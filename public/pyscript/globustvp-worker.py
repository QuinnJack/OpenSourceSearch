
import asyncio
import json
import base64
import numpy as np
import cv2
from js import self as worker_self
from globustvp.core import globustvp
from globustvp.geometry import normalize_lines, compute_backprojection_normals, compute_line_uncertainties

# Setup bridge
# from pyscript import sync # Removed

def log(msg):
    print(f"[GlobustVP-Worker] {msg}")

# @sync - Removed, sync object is not callable
def process_image_sync(base64_image_str):
    """
    Process image data received from JS as base64 string.
    """
    try:
        log("Processing image...")
        
        # Decode base64
        # Remove header if present (data:image/jpeg;base64,...)
        if ',' in base64_image_str:
            base64_image_str = base64_image_str.split(',')[1]

        image_bytes = base64.b64decode(base64_image_str)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

        if img is None:
             return json.dumps({"error": "Failed to decode image."})

        height, width = img.shape

        # Step 1: Detect Lines (LSD)
        # Check availability
        if not hasattr(cv2, 'createLineSegmentDetector'):
            # Fallback to Hough? LSD is standard in contrib/main opencv usually.
            # Pyodide's opencv might be headless or minimal.
            # If missing, we might use HoughLinesP (probabilistic).
            log("LSD not found, using HoughLinesP...")
            edges = cv2.Canny(img, 50, 150, apertureSize=3)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=10)
            # Hough returns (N, 1, 4) -> [x1, y1, x2, y2]
            if lines is not None:
                lines_2D = lines.squeeze(1) # (N, 4)
            else:
                 lines_2D = np.empty((0, 4))
        else:
            lsd = cv2.createLineSegmentDetector(0) # 0 = LSD_REFINE_STD
            lines, width_, prec, nfa = lsd.detect(img)
            # lines is (N, 1, 4)
            if lines is not None:
                lines_2D = lines.squeeze(1).astype(np.float32)
            else:
                lines_2D = np.empty((0, 4))

        # Filter short lines
        min_len = 30
        lengths = np.sqrt((lines_2D[:, 2]-lines_2D[:, 0])**2 + (lines_2D[:, 3]-lines_2D[:, 1])**2)
        lines_2D = lines_2D[lengths >= min_len]
        
        if len(lines_2D) < 10:
             return json.dumps({"error": "Not enough lines detected."})

        log(f"Detected {len(lines_2D)} lines.")

        # Step 2: Normalize
        # Guess intrinsics if not provided (assume center principal point, roughly 1.0 focal len ratio?)
        # width, height
        f = max(width, height) * 0.8 # Rough guess
        cx = width / 2
        cy = height / 2
        K = np.array([
            [f, 0, cx],
            [0, f, cy],
            [0, 0, 1]
        ])

        # normalize_lines requires (N, 4) input based on my rewrite? 
        # My rewrite of normalize_lines accepts (N,4) but returns (4,N)?
        # Let's check `geometry.py`: 
        # "input lines_2D shape (N, 4)... Return shape (4, N)"
        
        normalized_lines = normalize_lines(K, lines_2D) # Returns (4, N)
        # Transpose for compute_backprojection_normals if needed?
        # My compute_backprojection_normals handles (4, N) by transposing internally.
        
        # But core.py passes `all_2D_lines` to `generate_bin`.
        # `generate_bin` expects (N, 4).
        # So we should maintain (N, 4) shape in `core` usage?
        # `globustvp` (core) takes `all_2D_lines`.
        # Check core.py: `largest_bin_idxes = generate_bin(all_2D_lines, param)`
        # `generate_bin`: `lines = all_2D_lines`, `lines[:, 2] - lines[:, 0]`.
        # This implies it expects (N, 4).
        
        # So `all_2D_lines` passed to `globustvp` MUST be (N, 4).
        # `normalize_lines` returns (4, N). So we transpose result.
        normalized_lines_N4 = normalized_lines.T

        # Backprojection
        # `compute_backprojection_normals` handles (4, N) or (N, 4) and returns (N, 3).
        para_lines = compute_backprojection_normals(normalized_lines_N4)

        # Uncertainty
        uncertainty = compute_line_uncertainties(normalized_lines_N4, K, use_uncertainty=True)

        # Params
        param = {
            "line_num": len(lines_2D),
            "vanishing_point_num": 3,
            "c": 0.03,
            "sample_line_num": 4, # Small sample for RANSAC/SDP? 
            # Original code logic: sample size for SDP minimum for 3 points is small?
            # It builds 3*M+3 constraints.
            "is_fast_solver": True,
            "eigen_threshold": 1,
            "solver": "SCS", # Try SCS first
            "solver_opts": {"eps": 1e-4}, # SCS opts
            "histogram_len": 100
        }

        # Run Logic
        success, vps, corrs = globustvp(normalized_lines_N4, para_lines, uncertainty, param)
        
        if success:
            log("Solver converged.")
            # Convert VPs back to 2D pixel coordinates?
            # VPs are unit vectors in camera space (directions).
            # Project to image: K @ vp.
            # Homogeneous division.
            # BUT vanishing points can be at infinity.
            # Return raw VPs (3D rays) AND projected 2D points (if inclusive).
            
            vps_2d = []
            for vp in vps:
                vp_cam = K @ vp
                if abs(vp_cam[2]) > 1e-5:
                     pt = vp_cam[:2] / vp_cam[2]
                     vps_2d.append(pt.tolist())
                else:
                     vps_2d.append("infinity")
            
            # Lines association
            # corrs is list of arrays (one per VP).
            # Consolidate: For each line, which VP?
            # corrs[k][i] == 1 means line i belongs to VP k.
            line_associations = [-1] * len(lines_2D)
            
            # Priority to earlier VPs? 
            for vp_idx, assoc in enumerate(corrs):
                # assoc is mask or 0/1 array
                indices = np.where(assoc > 0)[0]
                for idx in indices:
                    line_associations[idx] = vp_idx

            return json.dumps({
                "status": "success",
                "lines": lines_2D.tolist(),
                "vps_3d": vps.tolist(),
                "vps_2d": vps_2d,
                "associations": line_associations
            })
        else:
            return json.dumps({"status": "failed", "error": "Solver did not converge."})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return json.dumps({"status": "error", "message": str(e)})

# Expose to JS via __export__ list for direct access (avoids sync/Atomics requirements)
# sync.process_image_sync = process_image_sync # Removed
worker_self.process_image_sync = process_image_sync 

__export__ = ["process_image_sync"]
log("GlobustVP Worker Loaded & Ready (Exported+Self).")

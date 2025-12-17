
import numpy as np
from scipy.linalg import null_space

def generate_bin(all_2D_lines, param):
    """
    Generate histogram of line directions and return dominant bin indices.
    """
    lines = all_2D_lines
    num_of_lines = lines.shape[0]

    histogram_len = param.get("histogram_len", 100)
    
    # Pre-allocate histogram: count and bin_index
    # We'll just track counts and store indices in a list of lists
    dir_cell = [[] for _ in range(histogram_len)]
    dir_histogram = np.zeros(histogram_len, dtype=int)
    
    resolution = np.pi / histogram_len

    dx = lines[:, 2] - lines[:, 0]
    dy = lines[:, 3] - lines[:, 1]
    
    # Vectorized direction calc
    directions = np.arctan2(dy, dx) # (-pi, pi]
    
    # Logic from original: 
    # if dx==0: pi/2. arctan2 handles this (returns pi/2 or -pi/2).
    # Original logic: np.arctan(dy/dx) gives (-pi/2, pi/2).
    # Then direction + pi/2 -> (0, pi).
    # Let's match original logic closer to ensure behavior.
    
    # Original:
    # if dx == 0: direction = pi/2
    # else: abs(atan(dy/dx))? No just atan.
    
    # Vectorized equivalent:
    # We want orientations in [0, pi).
    # np.arctan returns [-pi/2, pi/2].
    with np.errstate(divide='ignore', invalid='ignore'):
        directions = np.arctan(dy / dx)
    
    # Handle dx=0 (inf/nan) -> pi/2
    directions[np.isnan(directions)] = np.pi / 2
    
    # Map to [0, pi] for binning
    # Original: direction + pi/2 -> [0, pi]
    directions_shifted = directions + np.pi / 2
    
    bin_ids = np.ceil(directions_shifted / resolution).astype(int)
    # Clamp 1-based index to 0-based
    bin_ids = np.clip(bin_ids, 1, histogram_len) - 1

    for i in range(num_of_lines):
        b = bin_ids[i]
        dir_histogram[b] += 1
        dir_cell[b].append(i)

    # Sort bins by count
    sorted_bin_indices = np.argsort(dir_histogram) # ascending
    
    peak_id1 = sorted_bin_indices[-1] # max count
    
    # Find second peak
    largest_bin_idxes = dir_cell[peak_id1]
    
    # Original logic:
    # "Select the second peak that is sufficiently different from the first peak"
    # Actually, the original code returns `dir_cell[peak_id1 - 1]` (0-based `peak_id1`).
    # Wait, original logic:
    # `peak_id1 = int(dir_histogram[-1, 1])` where column 1 was 1-based index.
    # `largest_bin_idxes = dir_cell[peak_id1 - 1]`
    # My `peak_id1` is 0-based index directly. So `dir_cell[peak_id1]` is correct.
    
    # The original loop checks for a second peak to validat "sufficiently different".
    # BUT it returns `dir_cell[peak_id1 - 1]` regardless?
    # Original:
    # for i in range(histogram_len):
    #    test_id = col1 of sorted
    #    if abs(test_id - peak_id1) >= 4:
    #       largest_bin_idxes = ...
    #       break
    # It *updates* largest_bin_idxes only if it finds a far-away peak?
    # NO: `peak_id1` is the HIGHEST count bin.
    # The loop searches for a `test_id` (a high count bin) that is far from `peak_id1`.
    # AND THEN sets `largest_bin_idxes = dir_cell[peak_id1 - 1]`.
    # Wait, it effectively *always* returns the first peak bin, unless the condition is never met?
    # If the loop finishes without break, `largest_bin_idxes` might be undefined/old value?
    # In python, scope leaks, so it might be `dir_cell[peak_id1-1]` from initialization?
    # Actually original code:
    # `largest_bin_idxes` is NOT initialized before the loop in the "fast" check?
    # Ah, `largest_bin_idxes` is returned.
    # If the formatting implies `largest_bin_idxes` is set inside the `if`:
    # It means it ONLY returns if there is a second peak far away?
    # The code seems to assume such a peak exists.
    # Let's just return the largest bin for robustness.
    
    return largest_bin_idxes

def check_eig(W, param):
    threshold = param.get("eigen_threshold", 9)
    pass_flags = []
    
    N = W.shape[2]
    for i in range(N):
        mat = W[:3, :3, i]
        eigvals = np.linalg.eigvalsh(mat) # sorted ascending
        largest = eigvals[-1]
        second = eigvals[-2]
        ratio = largest / second if second > 1e-12 else np.inf
        pass_flags.append(ratio > threshold)
    return pass_flags

def recover_vp(W):
    # SVD on first slice
    U, S, Vt = np.linalg.svd(W[:3, :3, 0])
    return S[0] * Vt[0]

def axang2rotm(axis, theta):
    # Local copy or import from geometry
    # We will duplicate small logic or import
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c = np.cos(theta)
    s = np.sin(theta)
    C = 1 - c

    R = np.array([
        [c + x*x*C,     x*y*C - z*s, x*z*C + y*s],
        [y*x*C + z*s,   c + y*y*C,   y*z*C - x*s],
        [z*x*C - y*s,   z*y*C + x*s, c + z*z*C]
    ])
    return R

def _angle_mask_vectorized(normals, n1_rot, n2_rot):
    # Vectorized version of _angle_mask
    # normals: (N, 3)
    # n1_rot, n2_rot: (3,)
    
    epsilon = 1e-8
    norms = np.linalg.norm(normals, axis=1)
    valid = norms > epsilon
    
    # We only care about valid normals
    # But to keep indexing simple, we compute for all and mask later or set invalid to 0
    
    # Cosine similarities
    # shape (N,)
    cos_n1 = normals @ n1_rot
    cos_n2 = normals @ n2_rot
    
    # Normalize
    # Handle division by zero (where norms is small) -> 0
    with np.errstate(divide='ignore', invalid='ignore'):
        cos_n1 /= norms
        cos_n2 /= norms
    
    cos_n1 = np.clip(cos_n1, -1.0, 1.0)
    cos_n2 = np.clip(cos_n2, -1.0, 1.0)
    
    # Angles in degrees
    ang1 = np.degrees(np.arccos(cos_n1))
    ang2 = np.degrees(np.arccos(cos_n2))
    
    # Check 90 deg distance
    mask1 = np.abs(ang1 - 90.0) <= 0.5
    mask2 = np.abs(ang2 - 90.0) <= 0.5
    
    final_mask = (mask1 | mask2) & valid
    return np.where(final_mask)[0]

def find_peak_intervals(d, normals):
    d = d / np.linalg.norm(d)
    basis = null_space(d.reshape(1, 3)) # (3, 2)
    n1_base = basis[:, 0]
    
    num_bins = 90
    bin_counts = np.zeros(num_bins, dtype=int)
    bin_indices = [[] for _ in range(num_bins)]
    
    # Loop over angles - this loop is 90 iters, fast enough in python
    for angle_deg in range(num_bins):
        theta = np.deg2rad(angle_deg)
        R = axang2rotm(d, theta)
        
        n1_rot = R @ n1_base
        n1_rot /= np.linalg.norm(n1_rot)
        n2_rot = np.cross(d, n1_rot)
        n2_rot /= np.linalg.norm(n2_rot)
        
        inliers = _angle_mask_vectorized(normals, n1_rot, n2_rot)
        
        bin_counts[angle_deg] = len(inliers)
        bin_indices[angle_deg] = inliers
        
    peak_idx = np.argmax(bin_counts)
    return bin_indices[peak_idx]


import numpy as np
from .sdp_solver import solve_sdp
from .solver_utils import check_eig, recover_vp, generate_bin, find_peak_intervals

def globustvp(all_2D_lines, para_lines, uncertainty, param):
    """
    Fast SDP-based solver to estimate vanishing points from a set of parallel lines.
    """
    def reset():
        return [], [], np.ones(param["line_num"], dtype=bool), np.arange(param["line_num"])
    
    est_vps, est_corrs, line_id_pool, reverse_pool = reset()
    is_fast_solver = param.get("is_fast_solver", False)

    largest_bin_idxes = None
    if is_fast_solver:
        # Note: generate_bin returns a list of indices
        largest_bin_idxes = generate_bin(all_2D_lines, param)

    # Max iterations safety break (in case of infinite loops)
    max_iter = param.get("iteration", 50)
    iter_count = 0

    while True:
        iter_count += 1
        if iter_count > max_iter:
            print("Reached max iterations, stopping.")
            break

        active_lines = para_lines[line_id_pool]
        active_uncertainty = uncertainty[line_id_pool]
        active_size = len(active_lines) # Should be int

        if active_size < 3:
            if len(est_vps) == param["vanishing_point_num"]:
                return True, np.array(est_vps), est_corrs # est_corrs is list of arrays
            else:
                est_vps, est_corrs, line_id_pool, reverse_pool = reset()
                continue
        
        # Sampling
        sample_size = param["sample_line_num"]
        
        if not est_vps: # First VP
            if is_fast_solver and largest_bin_idxes is not None and len(largest_bin_idxes) > 0:
                # Use intersection of line_id_pool and largest_bin_idxes
                # But line_id_pool is boolean mask.
                # largest_bin_idxes is list of indices.
                # We need indices that are TRUE in line_id_pool.
                
                # Check valid candidates
                candidates = [idx for idx in largest_bin_idxes if line_id_pool[idx]]
                
                if len(candidates) >= sample_size:
                    # Map candidates (global indices) to local indices in active_lines?
                    # No, active_lines is para_lines[line_id_pool].
                    # Wait, active_lines indices are 0..active_size-1.
                    # We need to sample from active_lines.
                    
                    # Mapping:
                    # It's easier to sample global IDs and then extract.
                    # But the loop logic uses `sampled_lines = active_lines[sample_ids]`.
                    # So sample_ids must be indices into active_lines.
                    
                    # Original code: 
                    # sample_ids = np.random.choice(largest_bin_idxes...) IF is_fast_solver
                    # AND logic implies largest_bin_idxes ARE indices in active_lines?
                    # No, `active_lines = para_lines[line_id_pool]`.
                    # `largest_bin_idxes` comes from `generate_bin(all_2D_lines)`.
                    # So `largest_bin_idxes` are GLOBAL indices.
                    
                    # But later `sampled_lines = active_lines[sample_ids]` implies `sample_ids` are local.
                    # This implies original code might have bug or implicit assumption that first pass line_id_pool is all True.
                    # In first pass, line_id_pool IS all true. So global == local.
                    
                    # However, if we RESET, line_id_pool is reset to all True.
                    # As strictly interpreted, for the FIRST VP, we are always effectively at global context?
                    # Yes, `if not est_vps`.
                    
                    # So we can use global indices directly if line_id_pool is all True.
                    # But `active_lines` is `para_lines[line_id_pool]`.
                    # If we use `sample_ids` from `largest_bin_idxes` (global), 
                    # and `line_id_pool` is all True, then `active_lines` is `para_lines`.
                    # So it works.
                    
                    # But wait, what if `largest_bin_idxes` contains indices that are NOT in `line_id_pool`?
                    # (Only possible if logic changes, but `if not est_vps` implies start or reset).
                    
                    # Let's ensure safety:
                    sample_global_ids = np.random.choice(candidates, min(len(candidates), sample_size), replace=False)
                    # Convert global to local? 
                    # Since line_id_pool strictly true on reset/start, local=global.
                    sample_ids = sample_global_ids
                else:
                    # Fallback to random if bin is empty or depleted
                    sample_ids = np.random.choice(active_size, sample_size, replace=False)
            else:
                 sample_ids = np.random.choice(active_size, sample_size, replace=False)
        else:
             # Subsequent VPs
             sample_ids = np.random.choice(active_size, min(sample_size, active_size), replace=False)

        sampled_lines = active_lines[sample_ids]
        sampled_uncertainty = active_uncertainty[sample_ids]
        
        # Build Cost Matrix C
        real_sample_size = len(sampled_lines)
        C = np.zeros((3 * real_sample_size + 3, 3 * real_sample_size + 3, 2))
        
        for i, (line, unc) in enumerate(zip(sampled_lines, sampled_uncertainty)):
            # line (3,), unc (1,)
            outer = np.outer(line, line)
            idx = (i + 1) * 3
            
            # C1
            C[:3, idx:idx+3, 0] = 0.5 * unc * outer
            C[idx:idx+3, :3, 0] = C[:3, idx:idx+3, 0]
            
            # C2
            # param["c"] is scalar
            val = 0.5 * unc * (param["c"]**2) * np.eye(3)
            C[:3, idx:idx+3, 1] = val
            C[idx:idx+3, :3, 1] = val

        # Solve
        # We need to pass `real_sample_size` correctly
        try:
            X = solve_sdp(C, 3*real_sample_size+3, real_sample_size, param)
        except Exception as e:
            print(f"SDP failed: {e}")
            continue

        # Check Eigenvalues
        if not all(check_eig(X, param)):
            continue

        # Recover
        est_vp = recover_vp(X)

        # Validate Orthogonality
        if len(est_vps) == 1:
            # Check 90 deg with first
            angle = np.degrees(np.arccos(np.clip(est_vps[0] @ est_vp, -1, 1)))
            # Tolerance?
            # if abs(90 - angle) > (90 - acos(c)) ?
            # param["c"] is cosine threshold? usually 0.03 (~1.7 deg?)
            # 90 - 88.3 = 1.7. So tolerance is around 1.7 deg.
            # Original: abs(90 - angle) > (90 - deg(acos(c)))
            tol = 90 - np.degrees(np.arccos(param["c"]))
            if np.abs(90 - angle) > tol:
                 est_vps, est_corrs, line_id_pool, reverse_pool = reset()
                 continue
        elif len(est_vps) == 2:
            # Check orthogonality with BOTH? 
            # Original: if dot with either > 1e-3, force cross product?
            # It just enforces orthogonality by setting it to cross(vp1, vp2).
            if np.abs(est_vps[0] @ est_vp) > 1e-3 or np.abs(est_vps[1] @ est_vp) > 1e-3:
                est_vp = np.cross(est_vps[0], est_vps[1])
                est_vp /= np.linalg.norm(est_vp)

        est_vps.append(est_vp)

        # Update lines
        # Identify lines consistent with this VP
        # all_lines is active subset? 
        # Original: `all_lines = para_lines[line_id_pool]`
        # `corr_line_idx = where(abs(dot) < c)[0]`
        # So corr_line_idx are LOCAL indices into active_lines.
        
        # But wait, original code:
        # `original_ids = reverse_pool[corr_line_idx]`
        # reverse_pool maps local indices back to global indices.
        
        all_lines_subset = para_lines[line_id_pool]
        dots = np.abs(all_lines_subset @ est_vp)
        corr_local_idc = np.where(dots < param["c"])[0]
        
        original_ids = reverse_pool[corr_local_idc]

        if is_fast_solver and len(est_vps) == 1:
            # Peak intervals logic
            # Update line_id_pool based on peak logic
            peak_ids = find_peak_intervals(est_vp, para_lines)
            # Reset pool to False, then set peak_ids to True?
            # Original: `line_id_pool[:] = False`, `line_id_pool[peak_ids] = True`
            line_id_pool[:] = False
            line_id_pool[peak_ids] = True
            
            # Re-update original_ids?
            # The logic flow in original code puts this block BEFORE removing inliers.
            # `if is_fast_solver...`
            # `line_id_pool[original_ids] = False`
            # So first we restrict to peak, THEN remove inliers of current VP?
            pass

        # Remove inliers from pool
        line_id_pool[original_ids] = False
        
        # Update reverse_pool (indices of True values)
        reverse_pool = np.where(line_id_pool)[0]
        
        # Record correlation
        corr = np.zeros(param["line_num"])
        corr[original_ids] = 1
        est_corrs.append(corr)

        if len(est_vps) == 3:
            # Enforce RH system and orthogonality
            est_vps = np.array(est_vps)
            if np.linalg.det(est_vps) < 0:
                est_vps[0] = -est_vps[0]
            
            U, _, Vt = np.linalg.svd(est_vps)
            est_vps = U @ Vt
            
            if np.allclose(est_vps @ est_vps.T, np.eye(3), atol=1e-3): # Relaxed tol slightly
                 return True, est_vps, est_corrs
            else:
                 est_vps, est_corrs, line_id_pool, reverse_pool = reset()
                 continue

    return False, np.array(est_vps), est_corrs

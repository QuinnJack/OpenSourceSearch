
import numpy as np

def skew(v):
    """
    Compute the skew-symmetric matrix of a 3D vector.
    """
    return np.array([
        [    0, -v[2],  v[1]],
        [ v[2],     0, -v[0]],
        [-v[1],  v[0],     0]
    ])

def axang2rotm(axis, theta):
    """
    Compute a 3x3 rotation matrix from a rotation axis and angle using Rodrigues' rotation formula.
    """
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

def normalize_lines(K, lines_2D):
    """
    Normalize 2D line segments by applying the inverse of the camera intrinsic matrix.
    K: (3, 3)
    lines_2D: (N, 4) -> [x1, y1, x2, y2]
    
    Returns: (4, N) [x1, y1, x2, y2]^T (normalized)
    """
    # Note: The original globustvp normalize_lines took (6, N) or (4, N) handling?
    # Looking at the original code: 
    # It expects lines_2D where each column is [x1, y1, 1, x2, y2, 1]^T, shape (6, N)
    # BUT standard input is usually (N, 4).
    # Let's adapt this to handle (N, 4) input from standard LSD output.
    
    K_inv = np.linalg.inv(K)
    
    # lines_2D shape (N, 4) -> x1, y1, x2, y2
    N = lines_2D.shape[0]
    
    # Create homogeneous pts
    # pts1: (3, N)
    pts1 = np.vstack((lines_2D[:, 0], lines_2D[:, 1], np.ones(N)))
    pts2 = np.vstack((lines_2D[:, 2], lines_2D[:, 3], np.ones(N)))
    
    # Apply inverse K
    pts1_h = K_inv @ pts1
    pts2_h = K_inv @ pts2
    
    # Normalize (div by z)
    pts1_n = pts1_h[:2, :] / pts1_h[2:, :]
    pts2_n = pts2_h[:2, :] / pts2_h[2:, :]
    
    # Return shape (4, N) to match original expectations
    return np.vstack((pts1_n, pts2_n))

def compute_backprojection_normals(lines_2D_norm):
    """
    Compute 3D plane normals.
    lines_2D_norm: (N, 4) or (4, N). Original code geometry.py expected (N, 4) but normalize_lines returned (4, N).
    Let's stick to consistent shapes.
    If input is (4, N) (from normalize_lines above), we transpose it to (N, 4) or handle it.
    
    Original `compute_backprojection_normals` expects (N, 4).
    But `normalize_lines` returns (4, N).
    So in `globustvp-worker`, we must transpose before calling this.
    """
    if lines_2D_norm.shape[0] == 4 and lines_2D_norm.shape[1] != 4:
         lines_2D_norm = lines_2D_norm.T

    x1 = lines_2D_norm[:, 0:2]
    x2 = lines_2D_norm[:, 2:4]

    # Homogeneous
    x1_h = np.hstack([x1, np.ones((x1.shape[0], 1))])
    x2_h = np.hstack([x2, np.ones((x2.shape[0], 1))])

    para_lines = np.cross(x1_h, x2_h)
    norms = np.linalg.norm(para_lines, axis=1, keepdims=True)
    para_lines /= norms
    
    return para_lines

def compute_line_uncertainties(lines_2D_norm, K, use_uncertainty=True):
    """
    Calculate uncertainty weights.
    lines_2D_norm: (N, 4) normalized lines.
    """
    if lines_2D_norm.shape[0] == 4 and lines_2D_norm.shape[1] != 4:
         lines_2D_norm = lines_2D_norm.T

    total_num = lines_2D_norm.shape[0]
    uncertainty = np.ones((total_num, 1))

    if use_uncertainty:
        # TODO: Vectorize this loop if possible, but for N ~100-500, loop is okay for now.
        # Original code used a loop calling `line_uncertainty` which does 3x3 matrix ops.
        # Keeping loop logic but ensuring no numba.
        pass # We will iterate below
        
        K_inv = np.linalg.inv(K)
        Sigma_2D = 2 * np.eye(2)
        Sigma_h = np.zeros((3, 3))
        Sigma_h[:2, :2] = Sigma_2D
        Sigma_1_h = K_inv @ Sigma_h @ K_inv.T
        Sigma_2_h = Sigma_1_h
        
        for i in range(total_num):
            p1 = lines_2D_norm[i, :2]
            p2 = lines_2D_norm[i, 2:4]
            
            p1_h = np.append(p1, 1.0)
            p2_h = np.append(p2, 1.0)
            
            l_3d = np.cross(p1_h, p2_h)
            norm_l = np.linalg.norm(l_3d)
            l_3d_norm = l_3d / norm_l
            
            # Skew matrices
            S1 = skew(p2_h)
            S2 = skew(p1_h)
            
            Sigma_l = S1 @ Sigma_1_h @ S1.T + S2 @ Sigma_2_h @ S2.T
            
            J = (np.eye(3) - np.outer(l_3d_norm, l_3d_norm)) / norm_l
            Sigma_l_normalized = J @ Sigma_l @ J.T
            
            uncertainty[i] = 1.0 / np.trace(Sigma_l_normalized)

        min_u, max_u = np.min(uncertainty), np.max(uncertainty)
        diff = max_u - min_u
        if diff < 1e-8: diff = 1e-8
        uncertainty = 0.1 + (uncertainty - min_u) * 0.2 / diff

    return uncertainty


import cvxpy as cp
import numpy as np

def solve_sdp(C, size_x, line_current_size, param):
    """
    Defines and returns an SDP solver for a problem using cvxpy.
    """
    block_size = 3

    if size_x > C.shape[0]:
        raise ValueError(f"size_x={size_x} exceeds available C size ({C.shape[0]}).")

    # Clean C
    C = np.where(np.abs(C) < 1e-12, 0, C)
    C1, C2 = C[:, :, 0], C[:, :, 1]

    # SDP Variables
    X1 = cp.Variable((size_x, size_x), PSD=True)
    X2 = cp.Variable((size_x, size_x), PSD=True)

    constraints = []

    # Binary inlier/outlier constraints
    for i in range(line_current_size):
        idx = (i + 1) * block_size
        constraints += [
            X1[:3, idx:idx+3] == X1[idx:idx+3, idx:idx+3],
            X2[:3, idx:idx+3] == X2[idx:idx+3, idx:idx+3]
        ]

    # Trace == 1
    constraints += [
        cp.trace(X1[:3, :3]) == 1,
        cp.trace(X2[:3, :3]) == 1
    ]

    # Symmetry
    for i in range(1, line_current_size):
        for j in range(i + 1, line_current_size + 1):
            i_idx, j_idx = i * block_size, j * block_size
            constraints += [
                X1[i_idx:i_idx+3, j_idx:j_idx+3] == X1[i_idx:i_idx+3, j_idx:j_idx+3].T,
                X2[i_idx:i_idx+3, j_idx:j_idx+3] == X2[i_idx:i_idx+3, j_idx:j_idx+3].T
            ]

    # Column constraints
    for i in range(line_current_size):
        idx = (i + 1) * block_size
        constraints.append(X1[:3, idx:idx+3] + X2[:3, idx:idx+3] == X1[:3, :3])

    # Redundant
    constraints.append(X1[:3, :3] == X2[:3, :3])

    # Objective
    objective = cp.Minimize(cp.trace(C1 @ X1) + cp.trace(C2 @ X2))
    problem = cp.Problem(objective, constraints)

    # Solve with Fallback Logic
    requested_solver = param.get("solver", "SCS")
    solver_opts = param.get("solver_opts", {})
    
    # Priority: SCS -> CLARABEL -> OSQP -> ECOS
    # If user asks for SCS, we try SCS.
    # Logic: try primary, then catch error and try fallback.
    
    solvers_to_try = []
    if requested_solver == "SCS":
        solvers_to_try = [cp.SCS, cp.CLARABEL]
    elif requested_solver == "CLARABEL":
        solvers_to_try = [cp.CLARABEL]
    elif requested_solver == "MOSEK":
        # In web, Mosek likely fails, fallback to SCS/Clarabel
        solvers_to_try = [cp.SCS, cp.CLARABEL]
    else:
        # Default fallback chain
        solvers_to_try = [cp.SCS, cp.CLARABEL]

    success = False
    last_error = None

    for solver in solvers_to_try:
        try:
            print(f"Attempting solver: {solver}")
            # Ensure opts are compatible. CLARABEL might have diff opts than SCS.
            # Passing raw opts might be risky if they are solver-specific.
            # For now, pass empty or generic opts if unsure.
            problem.solve(solver=solver, verbose=False)
            
            if problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE]:
                success = True
                print(f"Solved with {solver}")
                break
            else:
                print(f"Solver {solver} failed with status: {problem.status}")
        except Exception as e:
            print(f"Solver {solver} raised exception: {e}")
            last_error = e

    if not success:
        raise ValueError(f"Optimization failed. Last error: {last_error}")

    X = np.stack([X1.value, X2.value], axis=-1)
    return X

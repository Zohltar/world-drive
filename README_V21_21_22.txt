World Drive V21.21.22 — speedAbs load hotfix candidate

Base: V21.21.21 Real Mass + F1 Downforce Candidate.

Fix:
- updateDrive() no longer reads the later-scoped `speedAbs` before initialization.
- longitudinal traction / braking / handbrake aero calculations now receive
  `longitudinalSpeedAbs`, captured before longitudinal integration.
- the existing `speedAbs` after integration remains used for steering/lateral physics.

This is intentionally a minimal runtime hotfix. Vehicle masses, F1 downforce, graphics,
lane assist and tire calibration are unchanged from V21.21.21.

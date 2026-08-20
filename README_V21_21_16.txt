WORLD DRIVE V21.21.16 — STEERING FORCE SIGN / TIRE DEMAND CANDIDATE

Base: V21.21.15 low-speed traction candidate.

Purpose
-------
Correct an inversion-like handling fault seen under acceleration: with a strong
steering command, especially 80–150 km/h, the chassis could yaw opposite the
steering direction and the rear could appear to move into the turn instead of
swinging outward.

Root causes found by simulation
--------------------------------
1. The per-wheel friction solver received the *unbounded kinematic* lateral
   acceleration request before the chassis yaw was clipped to the tire lateral
   limit. Full steering lock at road speed could therefore feed several g of
   impossible lateral demand into a ~1 g tire model. This saturated all four
   tires in the solver even though the chassis itself was later capped.

2. During AWD acceleration, longitudinal load transfer unloads the front axle.
   The old combined front+rear force-loss yaw correction could then become
   dominated by front grip loss. Front grip loss is understeer, but the code
   integrated that opposing correction as a real yaw torque; it could exceed
   the commanded steering yaw and rotate the chassis the wrong way.

3. Axle slip state used the worst single tire. A lightly loaded inside tire
   reaching saturation could therefore mark the entire axle as fully broken
   away. V21.21.16 uses a normal-load-weighted axle lateral slip state while
   preserving per-wheel slip for skid marks and audio.

Changes
-------
- Tire solver lateral demand is capped to latLimit before the friction-circle
  calculation. The sign of signed lateral acceleration is preserved.
- Front force-loss remains available in diagnostics, but while the driver is
  actively steering an opposing force-loss yaw moment is treated as understeer
  through the existing front-slip/yaw-rate reduction instead of being allowed
  to reverse chassis yaw.
- Same-sign rear-loss moments remain intact: handbrake and genuine rear
  breakaway still generate oversteer/drift.
- Front/rear axle lateral slip is now load-weighted instead of max(single tire).
- No renderer, terrain, streaming, multiplayer, or frame-pacing changes.

Extreme WRX simulation
----------------------
The new dedicated QA applies full WRX propulsion and maximum steering from a
straight state for 1 second at 80, 100, 120, and 150 km/h, both directions.

RIGHT steer:
  80 km/h  chassis +11.34 deg, trajectory +12.69 deg, rear -0.302 m vs COM
 100 km/h  chassis  +9.02 deg, trajectory +10.10 deg, rear -0.241 m vs COM
 120 km/h  chassis  +7.36 deg, trajectory  +8.26 deg, rear -0.197 m vs COM
 150 km/h  chassis  +5.64 deg, trajectory  +6.38 deg, rear -0.151 m vs COM
LEFT is sign-symmetric.

The rear-relative displacement is opposite the steering direction, as expected
for the tail swing of a turning chassis.

Launch / full-lock test
-----------------------
From rest, full throttle + full steering was simulated for 5 seconds in both
directions. Chassis yaw and translation stay in the requested direction.
At 12.9 km/h no tire is sliding. By 25.4 km/h at full steering + full throttle,
inside tires begin to saturate first instead of all four tires instantly being
reported as fully lost.

Handbrake regression
--------------------
The V21.21.11 and V21.21.12 handbrake regression tests still pass.
Dedicated V21.21.16 test at 72 km/h:
  max sideslip ~26.08 deg
  extra heading from a 0.5 s handbrake application ~36.98 deg

Status
------
Candidate only. Requires user visual/handling validation before promotion.

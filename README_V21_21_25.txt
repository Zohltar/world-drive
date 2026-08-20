World Drive V21.21.25 — Steering Rack + F1 High-Speed Authority Candidate

Base
----
V21.21.24 F1 Steering Stability Candidate.

Goals
-----
1. Make the F1 more willing to turn in sustained high-speed bends without
   bringing back the low-speed joystick zig-zag / G-spike problem.
2. Replace the abstract exponential steering attack with a directly tunable
   physical-feeling steering-rack travel time per vehicle.

Finite steering rack
--------------------
Each current vehicle now exposes:

  steeringCenterToFullTimeSec
  steeringReturnToCenterTimeSec

`steeringCenterToFullTimeSec` is the normalized time for the front-wheel rack
command to move from centre (0) to a full-scale joystick request (+/-1).
Travel is linear in rack distance:

- 0 -> 50% request takes half the configured time.
- 0 -> 100% takes the configured time.
- -100% -> +100% takes twice the configured time.

This does not create yaw or grip. It only limits how quickly the requested
front-wheel angle can physically change. Profiles without these fields still
fall back to the historical exponential response.

Current calibration
-------------------
ID.4       centre->full 0.58 s   return 0.40 s
WRX        centre->full 0.46 s   return 0.34 s
Civic      centre->full 0.52 s   return 0.38 s
Sonata     centre->full 0.55 s   return 0.40 s
F1 2010    centre->full 0.42 s   return 0.30 s
Countach   centre->full 0.44 s   return 0.32 s
i3         centre->full 0.50 s   return 0.36 s

F1 high-speed steering
----------------------
V21.21.24 intentionally limited full steering to 66% of the available tire +
aero lateral envelope. That made the car stable, but too reluctant to take
fast sustained bends.

V21.21.25 raises this to 82%, while the finite rack prevents a joystick step
from applying that angle in one frame. F1 transient yaw response multiplier is
also raised from 0.72 to 0.86.

Representative full-steering demand:
  100 km/h : ~2.16 g available command
  150 km/h : ~2.72 g
  200 km/h : ~3.51 g
  250 km/h : ~4.51 g
  300 km/h : ~5.14 g

The steering-only command remains inside the configured grip envelope and the
QA tire model does not report breakaway in those cases.

Unchanged systems
-----------------
No intentional changes to terrain, imagery, hydro, road rendering, lane assist,
braking/momentum, vehicle masses, F1 downforce, transmission, Electron or
multiplayer.

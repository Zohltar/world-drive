World Drive V21.21.26 — Real Behavior Candidate
================================================

Goal
----
Preserve the V21.21.25 steering-rack, F1 aero, braking/momentum, lane assist,
terrain and graphics work, while calibrating the seven current vehicles around
representative real-world acceleration, braking and lateral-grip envelopes.

Why this pass was needed
------------------------
The chassis masses were already close to real values, but World Drive stores
engine acceleration and braking directly in m/s^2. Raising a car's mass does
not automatically make its configured acceleration weaker. Several road cars
therefore still behaved too much like performance cars despite realistic mass.

Main behavior calibration
-------------------------
Representative simulated metrics after calibration:

Vehicle       0-100 km/h   112.7-0 km/h   Base lateral grip   Top-speed ref
ID.4 AWD        5.02 s        51.5 m            0.86 g           160 km/h
WRX manual      5.75 s        47.6 m            0.95 g           225 km/h
Civic Sport     9.15 s        51.8 m            0.87 g           180 km/h
Sonata Sport    7.69 s        50.9 m            0.82 g           205 km/h
F1 2010         2.60 s        23.1 m            2.09 g*          350 km/h
Countach QV     5.17 s        60.9 m            0.82 g           295 km/h
i3 2017         6.90 s        53.9 m            0.77 g           150 km/h

*F1 base mechanical value; aerodynamic grip continues to rise strongly with
speed exactly as in V21.21.25.

Vehicle-character adjustments
------------------------------
- ID.4: rear-biased dual-motor AWD torque split, heavy but strong EV launch.
- WRX: quick AWD launch and strong road grip, but no supercar braking/accel.
- Civic: substantially calmer straight-line performance.
- Sonata: realistic midsize-sedan acceleration and grip.
- Countach: period-style 0.82 g road grip and long non-ABS braking distance,
  while its huge rear tires still permit representative QV launch performance.
- i3: light/nimble feel without unrealistic sports-car acceleration.
- F1: V21.21.25 steering/aero behavior preserved; slight straight-line
  calibration only.

Physics correction found during testing
---------------------------------------
V21.21.25 computed longitudinal weight transfer from the DRIVER'S REQUESTED
acceleration before traction limiting. When the requested force was impossible,
the solver could unload an axle as if the impossible acceleration had already
happened. In AWD/FWD cases this could make more throttle paradoxically reduce
available traction.

V21.21.26 now solves load transfer against the acceleration that the tires can
actually deliver. Normal unsaturated driving keeps a fast single-pass path;
only traction-limited drive/handbrake cases use the tiny convergence loop.
Service braking keeps a separate fast path.

Performance
-----------
The additional traction consistency work is intentionally very small. A local
1,000,000-call microbenchmark was ~0.29 microseconds per traction-limit call on
the QA host. The existing allocation-light dynamics benchmark remains around
1.45 microseconds/frame in its synthetic test.

Preserved systems
-----------------
- V21.21.25 finite steering-rack timing
- V21.21.24 F1 steering stability
- V21.21.23 F1 downforce / aero grip / crest support
- V21.21.17 braking + momentum behavior
- V21.21.19 right-lane physical lane assist
- V21.21.20 graphics recovery / stencil road-water ownership
- terrain orientation and V21.21.8 frame-pacing work

Status
------
Candidate only. Requires user road testing before promotion to a stable baseline.

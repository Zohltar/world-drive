World Drive V21.21.17 — Braking Momentum / Combined Grip Candidate

Goal
----
Fix the remaining "magic grip" behaviour discovered after V21.21.16:
when the car was already carrying sideways momentum (especially after landing
crosswise), touching the service brake could make the travel direction snap
far too quickly toward the chassis heading.

Root cause
----------
The tire friction-circle state was improved in V21.21.10–16, but the final
velocity-direction alignment still contained a legacy high-rate heuristic.
That heuristic was not bounded by the lateral acceleration the tires could
actually produce. At high speed it could rotate linear momentum much faster
than a_lat / v. Service braking therefore did not reliably reduce that
synthetic alignment, which felt like braking created extra cornering grip.

V21.21.17 changes
-----------------
1. The tire solver now exposes the remaining whole-car lateral-force capacity
   after longitudinal demand, load transfer and the friction circle.
2. Every non-low-speed correction of the linear momentum direction is capped by
   the physical relation d(theta)/dt <= a_lat / v.
3. While airborne, tires can no longer rotate horizontal momentum at all.
4. Service braking on modern road cars uses ABS/EBD-style force distribution by
   default, so the WRX no longer reports an artificial rear-wheel lock caused by
   blindly applying the static 62/38 brake bias after weight transfer.
5. F1 2010 and Countach keep non-ABS braking behaviour.
6. Handbrake behaviour remains rear-axle-specific and is not converted to ABS.

Expected feel
-------------
- Coast after a sideways landing: the car keeps travelling in its old direction
  and progressively scrubs/alters that momentum instead of snapping to the nose.
- Brake after a sideways landing: longitudinal braking consumes tire friction,
  so the momentum vector bends LESS, not more.
- Full service braking while steering at 80–150 km/h can rotate the chassis, but
  the center-of-mass trajectory cannot magically follow it; visible sideslip and
  outward momentum should remain.
- Normal low-speed hairpin behaviour from V21.21.15 stays intact.
- Handbrake drift from V21.21.12+ stays intact.

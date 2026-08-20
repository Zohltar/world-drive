World Drive V21.21.24 — F1 Steering Stability Candidate

Goal
- Keep the F1's very high tire/aero grip from V21.21.23.
- Remove low-speed zig-zag/nervous steering and G-force spikes.
- Prevent steering input alone from instantly saturating the F1 tires.

Changes
- F1 roadGripMultiplier: 1.72 -> 1.00. Grip now stays in the tire/aero envelope instead of multiplying geometric yaw.
- F1 low-speed steering lock reduced and parking-rack boost reduced.
- F1 steering input/return response softened, especially below normal road speed.
- Added optional physics-aware steering envelope: full-lock road-wheel angle is capped to 66% of current tire+aero lateral capacity above low speed.
- F1 yaw transient response reduced (yawResponseMultiplier 0.72).
- Other vehicle profiles retain their previous steering behavior.

Expected feel
- 20–40 km/h: still enough lock for tight turns, but much easier to hold a clean line.
- 60+ km/h: full steering no longer asks for multiple times the available lateral G.
- 100–300 km/h: steering remains responsive but progressively uses only part of the available grip, leaving reserve instead of immediately sliding.
- The F1 can still lose grip from combined throttle/braking/curbs/loose surfaces; the change is not an artificial stability-control teleport.

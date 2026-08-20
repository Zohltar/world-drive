WORLD DRIVE V21.21.15 — LOW-SPEED STEERING / TRACTION CANDIDATE

Base: V21.21.14 Tire Adhesion Candidate.

Goal
- Fix full-lock launches that tended to continue too straight from a near stop.
- Prevent modest acceleration from consuming too much of the tire friction budget.
- Improve the same behaviour off road without weakening the handbrake drift model.

Changes
1. Parking / hairpin steering
   - Adds up to +26% road-wheel steering travel at parking speed.
   - Fades completely by ~29 km/h (8 m/s).
   - WRX full-lock wheel angle at standstill: ~34.7 degrees.
   - WRX bicycle-model turning radius at standstill: ~3.83 m (previously ~5.09 m).
   - Low-speed rack response increased; medium/high-speed steering remains on the V21.21.13 curve.

2. Longitudinal friction-circle normalization
   - Propulsion/braking utilization is now normalized against actual axle capacity:
       surface mu * g * dynamic axle load
   - Removes the old normalization against engine/brake ratings that could make light throttle consume too much adhesion.
   - Drive/brake shares and dynamic axle loads remain respected.

3. Correct tire-force load transfer
   - Axle load transfer inside the grip solver now uses tire-generated acceleration only.
   - Gravity/grade and rolling resistance no longer masquerade as tire force.
   - This removes false unloading/traction loss on slopes, especially off road.

4. Low-speed off-road static bite
   - Small +12% maximum static longitudinal grip boost at walking speed.
   - Fades out by 7 m/s (~25 km/h).
   - Loose terrain still remains significantly lower-grip than asphalt.

5. Preserved behaviour
   - V21.21.12 force-coupled drift remains active.
   - V21.21.13 high-speed steering stability remains active.
   - V21.21.14 low-speed lateral no-slip behaviour remains active.
   - V21.21.9 terrain orientation and V21.21.8 frame pacing remain unchanged.

This is a candidate. User driving validation is still required.

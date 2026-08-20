WORLD DRIVE V21.21.10 — FRICTION CIRCLE / HANDBRAKE DRIFT CANDIDATE

Base: V21.21.9 validated terrain-orientation + frame-pacing candidate.

OBJECTIVE
Correct the tire friction-circle interaction so longitudinal tire demand reduces the lateral grip still available at that wheel.

BEHAVIOR CHANGE
- Handbrake continues to act on the rear axle only.
- Rear-wheel lock now consumes nearly all rear longitudinal adhesion.
- If the car is already cornering, the rear axle therefore loses lateral reserve and can break away naturally.
- In a straight line, the handbrake does NOT create an artificial yaw moment: no lateral demand means no lateral slip term.
- Hard service braking while cornering also consumes lateral reserve, enabling natural trail-braking/combined-load behavior.
- No direct arcade "add yaw when handbrake pressed" term was added.

PRESERVED
- V21.21.9 visual quality and frame pacing.
- Terrain orientation correction.
- Generalized multi-axle physics foundation.
- Grade gravity behavior.
- Route/terrain generation.
- Windows OSM proxy and LAN multiplayer runtime.

SUGGESTED USER TEST
1. WRX, dry asphalt, ~50-80 km/h: turn firmly, then tap/hold handbrake. Rear should rotate and velocity heading should lag the chassis, producing a visible drift.
2. Repeat in a straight line: car should decelerate/lock rear tires without magically rotating.
3. Countach: handbrake initiation should be easy; throttle after release can sustain rear slip more readily because it is RWD.
4. Civic: handbrake can initiate rotation, but front-wheel throttle should tend to pull/stabilize rather than power-oversteer.
5. Verify FPS remains comparable to V21.21.9.

STATUS
Candidate only until user visual/feeling validation.

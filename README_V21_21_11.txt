WORLD DRIVE V21.21.11 — HANDBRAKE YAW / TRUE FRICTION-BALANCE CANDIDATE

Base: V21.21.10 friction-circle candidate, itself based on the validated V21.21.9 terrain-orientation + frame-pacing candidate.

ROOT CAUSE FOUND
V21.21.10 correctly detected that a locked rear wheel had essentially no lateral grip left, but that information stopped at the slip indicator. The chassis yaw model still followed the balanced bicycle-model yaw target, so the rear axle could be fully saturated without producing the missing counter-yaw force that should rotate the car.

V21.21.11 CORRECTION
- The grip solver now converts remaining friction-circle capacity into an actual lateral-force scale at every wheel.
- Only the CHANGE in lateral force versus the already-balanced steering model is converted into a yaw moment around the vehicle CG.
- That yaw moment is divided by the vehicle yaw inertia and integrated into the existing dynamic yaw-rate state.
- Rear grip loss therefore produces oversteer; front grip loss naturally produces understeer.
- The velocity vector follows the chassis more slowly only when the friction-circle force imbalance is real, allowing a visible sideslip/drift angle.
- No direct `handbrake = add yaw` arcade shortcut was added.

EXPECTED BEHAVIOR
- Straight + handbrake: rear wheels lock / car slows, but no magic rotation.
- Turn + handbrake: front tires keep generating cornering force while the locked rear axle loses lateral authority, so the chassis rotates and the momentum vector lags behind -> visible drift.
- Release handbrake: rear grip progressively returns and the car can recover with counter-steer.
- Service braking / driven-axle saturation can also consume lateral reserve naturally through the same model.

PRESERVED
- V21.21.9 terrain orientation fix.
- V21.21.8 frame-pacing improvements.
- V21.21.7 visual quality policy.
- Generalized multi-axle vehicle architecture.
- Grade gravity / free rolling in slopes.
- Windows OSM proxy and LAN multiplayer runtime.

SUGGESTED USER TEST
1. WRX, dry asphalt, about 60-80 km/h.
2. Establish a real turn first, then hold the handbrake for about 0.3-0.6 s.
3. The rear should now step outward clearly; counter-steer should become necessary.
4. Repeat in a straight line: there should be no spontaneous spin.
5. Countach: initiate with handbrake, release it, then use throttle to test power-oversteer continuation.
6. Verify FPS stays comparable to V21.21.9/V21.21.10.

STATUS
Candidate until user driving-feel validation.

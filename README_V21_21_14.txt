WORLD DRIVE V21.21.14 — TIRE ADHESION / LOW-SPEED STABILITY CANDIDATE

Base: V21.21.13 High-Speed Stability Candidate.

Goal
----
Remove the odd low-speed lateral skating introduced after the force-coupled drift work, while preserving the handbrake breakaway that was positively validated in V21.21.12/13.

Changes
-------
1. Four-tire static adhesion reserve at very low speed
   - All four tires receive the same low-speed static-friction reserve.
   - +18% at parking speed, smoothly fading to 0 by about 30 km/h.
   - Left/right tires remain exactly symmetric; no artificial pull is introduced.

2. Tire load sensitivity
   - Tire capacity now scales with vertical load using a 0.90 exponent instead of a purely linear normalization.
   - This avoids making a lightly loaded inside tire unrealistically fragile during small low-speed steering inputs while retaining weight-transfer effects near the limit.

3. Faster low-speed slip recovery
   - Small transient front/rear slip decays faster below about 30 km/h.
   - Prevents stale slip state from making the car continue to skate sideways after the tires should have hooked up.

4. Low-speed no-slip trajectory region
   - Below about 30 km/h, when neither axle is actually saturated, the velocity vector follows chassis heading much more tightly.
   - Below about 9 km/h it is effectively kinematic/no-slip.
   - This is bypassed immediately for a real breakaway, so handbrake drift remains available.

Preserved
---------
- V21.21.13 high-speed steering stabilization.
- V21.21.12 force-coupled drift model.
- V21.21.11 tire-force yaw moment.
- V21.21.10 friction-circle coupling.
- V21.21.9 terrain orientation fix.
- V21.21.8 frame-pacing optimizations and V21.21.7 render quality policy.
- Gravity-on-slope behaviour.

Expected feel
-------------
At parking / neighbourhood speeds, steering should feel planted: the car should turn in the commanded direction without the body visibly skating the opposite way. At 60–80 km/h, a deliberate handbrake turn should still produce a clear rear breakaway and require counter-steer.

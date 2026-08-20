WORLD DRIVE V21.21.27 — VISUAL / STREAMING CANDIDATE
=====================================================

Base
----
V21.21.26 Real Behavior Candidate.

Goal
----
Polish the visible world without changing the validated V21.21.26 vehicle
physics:
- make the road surface read as real pavement instead of a flat grey ribbon;
- reduce late terrain/imagery changes as the vehicle approaches;
- improve the quality and continuity of distant mountain terrain.

Road visual pass
----------------
- Asphalt texture system upgraded from one 256 px color texture to deterministic
  512 px albedo + bump + roughness maps.
- Fine aggregate, low-frequency patching and subtle longitudinal tire-polish
  bands provide variation without turning the road into a noisy decal.
- Shoulder upgraded from a flat material to a separate compact-gravel texture
  with albedo + bump + roughness.
- Texture anisotropy raised from up to 8x to up to 16x where the GPU supports it.
- Yellow/white markings now use lit MeshStandardMaterial instead of unlit basic
  material so they sit more naturally in the scene lighting.
- Road ribbon longitudinal sampling tightened from <=4 m to <=3 m for smoother
  curves, shoulders and markings.
- Existing road-over-water stencil priority is preserved.

Terrain / streaming pass
------------------------
- Near high-detail terrain footprint: 2400 m / 192 segments -> 3200 m /
  256 segments. Nominal vertex spacing remains 12.5 m, so the larger area does
  not sacrifice local terrain density.
- At the 520 m floating-origin threshold, the minimum forward high-detail margin
  grows from 680 m to 1080 m.
- Distant square-ring horizon is retuned with denser rings near the hand-off and
  reaches a 5860 m half-extent (~8.3 km to the far corners).
- Streaming distance multipliers become .96 / 1.32 / 1.82 for low / medium /
  high display-distance profiles.
- The existing 250 ms directional prefetch remains intact.
- New route-aware warm-cache pass runs every 850 ms and prefetches DEM + imagery
  along the actual travel direction at approximately 650 / 1250 / 2100 / 3200 m,
  with an additional speed-dependent lead of up to 1400 m.
- Completed ahead-of-car DEM requests trigger a coalesced visible-world rebuild,
  allowing newly cached real elevation to replace the procedural fallback before
  the vehicle reaches that area.
- Current imagery can refresh after ~340 m of travel instead of waiting for a
  much later world transition.

Preserved behavior
------------------
V21.21.26 vehicle behavior calibration, V21.21.25 steering rack, F1 stability /
aero, braking + momentum, right-lane assist, terrain orientation, MSAA and the
adaptive render-ratio ladder are unchanged by design.

Status
------
CANDIDATE — visual test on the user's GPU is required before baseline promotion.

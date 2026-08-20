WORLD DRIVE V21.22.0 — DISTANT TERRAIN CANDIDATE
===================================================

Base
----
V21.21.27 stable baseline.

Goal
----
Begin the V21.22 distant-terrain visual overhaul without changing vehicle
physics, road behavior, streaming policy or the stable baseline.

Changes
-------
- Distant horizon no longer uses the near-terrain topographic contour shader.
  The former 14 m major/minor contour bands are removed from the horizon.
- Distant colour is now generated from altitude + slope with a muted
  vegetation/rock palette. Three.js lighting supplies the actual hillshade so
  the horizon is not shaded twice.
- Low-frequency world-space colour breakup replaces high-frequency/cartographic
  striping.
- A small distance-based desaturation is applied before normal scene fog,
  improving atmospheric depth while preserving day/night lighting.
- Distant geometry receives progressive low-pass height smoothing beyond the
  near seam. The exact 3200 m near-terrain border and road-clearance corridors
  are protected from smoothing.
- Square-ring LOD rows increase from 13 to 15 while keeping the same 5860 m
  outer half-extent (~8.3 km corners). This reduces stretched mountain quads
  without increasing draw distance.
- Horizon material enables dithering and fog; it remains MeshStandardMaterial
  so time-of-day lighting still affects mountains.

Preserved
---------
- V21.21.27 near terrain: 3200 m / 256 segments.
- V21.21.27 road material and <=3 m road ribbon sampling.
- V21.21.27 route-ahead DEM/imagery prefetch.
- V21.21.26 vehicle behavior and all V21.21 physics.
- V21.21.25 steering rack.
- V21.21.23/24 F1 stability and steering.
- V21.21.19 right-lane assist.

Status
------
CANDIDATE — visual test required before any baseline promotion.

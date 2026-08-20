WORLD DRIVE V21.22.6 — SATELLITE / PROCEDURAL TERRAIN OWNERSHIP

Goal
----
Eliminate polygon-shaped procedural terrain bleed-through visible on top of loaded satellite chunks.

Root cause
----------
V21.22.5 correctly removed stretched satellite imagery, but satellite chunks and the procedural DEM remained two independent meshes. Even when both sampled the same elevation source, their grids and triangle diagonals differed. On slopes the surfaces crossed, producing large polygon-shaped green patches / z-fighting.

Fix
---
- Satellite chunks render before procedural terrain and write stencil ref 2.
- Near procedural DEM rejects pixels with stencil ref 2.
- Road-bed terrain clones inherit the same rejection policy.
- Distant procedural terrain also rejects ref 2.
- Chunk geometry density rises 72 -> 96 segments to better match the ~12.5 m near DEM grid.
- No vertical floating-layer hack is used.
- Missing chunks still reveal the natural procedural DEM fallback.

Preserved
---------
- V21.22.3 hitch-free streaming.
- V21.22.4 2D preload buffer.
- V21.22.5 exact geographic satellite chunks.
- V21.21.27 vehicle physics byte-for-byte.

World Drive V21.16 - Terrain Artifact Test 3

BASE: V21.16 rollback + safe terrain-only geometry work from Test 2.

IMPORTANT:
- src/main.js is byte-for-byte identical to V21.16.
- package.json is byte-for-byte identical to V21.16.
- road geometry/materials are NOT modified.
- only src/terrain.js changes.

What Test 3 targets from the latest Yungas screenshot:
1. the conspicuous dark-green terrain band/terrace following the road;
2. occasional green transition polygons appearing over neighbouring road branches.

Changes:
- Terrain grading is now elevation-aware when several switchback branches are close in X/Z.
  It no longer blindly picks the horizontally nearest road if another nearby branch matches
  the local DEM elevation much better.
- Directly under the visible road corridor, planar proximity still wins to preserve road
  clearance and prevent terrain from rising through asphalt.
- The visual transition ribbon is coloured from the untouched DEM appearance rather than
  from its artificial steep cut normal. This removes the dark-green painted-looking band
  in Photo OFF.
- Terrain transition triangles are rejected if their vertices, edge midpoints or centroid
  enter the protected corridor of ANY road branch.
- Transition terrain depth bias is pushed behind the road instead of toward the camera.

Goal: keep the road exactly as V21.16 while making the surrounding mountain cut look like
continuous terrain instead of an artificial dark ribbon/terrace.

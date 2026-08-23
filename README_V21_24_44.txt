World Drive V21.24.44 — Civic authored-light geometry fix

Fixes from the three user screenshots:
- removes all synthetic front/rear rectangle overlays;
- reverse now affects only rear clear-lamp triangles, never the windows;
- night running/brake logic affects only rear red-lamp triangles;
- front night glow affects clear upper headlamp triangles, not amber indicators;
- headlight SpotLights are parented to RootNode so the GLB internal 0.01 scale no longer places them ~100x away;
- projected headlight beam intensity increased.

Unchanged:
- Civic daylight brightness tuning;
- Civic physics;
- wheel/rim/disc animation and fixed calipers;
- WRX, ID.4, Countach and terrain.

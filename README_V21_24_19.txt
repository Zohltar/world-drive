World Drive V21.24.19 — ID.4 lighter visual model

Changes vs V21.24.18:
- replaced the detailed ID.4 GLB with a lighter optimized variant;
- removed mostly interior / secondary meshes that contribute little in normal external driving view;
- preserved the exterior body, wheels, rims, glass, and lamp-related geometry;
- preserved the ID.4 orientation fix, wheel/rim animation, and light logic.

Optimization summary:
- geometry count: 103 -> 94
- face count: 256,450 -> 218,337 (~14.9% reduction)
- asset size: ~15 MB -> ~9.2 MB

Note:
- This optimization intentionally favors third-person/external driving visuals. If later we want a premium cockpit view for the ID.4, we can keep a separate full-detail source for first-person only.

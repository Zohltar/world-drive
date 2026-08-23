World Drive V21.24.24 — WRX robust wheel animation + authored rear lights

Fixes vs V21.24.22/V21.24.23:
- no longer depends on exact Sketchfab wheel node names (GLTFLoader can sanitize punctuation);
- detects the four WRX wheel groups automatically;
- animates the actual tire/rim carrier node whose origin is the authored hub centre;
- all tire/rim/brake/hub pieces therefore roll together;
- front wheel assemblies steer using the simulated rack;
- brake glow uses the authored red lens / taillight / CHMSL geometry;
- reverse glow uses the authored reverse-light geometry;
- no extra permanent rear-light meshes are added.

Countach and ID.4 remain unchanged.

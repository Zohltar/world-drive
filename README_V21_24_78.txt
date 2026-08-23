World Drive V21.24.78 — Sonata true dark 80% opaque glass

Base: V21.24.75 strict red brake mask.

Fix:
- identified the real authored glass material: Material_13.002;
- identified why V21.24.76/.77 appeared unchanged: the GLB glass uses KHR_materials_transmission with transmissionFactor=1.0;
- explicitly sets transmission=0 and removes transmissionMap;
- applies a very dark blue-black tint and 0.80 opacity;
- preserves reflections with restrained roughness/env response.

Unchanged:
- brake-light mask;
- reverse lights;
- turn signals and V21.24.69 signal logic;
- physics and vehicle geometry.

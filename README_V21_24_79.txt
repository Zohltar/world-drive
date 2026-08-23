World Drive V21.24.79 — Sonata direct dark glass mesh override

Base: V21.24.75 (working brake/reverse/turn-signal lighting).

Window fix:
- identified the five actual glazing meshes in the Sonata GLB: Object_97, Object_94, Object_84, Object_72 and Object_62;
- replaces their authored transmissive materials directly with a dedicated dark MeshStandardMaterial;
- opacity: 0.80 (80% opaque);
- very dark blue-black tint;
- no KHR_materials_transmission path remains on these meshes.

Lighting logic is unchanged from V21.24.75.

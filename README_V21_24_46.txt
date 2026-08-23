World Drive V21.24.46 — Saia LTL articulated truck GLB candidate

Changes from V21.24.45:
- removes the second experimental truck profile (semi_cabover_glb) from the selectable fleet;
- keeps one truck profile only: semi_6x4;
- integrates the supplied saia_ltl_freight_-_truck_half_trailer.glb as the visual source for BOTH tractor and trailer;
- splits the combined GLB at runtime into tractor and trailer visual bodies while preserving the existing articulated trailer physics;
- detailed trailer shell remains attached to the trailer rigid-body group, so it yaws/pitches/rolls with the articulated trailer;
- mixed wheel/undercarriage geometry is spatially separated between tractor and trailer;
- procedural tractor/trailer visuals remain only as a fallback if the GLB cannot load;
- existing semi_6x4 mass, power, braking, steering, coupling and trailer dynamics are intentionally unchanged in this visual-conversion pass;
- passenger-car models and terrain/streaming code are unchanged.

Notes:
- The supplied asset is a shorter LTL/half-trailer combination. Its visual centre is offset inside the existing trailer physics group so the trailer nose meets the fifth wheel while retaining the proven articulation model.
- Imported GLB wheels are used visually in this first pass; detailed wheel-spin animation can be refined after scale/orientation/articulation are visually validated.

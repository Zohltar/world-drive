World Drive V21.24.92 — BMW i3 persistent procedural-wheel ghost suppression

Base: clean V21.24.86.

Fix:
- while the detailed i3 GLB is active, force all legacy/procedural wheel pivots invisible on every update frame;
- prevents a generic wheel/mag from being re-enabled behind the GLB wheel after the initial visual swap.

Preserved:
- +20% i3 scale;
- correct tire + rim rotation;
- front-only steering;
- existing i3 lights and materials.

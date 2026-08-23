World Drive V21.24.83 — Sonata centered wheel pivots

Fix:
- keeps the successful V21.24.82 4/4 sanitized wheel-node binding;
- computes the real visible wheel centre from each authored wheel subtree;
- inserts a dedicated spin pivot exactly at that hub centre;
- reparents the authored wheel under the pivot while preserving its world transform;
- wheel rolling now occurs around the hub instead of around the offset Blender group origin.

Unchanged:
- V21.24.79 dark glass;
- V21.24.75 lighting behavior;
- vehicle physics.

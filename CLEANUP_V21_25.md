# World Drive V21.25 Cleanup

Base: V21.24.94 (`1dec2a2`)
Branch: `cleanup/v21.25`

## Goal

Reduce legacy code and overlapping vehicle presentation paths without changing the proven V21.24.94 driving, terrain, lighting, or GLB behavior.

## Phase 1 — GLB-era vehicle visual cleanup

### Result

`src/vehicle-visuals.js` no longer constructs complete visible procedural passenger/race cars. It now keeps only the shared vehicle root, sprung body group, invisible wheel/suspension probes and the shared brake/headlight API required by the rest of World Drive.

The authored GLB modules are now the only visible local presentation path for:

- ID.4 -> `src/id4-glb.js`
- WRX -> `src/wrx-glb.js`
- Civic -> `src/civic-glb.js`
- Sonata -> `src/sonata-glb.js`
- Countach -> `src/countach-glb.js`
- F1 -> `src/f1-glb.js`
- BMW i3 -> `src/i3-glb.js`

### Validation

Manual regression test on 2026-08-23: no visible difference from V21.24.94 and the game remains functional after the probe-only conversion.

This validates that the procedural passenger-car bodies were no longer required by the current runtime presentation path.

### Preserved contract

The cleanup preserves the public contract consumed by `main.js`, suspension, skidmarks, multiplayer and presentation systems:

- `car`
- `bodyGroup`
- `wheels`
- `activeVehicleWheels()`
- brake/headlight state API
- wheel pivot positions and metadata required by suspension/skidmark/physics systems

## Phase 2 — orphan removal

The old primitive-only WRX builder `src/wrx-visual.js` had no remaining consumer after Phase 1 and has been removed. The authored `src/wrx-glb.js` remains the WRX presentation implementation.

## Phase 3 — prototype / diagnostic cleanup

Removed additional files that are no longer part of the current runtime or QA contract:

- `inspect-civic.mjs` — one-off GLB hierarchy diagnostic used during Civic integration.
- `src/assets/cabover_micro.glb` — superseded cab-over prototype; the current truck system loads `saia_ltl_freight_truck_half_trailer.glb`.
- `qa/V21_24_0_CABOVER_GLB_QA.mjs` — obsolete QA that still expected the removed `semi_cabover_glb` profile and old cab-over asset.

No production code path referenced the removed cab-over prototype; the current truck runtime remains the Saia articulated system.

## Main.js audit findings

The first focused audit found legacy naming/state that should be cleaned in a later isolated commit:

- `bodyHeave` is declared but has no other reference and is dead state.
- `countachBrakeLightRequested` and `countachReverseLightRequested` are now generic state used by every GLB vehicle, despite their Countach-specific names.
- No remaining `semi_cabover` runtime branch was found in `main.js`.

These are intentionally not changed in the same commit as asset deletion so runtime regressions remain easy to isolate.

## Remaining cleanup targets

### 1. GLB ownership terminology

Several GLB modules still use legacy helper names such as `hideProceduralVisuals()` / `restoreProceduralVisuals()`. The functions are still operationally useful because they temporarily hide shared probes/headlight infrastructure while a GLB owns presentation, but the naming/comments should be updated to reflect the new probe-only architecture.

### 2. Stale asset metadata

Some `vehicle-system.js` visual metadata still references older asset names while GLB modules load newer authored assets directly (for example the detailed ID.4). These metadata entries should be reconciled so there is one canonical asset reference per vehicle.

Two additional stale assets are intentionally retained until their metadata is corrected:

- `id4_2021.glb` — superseded by `id4_2021_detailed.glb`.
- `countach_80_real.glb` — byte-identical duplicate of canonical `countach_80.glb`.

### 3. Version labels

`index.html` still contains legacy `V21.7` labels hardcoded in several UI locations. Version display should eventually be centralized instead of duplicated in HTML.

### 4. Main.js

`src/main.js` is currently very large and contains accumulated version-specific compatibility paths. It should be cleaned in small isolated commits after vehicle visual ownership and asset metadata are simplified.

## Cleanup order

1. ✅ Replace visible procedural passenger-car geometry with probe-only infrastructure while preserving exact wheel probe coordinates and public API.
2. ✅ Manual regression validation: no visible/runtime regression observed.
3. ✅ Remove obsolete `wrx-visual.js`.
4. ✅ Remove one-off Civic inspector and obsolete cab-over prototype/QA.
5. Reconcile stale GLB asset metadata in `vehicle-system.js`.
6. Remove confirmed duplicate/superseded GLB assets after metadata reconciliation.
7. Rename/clarify obsolete procedural-fallback terminology in GLB modules.
8. Centralize application/version labels.
9. Audit and simplify `main.js` state in isolated commits.
10. Run final regression QA against V21.24.94 before merging to `dev` or `main`.

## Safety rule

V21.24.94 remains untouched and tagged as the stable rollback baseline. All V21.25 cleanup changes stay isolated on `cleanup/v21.25` until regression-tested.

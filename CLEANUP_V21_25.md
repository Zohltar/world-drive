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

## Remaining cleanup targets

### 1. GLB ownership terminology

Several GLB modules still use legacy helper names such as `hideProceduralVisuals()` / `restoreProceduralVisuals()`. The functions are still operationally useful because they temporarily hide shared probes/headlight infrastructure while a GLB owns presentation, but the naming/comments should be updated to reflect the new probe-only architecture.

### 2. Stale asset metadata

Some `vehicle-system.js` visual metadata still references older asset names while GLB modules load newer authored assets directly (for example the detailed ID.4). These metadata entries should be reconciled so there is one canonical asset reference per vehicle.

### 3. Version labels

`index.html` still contains legacy `V21.7` labels hardcoded in several UI locations. Version display should eventually be centralized instead of duplicated in HTML.

### 4. Main.js

`src/main.js` is currently very large and contains accumulated version-specific compatibility paths. It should be cleaned only after vehicle visual ownership and asset metadata are simplified, to avoid removing code that still participates indirectly in vehicle switching, suspension, lights or multiplayer.

## Cleanup order

1. ✅ Replace visible procedural passenger-car geometry with probe-only infrastructure while preserving exact wheel probe coordinates and public API.
2. ✅ Manual regression validation: no visible/runtime regression observed.
3. ✅ Remove obsolete `wrx-visual.js`.
4. Reconcile stale GLB asset metadata in `vehicle-system.js`.
5. Rename/clarify obsolete procedural-fallback terminology in GLB modules.
6. Centralize application/version labels.
7. Audit `main.js` for obsolete version-specific vehicle branches and duplicated state.
8. Run final regression QA against V21.24.94 before merging to `dev` or `main`.

## Safety rule

V21.24.94 remains untouched and tagged as the stable rollback baseline. All V21.25 cleanup changes stay isolated on `cleanup/v21.25` until regression-tested.

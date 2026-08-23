# World Drive V21.25 Cleanup

Base: V21.24.94 (`1dec2a2`)
Branch: `cleanup/v21.25`

## Goal

Reduce legacy code and overlapping vehicle presentation paths without changing the proven V21.24.94 driving, terrain, lighting, or GLB behavior.

## Phase 1 audit

### 1. Legacy procedural vehicle visuals

`src/vehicle-visuals.js` still constructs complete visible procedural cars (body, glass, lamps, tires and rims) for vehicles that now have authored GLB systems:

- ID.4 -> `src/id4-glb.js`
- WRX -> `src/wrx-glb.js`
- Civic -> `src/civic-glb.js`
- Sonata -> `src/sonata-glb.js`
- Countach -> `src/countach-glb.js`
- F1 -> `src/f1-glb.js`
- BMW i3 -> `src/i3-glb.js`

The GLB modules currently hide/restore those procedural meshes at runtime. This creates two presentation systems for the same vehicle and is a likely source of ghost geometry / ownership conflicts.

### 2. What must be preserved

Do **not** remove the invisible wheel/suspension probes used by physics and `vehicle-presentation.js`.

The cleanup must preserve the public contract currently consumed by `main.js` and other systems:

- `car`
- `bodyGroup`
- `wheels`
- `activeVehicleWheels()`
- brake/headlight state API
- wheel pivot positions and metadata required by suspension/skidmark/physics systems

### 3. GLB ownership

After cleanup, authored GLB modules should be the only visible passenger-car presentation path. Procedural wheel probes may remain, but their renderable tire/rim meshes should no longer be required as visual fallback for migrated vehicles.

### 4. Stale asset metadata

Some `vehicle-system.js` visual metadata still references older asset names while GLB modules load newer authored assets directly (for example the detailed ID.4). These metadata entries should be reconciled after the presentation cleanup so there is one canonical asset reference per vehicle.

### 5. Main.js

`src/main.js` is currently very large and contains accumulated version-specific compatibility paths. It should be cleaned only after vehicle visual ownership is simplified, to avoid removing code that still participates indirectly in vehicle switching, suspension, lights or multiplayer.

## Cleanup order

1. Replace visible procedural passenger-car geometry with probe-only infrastructure while preserving exact wheel probe coordinates and public API.
2. Validate all seven GLB vehicles: selection, wheel suspension, steering, braking, reverse lamps, headlights, camera and skidmarks.
3. Remove now-unused procedural material/build helpers and `wrx-visual.js` if it has no remaining consumer.
4. Reconcile stale GLB asset metadata in `vehicle-system.js`.
5. Audit `main.js` for obsolete version-specific vehicle branches and duplicated state.
6. Run regression QA against V21.24.94 before merging to `dev` or `main`.

## Safety rule

V21.24.94 remains untouched and tagged as the stable rollback baseline. All V21.25 cleanup changes stay isolated on `cleanup/v21.25` until regression-tested.

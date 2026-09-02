# World Drive — Evolution & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable fallback: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

GitHub state + this file override chat memory when they disagree.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding/architecture/QA conversation:

1. Read this file from current `dev`.
2. Read live HEADs of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If a checkpoint names a candidate/audit branch, inspect it before editing.
6. Resume the exact **Next action** unless the user changes priority.
7. Structural work uses: read-only audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint when behavior/visual/performance can change.
8. **Never move `main` without explicit user approval.**
9. Phase R is structural only: no physics/visual/terrain/forest tuning mixed in.
10. Do not mix dependency/security or GitHub Actions runtime maintenance into structural work.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization  
**Active item:** **R6.4 — water/hydrography rollback verification**  
**State:** **R6.4 MOVE FAILED HUMAN SMOKE → ROLLBACK INTEGRATED → HUMAN RETEST NEXT**  
**Current validated runtime/CI dev HEAD before this documentation commit:** `3327ae7e3dd9e533e82abf7fb48b19b69f79c25b`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Latest exact-head Dev Integration before this documentation commit:** run `33627194880` on `3327ae7e3dd9e533e82abf7fb48b19b69f79c25b` — **PASS, 97/97**  
**Dedicated hydro runtime coverage:** run `33627194772` — **PASS**  
**Rollback candidate evidence:** `candidate/r6-water-rollback`, run `33626992531` — **PASS**

## Human R6.4 failure

The attempted R6.4 path-only move placed water implementations under `src/water/` behind root facades. Automation passed, but the human smoke found a material runtime defect:

- hydrography did not appear to load;
- rivers were missing;
- bridges sourced by hydro were missing at the same time.

This invalidated R6.4 despite green automation.

GitHub issue: **#3 — `R6.4: hydrography and bridges missing after water module move`**.

## Rollback disposition

R6.4 has been rolled back to the previously proven root layout:

```text
src/water-data.js
src/water-renderer.js
src/forest-water-assets.js
```

The failed nested files are removed:

```text
src/water/water-data.js
src/water/water-renderer.js
```

The failed R6.4 source-tree gate was removed. Water/hydro remains an intentional root boundary for the rest of Phase R unless a future independent audit proves a safer architecture.

No hydro query, cache TTL, rendering algorithm, shoreline logic, bridge logic or forest/water styling was tuned during the rollback.

## New permanent hydro coverage

Added:

- `qa/qa-water-hydro-runtime.mjs`
- `.github/workflows/qa-water-hydro-runtime.yml`

This now verifies:

- root `createWaterDataService` and `createWaterRenderer` exports;
- visible hydro load on a cache miss;
- river ingestion;
- bridge ingestion;
- hydro cache write;
- reset semantics;
- `main.js` root water imports;
- actual Vite-served `/src/water-data.js` and `/src/water-renderer.js` HTTP paths.

This coverage exists because the previous source-tree/build tests did not catch the human-visible failure.

## Exact next action

**Human retest of the rolled-back water layout on current `dev`.**

Test a route known to contain hydrography and verify:

- rivers/lakes/reservoirs appear again;
- bridges appear again;
- water surfaces remain flat and visually normal;
- no giant blue facets or missing strips;
- scenery/forest remain normal;
- preferably route reload or a second route.

If hydro + bridges are restored, record **PASS**, close issue #3 as resolved by rollback, and close R6 with water marked **KEEP ROOT**. Then begin **R7 with read-only audit only**.

If hydro is still missing after rollback, stop structural work and diagnose Overpass/cache/runtime loading before any R7 work.

---

# 2. Deferred observed defects

## Issue #2 — intermittent delayed terrain adjustment after route startup

During R6.3a, one Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were already visible. It converged on its own and could not be reproduced after relaunch.

Observed telemetry:
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count increased from 5 to 9;
- `maxFrameMs:194.4`.

Current hypothesis only: deferred terrain↔road transition preparation. **Do not tune during R6/R7.** Revisit in **R8 terrain/imagery/local-world/streaming** with full `WorldDriveFramePacing()` diagnostics if reproducible.

## Issue #3 — hydrography and bridges missing after R6.4 move

Human FAIL triggered rollback. Current state: **rollback integrated, human retest pending**.

---

# 3. CLOSED / CERTIFIED STRUCTURAL WORK

## R2 — Multiplayer

**DONE — automation + human PASS.**  
Root lazy facades retained; implementation under `src/multiplayer/`.  
Permanent gate: `qa/qa-source-tree-r2-multiplayer.mjs`.

## R3 — Civil traffic

**DONE — automation + human PASS.**  
Implementation under `src/traffic/`.  
Permanent gate: `qa/qa-source-tree-r3-traffic.mjs`.

## R4 — Vehicles / presentation / models / truck

**DONE — automation + human PASS.**  
Implementation organized under `src/vehicles/`, including `models/` and `truck/`.

## R4.5 — Audio

**DONE — automation + human PASS.**

```text
src/audio/audio.js
src/audio/audio-base.js
```

## QA root-layout cleanup

**DONE — automation + human PASS.**  
Canonical QA location: `qa/`.  
Permanent gate: `qa/QA_ROOT_LAYOUT_QA.mjs`.

## R5a — Core vehicle dynamics

**DONE.**

```text
src/physics/vehicle-dynamics.js
src/physics/vehicle-dynamics-core.js
src/physics/vehicle-dynamics-traction-steering.js
```

No physics tuning was part of the move.

## R5b.1 — Wheel-ground support

**DONE — automation + human PASS.**

```text
src/wheel-ground-support.js                  -> root facade
src/physics/wheel-ground-support.js          -> implementation
```

Implementation blob preserved: `54e11aba7d2543981f7c0a9f517a293ac47c18ae`.

## R5b.2 — Transmission network/runtime state

**DONE — automation + human PASS.**

```text
src/transmission-network-state.js            -> root facade
src/transmission-runtime-bridge.js            -> root facade
src/physics/transmission-network-state.js     -> implementation
src/physics/transmission-runtime-bridge.js    -> implementation
```

Preserved semantics: `R=-1`, `N=0`, forward `1..N`.

## R5 closure — intentional root boundaries

**R5 CLOSED.**

Keep root:
- `src/driving-runtime.js`;
- `src/driving-runtime-base.js` — defer architectural clarification to O6;
- `src/transmission-controller.js`;
- `src/skidmarks.js`.

## R6.1 — Road furniture/signs

**DONE — automation + human PASS.**

```text
src/road-furniture.js              -> root facade
src/road/road-furniture-p930.js
src/road/road-furniture-p937.js
```

Permanent gate: `qa/qa-source-tree-r6-road-furniture.mjs`.

## R6.2 — Road geometry + bridge interactions

**DONE — automation + human PASS.**

```text
src/road-geometry.js               -> root facade
src/road/road-geometry.js          -> implementation
src/bridges.js                     -> intentionally root
```

Road implementation blob preserved: `5c4f928cead5423e6591766c81528f5eaa7055a2`.

Permanent gate: `qa/qa-source-tree-r6-road-geometry.mjs`.

## R6.3a — Scenery renderer

**DONE — automation + accepted human PASS.**

```text
src/scenery-renderer.js            -> root facade
src/scenery/scenery-renderer-p9.js
src/scenery/scenery-renderer-p933.js
```

Permanent gate: `qa/qa-source-tree-r6-scenery-renderer.mjs`.

Exact-head evidence before R6.4: Dev Integration `33590338958` — **97/97**.

## R6.3b — Forest runtime family

**CLOSED — KEEP ROOT. No runtime move.**

Keep root intentionally:

```text
src/forest-authored-lite.js
src/forest-chunk-streamer-core.js
src/forest-chunk-streamer.js
src/forest-proxy-assets.js
src/forest-streaming-policy.js
src/forest-terrain-sampler.js
src/forest-water-assets.js
```

Reason: these files carry performance-sensitive streaming, cache, prefetch, frame-budget, startup and diagnostics contracts; moving them would create high path churn for little ownership gain. `forest-water-assets.js` is also shared with water.

---

# 4. Operating principles / prohibitions

1. **One intent per commit.**
2. **Phase R must not tune behavior.**
3. **Move first, rename later.** Historical names belong to Phase O.
4. **Audit before editing.**
5. **Candidate before dev** for material structural work.
6. **Exact final `dev` HEAD must pass Dev Integration.**
7. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
8. **Human FAIL overrides green automation.** Roll back first when behavior preservation is violated.
9. **No silent debt discoveries.** Log material defects/issues.
10. **Never touch `main` without explicit user approval.**

Do not mix into structural Phase R:
- physics/handling tuning;
- road/terrain/visual tuning;
- forest density/priority/budget/prefetch/cache tuning;
- transmission/clutch/brake semantic changes;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup.

---

# 5. Protected behavior contracts

## Driving / physics

Preserve per-wheel tire forces, braking/ABS, handbrake/J-turn, load transfer, high-speed stability, airborne/landing, terrain→road support re-entry and skid/contact alignment.

## Road / bridges

Preserve robust road mesh, smoothing, banking/superelevation, terrain authority, bridge deck height interpolation, bridge approaches, route reset/profile ownership.

## Scenery / forest

Preserve scenery visibility, P9/P933 composition, forest asset timing, startup forward coverage, priority/prefetch/cache lifecycle, frame budget, hitch attribution and floating-origin behavior.

## Water / hydrography

Preserve:
- hydro/coastline/bridge OSM query scope;
- 30-day hydro cache TTL;
- water/bridge/coastline ingest + dedup + generation/reset semantics;
- river ribbon flat-water behavior;
- shoreline binary search;
- three-pass profile smoothing;
- polygon/coastline geometry;
- authored forest/water style sharing;
- road-over-water stencil priority;
- bridge-over-water orchestration;
- root `forest-water-assets.js` shared boundary.

## Terrain / streaming / performance

Preserve cache reuse/preload, imagery/procedural transitions, near/medium/far continuity, photo ON/OFF quality, forest frame pacing and low-hitch long-route behavior.

---

# 6. PHASE R roadmap

- **R1 — runtime path/import/QA inventory:** DONE.
- **R2 — multiplayer:** DONE automation + human PASS.
- **R3 — traffic:** DONE automation + human PASS.
- **R4 — vehicles/presentation/models/truck:** DONE automation + human PASS.
- **R4.5 — audio:** DONE automation + human PASS.
- **QA root-layout cleanup:** DONE automation + human PASS.
- **R5a — core vehicle dynamics:** DONE.
- **R5b — runtime/transmission/wheel support:** CLOSED.
- **R6.1 — road furniture/signs:** DONE automation + human PASS.
- **R6.2 — road geometry + bridge interactions:** DONE automation + human PASS.
- **R6.3a — scenery renderer:** DONE automation + accepted human PASS.
- **R6.3b — forest runtime:** CLOSED — KEEP ROOT.
- **R6.4 — water:** **FAILED move; rollback integrated; human rollback retest pending.**
- **R7 — app/input/ui/routing/services:** BLOCKED until R6.4 rollback human PASS; then read-only audit first.
- **R8 — terrain/imagery/local-world/streaming:** LAST / performance-sensitive; revisit issue #2 here.
- **R9 — permanent root-cleanliness gate:** after migrations stabilize.

---

# 7. PHASE O — responsibility naming / historical cleanup

Only after relevant Phase R folders are stable.

- O1 Multiplayer historical names.
- O2 Road-furniture P930/P937 names.
- O3 Vehicle-presentation historical version name.
- O4 Scenery P9/P933 names.
- O5 Audio base naming if useful.
- O6 Driving runtime base/public runtime architecture.
- O7 Terrain/imagery/local-world/streaming names after R8.

---

# 8. Maintenance debt — keep separate

## C-M1 — Dependency/security audit

Known discovery: `npm ci` reports **25 vulnerabilities: 3 low, 21 high, 1 critical**.

Rules:
- inspect dependency tree first;
- distinguish runtime vs dev/build-only risk;
- **no `npm audit fix --force`**;
- validate Electron/Forge/Vite changes independently.

## C-M2 — GitHub Actions runtime hygiene

Node action-runtime deprecation/Node 24 warnings remain separate from Phase R.

---

# 9. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Road geometry | C3 + smoothing/banking/superelevation + terrain authority |
| Road furniture/signs | R6 road-furniture + sign runtime/minimap/geographic signs |
| Scenery renderer | R6 scenery + P9.25 + startup/retention gates |
| Forest / streaming | active forest + P9.29/P9.35–P9.42 |
| Water / hydrography | `qa/qa-water-hydro-runtime.mjs` + `Water Hydro Runtime QA` + human visible hydro/bridge smoke |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human visible validation.

---

# 10. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:
1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

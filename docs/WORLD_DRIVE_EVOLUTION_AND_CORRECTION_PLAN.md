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
7. Use certified blocks: audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint where behavior/visual/performance can change.
8. **Never move `main` without explicit user approval.**
9. Do not mix dependency/security or GitHub Actions runtime maintenance into structural/correction work.
10. Human-visible FAIL overrides green automation.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R8 terrain / imagery / local-world / streaming**  
**State:** **R8.0 AUDIT + QA BASELINE DONE — no production runtime change**  
**R8.0 integration head before this documentation commit:** `22d28ac1762d774253027185d02252ee9d6874ec` — `QA: make R8 streaming baseline permanent`  
**Focused R8 baseline:** run `33680675720` — **PASS** on `22d28ac1762d774253027185d02252ee9d6874ec`  
**Dev Integration:** run `33680675787` — **PASS 100/100** on `22d28ac1762d774253027185d02252ee9d6874ec`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Main rule:** `main` remains untouched without explicit user approval.

R8.0 established permanent current streaming coverage:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

`qa/DEV_INTEGRATION_AUDIT.mjs` now permanently executes the isolated R8 streaming baseline before the historical source-tree audit. The R8 runner executes **14/14** current contracts covering P9.17 through P9.27, including route-cache reset and both P9.23 prepared-refresh/scheduler gates. Terrain R1/R2 and P9.37–P9.42 remain separate permanent Dev Integration steps.

## Exact next action — R8.1 issue #2 diagnostics only

Do **not** reorganize terrain/imagery/streaming production files yet.

Open a small candidate whose only runtime-visible intent is to improve diagnostics for deferred issue #2 (`Intermittent delayed terrain adjustment after route startup`). The candidate should expose enough timing/state to distinguish:

1. initial forced/synchronous local-world boot commit;
2. a later prepared P9.23/P9.27 refresh;
3. DEM/hydro dirty-triggered refresh after boot;
4. imagery geometry invalidation / sequential chunk resampling after a terrain commit;
5. browser/render long-frame activity unrelated to a world rebuild.

Preferred additive telemetry in existing diagnostics:

- imagery geometry invalidation generation/count;
- pending/resampled chunk count;
- invalidation start/end timestamps or durations;
- last invalidation reason when the caller can supply it safely;
- active/pending geometry refresh state;
- enough boot/commit correlation to compare with `localWorldPhases`, `visualJobs`, P9.27 and P9.39.

Requirements:

- **diagnostic-only**: no terrain visual tuning, no imagery quality change, no scheduling/cooldown/budget change;
- candidate first;
- focused QA must prove telemetry is additive and existing contracts remain unchanged;
- if issue #2 can be reproduced, human Manic-5 startup evidence decides ownership before any fix;
- if it cannot be reproduced, do not invent a corrective change.

---

# 2. R8.0 read-only audit — CLOSED

## 2.1 Current ownership map

### `src/world-streaming.js`

Owns **WHEN** visible world services refresh and route-ahead caches prefetch. Individual loaders/renderers continue to own **HOW** content loads or renders.

Current visible refresh thresholds:

```text
elevation:     1400 m
water:         2200 m
scenery:       2600 m
imagery:        700 m
roadMetadata:   700 m
signs:         2500 m
```

Directional prefetch defaults:

```text
step:  850 m
near: 1800 m
far:  3600 m
```

### `src/streaming-coordinator.js`

Owns scheduler/arbitration, prepared refresh lifecycle, visual-job scheduling, imagery commit deferral, local-world phase timing and hitch attribution.

Important invariant:

```text
periodic refresh -> prepared incremental path
forced boot/route/reset -> proven synchronous P9.13 path
```

### Local-world builder chain

```text
src/local-world-builder.js
  -> src/local-world-builder-p926.js
    -> src/local-world-builder-p925.js
```

Responsibilities include incremental near-ground preparation, horizon preparation, atomic commits, road replay/prebuild, hydro/scenery rebuild orchestration, forest retention and deferred P9.27 road-transition work after prepared commits.

### Terrain chain

```text
src/terrain.js                 P9.27 road↔terrain transition
  -> src/terrain-p926.js       P9.26 distant/horizon LOD
    -> src/terrain-p925.js     P9.25 near ground / road-bed base
```

Protected terrain behavior remains authoritative; R8 is not permission to retune it.

### Imagery

```text
src/imagery.js
  -> src/imagery-p913.js
```

Imagery remains separate georeferenced satellite geometry over the procedural/terrain underlay. It keeps its own chunk cache, queue, build lifecycle and geometry invalidation/resampling path.

### Other owners

- `src/elevation.js`: Terrarium DEM fetch/cache/interpolation + route-ahead elevation prefetch.
- `src/world-scene.js`: static scene composition and group hierarchy; not mutable streaming policy.
- `src/routing/route-lifecycle.js`: route startup sequencing and forced initial local-world commit.

## 2.2 Issue #2 ownership finding

Deferred issue #2 was previously suspected to involve the delayed P9.27 road-transition path. R8 audit shows that assumption is incomplete:

- route startup calls the **forced synchronous** local-world commit;
- P9.27 is the prepared-periodic transition path and therefore does **not directly own the first boot commit**;
- P9.27 can still appear later if a post-boot DEM/hydro/world-dirty refresh occurs.

A more directly compatible **hypothesis** is imagery geometry invalidation after the synchronous terrain commit:

1. route startup can prepare/await satellite imagery;
2. terrain/local-world then performs the forced boot commit;
3. imagery geometry is invalidated to match the new terrain surface;
4. existing satellite chunks are resampled sequentially after commit guards / idle turns;
5. a large area could therefore appear temporarily unadjusted while road + forest are already visible.

**This is a hypothesis, not a diagnosis.** No production fix is authorized until the symptom is reproduced and diagnostics correlate the visible correction with one of the runtime paths above.

Useful existing evidence surface:

```text
WorldDriveFramePacing()
  pendingWorld
  localWorldPhases
  p923.builder.p927RoadTransition
  visualJobs
  imagery queue/build/commit state
  p939HitchAttribution
  frame/browser long-frame snapshots
```

R8.1 should make imagery geometry invalidation equally observable.

## 2.3 QA gap found and closed

Before R8.0, current-valid P9.17–P9.27 streaming tests existed in the historical `Foret Streaming QA` workflow but were not executed by exact-head `dev` certification. `npm run qa:stress` did not cover them, and A8 only checked that current ownership/tests existed.

R8.0 closed that gap without touching production source.

Historical V21.21/V21.25 streaming tests remain historical and are **not** authoritative when they assert superseded sizes, thresholds or source locations. Never alter current runtime merely to satisfy a stale historical assertion.

---

# 3. R7 app/input/UI/routing/services — CLOSED

R7 reorganized the remaining application-facing source-root ownership without changing intended runtime behavior. Human Electron validation passed.

Permanent boundary QA:

```text
qa/qa-source-tree-r7-input.mjs
qa/qa-source-tree-r7-routing.mjs
qa/qa-source-tree-r7-ui.mjs
qa/qa-source-tree-r7-app-services.mjs
```

Application implementations live under `src/app/`; service implementations live under `src/services/`; stable root compatibility facades remain intentionally available.

Preserved invariants include settings identity/persistence, input behavior, routing lifecycle, UI behavior, package-derived branding, diagnostics identity, cache semantics, Overpass failover/pacing/cooldown and Electron desktop Overpass transport.

R7 final human Electron smoke: **PASS**.

---

# 4. OSM / Geofabrik reliability — CLOSED FOR QUEBEC HYDRO

GitHub issue #3 — `Overpass shared pipeline can make hydrography and scenery unavailable together` — **CLOSED / completed 2026-09-02**.

Implemented direction:

```text
Geofabrik Quebec .osm.pbf
  -> offline preprocessing
  -> 16 km World Drive spatial tiles
  -> hydro-only gzip v2 tiles
  -> local-first hydro reader
  -> existing water ingest/render semantics
  -> Overpass fallback outside covered local tiles
```

Generated/source data remain ignored by Git:

```text
world-data/
public/world-data/
```

Do not commit or silently bundle the Quebec dataset until packaging/distribution is explicitly decided.

Final coastline-corrected v1:

```text
inputFeatures:    12,347,944
emittedFeatures:   7,660,197
oversizeFeatures:         20
tileRecords:       7,966,008
tileCount:            19,255
tileSizeMeters:        16,000
water:             3,040,174
waterway:          2,178,612
bridge:               24,490
dam:                   4,108
```

Accepted hydro gzip v2:

```text
format:                    world-drive-osm-hydro-jsonl-gzip-v2
hydro tileCount:           18,757
hydro records:             5,503,776
parseErrors:               0
uncompressedSize:          10.20 GB
compressedSize:             2.92 GB
compressionRatio:          0.2867
reductionPercent:          71.33%
average compressed tile:   163.4 KB
max compressed tile:         1.9 MB
max uncompressed tile:       6.7 MB
oversize hydro records:          6
```

Decision: gzip v2 passes the storage/runtime gate. No geometry simplification or MVT/PMTiles conversion is justified now.

Known Manic local-hydro human smoke: **PASS**.

---

# 5. Deferred issue #2 — terrain startup adjustment

Issue remains **OPEN / intermittent / not yet diagnosed**.

Original observation on Manic-5:

- large near-terrain area briefly dark/unadjusted;
- road + forest already visible;
- converged after several seconds;
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count 5 → 9;
- `maxFrameMs:194.4`;
- not reproducible after settled/relaunch tests.

R8 audit now explicitly rejects assuming P9.27 owns the initial symptom. See R8.1 diagnostic plan above.

---

# 6. CLOSED / CERTIFIED STRUCTURAL WORK

- R1 source-root audit: DONE.
- R2 multiplayer: DONE automation + human PASS.
- R3 civil traffic: DONE automation + human PASS.
- R4 vehicles/presentation/models/truck: DONE automation + human PASS.
- R4.5 audio: DONE automation + human PASS.
- QA root-layout cleanup: DONE automation + human PASS.
- R5 vehicle dynamics / wheel-ground / transmission: CLOSED; no physics tuning.
- R6.1 road furniture/signs: DONE automation + human PASS.
- R6.2 road geometry/bridges: DONE automation + human PASS.
- R6.3 scenery/forest: CLOSED; scenery moved, forest KEEP ROOT.
- R6.4 water structural move: FAILED human smoke, rolled back; water KEEP ROOT.
- OSM Quebec hydro reliability / issue #3: CLOSED, local-first gzip v2 + human PASS.
- R7 app/input/UI/routing/services: DONE automation + human PASS.
- R8.0 audit + permanent QA baseline: DONE, no runtime change.

Intentional root water layout:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

---

# 7. Operating principles / prohibitions

1. **One intent per commit.**
2. **Audit before editing.**
3. **Candidate before dev** for material runtime/correction work.
4. **Exact final `dev` HEAD must pass Dev Integration.**
5. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
6. **Human FAIL overrides green automation.**
7. **No silent debt discoveries.**
8. **Never touch `main` without explicit user approval.**
9. Keep generated Geofabrik source/tiles out of Git until packaging is explicitly decided.
10. Migrate data consumers incrementally; do not combine unrelated layers.
11. A green QA does not authorize a production runtime change without its own candidate and required human smoke.

Do not mix into R8:

- physics/handling tuning;
- terrain/road/forest visual tuning unless a later explicitly approved R8 correction requires it;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup;
- scenery/sign offline migration;
- regional-data packaging decisions.

---

# 8. Protected behavior contracts

## Driving / physics

Preserve tire forces, braking/ABS, handbrake/J-turn, load transfer, high-speed stability, airborne/landing, terrain→road support and skid/contact alignment.

## Road / bridges

Preserve robust road mesh, smoothing, banking/superelevation, terrain authority, bridge deck interpolation, bridge approaches and route/profile ownership.

## Scenery / forest

Preserve scenery visibility, P9/P933 composition, forest asset timing, startup coverage, priority/prefetch/cache lifecycle, frame budget and hitch attribution.

## Water / hydrography / OSM

Preserve water/bridge/coastline ingest semantics, river/polygon/coastline rendering, bridge-over-water orchestration, authored style sharing, local-first Quebec hydro, fallback outside covered tiles, visible corrupt-local failure and OSM attribution/ODbL obligations.

## App / input / UI / routing / services

Preserve stable R7 public root paths, settings identity/persistence, input bindings, routing lifecycle/presets, startup/menu/HUD/minimap/compass behavior, branding, diagnostics aliases, cache semantics, Overpass fallback and Electron transport.

## Terrain / imagery / streaming / performance

Preserve:

- forced synchronous boot/route/reset path until separately proven safe to change;
- prepared incremental periodic refresh semantics;
- near-ground, horizon and road-transition continuity;
- terrain road-bed / visible-earthwork authority;
- imagery as separate satellite geometry over the underlay;
- road-aware imagery height alignment;
- cache reuse and route-ahead prefetch;
- photo ON/OFF quality;
- forest retention/frame pacing;
- low-hitch long-route behavior;
- current P9.17–P9.27 and P9.37–P9.42 contracts.

---

# 9. PHASE R roadmap

- R1: DONE.
- R2 multiplayer: DONE.
- R3 traffic: DONE.
- R4 vehicles/presentation/models/truck: DONE.
- R4.5 audio: DONE.
- QA root-layout: DONE.
- R5: CLOSED.
- R6.1 road furniture/signs: DONE.
- R6.2 road geometry/bridges: DONE.
- R6.3 scenery/forest: CLOSED.
- R6.4 water: KEEP ROOT after failed structural move.
- OSM Quebec hydro reliability: DONE; issue #3 CLOSED.
- R7 app/input/UI/routing/services: DONE.
- **R8.0 terrain/imagery/local-world/streaming audit + baseline: DONE.**
- **R8.1 issue #2 diagnostic attribution: NEXT.**
- R8 structural moves/corrections: only after R8.1 evidence and separate candidate decisions.
- R9 permanent root-cleanliness gate: after R8 stabilizes.

---

# 10. PHASE O — historical naming cleanup

Only after relevant Phase R folders are stable. Terrain/imagery/local-world/streaming historical P9 naming belongs to O7, **after R8**, not during issue #2 diagnosis.

---

# 11. Maintenance debt — keep separate

## C-M1 dependency/security

Latest R7-era audit output reported 27 vulnerabilities: 3 low, 1 moderate, 22 high, 1 critical. Inspect separately; distinguish runtime from dev/build risk. **Never run `npm audit fix --force` as part of structural work.**

## C-M2 GitHub Actions runtime hygiene

Node action-runtime deprecation / forced Node 24 warnings remain separate from Phase R work. Do not upgrade Actions opportunistically in R8.

---

# 12. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| R8 current ownership | `qa/qa-r8-current-ownership.mjs` |
| R8 P9.17–P9.27 | `qa/qa-r8-streaming-baseline.mjs` + focused R8 workflow |
| Terrain visual ownership | `qa/qa-terrain-r1-legacy-ownership.mjs` |
| Terrain/road imagery alignment | `qa/qa-terrain-r2-road-imagery.mjs` |
| Frame pacing / hitch attribution | P9.37–P9.42 permanent gates + `WorldDriveFramePacing()` |
| R8.1 issue #2 | focused diagnostics QA + repeated human Manic-5 startup observation if reproducible |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Water/hydrography | `qa/qa-water-hydro-runtime.mjs` + human hydro/bridge smoke |
| Offline Quebec hydro | `qa/qa-geofabrik-hydro-runtime-r1.mjs` + known Manic human smoke |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 13. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:

1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

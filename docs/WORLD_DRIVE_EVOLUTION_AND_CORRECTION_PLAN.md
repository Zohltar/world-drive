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
10. Human-visible FAIL overrides green automation; A/B validation may establish that a visible defect predates a candidate.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R8 terrain / imagery / local-world / streaming**  
**State:** **R8.2 IMAGERY STRUCTURAL MOVE DONE — automation green; human A/B confirms no candidate regression**  
**Current `dev`:** `cc6cfdbace19c78f54d265bb0cebd530d1fa8de4` — `QA: certify R8 nested imagery boundary`  
**R8 imagery exact-head:** run `33684487380` — **PASS**  
**R8 baseline exact-head:** run `33684487355` — **PASS**  
**Dev Integration exact-head:** run `33684487357` — **PASS 100/100**  
**Human checkpoint:** Photo ON normal; Photo OFF black procedural patches reproduced on both candidate and pre-R8.2 `dev`, therefore R8.2 is **non-causal / accepted**.  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Main rule:** `main` remains untouched without explicit user approval.

Current imagery layout:

```text
src/imagery.js                  # stable current root owner
src/imagery/imagery-p913.js     # historical P9.13 implementation, moved byte-for-byte
```

R8.2 permanent certification:

```text
qa/qa-source-tree-r8-imagery.mjs
.github/workflows/qa-source-tree-r8-imagery.yml
qa/DEV_INTEGRATION_AUDIT.mjs     # includes R8.2 boundary
```

GitHub recognized `src/imagery-p913.js` → `src/imagery/imagery-p913.js` as a pure rename with **0 additions / 0 deletions**. `src/imagery.js` changed only its import path. Existing R8 ownership, P9.13 transition, Terrain R1/R2, issue #2 diagnostics and C6 global-inventory contracts were updated to the new implementation path and remain green.

## Exact next action — R8.3 scheduler historical-base micro-audit

Do **not** fix issue #4 inside this structural step and do **not** move the terrain chain yet.

Perform a **read-only audit first** of:

```text
src/streaming-coordinator.js
  -> src/streaming-coordinator-p913.js
```

Determine:

- direct runtime fan-in of `streaming-coordinator-p913.js`;
- every QA/workflow/global-inventory path contract naming it;
- whether `src/streaming-coordinator.js` should remain the stable current root owner;
- whether moving only the historical P9.13 base under `src/streaming/` is structural-only;
- whether any globals/polyfills or issue #2 diagnostics depend on the old path;
- required focused automation and human long-route/perf smoke.

Preferred next candidate, only if audit confirms low risk:

```text
src/streaming-coordinator.js
src/streaming/streaming-coordinator-p913.js
```

Keep historical filename unchanged; renaming belongs to Phase O7.

---

# 2. R8 ownership and certified work

## R8.0 — audit + permanent streaming baseline: DONE

Current ownership map:

```text
src/world-streaming.js
  WHEN services refresh / route-ahead prefetch

src/streaming-coordinator.js
  scheduler/arbitration, prepared refresh lifecycle, visual jobs,
  imagery commit deferral, phase timing, hitch attribution

src/local-world-builder.js
  -> src/local-world-builder-p926.js
    -> src/local-world-builder-p925.js

src/terrain.js
  -> src/terrain-p926.js
    -> src/terrain-p925.js

src/imagery.js
  -> src/imagery/imagery-p913.js

src/elevation.js
  DEM fetch/cache/interpolation + route-ahead elevation prefetch

src/routing/route-lifecycle.js
  route startup + forced initial local-world commit
```

Critical invariant:

```text
periodic refresh -> prepared incremental path
forced boot/route/reset -> proven synchronous P9.13 path
```

Permanent R8 baseline:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

The isolated baseline executes **14/14 current contracts** covering P9.17→P9.27, including route-cache reset and both P9.23 prepared-refresh/scheduler gates. Terrain R1/R2 and P9.37→P9.42 remain separately permanent.

Visible refresh thresholds remain:

```text
elevation:     1400 m
water:         2200 m
scenery:       2600 m
imagery:        700 m
roadMetadata:   700 m
signs:         2500 m
```

Directional prefetch defaults remain:

```text
step:  850 m
near: 1800 m
far:  3600 m
```

## R8.1 — issue #2 diagnostics: DONE

Issue #2: `Intermittent delayed terrain adjustment after route startup` remains **OPEN / watch-only / not diagnosed**.

R8 audit established that P9.27 does not directly own the initial route boot because startup uses the forced synchronous local-world commit. Imagery geometry invalidation/resampling after that commit is a plausible alternative hypothesis, but **not a diagnosis**.

Permanent additive telemetry:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
qa/qa-r8-issue2-imagery-diagnostics.mjs
.github/workflows/qa-r8-issue2-diagnostics.yml
```

Human R8.1 smoke: **PASS; original symptom not reproduced**. Captured state included ~143.88 FPS, hitchCount 15, maxFrameMs 215.3, no pending world refresh, 2 prepared starts / 2 commits / 0 discards, imagery queue empty at capture. The nested R8 geometry object was not expanded, so the imagery hypothesis remains unproven.

If issue #2 returns, capture before convergence:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
WorldDriveFramePacing().localWorldPhases
WorldDriveFramePacing().p923
WorldDriveFramePacing().visualJobs
WorldDriveFramePacing().p939HitchAttribution
```

Do not invent a correction while the symptom is non-reproducible.

## R8.2 — imagery historical implementation nesting: DONE

Candidate: `candidate/r8-imagery-structure-r1`  
Final integrated head: `cc6cfdbace19c78f54d265bb0cebd530d1fa8de4`.

Candidate evidence:

- focused imagery run `33683269801` — PASS;
- R8 baseline run `33683269534` — PASS;
- runtime implementation rename: 0 additions / 0 deletions.

Exact-head `dev` evidence:

- R8 imagery run `33684487380` — PASS;
- R8 baseline run `33684487355` — PASS;
- Dev Integration run `33684487357` — PASS 100/100.

Human visual A/B:

- candidate Photo ON: normal;
- candidate Photo OFF: large black procedural patches visible;
- pre-R8.2 `dev @ 7f866f23c1f13e53a39df1eabc4d27c2e9f794f6` Photo OFF: same artifact reproduced.

Conclusion: Photo OFF artifact **predates and is not caused by R8.2**. Structural imagery move accepted.

---

# 3. Open R8 visual debt

## Issue #4 — Photo OFF black procedural terrain patches

GitHub issue #4: `Photo OFF can reveal large black procedural terrain patches` — **OPEN / pre-existing**.

Observed on Manic-2 → Manic-5:

- Photo OFF exposes large solid black polygons/patches beside the road;
- boundaries are sharp/geometric;
- Photo ON looks normal because satellite geometry covers the underlying procedural terrain;
- same artifact reproduced on pre-R8.2 `dev`, proving it is not an imagery-file-move regression.

`Photo OFF` only hides the satellite chunk group; it does not substitute a new terrain material. Treat this as a procedural/terrain visual defect.

Disposition:

- dedicated correction candidate only;
- do not mix with structural moves;
- protect Photo ON appearance;
- require Photo OFF human visual PASS before integration.

---

# 4. OSM / Geofabrik reliability — CLOSED FOR QUEBEC HYDRO

Issue #3 — `Overpass shared pipeline can make hydrography and scenery unavailable together` — **CLOSED / completed 2026-09-02**.

Implemented:

```text
Geofabrik Quebec .osm.pbf
  -> offline preprocessing
  -> 16 km spatial tiles
  -> hydro-only gzip v2 tiles
  -> local-first hydro reader
  -> existing water ingest/render semantics
  -> Overpass fallback outside local coverage
```

Generated/source data stay ignored by Git:

```text
world-data/
public/world-data/
```

Do not commit or silently bundle the Quebec dataset until packaging/distribution is explicitly decided.

Final coastline-corrected source stats:

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

Decision: gzip v2 passes storage/runtime gate. No simplification or MVT/PMTiles conversion is justified now. Known Manic local-hydro human smoke: **PASS**.

---

# 5. Closed / certified Phase R work

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
- OSM Quebec hydro reliability / issue #3: DONE + human PASS.
- R7 app/input/UI/routing/services: DONE automation + human PASS.
- R8.0 audit + permanent baseline: DONE.
- R8.1 issue #2 diagnostics: DONE + human PASS; issue watch-only.
- R8.2 imagery historical implementation nesting: DONE automation + human A/B validation.

Intentional root water layout:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

---

# 6. Operating principles / prohibitions

1. **One intent per commit.**
2. **Audit before editing.**
3. **Candidate before `dev`** for material runtime/correction work.
4. **Exact final `dev` HEAD must pass Dev Integration.**
5. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
6. **Human FAIL overrides green automation.** Use A/B against certified `dev` when causality is uncertain.
7. **No silent debt discoveries** — create/record them separately.
8. **Never touch `main` without explicit user approval.**
9. Keep generated Geofabrik source/tiles out of Git until packaging is explicitly decided.
10. Do not combine unrelated data consumers or corrections.
11. A green QA does not authorize a production runtime change without its required human smoke.

Do not mix into structural R8 candidates:

- physics/handling tuning;
- terrain/road/forest visual tuning;
- issue #4 correction;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup;
- scenery/sign offline migration;
- regional-data packaging decisions.

---

# 7. Protected behavior contracts

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
- `src/imagery.js` as current root owner while R8.2 nested only its historical base;
- road-aware imagery height alignment;
- R8.1 geometry-refresh diagnostics as additive observability only;
- cache reuse and route-ahead prefetch;
- Photo ON quality;
- Photo OFF must not be made worse; issue #4 correction is separate;
- forest retention/frame pacing;
- low-hitch long-route behavior;
- current P9.17→P9.27 and P9.37→P9.42 contracts.

---

# 8. PHASE R roadmap

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
- R8.0 audit + baseline: DONE.
- R8.1 issue #2 diagnostics: DONE; issue #2 watch-only.
- R8.2 imagery historical implementation nesting: DONE.
- **R8.3 scheduler historical-base micro-audit: NEXT.**
- Issue #4 Photo OFF terrain correction: separate R8 correction candidate, not bundled into R8.3.
- Further terrain/local-world structural moves: only after lower-risk scheduler work stabilizes.
- R9 permanent root-cleanliness gate: after R8 stabilizes.

---

# 9. PHASE O — historical naming cleanup

Only after relevant Phase R folders are stable. Terrain/imagery/local-world/streaming historical P9 naming belongs to O7 **after R8**. Do not rename P9 files during structural moves.

---

# 10. Maintenance debt — keep separate

## C-M1 dependency/security

Latest audit reports 27 vulnerabilities: 3 low, 1 moderate, 22 high, 1 critical. Inspect separately; distinguish runtime from dev/build risk. **Never run `npm audit fix --force` as part of Phase R.**

## C-M2 GitHub Actions runtime hygiene

Node action-runtime deprecation / forced Node 24 warnings remain separate. Do not upgrade Actions opportunistically in R8.

---

# 11. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| R8 current ownership | `qa/qa-r8-current-ownership.mjs` |
| R8 P9.17→P9.27 | `qa/qa-r8-streaming-baseline.mjs` + focused R8 workflow |
| R8.2 imagery boundary | `qa/qa-source-tree-r8-imagery.mjs` |
| Terrain visual ownership | `qa/qa-terrain-r1-legacy-ownership.mjs` |
| Terrain/road imagery alignment | `qa/qa-terrain-r2-road-imagery.mjs` |
| Frame pacing / hitch attribution | P9.37→P9.42 + `WorldDriveFramePacing()` |
| Issue #2 | R8.1 diagnostics + expanded runtime telemetry only if symptom returns |
| Issue #4 | dedicated Photo OFF correction QA + Photo OFF/ON human A/B visual smoke |
| R8.3 scheduler structure | focused source/path QA + R8 baseline + C6 + build/code split + human long-route/perf smoke |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Water/hydrography | `qa/qa-water-hydro-runtime.mjs` + human hydro/bridge smoke |
| Offline Quebec hydro | `qa/qa-geofabrik-hydro-runtime-r1.mjs` + known Manic human smoke |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 12. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:

1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

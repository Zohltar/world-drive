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
3. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
4. Resume the exact **Next action** below unless the user changes priority.
5. Use certified blocks: read-only audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint where visuals/runtime/performance can change.
6. **Never move `main` without explicit user approval.**
7. Human-visible FAIL overrides green automation. An A/B comparison may establish that a visible defect predates a candidate.
8. One intent per commit. Do not mix maintenance/security/dependency/Actions/naming work into structural work.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R8 terrain / imagery / local-world / streaming**  
**State:** **R8.6 WORLD-SCENE STRUCTURAL MOVE DONE — automation + human PASS; issues #5 and #6 remain separate follow-ups**  
**Integration HEAD before this docs commit:** `6cd17c553bc40a970432d0f61c53d4350a247b57` — `QA: certify R8 world-scene boundary`  
**R8 World Scene Structure:** run `33704466668` — **PASS** on exact `dev` HEAD  
**R8 Terrain Streaming Baseline:** run `33704466610` — **PASS**  
**C6 Final Global Boundary:** run `33704466608` — **PASS**  
**Dev Integration:** run `33704466644` — **PASS 100/100** on exact `dev` HEAD  
**Triggered workflow set:** **13/13 completed successfully** on exact runtime HEAD  
**Human checkpoint:** new-route visual composition + route change — **PASS**. A route-start vehicle-under-terrain condition was observed, but the user explicitly confirmed it predates R8.6; it is tracked separately as issue #6.  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

R8.6 layout:

```text
src/world-scene.js          # stable root compatibility/public facade
src/terrain/world-scene.js  # byte-for-byte implementation
```

The moved implementation is literally the same Git blob as the prior root implementation: `52362de6e2ca60ae081c75ade5fa9563aa7a2f94`. `main.js` was not changed and continues importing `./world-scene.js`. Group order, ground construction, stencil policy, static matrix freezing, origin reset helpers and near-terrain constants were not changed.

Candidate certification before integration:

- `candidate/r8-world-scene-r1` final HEAD `6cd17c553bc40a970432d0f61c53d4350a247b57`;
- runtime move commit `dd83c6f62c12fa88130ef1ed0c7c66e7dbb52be0` — `R8 world scene: move implementation behind root facade`;
- focused candidate run `33703437247` — **PASS**;
- R8 Terrain Streaming Baseline candidate run `33703437197` — **PASS**;
- human smoke — **PASS** except for separately triaged pre-existing issue #6.

Issue #5 remains **OPEN / deferred until end of R8 / non-blocking**: forest population can appear noticeably later than expected. Do not tune forest during structural work.

Issue #6 — `Vehicle can spawn below terrain on new route` — is **OPEN / pre-existing / non-causal to R8.6**. Occasionally a new-route spawn places the vehicle/camera under or inside terrain. Resetting/reinitializing vehicle position immediately corrects it. Investigate later in a dedicated candidate, focusing first on route-start vehicle-placement timing versus terrain/local-world readiness and the already-working reset-position path.

## Exact next action — R8.7 remaining terrain/world ownership audit

Continue **read-only first**. R8.6 already established that `world-scene.js` was the smallest safe remaining owner. Audit the next remaining candidates:

```text
src/world-materials.js
src/elevation.js
src/terrain-p925.js
src/terrain.js
```

Audit direction:

- `src/terrain-p925.js` remains **KEEP ROOT / protected**. It is large and owns sensitive near-ground preparation, road-bed state, geometry reuse and prepared commits.
- `src/terrain.js` remains the current P9.27 owner; do not move or tune it casually.
- Compare `world-materials.js` and `elevation.js` path/runtime contracts before choosing any candidate.
- `world-materials.js` is visually sensitive despite being structurally self-contained; enumerate C5.1, V21.22.3, terrain/road/water material and workflow contracts before editing.
- `elevation.js` owns network-backed Terrarium DEM loading, cache/prefetch, fast world sampling and P9.19 compatibility semantics; treat it as higher runtime risk than its file size suggests.
- KEEP ROOT is a valid audit result.
- Do not combine structural work with issue #4, #5 or #6 corrections.
- Prefer one conservative candidate with focused permanent QA; require human smoke when the selected move can affect visible/runtime/performance behavior.

---

# 2. R8 certified work

## R8.0 — ownership audit + permanent baseline — DONE

Current ownership model:

- `src/world-streaming.js`: decides **WHEN** visible services refresh and route-ahead caches prefetch.
- `src/streaming-coordinator.js`: scheduler/arbitration, prepared refresh lifecycle, visual jobs, imagery commit deferral, local-world timing and hitch attribution.
- forced boot/route/reset keeps the proven synchronous path; periodic refreshes use prepared incremental work.
- local-world chain: current root owner -> P9.26 facade/nested wrapper -> P9.25 root sensitive base.
- terrain chain: `terrain.js -> root P9.26 facade -> terrain/P9.26 -> terrain/P9.25 bridge -> root P9.25`.
- imagery: root `imagery.js` current owner with historical P9.13 implementation nested under `src/imagery/`.
- world scene: stable root facade -> `src/terrain/world-scene.js` implementation.
- elevation and route lifecycle remain separate owners.

Permanent R8 baseline:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

The isolated runner permanently covers 14/14 current P9.17–P9.27 contracts. Terrain R1/R2 and P9.37–P9.42 remain separate permanent Dev Integration gates.

## R8.1 — issue #2 diagnostics — DONE / watch-only

Added additive imagery geometry-refresh telemetry under:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
```

No resampling/scheduling behavior was retuned. Human Manic validation passed and the original delayed startup-adjustment symptom did not reproduce. **Issue #2 remains OPEN / watch-only / not diagnosed.** Do not invent a fix while evidence is absent.

If issue #2 returns, capture expanded:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
WorldDriveFramePacing().localWorldPhases
WorldDriveFramePacing().p923
WorldDriveFramePacing().visualJobs
WorldDriveFramePacing().p939HitchAttribution
```

## R8.2 — imagery structural move — DONE

```text
src/imagery.js                       # current root owner
src/imagery/imagery-p913.js          # historical implementation
```

The P9.13 implementation moved byte-for-byte. Candidate automation passed. Human Photo ON was normal. Photo OFF showed black procedural patches, but the same defect was reproduced on the pre-R8.2 `dev` baseline, proving R8.2 was non-causal.

## R8.3 — streaming structural move — DONE

```text
src/streaming-coordinator.js                  # current scheduler owner
src/streaming-coordinator-p913.js             # stable root compatibility facade
src/streaming/streaming-coordinator-p913.js   # historical P9.13 implementation
```

No scheduler thresholds/cooldowns/frame budgets changed. Human long-route/multi-refresh PASS.

Human telemetry retained as observation only:

```text
fps:                       ~141.51
hitchCount:                6
maxFrameMs:                ~201.4 ms
pendingWorldRefresh:       false
suspendedFrames:           0
worldBuildCount:           7
lastWorldBuildMs:          ~103.8 ms
maxWorldBuildMs:           ~202.1 ms
p923 preparedStarts:       1
p923 preparedCommits:      1
p923 preparedDiscards:     0
```

Do not invent performance tuning from the max-build value alone; the human test observed no regression.

## R8.4 — local-world P9.26 structural move — DONE

```text
src/local-world-builder.js
src/local-world-builder-p926.js                 # stable facade
src/local-world/local-world-builder-p926.js     # nested P9.26 implementation
src/local-world-builder-p925.js                 # KEEP ROOT
```

Focused QA, full R8 baseline, A8, C6 and Dev Integration passed on exact `dev` HEAD. Human route-start / multiple-refresh / horizon-continuity smoke passed.

## R8.5 — terrain P9.26 structural move — DONE

```text
src/terrain-p925.js
src/terrain-p926.js
src/terrain/terrain-p925.js
src/terrain/terrain-p926.js
src/terrain.js
```

`src/terrain/terrain-p926.js` is the byte-identical prior P9.26 implementation. The stable root `src/terrain-p926.js` remains the compatibility/public path. The nested P9.25 bridge points back to the unchanged sensitive root P9.25 implementation. Current P9.27 stays at root.

Permanent focused coverage:

```text
qa/qa-source-tree-r8-terrain.mjs
.github/workflows/qa-source-tree-r8-terrain.yml
```

`qa/DEV_INTEGRATION_AUDIT.mjs` includes the R8 terrain source-tree boundary. Focused candidate, full R8 baseline, exact-head Dev Integration, C6 and issue #2 diagnostics passed. Human terrain/horizon/refresh/route-change smoke passed; delayed forest appearance is tracked separately as issue #5.

## R8.6 — world-scene structural move — DONE

```text
src/world-scene.js
src/terrain/world-scene.js
```

The implementation moved byte-for-byte behind the stable root facade; the nested file reuses the exact prior Git blob `52362de6e2ca60ae081c75ade5fa9563aa7a2f94`. `main.js` continues using the root boundary and was unchanged.

Permanent focused coverage:

```text
qa/qa-source-tree-r8-world-scene.mjs
.github/workflows/qa-source-tree-r8-world-scene.yml
```

C5.3 was updated only to inspect the implementation behind the facade; V21.22.3 and R8 ownership checks were updated for the new structural path. Candidate automation, exact-head Dev Integration, R8 baseline, C6 and all triggered workflows passed. Human route visual/route-change smoke passed. The observed under-terrain route-start spawn is explicitly pre-existing and tracked separately as issue #6.

---

# 3. Open issues relevant to R8

## Issue #2 — delayed terrain startup adjustment

**OPEN / watch-only / not diagnosed.** Original transient Manic-5 observation has not reproduced during current R8 testing. Instrumentation exists; no correction is authorized without correlation evidence.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN — pre-existing visual defect.** On Manic-2 → Manic-5, Photo OFF can reveal large solid-black procedural terrain patches with sharp polygon boundaries. Photo ON looks normal. The defect reproduced on both the R8.2 candidate and the prior `dev`, so it is not caused by the imagery move.

Treat issue #4 in a dedicated later R8 correction candidate. Preserve Photo ON while correcting it. Do not mix that visual fix into structural moves.

## Issue #5 — delayed forest appearance

**OPEN / deferred until end of R8 / non-blocking.** During the R8.5 human smoke, terrain and road were already visible while forest population appeared noticeably later than expected. The rest of the R8.5 visual/runtime smoke passed.

Human direction is to record the observation and investigate it **at the end of R8**, not to tune forest during structural work. Before any correction, compare startup/front-load timing with the pre-R8.5 baseline and determine whether the delay is causal to current R8 work.

## Issue #6 — vehicle can spawn below terrain on a new route

**OPEN / pre-existing / non-causal to R8.6.** During the R8.6 human smoke, a new route occasionally spawned the vehicle/camera under or inside the terrain. The user explicitly confirmed this behavior existed before R8.6 but had not previously been reported. Reinitializing/resetting vehicle position immediately fixes the placement.

Do not mix a speculative fix into structural R8 work. In a dedicated later candidate, first compare the initial route-start placement path with the known-good reset-position path and correlate placement timing with terrain/local-world readiness.

---

# 4. Closed/certified structural work

- R1 source-root audit: DONE.
- R2 multiplayer: DONE automation + human PASS.
- R3 traffic: DONE automation + human PASS.
- R4 vehicles/presentation/models/truck: DONE automation + human PASS.
- R4.5 audio: DONE automation + human PASS.
- QA root-layout: DONE.
- R5 vehicle dynamics / wheel-ground / transmission: CLOSED; no physics tuning.
- R6.1 road furniture/signs: DONE automation + human PASS.
- R6.2 road geometry/bridges: DONE automation + human PASS.
- R6.3 scenery/forest: CLOSED; scenery moved, forest KEEP ROOT.
- R6.4 water structural move: human FAIL, rolled back; water KEEP ROOT.
- Quebec local-first hydro / issue #3: DONE + human PASS; issue #3 CLOSED.
- R7 app/input/UI/routing/services: DONE automation + human PASS.
- R8.0 audit/baseline: DONE.
- R8.1 diagnostics: DONE + human PASS.
- R8.2 imagery structure: DONE + A/B human validation.
- R8.3 streaming structure: DONE automation + human PASS.
- R8.4 local-world P9.26 structure: DONE automation + human PASS.
- R8.5 terrain P9.26 structure: DONE automation + human PASS; issue #5 deferred.
- R8.6 world-scene structure: DONE automation + human PASS; issue #6 recorded as pre-existing.

Intentional root water layout remains:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

---

# 5. Protected behavior / prohibitions

Preserve all accepted physics, road/bridge geometry, terrain authority, forest/scenery behavior, hydro semantics, settings/routing/UI contracts, local-first Quebec hydro, cache behavior, Photo ON quality, streaming frame pacing and compatibility diagnostic aliases.

Do not mix into R8:

- physics/handling tuning;
- terrain/road/forest visual tuning except a separately approved correction such as issue #4 or the later evidence-backed issue #5 investigation;
- route-start vehicle-placement correction for issue #6 inside unrelated structural commits;
- dependency/security fixes (`npm audit fix --force` forbidden);
- GitHub Actions runtime upgrades;
- historical P9/V21 naming cleanup (Phase O only);
- scenery/sign offline migration;
- regional-data packaging decisions.

Generated/source Geofabrik data remain out of Git until packaging is explicitly decided.

---

# 6. Phase roadmap

- R1–R7: CLOSED/DONE as above.
- R8.0 baseline: DONE.
- R8.1 issue #2 observability: DONE; watch-only.
- R8.2 imagery structure: DONE.
- R8.3 streaming structure: DONE.
- R8.4 local-world P9.26 structure: DONE.
- R8.5 terrain P9.26 structure: DONE.
- R8.6 world-scene structure: DONE.
- **R8.7 remaining terrain/world ownership: ACTIVE — read-only `world-materials.js` vs `elevation.js` audit first; P9.25/P9.27 protected root.**
- End-of-R8 follow-up: investigate issue #5 forest appearance timing before declaring R8 closed.
- Dedicated later correction: issue #6 route-start vehicle placement, based on readiness evidence and reset-path comparison.
- Further R8 structural moves/corrections: separate candidates only after evidence.
- R9 permanent root-cleanliness gate: after R8 stabilizes.
- Phase O historical naming cleanup: only after Phase R folders stabilize.

---

# 7. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| R8 ownership | `qa/qa-r8-current-ownership.mjs` |
| R8 streaming P9.17–P9.27 | `qa/qa-r8-streaming-baseline.mjs` |
| Local-world structure | `qa/qa-source-tree-r8-local-world.mjs` |
| Terrain structure | `qa/qa-source-tree-r8-terrain.mjs` + P9.26 horizon + Terrain R1/R2 |
| World-scene structure | `qa/qa-source-tree-r8-world-scene.mjs` + C5.3 + human visual smoke |
| Terrain/imagery visuals | Terrain R1 + Terrain R2 + human visual smoke |
| Frame pacing | P9.37–P9.42 + `WorldDriveFramePacing()` |
| Imagery structure | `qa/qa-source-tree-r8-imagery.mjs` |
| Streaming structure | `qa/qa-source-tree-r8-streaming.mjs` |
| Build | `npm run build` + code-split QA |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 8. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires exact final `dev` green + required human validation + explicit user approval. Until then, **do not move `main`**.

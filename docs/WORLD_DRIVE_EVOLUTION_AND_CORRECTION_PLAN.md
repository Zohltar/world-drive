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
**State:** **R8.5 TERRAIN P9.26 STRUCTURAL MOVE DONE — automation + human PASS; forest delay deferred as issue #5**  
**Integration HEAD before this docs commit:** `60bddd5255bc374a53b705531007e6532dd79529` — `QA: add R8 terrain focused gate`  
**R8 Terrain Structure:** run `33702782047` — **PASS** on exact `dev` HEAD  
**R8 Terrain Streaming Baseline:** run `33702781938` — **PASS**  
**C6 Final Global Boundary:** run `33702781983` — **PASS**  
**R8 Issue #2 Diagnostics:** run `33702781942` — **PASS**  
**Dev Integration:** run `33702781926` — **PASS 100/100** on exact `dev` HEAD  
**Triggered workflow set:** **17/17 completed successfully** on exact runtime HEAD  
**Human checkpoint:** terrain/horizon, road-adjacent relief, refresh transitions and route change — **PASS**. Forest appeared noticeably later; recorded as non-blocking issue #5 for end-of-R8 investigation.  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

R8.5 layout:

```text
src/terrain-p925.js          # KEEP ROOT: sensitive P9.25 near-ground / road-bed owner
src/terrain-p926.js          # stable root compatibility facade
src/terrain/terrain-p925.js  # tiny bridge back to the protected root P9.25 owner
src/terrain/terrain-p926.js  # byte-identical prior P9.26 implementation
src/terrain.js               # current P9.27 owner retained at root
```

The P9.26 implementation was moved **byte-for-byte**. A two-line nested P9.25 bridge lets the moved P9.26 file retain its original import text while the real P9.25 implementation remains at root. No horizon budget, timer cadence, terrain visual policy, road transition policy, physics, forest policy or streaming threshold was tuned.

Candidate certification before integration:

- `candidate/r8-terrain-structure-r1` final HEAD `60bddd5255bc374a53b705531007e6532dd79529`;
- focused R8 Terrain Structure run `33700698266` — **PASS**;
- R8 Terrain Streaming Baseline run `33700698271` — **PASS**;
- human smoke — **PASS except deferred forest appearance timing observation**.

Issue #5 — `R8: forest appears noticeably later after terrain structure move` — is deliberately **OPEN / deferred / non-blocking** by human direction. Do not tune forest as part of structural R8 work. Diagnose it after remaining R8 structural work stabilizes, comparing startup/front-load timing against the pre-R8.5 baseline first.

## Exact next action — R8.6 remaining terrain/world ownership audit

Continue **read-only first**. Inventory the remaining R8 terrain/world owners and their path/runtime contracts, especially:

```text
src/elevation.js
src/world-scene.js
src/world-materials.js
src/terrain-p925.js
src/terrain.js
```

Audit direction:

- `src/terrain-p925.js` remains **KEEP ROOT / protected** during the first R8.6 pass. It is large and owns sensitive near-ground preparation, road-bed state, geometry reuse and prepared commits.
- `src/terrain.js` remains the current P9.27 owner; do not move/tune it casually.
- Determine whether a smaller low-fan-in owner such as `elevation.js`, `world-scene.js` or `world-materials.js` has a demonstrably structural-only folder move available.
- Enumerate all QA/workflow/tool/import path contracts before editing. KEEP ROOT is a valid audit result.
- Do not combine a structural move with issue #4 or issue #5 corrections.
- Keep issue #5 forest delayed appearance deferred until the end of R8 structural work.
- Prefer one conservative candidate with focused permanent QA; require human smoke only if the selected move can affect visible/runtime/performance behavior.

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
- elevation, world scene and route lifecycle remain separate owners.

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

`qa/DEV_INTEGRATION_AUDIT.mjs` now includes the R8 terrain source-tree boundary. Focused candidate, full R8 baseline, exact-head Dev Integration, C6 and issue #2 diagnostics all passed. Human terrain/horizon/refresh/route-change smoke passed; delayed forest appearance is tracked separately as issue #5 and is not folded into this structural move.

---

# 3. Open issues relevant to R8

## Issue #2 — delayed terrain startup adjustment

**OPEN / watch-only / not diagnosed.** Original transient Manic-5 observation has not reproduced during current R8 testing. Instrumentation exists; no correction is authorized without correlation evidence.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN — pre-existing visual defect.** On Manic-2 → Manic-5, Photo OFF can reveal large solid-black procedural terrain patches with sharp polygon boundaries. Photo ON looks normal. The defect reproduced on both the R8.2 candidate and the prior `dev`, so it is not caused by the imagery move.

Treat issue #4 in a dedicated later R8 correction candidate. Preserve Photo ON while correcting it. Do not mix that visual fix into structural moves.

## Issue #5 — delayed forest appearance during R8.5 smoke

**OPEN / deferred until end of R8 / non-blocking.** During the R8.5 human smoke, terrain and road were already visible while forest population appeared noticeably later than expected. The rest of the R8.5 visual/runtime smoke passed.

Human direction is to record the observation and investigate it **at the end of R8**, not to tune forest during the structural move. Before any correction, compare startup/front-load timing with the pre-R8.5 baseline and determine whether the delay is actually causal to current R8 work.

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
- **R8.6 remaining terrain/world ownership: ACTIVE — read-only audit first; P9.25 protected root.**
- End-of-R8 follow-up: investigate issue #5 forest appearance timing before declaring R8 closed.
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

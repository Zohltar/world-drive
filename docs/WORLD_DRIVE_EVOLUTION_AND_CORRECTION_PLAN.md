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
**State:** **R8.3 STREAMING STRUCTURAL MOVE DONE — automation + human PASS**  
**Integration HEAD before this docs commit:** `c333eb4734189b72e21ec9beb5aa948da92d0c39` — `QA: certify R8 nested streaming boundary`  
**R8 Streaming Structure:** run `33685930859` — **PASS** on exact `dev` HEAD  
**R8 Terrain Streaming Baseline:** run `33685930757` — **PASS**  
**C6 Final Global Boundary:** run `33685930755` — **PASS**  
**Dev Integration:** run `33685930860` — **PASS 100/100** on exact `dev` HEAD  
**Human checkpoint:** long-route / multi-refresh streaming — **PASS**  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

R8.3 layout:

```text
src/streaming-coordinator.js                  # current scheduler owner
src/streaming-coordinator-p913.js             # stable root compatibility facade
src/streaming/streaming-coordinator-p913.js   # historical P9.13 implementation, moved byte-for-byte
```

No scheduling threshold, cooldown, frame budget, refresh policy or implementation logic changed in R8.3.

Human telemetry after the R8.3 PASS:

```text
fps:                       ~141.51
hitchCount:                6
maxFrameMs:                ~201.4 ms
pendingWorldRefresh:       false
pendingReasons:            []
suspendedFrames:           0
deferredImageryRefreshes:  0
imagery chunkCommits:      78
imagery queued:            0
worldBuildCount:           7
lastWorldBuildMs:          ~103.8 ms
maxWorldBuildMs:           ~202.1 ms
p923 preparedStarts:       1
p923 preparedCommits:      1
p923 preparedDiscards:     0
```

The ~202 ms max world-build value is retained as observation only. The user observed no hitch/regression requiring a correction, so do not invent performance tuning from this number alone.

## Exact next action — R8.4 local-world builder micro-audit

Continue **read-only first**. The local-world chain is more performance/visual sensitive than R8.2/R8.3:

```text
src/local-world-builder.js
  -> src/local-world-builder-p926.js
    -> src/local-world-builder-p925.js
```

Current audit direction:

- `local-world-builder-p925.js` owns the sensitive incremental near-ground preparation, road-bed state installation, frame-spaced slices and prepared commits. **Do not move/tune it casually.**
- Evaluate moving **only `local-world-builder-p926.js`** under an explicit `src/local-world/` folder behind a stable root facade.
- Before editing, enumerate every direct path contract for P9.26, especially horizon QA, R8 ownership, C6 global `__WORLD_DRIVE_P923_LOCAL_WORLD__` inventory and workflow triggers.
- If the P9.26-only move is not demonstrably structural-only, KEEP ROOT and document why.
- Any accepted builder move requires focused QA + full R8 baseline + build/code split + a human route-start / multiple-refresh / horizon-continuity smoke.

---

# 2. R8 certified work

## R8.0 — ownership audit + permanent baseline — DONE

Current ownership model:

- `src/world-streaming.js`: decides **WHEN** visible services refresh and route-ahead caches prefetch.
- `src/streaming-coordinator.js`: scheduler/arbitration, prepared refresh lifecycle, visual jobs, imagery commit deferral, local-world timing and hitch attribution.
- forced boot/route/reset keeps the proven synchronous path; periodic refreshes use prepared incremental work.
- local-world chain: `local-world-builder.js -> p926 -> p925`.
- terrain chain: `terrain.js -> terrain-p926.js -> terrain-p925.js`.
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

Historical P9.13 scheduler implementation is nested under `src/streaming/`; stable root facade retained. Human long-route/multi-refresh PASS and exact-head automation green.

---

# 3. Open issues relevant to R8

## Issue #2 — delayed terrain startup adjustment

**OPEN / watch-only / not diagnosed.** Original transient Manic-5 observation has not reproduced during current R8 testing. Instrumentation exists; no correction is authorized without correlation evidence.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN — pre-existing visual defect.** On Manic-2 → Manic-5, Photo OFF can reveal large solid-black procedural terrain patches with sharp polygon boundaries. Photo ON looks normal. The defect reproduced on both the R8.2 candidate and the prior `dev`, so it is not caused by the imagery move.

Treat issue #4 in a dedicated later R8 correction candidate. Preserve Photo ON while correcting it. Do not mix that visual fix into structural moves.

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
- terrain/road/forest visual tuning except a separately approved correction such as issue #4;
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
- **R8.4 local-world builder: ACTIVE — read-only P9.26-only audit first.**
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
| Terrain/imagery | Terrain R1 + Terrain R2 + human visual smoke |
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

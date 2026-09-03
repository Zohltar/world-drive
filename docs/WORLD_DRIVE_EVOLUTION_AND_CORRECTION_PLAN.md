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
7. Human-visible FAIL overrides green automation. A/B comparison may establish that a defect predates a candidate.
8. One intent per commit. Do not mix maintenance/security/dependency/Actions/naming work into unrelated structural work.
9. Prefer meaningful work blocks; involve the user only at critical human/runtime/visual/integration checkpoints.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **Phase O — historical naming cleanup audit**  
**State:** **R9 PERMANENT ROOT-CLEANLINESS GATE DONE / CERTIFIED; R8 remains COMPLETE / STABILIZED / FROZEN**  
**R9 integration HEAD before this docs commit:** `a4ad5b329d065d4cbe6dd0ca80c4f7aa52751d0f` — `QA: add permanent R9 root cleanliness workflow`  
**R9 Root Cleanliness QA:** run `33748842006` — **PASS** on exact integrated `dev` HEAD  
**Dev Integration:** run `33748841800` — **PASS 100/100 functional steps** on exact integrated `dev` HEAD  
**Triggered workflow set:** **14/14 completed successfully** on exact integrated R9 HEAD  
**Candidate focused run:** `33748697259` — **PASS**  
**Human checkpoint:** not required; R9 changed QA/workflow files only, no runtime source.  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

R9 permanently freezes the accepted direct-file topology of `src/` after R8:

- **67** accepted direct files total;
- **32** stable/public facades;
- **14** intentional protected owners;
- **21** bootstrap/runtime owners;
- **0** direct-root placement items classified as migration debt.

The gate allows new owned subdirectories. A new file directly under `src/` now requires an explicit R9 policy update and architectural justification. R9 does **not** force cosmetic moves of accepted root owners.

Permanent R9 coverage:

```text
qa/qa-r9-root-cleanliness.mjs
.github/workflows/qa-r9-root-cleanliness.yml
qa/DEV_INTEGRATION_AUDIT.mjs  # imports the R9 policy gate
```

Accepted protected owners remain intentionally root-owned, including:

```text
src/elevation.js
src/terrain.js
src/terrain-p925.js
src/local-world-builder-p925.js
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

## Exact next action — Phase O historical naming cleanup audit

Proceed **read-only first**. Phase O is about historical naming debt, not another architecture move.

1. Inventory tracked source/QA/workflow paths and exported/global identifiers containing historical `P9`, `P9.x`, `V21`, or obsolete milestone/version naming.
2. Classify each occurrence as one of:
   - compatibility/public contract that should remain;
   - historical diagnostic/QA label that can remain for traceability;
   - internal implementation filename or identifier that is safe to rename later;
   - generated/build/documentation reference that must follow a rename atomically;
   - obsolete/dead naming debt candidate.
3. Determine fan-in and path contracts before proposing any rename. Respect stable root facades and R9.
4. Prefer **KEEP NAME** when a rename provides little value or would erase useful historical traceability.
5. Do not combine naming cleanup with behavior changes, file moves, dependency/security work, issue #2 or issue #4 corrections.
6. If a safe rename set exists, create one conservative candidate with mechanical path/reference updates and focused permanent QA.
7. Runtime-visible or compatibility-sensitive renames require a meaningful smoke; pure QA/docs label cleanup does not.
8. No `main` promotion without explicit user approval.

---

# 2. Certified architecture through R9

## R1–R7 — DONE

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

## R8 — terrain / imagery / local-world / streaming — COMPLETE / FROZEN

### R8.0 ownership audit + baseline — DONE

Permanent baseline:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

The isolated baseline covers current P9.17–P9.27 contracts. Terrain R1/R2 and P9.37–P9.42 remain separate permanent gates.

### R8.1 issue #2 observability — DONE / watch-only

Additive telemetry remains available under:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
WorldDriveFramePacing().localWorldPhases
WorldDriveFramePacing().p923
WorldDriveFramePacing().visualJobs
WorldDriveFramePacing().p939HitchAttribution
```

No speculative correction is authorized unless issue #2 reproduces with evidence.

### R8.2 imagery structure — DONE

```text
src/imagery.js
src/imagery/imagery-p913.js
```

Historical imagery implementation moved behind the current root owner. Human Photo ON validation passed. Issue #4 reproduced on the prior baseline, proving this move non-causal.

### R8.3 streaming structure — DONE

```text
src/streaming-coordinator.js
src/streaming-coordinator-p913.js
src/streaming/streaming-coordinator-p913.js
```

No scheduler thresholds/cooldowns/frame budgets changed. Human long-route/multi-refresh PASS.

### R8.4 local-world P9.26 structure — DONE

```text
src/local-world-builder.js
src/local-world-builder-p926.js
src/local-world/local-world-builder-p926.js
src/local-world-builder-p925.js                 # KEEP ROOT
```

Focused QA, R8 baseline, A8, C6, Dev Integration and human route/refresh/horizon smoke passed.

### R8.5 terrain P9.26 structure — DONE

```text
src/terrain.js
src/terrain-p926.js
src/terrain/terrain-p926.js
src/terrain/terrain-p925.js
src/terrain-p925.js                              # KEEP ROOT
```

P9.26 moved behind the stable root facade. Sensitive P9.25 and current P9.27 ownership remained protected. Automation and human terrain/horizon/refresh smoke passed.

### R8.6 world-scene structure — DONE

```text
src/world-scene.js
src/terrain/world-scene.js
```

Implementation moved byte-for-byte behind the stable root facade. Automation and human visual/route-change smoke passed.

### R8.7 world-materials + remaining-owner audit — DONE

```text
src/world-materials.js
src/terrain/world-materials.js
```

Certified runtime checkpoint:

- `dev @ d09017137e671d1d5a098ccfc5d0c058c8b78d07`;
- World Materials QA `33705740429` — PASS;
- R8 baseline `33705740388` — PASS;
- C5.1 `33705740408` — PASS;
- C6 `33705740450` — PASS;
- Dev Integration `33705740420` — PASS.

Remaining-owner audit concluded:

```text
src/elevation.js        # KEEP ROOT / P9.19 hot DEM owner
src/terrain-p925.js     # KEEP ROOT / protected
src/terrain.js          # KEEP ROOT / current P9.27 owner
```

No further organization-only R8 moves are planned.

### R8 issue #6 route-start final placement — DONE / CLOSED

Root cause: initial/fallback road height could be sampled before the final DEM/local-world commit.

Correction: lightweight final road-profile height resample after initial DEM/world commit; no second full recenter, no duplicate dynamics reset, no physics or terrain visual tuning.

Validation:

- candidate focused `33709337623` — PASS;
- candidate R8 baseline `33709337634` — PASS;
- human multi-route + reset — PASS;
- integrated focused `33711906871` — PASS;
- integrated R8 baseline `33711906868` — PASS;
- integrated Dev Integration `33711906922` — PASS 100/100.

Issue #6 is CLOSED.

### R8 issue #5 route-change forest readiness — DONE / CLOSED

Causal audit proved R8.5 non-causal. The actual defect was an older sequencing asymmetry: initial startup waited for P9.35 readiness, but in-game route changes exposed terrain after starting scenery asynchronously.

Correction: in-game route changes reuse the existing P9.35 readiness barrier before hiding the loading overlay. No density, chunk-budget, threshold or visual-policy tuning.

Validation:

- Forest Route Readiness `33712481302` — PASS;
- R8 baseline `33712481234` — PASS;
- P9.35/P9.36/P9.38 — PASS;
- route placement preservation, audit, build, code split — PASS;
- human repeated multi-route smoke — PASS.

Issue #5 is CLOSED.

## R9 — permanent root-cleanliness gate — DONE

Candidate:

```text
candidate/r9-root-cleanliness-r1
final HEAD a4ad5b329d065d4cbe6dd0ca80c4f7aa52751d0f
```

R9 is intentionally QA-only. It classifies the accepted 67 direct `src/` files and rejects unexplained additions/removals without forcing runtime churn. New owned directories remain allowed.

Validation:

- candidate focused `33748697259` — PASS;
- exact integrated R9 QA `33748842006` — PASS;
- exact integrated Dev Integration `33748841800` — PASS 100/100;
- 14/14 triggered workflows on exact integrated HEAD — PASS;
- build and code split — PASS;
- human runtime smoke — not required because no runtime source changed.

---

# 3. Open/deferred issues

## Issue #2 — delayed terrain startup adjustment

**OPEN / watch-only / not diagnosed.** Original transient Manic observation has not reproduced. Permanent instrumentation exists. Do not invent a correction without correlation evidence.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN / pre-existing visual defect.** Photo OFF can reveal large solid-black procedural terrain patches while Photo ON looks normal. A/B reproduction on pre-R8.2 `dev` proved the imagery structural move non-causal.

Treat only in a dedicated later correction candidate and preserve Photo ON quality.

## Issue #5 — route-change forest readiness

**CLOSED / corrected.** In-game route changes now wait on the existing P9.35 forest readiness gate before exposing the route.

## Issue #6 — vehicle can spawn below terrain on a new route

**CLOSED / corrected.** Final route-start placement re-samples the final road-profile height after the initial DEM/world commit.

---

# 4. Protected behavior / prohibitions

Preserve accepted physics, road/bridge geometry, terrain authority, forest/scenery behavior, hydro semantics, settings/routing/UI contracts, local-first Quebec hydro, cache behavior, Photo ON quality, streaming frame pacing and compatibility diagnostic aliases.

Do not mix into Phase O:

- runtime architecture/file moves merely for cleanliness;
- physics/handling tuning;
- terrain/road/forest visual tuning;
- dependency/security fixes (`npm audit fix --force` forbidden);
- GitHub Actions runtime upgrades;
- scenery/sign offline migration;
- regional-data packaging decisions;
- issue #2/#4 corrections;
- behavioral changes hidden inside mechanical renames.

Generated/source Geofabrik data remain out of Git until packaging is explicitly decided.

---

# 5. Phase roadmap

- R1–R7: CLOSED/DONE.
- R8.0–R8.7: DONE / frozen.
- R8 issue #5: DONE / CLOSED.
- R8 issue #6: DONE / CLOSED.
- **R8 overall: CLOSED / STABILIZED / FROZEN.**
- **R9 permanent root-cleanliness gate: DONE / CERTIFIED.**
- **Phase O historical naming cleanup: ACTIVE — read-only inventory first.**
- Issue #2: watch-only unless reproduced.
- Issue #4: dedicated Photo OFF correction later; separate from Phase O.

---

# 6. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| Root cleanliness | `qa/qa-r9-root-cleanliness.mjs` + existing R1–R8 boundaries |
| R8 ownership | `qa/qa-r8-current-ownership.mjs` |
| R8 streaming | `qa/qa-r8-streaming-baseline.mjs` |
| Local-world structure | `qa/qa-source-tree-r8-local-world.mjs` |
| Terrain structure | `qa/qa-source-tree-r8-terrain.mjs` + Terrain R1/R2 |
| World-scene | `qa/qa-source-tree-r8-world-scene.mjs` + C5.3 |
| World-materials | `qa/qa-source-tree-r8-world-materials.mjs` + C5.1 |
| Elevation owner | `qa/qa-streaming-p919-elevation.mjs` |
| Route-start placement | `qa/qa-route-start-final-placement-r8.mjs` + human multi-route smoke when runtime changes |
| Forest readiness | `qa/qa-r8-forest-route-readiness.mjs` + P9.35/P9.36/P9.38 |
| Terrain/imagery visuals | Terrain R1 + Terrain R2 + human visual smoke |
| Frame pacing | P9.37–P9.42 + `WorldDriveFramePacing()` |
| Historical rename | exhaustive fan-in/reference audit + relevant focused QA; human smoke if runtime/public paths change |
| Build | `npm run build` + code-split QA |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation when runtime or visuals change.

---

# 7. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires exact final `dev` green + required human validation + explicit user approval. Until then, **do not move `main`**.

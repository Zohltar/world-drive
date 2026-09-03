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
9. Prefer meaningful work blocks; involve the user only at critical human/runtime/visual/integration checkpoints.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R9 permanent root-cleanliness gate**  
**State:** **R8 COMPLETE / STABILIZED / FROZEN — structural work + issues #5 and #6 corrections automation/human PASS**  
**Final R8 runtime integration HEAD before this docs commit:** `31561c128696f045aeaf98fde9de8a1f9ecdabd6` — `QA: add forest route readiness workflow`  
**R8 Forest Route Readiness QA:** run `33712481302` — **PASS**  
**R8 Terrain Streaming Baseline:** run `33712481234` — **PASS**  
**Human checkpoint:** repeated in-game route changes / forest readiness / normal driving — **PASS**  
**Issue #5:** **CLOSED / corrected**  
**Issue #6:** **CLOSED / corrected**  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

R8 terrain/imagery/local-world/streaming ownership is now intentionally frozen. Do not perform more organization-only moves merely to reduce root-file count.

Final R8 ownership decisions:

```text
src/imagery.js
  -> src/imagery/imagery-p913.js

src/streaming-coordinator.js
  -> src/streaming-coordinator-p913.js facade
  -> src/streaming/streaming-coordinator-p913.js

src/local-world-builder.js
  -> src/local-world-builder-p926.js facade
  -> src/local-world/local-world-builder-p926.js
  -> src/local-world-builder-p925.js                 # KEEP ROOT / sensitive

src/terrain.js                                      # KEEP ROOT / current P9.27 owner
  -> src/terrain-p926.js facade
  -> src/terrain/terrain-p926.js
  -> src/terrain/terrain-p925.js bridge
  -> src/terrain-p925.js                            # KEEP ROOT / protected

src/world-scene.js
  -> src/terrain/world-scene.js

src/world-materials.js
  -> src/terrain/world-materials.js

src/elevation.js                                    # KEEP ROOT / P9.19 hot DEM owner
```

`src/elevation.js` remains root-owned because it combines Terrarium network/image loading, cache/prefetch state and the high-frequency P9.19 world-space sampler/compatibility contract. Moving it adds runtime/path risk without enough architectural benefit.

`src/terrain-p925.js` remains **KEEP ROOT / protected** because it owns sensitive near-ground preparation, road-bed state, geometry reuse and prepared commits. `src/terrain.js` remains the current P9.27 root owner.

## Exact next action — R9 permanent root-cleanliness gate

Proceed **read-only first**. R9 is not another broad file-moving phase. Its purpose is to make the accepted root/folder architecture enforceable so future work cannot silently reintroduce structural debt.

1. Inventory the current `src/` root after R8 and classify each remaining root module as public/stable facade, intentional protected owner, application bootstrap/runtime owner, or migration debt.
2. Reuse the already-certified R1–R8 source-tree boundary QAs instead of duplicating them.
3. Define the smallest permanent root-cleanliness policy that rejects **new unexplained root modules** while explicitly allowing the accepted current root set.
4. The gate must not require renaming historical P9/V21 files; historical naming cleanup remains Phase O.
5. Do not move protected owners merely to satisfy the gate. The gate must encode architecture decisions, not force cosmetic churn.
6. Candidate first for the permanent QA/workflow; validate against current `dev`, build and exact-head Dev Integration.
7. No human driving checkpoint is required for a QA-only R9 gate unless runtime files are unexpectedly changed.
8. Keep issues #2 and #4 separate backlog items; do not mix their corrections into R9.

---

# 2. R8 certified work

## R8.0 — ownership audit + permanent baseline — DONE

Current ownership model and permanent R8 checks were established before structural moves.

Permanent baseline:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

The isolated runner covers 14/14 current P9.17–P9.27 contracts. Terrain R1/R2 and P9.37–P9.42 remain separate permanent Dev Integration gates.

## R8.1 — issue #2 diagnostics — DONE / watch-only

Additive imagery geometry-refresh telemetry exists under:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
```

No resampling/scheduling behavior was retuned. Human Manic validation passed and the original delayed startup-adjustment symptom did not reproduce. **Issue #2 remains OPEN / watch-only / not diagnosed.**

If it returns, capture expanded:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
WorldDriveFramePacing().localWorldPhases
WorldDriveFramePacing().p923
WorldDriveFramePacing().visualJobs
WorldDriveFramePacing().p939HitchAttribution
```

## R8.2 — imagery structural move — DONE

```text
src/imagery.js
src/imagery/imagery-p913.js
```

Historical P9.13 implementation moved behind the current root owner. Human Photo ON validation passed. Photo OFF black procedural patches reproduced on the pre-R8.2 baseline, proving issue #4 is pre-existing/non-causal.

## R8.3 — streaming structural move — DONE

```text
src/streaming-coordinator.js
src/streaming-coordinator-p913.js
src/streaming/streaming-coordinator-p913.js
```

No scheduler thresholds/cooldowns/frame budgets changed. Human long-route/multi-refresh PASS.

## R8.4 — local-world P9.26 structural move — DONE

```text
src/local-world-builder.js
src/local-world-builder-p926.js
src/local-world/local-world-builder-p926.js
src/local-world-builder-p925.js                 # KEEP ROOT
```

Focused QA, R8 baseline, A8, C6, exact-head Dev Integration and human route/refresh/horizon smoke passed.

## R8.5 — terrain P9.26 structural move — DONE

```text
src/terrain.js
src/terrain-p926.js
src/terrain/terrain-p926.js
src/terrain/terrain-p925.js
src/terrain-p925.js                              # KEEP ROOT
```

P9.26 implementation moved behind the stable root facade while sensitive P9.25 remained root-owned. P9.27 stayed at root. Automation and human terrain/horizon/refresh/route-change smoke passed.

Permanent focused coverage:

```text
qa/qa-source-tree-r8-terrain.mjs
.github/workflows/qa-source-tree-r8-terrain.yml
```

## R8.6 — world-scene structural move — DONE

```text
src/world-scene.js
src/terrain/world-scene.js
```

Implementation moved byte-for-byte behind the stable root facade. `main.js` continued using `./world-scene.js`. Automation and human visual/route-change smoke passed. The separately observed route-start spawn defect was confirmed pre-existing and became issue #6.

## R8.7 — world-materials move + remaining ownership audit — DONE

```text
src/world-materials.js
src/terrain/world-materials.js
```

World-materials implementation moved behind the stable root facade with focused/permanent QA. Certified runtime checkpoint:

- `dev @ d09017137e671d1d5a098ccfc5d0c058c8b78d07` — `QA: certify R8 world-materials boundary`;
- R8 World Materials Structure QA `33705740429` — **PASS**;
- R8 Terrain Streaming Baseline `33705740388` — **PASS**;
- C5.1 World Materials QA `33705740408` — **PASS**;
- C6 Final Global Boundary `33705740450` — **PASS**;
- Dev Integration `33705740420` — **PASS**;
- 14 triggered workflows completed successfully on that exact HEAD.

Read-only review of remaining terrain/world owners concluded:

- `src/elevation.js` — **KEEP ROOT**;
- `src/terrain-p925.js` — **KEEP ROOT / protected**;
- `src/terrain.js` — **KEEP ROOT / current P9.27 owner**.

This closed structural R8.

## R8 post-structure — issue #6 route-start final placement — DONE / CLOSED

Dedicated candidate:

```text
candidate/r8-post-structure-spawn-r1
final HEAD a4267ec3c92a84ad16beea29037312c05b4f25f6
```

Root cause: the vehicle could be positioned using initial/fallback road height before the final DEM/local-world commit changed the road/terrain elevation.

Correction:

- route-start placement gets a lightweight final road-profile height refresh after initial DEM/world commit;
- no second full recenter;
- no duplicate dynamics/transmission reset;
- no physics tuning;
- no terrain visual tuning.

Validation:

- candidate focused run `33709337623` — **PASS**;
- candidate R8 baseline `33709337634` — **PASS**;
- human multi-route + reset smoke — **PASS**;
- exact integrated `dev` focused run `33711906871` — **PASS**;
- exact integrated `dev` R8 baseline `33711906868` — **PASS**;
- exact integrated `dev` Dev Integration `33711906922` — **PASS 100/100 functional steps**.

GitHub issue #6 is **CLOSED / completed**.

## R8 post-structure — issue #5 route-change forest readiness — DONE / CLOSED

Causal audit proved R8.5 non-causal: the forest/scenery owners were byte-identical across the R8.5 move. The actual defect was an older route-change sequencing asymmetry: initial startup waited for P9.35 forest readiness, but in-game route creation exposed terrain immediately after starting scenery asynchronously.

Dedicated candidate:

```text
candidate/r8-forest-route-readiness-r1
final HEAD 31561c128696f045aeaf98fde9de8a1f9ecdabd6
```

Correction:

- in-game route changes reuse the existing P9.35 readiness barrier before hiding the loading overlay;
- initial startup behavior is unchanged;
- no forest density/budget/threshold/visual tuning;
- route-start final-placement correction remains preserved.

Validation:

- R8 Forest Route Readiness QA `33712481302` — **PASS**;
- R8 Terrain Streaming Baseline `33712481234` — **PASS**;
- P9.35 startup/front-load, rolling prefetch, prepared forest retention — **PASS**;
- route placement preservation, runtime audit, build and code split — **PASS**;
- human repeated multi-route smoke — **PASS**, including acceptance of the small additional loading wait.

GitHub issue #5 is **CLOSED / completed**.

---

# 3. Open/deferred issues after R8

## Issue #2 — delayed terrain startup adjustment

**OPEN / watch-only / not diagnosed.** Original transient Manic observation has not reproduced. Permanent instrumentation exists. Do not invent a correction without correlation evidence.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN / pre-existing visual defect.** Photo OFF can reveal large solid-black procedural terrain patches; Photo ON looks normal. A/B reproduction on pre-R8.2 `dev` proved the imagery structural move non-causal.

Treat only in a dedicated correction candidate. Preserve Photo ON. This is not part of R9 root-cleanliness work.

## Issue #5 — route-change forest readiness

**CLOSED / corrected.** In-game route changes now wait on the already-proven P9.35 forest readiness gate before exposing the route.

## Issue #6 — vehicle can spawn below terrain on a new route

**CLOSED / corrected.** Final route-start placement re-samples the final road-profile height after the initial DEM/world commit.

---

# 4. Closed/certified work

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
- R8.0–R8.7 structural work: DONE / frozen.
- R8 issue #6 correction: DONE automation + human PASS; issue CLOSED.
- R8 issue #5 correction: DONE automation + human PASS; issue CLOSED.
- **R8 overall: COMPLETE / STABILIZED / FROZEN.**

Intentional root water layout remains:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

Intentional protected terrain owners remain:

```text
src/elevation.js
src/terrain.js
src/terrain-p925.js
src/local-world-builder-p925.js
```

---

# 5. Protected behavior / prohibitions

Preserve accepted physics, road/bridge geometry, terrain authority, forest/scenery behavior, hydro semantics, settings/routing/UI contracts, local-first Quebec hydro, cache behavior, Photo ON quality, streaming frame pacing and compatibility diagnostic aliases.

Do not mix into R9:

- runtime file moves merely to reduce root count;
- physics/handling tuning;
- terrain/road/forest visual tuning;
- dependency/security fixes (`npm audit fix --force` forbidden);
- GitHub Actions runtime upgrades;
- historical P9/V21 naming cleanup (Phase O only);
- scenery/sign offline migration;
- regional-data packaging decisions;
- issue #2/#4 corrections.

Generated/source Geofabrik data remain out of Git until packaging is explicitly decided.

---

# 6. Phase roadmap

- R1–R7: CLOSED/DONE.
- R8.0 baseline: DONE.
- R8.1 issue #2 observability: DONE; watch-only.
- R8.2 imagery structure: DONE.
- R8.3 streaming structure: DONE.
- R8.4 local-world structure: DONE.
- R8.5 terrain structure: DONE.
- R8.6 world-scene structure: DONE.
- R8.7 world-materials + remaining-owner audit: DONE; `elevation.js`, P9.25 and P9.27 KEEP ROOT.
- R8 issue #6 route-start placement: DONE / CLOSED.
- R8 issue #5 route-change forest readiness: DONE / CLOSED.
- **R8 overall: CLOSED / FROZEN.**
- **R9 permanent root-cleanliness gate: ACTIVE — read-only inventory and policy first.**
- Issue #2: watch-only unless reproduced.
- Issue #4: dedicated Photo OFF correction later; keep separate from R9.
- Phase O historical naming cleanup: after R9 / folder stabilization.

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
| World-materials structure | `qa/qa-source-tree-r8-world-materials.mjs` + C5.1 + V21.22.3 |
| Elevation owner | `qa/qa-streaming-p919-elevation.mjs` |
| Route-start placement | `qa/qa-route-start-final-placement-r8.mjs` + finite placement QA + human multi-route smoke |
| Route-change forest readiness | `qa/qa-r8-forest-route-readiness.mjs` + P9.35/P9.36/P9.38 + human multi-route smoke |
| Terrain/imagery visuals | Terrain R1 + Terrain R2 + human visual smoke |
| Frame pacing | P9.37–P9.42 + `WorldDriveFramePacing()` |
| Build | `npm run build` + code-split QA |
| R9 root cleanliness | permanent allowlist/policy gate + existing R1–R8 boundary QAs |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 8. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires exact final `dev` green + required human validation + explicit user approval. Until then, **do not move `main`**.

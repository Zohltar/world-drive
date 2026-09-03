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
7. Human-visible FAIL overrides green automation; A/B may establish that a defect predates a candidate.
8. One intent per commit. Do not mix dependency/security/Actions/behavioral work into unrelated structural or naming work.
9. Prefer meaningful work blocks. Involve the user only at critical runtime/visual/integration checkpoints.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **post-architecture visual correction backlog — issue #4 Photo OFF terrain patches**  
**State:** **R1–R9 + Phase O DONE/CERTIFIED; R8 architecture FROZEN; issue #4 is next concrete runtime defect**  
**Phase O integration HEAD before this docs commit:** `f6ec24c955504217d2cf87a62b89af8259d80898` — `QA: include hidden P9.41 runtime state in naming boundary`  
**Phase O Historical Naming Boundary QA:** run `33750048026` — **PASS** on exact integrated `dev` HEAD  
**Dev Integration:** run `33750047938` — **PASS 100/100 functional steps** on exact integrated `dev` HEAD  
**Triggered workflow set:** **15/15 completed successfully** on exact integrated Phase O HEAD  
**Candidate focused Phase O run:** `33749970701` — **PASS**  
**Human checkpoint:** not required; Phase O changed QA/workflow files only.  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

## Phase O decision — KEEP existing historical lineage, prevent new naming debt

Phase O did **not** rename runtime files. The audit concluded that current `P9`, `V21` and `Mx` names still encode compatibility boundaries, implementation lineage, active branding or diagnostic provenance. Mechanical renames would add path/compatibility risk while erasing useful history.

Permanent Phase O policy:

```text
qa/qa-phase-o-naming-boundary.mjs
.github/workflows/qa-phase-o-naming-boundary.yml
qa/DEV_INTEGRATION_AUDIT.mjs  # imports Phase O boundary
```

The gate freezes:

- **21** accepted historical runtime source paths;
- **15** historical compatibility/diagnostic/runtime-state globals;
- existing lineage remains allowed;
- **new** milestone/version-stamped runtime filenames (`P9`, `Vxx`, `Mx`) require explicit policy review.

Important audit refinements:

- binary/media names are not naming debt merely because they contain version-like text (example: `f1-v8.ogg`);
- hidden computed runtime state `__WORLD_DRIVE_P941_FRAME_RUNTIME_STATE__` is explicitly retained as P9.41 lineage state;
- `vehicle-presentation-v21.29.js` and M3 multiplayer layers are explicitly retained because current QA/runtime contracts treat them as historical compatibility layers.

## Exact next action — issue #4 Photo OFF black procedural terrain patches

Issue #4 is concrete, reproducible and pre-existing. Photo OFF can expose large solid-black procedural terrain patches with sharp polygon boundaries beside the road; Photo ON is visually correct.

Proceed **read-only / causal first**:

1. Re-read issue #4 and preserve its A/B conclusion: the defect predates R8.2 and is not caused by the imagery structural move.
2. Trace what Photo OFF actually toggles in `imagery.js` and what terrain/material becomes visible underneath.
3. Inspect the procedural near-ground material/vertex-color/texture path across `world-materials`, current `terrain.js`, P9.26/P9.25 and local-world prepared commits.
4. Search for black material defaults, missing/zero vertex colors, uninitialized texture/material slots, invalid normals/UVs, transparent/stencil interactions or stale material state that could create polygon-shaped black regions.
5. Compare Photo ON vs OFF ownership; **do not alter Photo ON imagery quality**.
6. Do not tune terrain geometry, road shape, physics, forest or streaming merely to mask the artifact.
7. If source evidence identifies a narrow cause, create a dedicated issue-#4 candidate with focused permanent QA and Photo ON/OFF regression protection.
8. Human visual A/B is mandatory before integration of any issue-#4 runtime correction.
9. If evidence is insufficient, add narrowly scoped diagnostics rather than speculative visual tuning.

---

# 2. Certified architecture

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

## R8 terrain / imagery / local-world / streaming — COMPLETE / STABILIZED / FROZEN

Permanent baseline:

```text
qa/qa-r8-current-ownership.mjs
qa/qa-r8-streaming-baseline.mjs
.github/workflows/qa-r8-baseline.yml
```

Certified ownership includes:

```text
src/imagery.js
  -> src/imagery/imagery-p913.js

src/streaming-coordinator.js
  -> src/streaming-coordinator-p913.js
  -> src/streaming/streaming-coordinator-p913.js

src/local-world-builder.js
  -> src/local-world-builder-p926.js
  -> src/local-world/local-world-builder-p926.js
  -> src/local-world-builder-p925.js             # KEEP ROOT / protected

src/terrain.js                                    # KEEP ROOT / current P9.27 owner
  -> src/terrain-p926.js
  -> src/terrain/terrain-p926.js
  -> src/terrain/terrain-p925.js
  -> src/terrain-p925.js                          # KEEP ROOT / protected

src/world-scene.js
  -> src/terrain/world-scene.js

src/world-materials.js
  -> src/terrain/world-materials.js

src/elevation.js                                  # KEEP ROOT / P9.19 hot DEM owner
```

R8 structural moves R8.2–R8.7 all passed focused automation, exact-head Dev Integration and required human smoke. No further organization-only R8 moves are planned.

### Issue #6 — route-start vehicle under terrain — CLOSED

Root cause: initial/fallback road height could be sampled before final DEM/local-world commit.

Correction: lightweight final road-profile height re-sample after initial DEM/world commit, without second full recenter or physics retune.

Candidate/integrated automation + human multi-route/reset smoke: PASS.

### Issue #5 — late forest on route change — CLOSED

R8.5 was proven non-causal. Actual cause was older sequencing asymmetry: initial startup waited for P9.35 readiness but in-game route changes exposed terrain before the same forest readiness barrier.

Correction: in-game route changes now reuse existing P9.35 readiness before hiding loading overlay. No forest density/budget/threshold tuning.

Automation + repeated human multi-route smoke: PASS.

## R9 permanent root-cleanliness — DONE / CERTIFIED

Permanent:

```text
qa/qa-r9-root-cleanliness.mjs
.github/workflows/qa-r9-root-cleanliness.yml
```

R9 freezes **67** accepted direct `src/` files:

- 32 stable/public facades;
- 14 intentional protected owners;
- 21 bootstrap/runtime owners;
- 0 direct-root placement debt.

New owned subdirectories remain allowed. A new direct `src/` file requires explicit R9 policy update/architectural justification.

Certified:

- candidate focused `33748697259` — PASS;
- integrated R9 `33748842006` — PASS;
- integrated Dev Integration `33748841800` — PASS 100/100;
- 14/14 triggered workflows — PASS.

## Phase O historical naming boundary — DONE / CERTIFIED

Phase O chose **KEEP NAME** for current runtime lineage. No runtime rename was performed.

Permanent gate:

```text
qa/qa-phase-o-naming-boundary.mjs
.github/workflows/qa-phase-o-naming-boundary.yml
```

Certified:

- candidate focused final `33749970701` — PASS;
- integrated Phase O `33750048026` — PASS;
- integrated Dev Integration `33750047938` — PASS 100/100;
- 15/15 triggered workflows — PASS.

---

# 3. Open / closed issues

## Issue #2 — intermittent delayed terrain adjustment after route startup

**OPEN / watch-only / not reproduced.** Permanent diagnostic instrumentation exists under `WorldDriveFramePacing().imagery.r8GeometryRefresh` plus local-world/visual-job/hitch attribution metrics. Do not invent a correction while the symptom remains non-reproducible.

## Issue #4 — Photo OFF black procedural terrain patches

**OPEN / ACTIVE NEXT / pre-existing.** Photo OFF can reveal large solid-black polygonal terrain patches. Photo ON is correct. A/B reproduction before R8.2 proved the imagery structural move non-causal. Dedicated causal audit/correction only; preserve Photo ON.

## Issue #5 — route-change forest readiness

**CLOSED / corrected.** Existing P9.35 readiness is reused before exposing an in-game route change.

## Issue #6 — route-start vehicle placement

**CLOSED / corrected.** Final placement re-samples final road-profile height after initial DEM/world commit.

---

# 4. Protected behavior / prohibitions

Preserve accepted physics, road/bridge geometry, terrain authority, forest/scenery behavior, hydro semantics, settings/routing/UI contracts, local-first Quebec hydro, cache behavior, Photo ON quality, streaming frame pacing and compatibility diagnostic aliases.

Do not mix into issue #4 work:

- physics/handling tuning;
- road geometry or terrain-shape tuning;
- forest/scenery tuning;
- dependency/security fixes (`npm audit fix --force` forbidden);
- GitHub Actions runtime upgrades;
- new architecture/file moves merely for cleanliness;
- historical naming churn already closed by Phase O;
- issue #2 speculative fixes;
- scenery/sign offline migration;
- regional-data packaging decisions.

Generated/source Geofabrik data remain out of Git until packaging is explicitly decided.

---

# 5. Phase roadmap

- R1–R7: DONE/CLOSED.
- R8.0–R8.7: DONE / frozen.
- R8 issue #5: DONE / CLOSED.
- R8 issue #6: DONE / CLOSED.
- R8 overall: CLOSED / STABILIZED / FROZEN.
- R9 permanent root-cleanliness: DONE / CERTIFIED.
- Phase O historical naming boundary: DONE / CERTIFIED; KEEP existing lineage.
- **Issue #4 Photo OFF procedural-terrain correction: ACTIVE — read-only audit first.**
- Issue #2: watch-only unless reproduced.
- `main` promotion: only after explicit user approval.

---

# 6. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| Root cleanliness | `qa/qa-r9-root-cleanliness.mjs` |
| Historical naming | `qa/qa-phase-o-naming-boundary.mjs` + C6 |
| R8 ownership | `qa/qa-r8-current-ownership.mjs` |
| R8 streaming | `qa/qa-r8-streaming-baseline.mjs` |
| Terrain structure | R8 terrain source-tree + Terrain R1/R2 |
| Issue #4 material/visual fix | focused permanent QA + Terrain R1/R2 + Photo ON/OFF human A/B |
| Elevation owner | `qa/qa-streaming-p919-elevation.mjs` |
| Route-start placement | `qa/qa-route-start-final-placement-r8.mjs` |
| Forest readiness | `qa/qa-r8-forest-route-readiness.mjs` + P9.35/P9.36/P9.38 |
| Frame pacing | P9.37–P9.42 + `WorldDriveFramePacing()` |
| Build | `npm run build` + code-split QA |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation when runtime or visuals change.

---

# 7. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires exact final `dev` green + required human validation + **explicit user approval**. Until then, do not move `main`.

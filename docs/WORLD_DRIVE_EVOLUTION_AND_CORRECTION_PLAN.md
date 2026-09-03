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
8. One intent per commit. Do not mix dependency/security/Actions/behavioral work into unrelated structural or correction work.
9. Prefer meaningful work blocks. Involve the user only at critical runtime/visual/integration checkpoints.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **post-architecture correction backlog clear — issue #2 watch-only**  
**State:** **R1–R9 + Phase O DONE/CERTIFIED; R8 architecture FROZEN; issues #4 and #8 CLOSED / HUMAN PASS; no active reproducible correction target**  
**Issue #8 integrated runtime/QA HEAD before this docs checkpoint:** `22c3f66a3756f5bec2ecec747f2cf953e59ec75d` — `QA: keep issue 8 historical shim out of root layout scan`  
**Issue #8 focused candidate QA:** run `33812652501` — **PASS**  
**Issue #8 exact-head Dev Integration:** run `33813055208` — **PASS 100/100 functional steps** on `22c3f66a3756f5bec2ecec747f2cf953e59ec75d`  
**Issue #8 human checkpoint:** **PASS** — bridge deck support, beside/below-bridge terrain support, ordinary road exit/re-entry and requested non-bridge behavior accepted.  
**Issue #2:** **OPEN / watch-only / not reproduced**; permanent diagnostics remain available if the symptom returns.  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

## Issue #4 final decision — retire legacy transition presentation

The visible black Photo-OFF patches were isolated to the legacy `road-terrain-transition` presentation layer.

Causal evidence:

- hiding the main `ground` did not remove the black patches;
- hiding `road-terrain-transition` removed them;
- shadow, stencil, winding, shading-floor, vertex-color and polygon-offset candidates were HUMAN FAIL / non-causal;
- an unlit fixed `MeshBasicMaterial` probe removed the black, proving the transition presentation path was responsible rather than the underlying terrain;
- hiding the transition entirely was visually cleaner than keeping the helper ribbon.

Final runtime correction:

```text
src/terrain/world-scene.js
```

`road-terrain-transition` and `road-terrain-transition-p927-hold` are presentation-retired with `visible=false` when added to the scene. Their generation, material, depth, geometry and physics contracts are otherwise left intact for minimal risk.

Permanent focused coverage:

```text
qa/qa-issue4-transition-retired.mjs
.github/workflows/qa-issue4-transition-retired.yml
```

Issue #4 is **CLOSED / corrected / HUMAN PASS**.

## Issue #8 final decision — reject detached elevated road support off the road core

Issue #8 was a separate physical defect discovered while diagnosing issue #4. Near/under an elevated bridge, wheel support could follow the elevated road plane even when the vehicle was on natural terrain beside or below it.

Measured bad point before correction:

- route distance `5.762 m`;
- road surface `2.889 m`;
- physical DEM `-2.113 m`;
- rendered ground `-1.640 m`;
- wheel support `2.786 m`.

Final correction in `src/physics/wheel-ground-support.js`:

- preserve authoritative road support inside the solid road core;
- outside that core, if the road support plane is more than `2.4 m` above natural terrain, use terrain support instead of blending toward the detached road plane;
- preserve existing modest embankment/cut blending and R14 road-edge/re-entry continuity;
- no handling, suspension, road geometry or terrain geometry retune.

Permanent focused coverage:

```text
qa/qa-issue8-bridge-support.mjs
.github/workflows/qa-issue8-bridge-support.yml
```

Issue #8 is **CLOSED / corrected / HUMAN PASS**.

## Exact next action — no speculative correction; hold issue #2 watch-only

There is currently no other open reproducible defect in the tracked correction backlog. Issue #2 remains open only because its delayed terrain-adjustment symptom has not reproduced since permanent diagnostics were added.

Proceed conservatively:

1. Do **not** invent or tune a correction for issue #2 while it remains non-reproducible.
2. If issue #2 reappears, capture the expanded `WorldDriveFramePacing().imagery.r8GeometryRefresh` together with `localWorldPhases`, `p923`, `visualJobs` and `p939HitchAttribution` before the condition converges.
3. Otherwise keep `dev` as the certified working branch and await the user's next feature/correction priority.
4. `main` remains untouched until the user gives explicit promotion approval.
5. Any new runtime/visual/physics work starts with a read-only causal audit and a dedicated candidate when risk warrants it.

---

# 2. Certified architecture

## R1–R7 — DONE

- R1 source-root audit: DONE.
- R2 multiplayer: DONE automation + human PASS.
- R3 traffic: DONE automation + human PASS.
- R4 vehicles/presentation/models/truck: DONE automation + human PASS.
- R4.5 audio: DONE automation + human PASS.
- QA root-layout: DONE.
- R5 vehicle dynamics / wheel-ground / transmission: CLOSED; no broad physics retune.
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

Final road-profile height is re-sampled after initial DEM/world commit. Candidate/integrated automation + human multi-route/reset smoke: PASS.

### Issue #5 — late forest on route change — CLOSED

In-game route changes reuse the existing P9.35 readiness barrier before exposing the route. No forest density/budget/threshold tuning. Automation + repeated human multi-route smoke: PASS.

## R9 permanent root-cleanliness — DONE / CERTIFIED

Permanent:

```text
qa/qa-r9-root-cleanliness.mjs
.github/workflows/qa-r9-root-cleanliness.yml
```

R9 freezes the accepted direct `src/` topology and requires explicit policy review for new direct-root source owners.

## Phase O historical naming boundary — DONE / CERTIFIED

Phase O chose **KEEP NAME** for current runtime lineage. No runtime rename was performed.

Permanent gate:

```text
qa/qa-phase-o-naming-boundary.mjs
.github/workflows/qa-phase-o-naming-boundary.yml
```

Existing historical `P9`, `V21` and `Mx` lineage remains accepted; new milestone/version-stamped runtime names require explicit review.

---

# 3. Open / closed issues

## Issue #2 — intermittent delayed terrain adjustment after route startup

**OPEN / watch-only / not reproduced.** Permanent diagnostic instrumentation exists under `WorldDriveFramePacing().imagery.r8GeometryRefresh` plus local-world/visual-job/hitch attribution metrics. Do not invent a correction while the symptom remains non-reproducible.

## Issue #4 — Photo OFF black procedural terrain patches

**CLOSED / corrected / HUMAN PASS.** Root visible artifact was the legacy `road-terrain-transition` presentation. Final correction retires that presentation while leaving its internal generation contracts intact.

## Issue #5 — route-change forest readiness

**CLOSED / corrected.** Existing P9.35 readiness is reused before exposing an in-game route change.

## Issue #6 — route-start vehicle placement

**CLOSED / corrected.** Final placement re-samples final road-profile height after initial DEM/world commit.

## Issue #7 — accidental placeholder

**CLOSED / not planned.** No project defect.

## Issue #8 — elevated road/bridge wheel-support bleed

**CLOSED / corrected / HUMAN PASS.** Detached elevated road support is rejected outside the solid road core when it is clearly above natural terrain; bridge-deck and normal road-edge support behavior remain preserved.

---

# 4. Protected behavior / prohibitions

Preserve accepted physics except for narrowly proven issue-specific corrections, road/bridge geometry, terrain authority, forest/scenery behavior, hydro semantics, settings/routing/UI contracts, local-first Quebec hydro, cache behavior, Photo ON quality, streaming frame pacing and compatibility diagnostic aliases.

Until a new concrete work item is chosen, do not introduce:

- broad handling/suspension tuning;
- road geometry or terrain-shape tuning;
- forest/scenery tuning;
- dependency/security fixes (`npm audit fix --force` forbidden);
- GitHub Actions runtime upgrades;
- architecture/file moves merely for cleanliness;
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
- Issue #4 Photo OFF procedural-terrain correction: DONE / CLOSED / HUMAN PASS.
- Issue #8 bridge/off-road wheel support: DONE / CLOSED / HUMAN PASS.
- Issue #2: OPEN / watch-only unless reproduced.
- **Active correction backlog: clear; await a concrete new priority or issue #2 reproduction.**
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
| Issue #4 retired transition | `qa/qa-issue4-transition-retired.mjs` + Photo ON/OFF human A/B |
| Issue #8 wheel support | `qa/qa-issue8-bridge-support.mjs` + R5b/R14 + bridge/off-road human smoke |
| Elevation owner | `qa/qa-streaming-p919-elevation.mjs` |
| Route-start placement | `qa/qa-route-start-final-placement-r8.mjs` |
| Forest readiness | `qa/qa-r8-forest-route-readiness.mjs` + P9.35/P9.36/P9.38 |
| Frame pacing | P9.37–P9.42 + `WorldDriveFramePacing()` |
| Build | `npm run build` + code-split QA |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation when runtime, physics or visuals change.

---

# 7. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires exact final `dev` green + required human validation + **explicit user approval**. Until then, do not move `main`.

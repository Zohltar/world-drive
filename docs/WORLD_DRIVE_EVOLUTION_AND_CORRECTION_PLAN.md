# World Drive — Evolution & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable fallback: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

This document is the active restart/checkpoint source for World Drive. Historical detail belongs under `docs/archive/`; GitHub state + this file win over chat memory when they disagree.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding/architecture/QA conversation:

1. Read this file from the current `dev` branch.
2. Read live HEADs of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If a checkpoint names an audit/candidate branch, inspect that branch and its latest workflow.
6. Resume the exact **Next action** unless the user changes priority.
7. Never mark structural work DONE without commit/run evidence and required human validation.
8. Work in small certified blocks: read-only audit → candidate → focused QA → permanent gate → exact-head Dev Integration → human checkpoint where required.
9. Before ending meaningful work, update this file with SHA/run evidence, discoveries, prohibitions and exact next action.
10. **Never move `main` without explicit user approval.**

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization  
**Active item:** **R6.4 — water implementation organization**  
**State:** **INTEGRATED AUTOMATION PASS — HUMAN CHECKPOINT NEXT**  
**Current validated runtime/CI dev HEAD before this documentation commit:** `33b4973f7af9ed6d85a92c0cdc8343149ec18c70`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Latest exact-head full integration before this documentation commit:** Dev Integration run `33592452542` on `33b4973f7af9ed6d85a92c0cdc8343149ec18c70` — **PASS**  
**Functional steps:** **98/98 green**  
**Latest human validation:** **R6.3a scenery renderer accepted PASS.** User explicitly authorized continuation and asked that the intermittent terrain issue be logged for later rather than block the plan. **R6.4 water human smoke is pending.**

## Accepted deferred observation — issue #2

During the R6.3a smoke, one Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were already visible. The terrain converged on its own and the condition could not be reproduced after relaunch.

Recorded telemetry while investigating:
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count increased from 5 to 9;
- `maxFrameMs:194.4`.

GitHub issue: **#2 — `Intermittent delayed terrain adjustment after route startup`**.

Current hypothesis only, not a confirmed cause: deferred P9.27 terrain↔road transition work (`road-transition` scheduling + sliced transition preparation). **Do not tune this during current structural R6/R7 work.** Reproduce later during **R8 terrain/imagery/local-world/streaming** or correction work with full `WorldDriveFramePacing()` nested diagnostics captured before/after convergence.

## Exact next action

**Human checkpoint — R6.4 water.** Test current `dev` with emphasis on:

- startup + route load;
- visible rivers/lakes/reservoirs where the chosen route contains them;
- coastline rendering if a coastal route is practical;
- normal shoreline clipping / flat water surfaces;
- no giant blue triangular facets or missing water strips;
- bridge-over-water appearance if encountered;
- scenery/forest still normal after the shared authored forest/water asset boundary is exercised;
- route reset/reload or a second route if practical;
- no new hitch/stall or frame-pacing regression.

If the smoke is **PASS**, record it and close R6. **Only then** begin R7 with a fresh read-only audit of app/input/ui/routing/services. Do not move R7 families before that audit.

---

# 2. CLOSED / CERTIFIED STRUCTURAL WORK

## R2 — Multiplayer

**DONE — automation + human PASS.**

- Public root lazy facades retained: `src/multiplayer.js`, `src/multiplayer-visuals.js`.
- Internal implementation lives under `src/multiplayer/`.
- Permanent gate: `qa/qa-source-tree-r2-multiplayer.mjs`.
- Key evidence: candidate `33455749888`, Dev Integration `33455977023`, human PASS.

## R3 — Civil traffic

**DONE — automation + human PASS.**

Implementation lives under `src/traffic/`:

```text
civil-traffic.js
civil-traffic-local.js
civil-traffic-network-bridge.js
civil-traffic-pool.js
civil-traffic-preload.js
```

Permanent gate: `qa/qa-source-tree-r3-traffic.mjs`.

## R4 — Vehicles / presentation / models / truck

**DONE — automation + human PASS.**

Implementation is organized under `src/vehicles/`, including `models/` and `truck/`. Authored registry paths, lazy GLB loading, `import.meta.url` assets, model scale/orientation/wheels/lights, multiplayer presentation, truck/trailer behavior and placement contracts were preserved.

Key evidence: candidate `33464463621`, integrated state `b718675b8d88a810c168216bf57be97546e35719`, Dev Integration `33465049654`, human PASS.

## R4.5 — Audio

**DONE — automation + human PASS.**

```text
src/audio.js      -> src/audio/audio.js
src/audio-base.js -> src/audio/audio-base.js
```

Exact-content moves; application-relative audio URLs and tire/brake audio behavior preserved. Permanent gate: `qa/qa-source-tree-audio.mjs`.

## QA root-layout cleanup

**DONE — automation + human PASS.**

- canonical QA location is `qa/`;
- legacy root `qa-*.mjs` clutter removed;
- path/context assumptions modernized without runtime changes;
- permanent gate: `qa/QA_ROOT_LAYOUT_QA.mjs`;
- exact-head Dev Integration `33562578540` — **92/92**;
- human PASS: “tout est beau, pass!”.

## R5a — Core vehicle dynamics

**DONE — automation + human PASS through the integrated runtime checkpoint.**

```text
src/physics/vehicle-dynamics.js
src/physics/vehicle-dynamics-core.js
src/physics/vehicle-dynamics-traction-steering.js
```

Permanent gate: `qa/qa-source-tree-r5a-vehicle-dynamics.mjs`.

No physics equation/constant tuning was part of the move.

## R5b.1 — Wheel-ground support

**DONE — automation + human PASS.**

```text
src/wheel-ground-support.js
  -> stable root facade
src/physics/wheel-ground-support.js
  -> implementation
```

Implementation blob remained byte-identical: `54e11aba7d2543981f7c0a9f517a293ac47c18ae`.

Permanent gate: `qa/qa-source-tree-r5b-wheel-ground-support.mjs`.

Evidence: candidate run `33578784621`; Dev Integration `33578884903`; documentation-head integration `33579048645`; human PASS “pass”.

## R5b.2 — Transmission network/runtime state

**DONE — automation + human PASS.**

```text
src/transmission-network-state.js
src/transmission-runtime-bridge.js
  -> stable root facades

src/physics/transmission-network-state.js
src/physics/transmission-runtime-bridge.js
  -> implementations
```

Implementation blobs remained byte-identical:
- network state: `8df33294597d28930cbfd2ceebb5152ad6b39287`;
- runtime bridge: `81e146c3bd5dee6ae3250421e84b170aa5b8cdd0`.

Frozen semantics:
- `R=-1`, `N=0`, forward `1..N`;
- controller/clutch/selector timing unchanged;
- multiplayer exact-gear publication/readback unchanged.

Permanent gate: `qa/qa-source-tree-r5b-transmission-state.mjs`.

Evidence:
- move `fe891d75ec873248d5924383d64e6b7531c2392c`;
- focused PASS `33581103633` after QA-only path correction;
- integrated runtime `30a67a295c19f8f02987390c23367290040c5260`;
- Dev Integration `33581319020` — **94/94**;
- human PASS recorded.

## R5 closure — driving runtime disposition

**R5 CLOSED.**

Read-only audit concluded:

- `src/driving-runtime.js` — **KEEP ROOT**, public/runtime orchestration facade;
- `src/driving-runtime-base.js` — **KEEP ROOT / DEFER TO O6**;
- `src/transmission-controller.js` — **KEEP ROOT**, application/controller boundary;
- `src/skidmarks.js` — **KEEP ROOT**, intentional contact/visual/audio/Three.js hybrid;
- transmission-state and wheel-support root facades retained intentionally.

Old companion names below do **not** exist and must not be recreated merely to satisfy historical assumptions:

```text
src/braking.js
src/abs-system.js
src/wheel-friction.js
src/truck-physics-adapter.js
```

## R6.1 — Road furniture / signs

**DONE — automation + human PASS.**

```text
src/road-furniture.js
  -> stable public root facade
src/road/road-furniture-p930.js
src/road/road-furniture-p937.js
  -> implementation layers
```

Preserved sign appearance, sign-face caching, incremental construction, idle scheduling/coalescing and minimap readout. `signs.js` and `bridges.js` were not mixed into this sub-lot.

Permanent gate: `qa/qa-source-tree-r6-road-furniture.mjs`.

Evidence:
- focused candidate run `33583213310` — PASS;
- integrated `dev` @ `411d881f66aa5af00e6eb5e6db443312c6f0061b`;
- Dev Integration `33583321914` — **95/95**;
- human PASS: **“pass aucun probleme”**.

## R6.2 — Road geometry + bridge interactions

**DONE — automation + human PASS.**

```text
src/road-geometry.js
  -> stable public root facade
src/road/road-geometry.js
  -> exact former implementation
src/bridges.js
  -> intentionally remains root
```

Implementation blob remained byte-identical:
`5c4f928cead5423e6591766c81528f5eaa7055a2`.

Frozen interactions include:
- bridge deck height override through `bridgeHeightAtCum(raw[i].cum)`;
- bridge approach preservation through `bridgeManager.isNearApproach(raw[i].cum,18)`;
- bridge manager initialization/order in `main.js`;
- smoothing, grades, banking/superelevation, terrain authority and road-contact math.

Permanent gate: `qa/qa-source-tree-r6-road-geometry.mjs`.

Evidence:
- path-only move `b91ae4be248a027460798e2622846987fbadaaab`;
- first candidate `33588019072` exposed a QA false positive only;
- focused PASS `33588152294` after QA-only correction;
- integrated runtime `101bb197b4e4855466a651341fdb670fc3b17a60`;
- Dev Integration `33588267313` — **96/96**;
- human PASS: **“pass”**.

---

# 3. R6.3 / R6.4 — SCENERY, FOREST, WATER

## R6.3a — Scenery renderer implementation move

**DONE — automation + accepted human PASS.**

Read-only audit separated scenery rendering from the higher-risk forest streaming family.

```text
src/scenery-renderer.js
  -> stable root facade

src/scenery/scenery-renderer-p9.js
src/scenery/scenery-renderer-p933.js
  -> implementation layers
```

Preserved boundaries:
- `main.js` still imports only `./scenery-renderer.js`;
- P933 still composes P9;
- P933 still consumes root forest policy + diagnostics boundaries;
- P9 still consumes root forest-water assets + forest chunk streamer boundaries;
- scenery rebuild / retained forest height refresh / refresh request ordering unchanged;
- route-change forest cache purge semantics unchanged;
- startup forest readiness remains 14 chunks / 8 forward / +2 forward lead;
- no forest constants, scheduling, priority, prefetch, cache, visual density or frame-budget tuning was made.

Permanent gate: `qa/qa-source-tree-r6-scenery-renderer.mjs`.

Evidence:
- structural move `c3b062de5219eef82104273f55dd69b80d4fa8d1`;
- QA-only path retarget `6908f6af7ce756536852fd7553c0540570bffa39`;
- focused candidate run `33590102641` — PASS;
- integrated state `98bf8ff386679e62e9c8702edf6b1954d751b47d`;
- Dev Integration `33590213452` — **97/97**;
- documentation-head Dev Integration `33590338958` — **97/97**;
- human disposition: continue; intermittent terrain observation logged as issue #2 and deferred.

## R6.3b — Forest runtime family disposition

**CLOSED — KEEP ROOT / intentional boundary. No runtime move.**

Audit branch: `audit/r6-forest` from `06e4fa09d2f908e879db7116dcdbaa75007b404c`.

Frozen root family:

```text
src/forest-authored-lite.js
src/forest-chunk-streamer-core.js
src/forest-chunk-streamer.js
src/forest-proxy-assets.js
src/forest-streaming-policy.js
src/forest-terrain-sampler.js
src/forest-water-assets.js
```

Decision reasons:
- streamer wrapper owns startup direction, diagnostics, hitch attribution and compatibility/runtime boundary behavior;
- core owns chunk cache, active/prefetched chunks, queue/prioritization, rolling prefetch, build slicing and height refresh;
- `forest-streaming-policy.js` owns behavior-sensitive density, distance, budget, cache and prefetch constants;
- C4 and the dense P9.29/P9.35–P9.42 QA suite intentionally protect the current root contracts;
- moving these files would create large path churn with no meaningful ownership gain;
- `forest-water-assets.js` is shared by scenery **and** water, so it must not be pulled into either implementation folder during Phase R.

No forest behavior or path was changed by R6.3b.

## R6.4 — Water implementation organization

**INTEGRATED — automation PASS, human smoke pending.**

```text
src/water-data.js
  -> stable root facade
src/water-renderer.js
  -> stable root facade

src/water/water-data.js
  -> data implementation
src/water/water-renderer.js
  -> rendering implementation

src/forest-water-assets.js
  -> intentionally remains root shared forest/water boundary
```

Preservation evidence:
- `src/water/water-data.js` reuses the exact original implementation blob `72ee9cba5874b0ba954a7fdf0e136402618f4816`;
- water renderer logic was preserved; only its relative shared-asset import changed from `./forest-water-assets.js` to `../forest-water-assets.js` after nesting;
- `main.js` still imports only `./water-data.js` and `./water-renderer.js`;
- no hydro query/cache/TTL change;
- no shoreline, water-level, smoothing, radius, coastline width, material, geometry or bridge behavior tuning;
- no forest/shared asset implementation move.

Permanent gate: `qa/qa-source-tree-r6-water.mjs`, wired into Dev Integration.

Evidence:
- audit branch `audit/r6-water`;
- candidate `candidate/r6-water`;
- structural move `2b59e0affc4c69ae81ee358e6186189c52a7bc79`;
- source-tree gate `c7a0deb6d6dfbdc9cff5f9a27394200c8d2f04da`;
- focused candidate run `33592303130` — **PASS**, covering runtime graph, water boundary/syntax, scenery/forest shared boundaries, P9.25 streaming, combined frame pacing, full V21.31 stress, live route smoke, build and code split;
- permanent Dev Integration gate commit `87708cc397d17b183b51a5c0645ba58fb0062f0b`;
- final integrated runtime/CI state `33b4973f7af9ed6d85a92c0cdc8343149ec18c70`;
- exact-head Dev Integration `33592452542` — **PASS, 98/98 functional steps green**.

---

# 4. Operating principles / prohibitions

1. **One intent per commit.** Path move, QA modernization, behavior fix and docs stay separate.
2. **Phase R must not tune behavior.** Preserve physics, visuals, terrain, imagery, frame pacing, traffic and multiplayer semantics.
3. **Move first, rename later.** Historical names belong to Phase O.
4. **Audit before editing.** Every structural lot starts read-only.
5. **Tests protect behavior, not obsolete paths.** Retarget stale path assertions instead of restoring old architecture.
6. **Candidate before dev.** Material structural work goes through a narrow candidate + focused QA.
7. **Full Dev Integration on the actual final `dev` HEAD.** Candidate green alone is not completion.
8. **Periodic human checkpoints.** Stop after meaningful structural clusters and whenever behavior/visual/performance risk rises.
9. **No silent debt discoveries.** Record material debt before moving on.
10. **No mixed maintenance.** Dependency/toolchain work remains separate from structural source-tree work.

Do **not** mix into structural Phase R:
- physics/handling tuning;
- road/terrain/visual tuning;
- forest density/priority/budget/prefetch/cache tuning;
- transmission/clutch/brake semantic changes;
- historical production-name cleanup;
- dependency/security fixes;
- GitHub Actions runtime upgrades.

---

# 5. Protected behavior contracts

## Driving / physics

Preserve:
- per-wheel tire force / countersteer coupling;
- ABS and locked-tire force direction;
- service braking, reverse, handbrake and J-turn behavior;
- grade gravity / load transfer;
- high-speed trajectory stability;
- terrain→road support re-entry;
- skidmark/contact alignment;
- FWD power-understeer counter-yaw;
- EV momentum/J-turn behavior;
- F1 front-slip/yaw/steering authority;
- crest launch and oblique landing.

## Road / bridges

Preserve:
- robust extreme road mesh;
- road profile identity/interpolation and contact math;
- V21.31 smoothing;
- banking/superelevation limits;
- terrain authority;
- bridge deck height interpolation;
- bridge approach smoothing;
- route reset / active profile ownership.

## Scenery / forest

Preserve:
- scenery/building/infrastructure visibility;
- P9/P933 composition and root public entry;
- forest assets loading and activation timing;
- startup route-direction seed;
- forward startup coverage contract;
- protected near-ring priority;
- forest cache and active-chunk lifecycle;
- route-reset destructive clear semantics;
- ordinary-refresh retained forest semantics;
- rolling prefetch and queue maintenance;
- frame budget and hitch attribution;
- floating-origin/recenter behavior.

## Water / hydrography

Preserve:
- hydro/coastline/bridge OSM query scope and 30-day hydro cache TTL;
- water/bridge/coastline feature dedup + generation/reset semantics;
- river ribbon flat-water behavior and shoreline binary search;
- three-pass water profile smoothing;
- water polygon/coastline geometry behavior;
- authored forest/water style sharing;
- road-over-water stencil/visual priority;
- bridge-over-water orchestration;
- shared root `forest-water-assets.js` boundary.

## Vehicles / visuals

Preserve authored Countach, ID.4, WRX, Civic, Sonata, i3, F1 and truck/trailer behavior, including scale/orientation/wheels, lighting, authored multiplayer parity, truck camera/trailer articulation and stable route placement.

## Terrain / streaming / performance

Preserve:
- imagery/procedural transitions;
- cache reuse/preload;
- forest frame pacing and queue maintenance;
- near/medium/far continuity;
- photo ON/OFF quality;
- low-hitch long-route behavior.

Performance-sensitive terrain/streaming work stays late in Phase R. Issue #2 remains deferred here until reproducible with full diagnostics.

---

# 6. PHASE R — Source tree organization roadmap

- **R1 — runtime path/import/QA inventory:** DONE.
- **R2 — multiplayer:** DONE automation + human PASS.
- **R3 — traffic:** DONE automation + human PASS.
- **R4 — vehicles/presentation/models/truck:** DONE automation + human PASS.
- **R4.5 — audio:** DONE automation + human PASS.
- **R5a — core vehicle dynamics:** DONE.
- **QA root-layout cleanup:** DONE automation + human PASS.
- **R5b — runtime/transmission/wheel support/skidmarks:** **CLOSED**; wheel-ground + transmission-state moved behind root facades; remaining runtime boundaries intentionally retained/deferred.
- **R6.1 — road furniture/signs:** DONE automation + human PASS.
- **R6.2 — road geometry + bridge interactions:** DONE automation + human PASS.
- **R6.3a — scenery renderer implementation layers:** DONE automation + accepted human PASS.
- **R6.3b — forest runtime family:** **CLOSED — KEEP ROOT**, no move after read-only audit.
- **R6.4 — water data/renderer implementations:** **INTEGRATED automation PASS; human checkpoint next.**
- **R7 — app/input/ui/routing/services:** pending R6.4 human PASS; begin read-only audit only.
- **R8 — terrain/imagery/local-world/streaming:** LAST / performance-sensitive; dedicated audit + mandatory long-route human validation. **Revisit issue #2 here.**
- **R9 — permanent root-cleanliness gate:** after structural migrations stabilize.

---

# 7. PHASE O — Responsibility naming / historical cleanup

Only after relevant Phase R folders are stable.

- **O1 Multiplayer:** replace historical `m3`/`v18` production names.
- **O2 Road furniture:** replace `p930`/`p937` names while preserving construction/scheduling layers.
- **O3 Vehicle presentation:** replace `vehicle-presentation-v21.29.js` only after presentation ownership is stable.
- **O4 Scenery renderer:** replace `p9`/`p933` names without disturbing startup/forest behavior.
- **O5 Audio:** reconsider `audio-base.js` only if ownership audit proves useful.
- **O6 Driving runtime:** clarify `driving-runtime-base.js` vs public runtime after R5.
- **O7 Terrain/imagery/local-world/streaming:** only after R8 + performance validation.

---

# 8. PHASE C — Corrections / maintenance debt

## C-M1 — Dependency/security audit

**NOT STARTED. Keep separate from Phase R.**

Known discovery: `npm ci` reports **25 vulnerabilities: 3 low, 21 high, 1 critical**.

Rules:
- inspect exact dependency tree;
- distinguish shipped/runtime risk from dev/build-only transitive debt;
- no blind `npm audit fix --force`;
- validate Electron/Forge/Vite/package changes independently.

## C-M2 — GitHub Actions runtime hygiene

**NOT STARTED. Keep separate from Phase R.**

Current Actions warn about Node 20 action-runtime deprecation/forced Node 24 for actions such as `actions/checkout@v4` and `actions/setup-node@v4`. Audit/update separately.

## Deferred defect reference

- **Issue #2 — intermittent delayed terrain adjustment after route startup.** Non-reproducible after convergence/relaunch during R6.3a. Preserve as deferred R8/correction evidence; do not tune blindly during structural work.

---

# 9. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant source-tree boundary |
| QA layout | `qa/QA_ROOT_LAYOUT_QA.mjs` |
| Driving physics | `npm run qa:stress` + `qa/DEV_DRIVING_SIM_QA.mjs` + relevant grip gates |
| Wheel support / airborne | R14 + crest-launch + oblique-landing |
| Road geometry | C3 + V21.25 road QA + V21.31 smoothing/banking/superelevation + terrain authority |
| Road furniture/signs | R6 road-furniture boundary + P9.30/P9.37 + minimap/geographic-sign QA |
| Scenery renderer | R6 scenery boundary + P9.25 + P9.33/P9.35 startup + P9.38 retention |
| Forest / streaming | active forest + P9.29/P9.35–P9.42 + route-cache reset + road-sign runtime |
| Water / hydrography | R6 water boundary + runtime graph + shared scenery/forest boundary + stress + live route smoke |
| Traffic / MP traffic | traffic R1/pool/preload/MP/live gates |
| Multiplayer authored visuals | registry/adapter + M4.14/M4.15 where relevant |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | `.github/workflows/qa-dev-integration.yml` on exact final `dev` HEAD |

A green candidate is not enough. The **actual final `dev` HEAD** must pass Dev Integration.

---

# 10. Human checkpoint policy

Automation cannot replace user-visible validation.

Mandatory/high-value checkpoints include:
- visible vehicle/model/presentation moves;
- meaningful physics/runtime structural clusters;
- multiplayer boundary changes;
- road/bridge visual/contact structural moves;
- scenery/forest lifecycle structural moves;
- water/hydrography rendering moves;
- terrain/imagery/streaming changes;
- before promotion to `main`.

Do not start the next high-risk structural sub-phase until the planned human checkpoint passes.

---

# 11. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires all three:
1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval to promote.

Until then, **do not move `main`**.

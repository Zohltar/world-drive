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
**Active item:** **R6.3a — scenery renderer implementation move**  
**State:** **INTEGRATED AUTOMATION PASS — HUMAN CHECKPOINT NEXT**  
**Current validated runtime/CI dev HEAD before this documentation commit:** `98bf8ff386679e62e9c8702edf6b1954d751b47d`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Latest exact-head full integration before this documentation commit:** Dev Integration run `33590213452` on `98bf8ff386679e62e9c8702edf6b1954d751b47d` — **PASS**  
**Functional steps:** **97/97 green**  
**Latest human validation:** **R6.2 road geometry + bridge interactions PASS — user: “pass”. R6.3a scenery/forest smoke is pending.**

## Exact next action

**Human checkpoint — R6.3a scenery renderer.** Test current `dev` with emphasis on:

- startup + route load;
- ordinary scenery/buildings/infrastructure visibility;
- forest appearing normally ahead during startup;
- several kilometres of driving if practical;
- floating-origin/recenter behavior if encountered;
- route reset/reload or a second route if practical;
- no abnormal forest gaps/pops, stuck preparation state, new hitch/stall or frame-pacing regression.

If the smoke is **PASS**, record it. **Only then** begin a fresh **read-only audit** of the root forest family as the next possible R6.3 sub-lot. Do not move forest files before that audit is independently green.

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

# 3. ACTIVE R6.3a — SCENERY RENDERER IMPLEMENTATION MOVE

## Audit decision

The read-only R6.3 audit separated scenery rendering from the higher-risk forest streaming family.

Safe sub-lot:

```text
src/scenery-renderer.js
src/scenery-renderer-p9.js
src/scenery-renderer-p933.js
```

Disposition:
- `src/scenery-renderer.js` stays at root as the stable public entry used by `main.js`;
- P9 and P933 implementation layers move under `src/scenery/`;
- `src/scenery-data.js` remains root for this sub-lot;
- the entire forest family remains root and is **not** part of R6.3a;
- water, terrain, imagery and streaming remain separate later work.

Forest root family explicitly frozen during R6.3a:

```text
src/forest-authored-lite.js
src/forest-chunk-streamer-core.js
src/forest-chunk-streamer.js
src/forest-proxy-assets.js
src/forest-streaming-policy.js
src/forest-terrain-sampler.js
src/forest-water-assets.js
```

Reason for separation: the forest wrapper/core own startup direction, chunk priority, frame budget, cache, queue maintenance, rolling prefetch, hitch attribution and retained-chunk lifecycle. That requires its own future audit and human performance checkpoint.

## Integrated structural result

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

Permanent gate:
- `qa/qa-source-tree-r6-scenery-renderer.mjs`;
- wired into `.github/workflows/qa-dev-integration.yml`.

## QA modernization discovered during move

Historical source-inspection tests still referenced root P9/P933 implementation paths. They were retargeted only where needed:

- `qa/qa-forest-p933-startup-gate.mjs`;
- `qa/qa-p938-forest-retention.mjs`;
- `qa/qa-forest-route-cache-reset.mjs`;
- `qa/qa-diagnostics-c6-1.mjs`;
- `qa/qa-diagnostics-c6-final-inventory.mjs`;
- C6.1 workflow path trigger.

No runtime source was changed by those QA corrections.

## Evidence

Candidate branch: `candidate/r6-scenery-renderer`.

Key commits / states:
- structural move: `c3b062de5219eef82104273f55dd69b80d4fa8d1`;
- P9.33 path QA retarget: `30be18ffcbe02cae8b6201f9cc48f70f31f9cf3b`;
- permanent source-tree gate: `b8866f19f3c8438e208f686377473d97b8a87fe8`;
- first focused run `33589913096` passed scenery boundary, runtime graph, P9.33/P9.35 startup, P9.25, active forest, P9.29, P9.35, P9.36 and P9.37 before stopping on stale P9.38 root path only;
- QA-only retarget commit: `6908f6af7ce756536852fd7553c0540570bffa39`;
- focused candidate run `33590102641` — **PASS**, including startup/forest/frame-pacing gates, full V21.31 stress, driving matrix, production build and code split;
- permanent Dev Integration gate commit: `9c3e01f8b669aba74bbdb48147b0f99b25b074dd`;
- final candidate/integrated runtime state after temporary workflow removal: `98bf8ff386679e62e9c8702edf6b1954d751b47d`;
- `dev` fast-forwarded without force from `8543340f6f52c7547d029c273695ac6db70c4e17` to `98bf8ff386679e62e9c8702edf6b1954d751b47d`;
- exact-head Dev Integration `33590213452` — **PASS, 97/97 functional steps green**.

No scenery/forest behavior defect was found. Candidate failures were stale source-inspection paths only.

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

Performance-sensitive terrain/streaming work stays late in Phase R.

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
- **R6.3a — scenery renderer implementation layers:** **INTEGRATED automation PASS; human checkpoint next.**
- **R6.3b — forest family organization:** BLOCKED on R6.3a human PASS; then read-only audit first. Do not infer that the forest family should move as one unit.
- **R6.4 — water organization:** pending R6.3; audit first.
- **R7 — app/input/ui/routing/services:** pending R6.
- **R8 — terrain/imagery/local-world/streaming:** LAST / performance-sensitive; dedicated audit + mandatory long-route human validation.
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
| Traffic / MP traffic | traffic R1/pool/preload/MP/live gates |
| Multiplayer authored visuals | registry/adapter + M4.14/M4.15 where relevant |
| Forest / streaming | active forest + P9.29/P9.35–P9.42 + route-cache reset + road-sign runtime |
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

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
**Active item:** **R6.2 — road geometry + bridge interactions**  
**State:** **INTEGRATED AUTOMATION PASS — HUMAN CHECKPOINT NEXT**  
**Current validated dev HEAD before this documentation commit:** `101bb197b4e4855466a651341fdb670fc3b17a60`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Latest exact-head full integration before this documentation commit:** Dev Integration run `33588267313` on `101bb197b4e4855466a651341fdb670fc3b17a60` — **PASS**  
**Functional steps:** **96/96 green**  
**Latest human validation:** **R6.1 road-furniture PASS — user: “pass aucun probleme”. R6.2 road/bridge human smoke is pending.**

## Exact next action

**Human checkpoint — R6.2 road geometry + bridge interactions.** Test current `dev` with emphasis on:

- startup + route load;
- ordinary road driving;
- curves with banking/superelevation;
- hills / vertical smoothing;
- at least one **bridge approach → deck → exit**;
- a route refresh or second route if practical;
- watch for road/terrain mismatch, vertical snap, sudden banking jump, bridge-deck mismatch or new hitch/stutter.

If the smoke is **PASS**, record it. **Only then** open R6.3 as a **read-only audit** of scenery/forest renderer boundaries. Do not move scenery/forest files before that audit is independently green.

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
- candidate `candidate/r5b-transmission-state`;
- move `fe891d75ec873248d5924383d64e6b7531c2392c`;
- focused PASS `33581103633` after QA-only path correction;
- integrated runtime `30a67a295c19f8f02987390c23367290040c5260`;
- Dev Integration `33581319020` — **94/94**;
- human PASS recorded.

## R5 closure — driving runtime disposition

**R5 CLOSED.**

Read-only audit of the remaining root runtime family concluded:

- `src/driving-runtime.js` — **KEEP ROOT**, public/runtime orchestration facade;
- `src/driving-runtime-base.js` — **KEEP ROOT / DEFER TO O6**;
- `src/transmission-controller.js` — **KEEP ROOT**, application/controller boundary;
- `src/skidmarks.js` — **KEEP ROOT**, intentional contact/visual/audio/Three.js hybrid;
- transmission-state and wheel-support root facades retained intentionally as above.

Why `driving-runtime-base.js` was not moved in R5:
- mixed physics + runtime orchestration responsibility;
- many direct helper imports from grip/truck/physics QA;
- source-inspection ownership gates depend on it;
- R17 CI contains explicit source greps against its root path;
- the roadmap already reserves this boundary/naming clarification for **O6**.

The following old companion names do **not** exist and must not be recreated merely to satisfy historical assumptions:

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

Preserved:
- P9.30 implementation byte-identical, blob `5bd3a7e86abf551a78b314ee56eaa8bde0fc25ff`;
- P9.37 only required its relative diagnostics import to follow the move;
- sign appearance, sign-face caching, incremental build, idle scheduling/coalescing and minimap readout unchanged;
- `signs.js` and `bridges.js` were deliberately not mixed into this sub-lot.

Permanent gate: `qa/qa-source-tree-r6-road-furniture.mjs`.

Evidence:
- candidate `candidate/r6-road-furniture`;
- focused candidate run `33583213310` on `fe9ac1af391657018d241bb216a29cc7d146af98` — PASS;
- integrated `dev` @ `411d881f66aa5af00e6eb5e6db443312c6f0061b`;
- exact-head Dev Integration `33583321914` — **95/95**;
- human PASS: **“pass aucun probleme”**.

---

# 3. ACTIVE R6.2 — ROAD GEOMETRY + BRIDGE INTERACTIONS

## Audit decision

Audit branch: `audit/r6-road-geometry` from `411d881f66aa5af00e6eb5e6db443312c6f0061b`.

Findings:
- production fan-in for `road-geometry.js` is effectively the `main.js` composition boundary;
- behavioral QA already consumes the public root module;
- source-inspection QA can safely inspect the nested implementation;
- `src/bridges.js` is a clean injected boundary and should **remain at root** during R6.2;
- bridge manager initialization remains before road-geometry composition;
- road geometry still receives `bridgeHeightAtCum` + `bridgeManager` through dependency injection.

## Integrated structural result

```text
src/road-geometry.js
  -> one-line stable public facade
src/road/road-geometry.js
  -> exact former implementation
src/bridges.js
  -> intentionally remains root
```

Root facade:

```js
export * from './road/road-geometry.js';
```

The nested implementation uses the exact original implementation blob:
`5c4f928cead5423e6591766c81528f5eaa7055a2`.

Therefore **no road geometry formula, constant or behavior was rewritten by the move**.

Frozen bridge interactions include:
- bridge deck height override through `bridgeHeightAtCum(raw[i].cum)`;
- bridge approach preservation through `bridgeManager.isNearApproach(raw[i].cum,18)`;
- startup/composition order in `main.js`;
- bridge manager stable root boundary.

No intentional changes were made to:
- road width/profile/contact math;
- smoothing;
- grades;
- banking/superelevation;
- terrain authority;
- snapping/step limits;
- bridge deck/approach behavior;
- driving physics.

## QA / evidence

Candidate branch: `candidate/r6-road-geometry`.

Key commits:
- path-only implementation move: `b91ae4be248a027460798e2622846987fbadaaab`;
- QA/path retargets only after move;
- QA false-positive correction: `c62b7053d0ff1392143b55645b25a939ef054ae8`;
- permanent Dev Integration gate: `23ac61939a1eaed99a5e08e34ed73a7d806ea78a`;
- final candidate / integrated state after temporary workflow removal: `101bb197b4e4855466a651341fdb670fc3b17a60`.

Permanent gate:
- `qa/qa-source-tree-r6-road-geometry.mjs`;
- wired into `.github/workflows/qa-dev-integration.yml`.

Candidate evidence:
- first run `33588019072` failed only because C3 detected the new gate's intentional literal check for absent `road-geometry-base.js`; runtime graph and R6 boundary were already green;
- no runtime/road behavior defect was found;
- QA-only correction followed;
- focused candidate run `33588152294` — **PASS**, covering R6 boundary, runtime graph, C3, historical V21.25 road geometry/init order, V21.31 smoothing/banking/superelevation, terrain/imagery boundaries, full stress, driving matrix, crest/landing, build and code split.

Integrated evidence:
- `dev` fast-forwarded without force from `411d881f66aa5af00e6eb5e6db443312c6f0061b` to `101bb197b4e4855466a651341fdb670fc3b17a60`;
- exact-head Dev Integration run `33588267313` — **PASS, 96/96 functional steps green**;
- C3 dedicated workflow `33588267337` — PASS;
- `main` remains untouched at `111df5d84bf7fd700590abbd9c129b303ac92fad`.

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
- road profile identity and interpolation;
- road-contact surface math;
- V21.31 smoothing;
- banking/superelevation limits;
- terrain authority;
- bridge deck height interpolation;
- bridge approach smoothing;
- route reset / active profile ownership.

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
- **R5b — runtime/transmission/wheel support/skidmarks:** **CLOSED**; wheel-ground + transmission-state moved behind root facades; remaining root runtime boundaries intentionally retained/deferred.
- **R6.1 — road furniture/signs implementation layers:** DONE automation + human PASS.
- **R6.2 — road geometry + bridge interactions:** **INTEGRATED automation PASS; human checkpoint next.**
- **R6.3 — scenery/forest renderer organization:** PENDING R6.2 human PASS; begin with read-only audit only.
- **R6.4 — water organization:** pending R6.3, audit first.
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
| Traffic / MP traffic | traffic R1/pool/preload/MP/live gates |
| Multiplayer authored visuals | registry/adapter + M4.14/M4.15 where relevant |
| Forest / streaming | active forest + P9.29/P9.35–P9.42 + road-sign runtime |
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

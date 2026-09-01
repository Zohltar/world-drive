# World Drive — Evolution & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable fallback: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

This document supersedes the archived A/B/C cleanup plans and the original Plan D. Historical material belongs under `docs/archive/`.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding/architecture/QA conversation:

1. Read this file from the **current `dev` branch**.
2. Read live HEADs of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If a checkpoint names an audit/candidate branch, inspect that branch + latest workflow.
6. Resume the exact **Next action** unless the user changes priority.
7. If chat memory disagrees with GitHub, **GitHub + this file win**.
8. Never mark an item DONE without recording commit/run evidence and required human validation.
9. Before ending meaningful work, update this checkpoint with branch/SHA, validation state, discoveries, prohibitions and exact next action.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization  
**Active item:** R4/R4.5 — combined human validation checkpoint before R5 physics/runtime  
**State:** **AUTOMATION DONE — HUMAN VALIDATION REQUIRED BEFORE R5**  
**Current validated dev HEAD before this documentation commit:** `340b1212bf5eb53b44cedd34df37fa22f0f84824`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Last green full integration:** Dev Integration run `33465706009` on `340b1212bf5eb53b44cedd34df37fa22f0f84824` — **PASS (90/90 functional steps)**  
**Human validation:** R2 multiplayer smoke — PASS. R3 traffic smoke — PASS. R4 vehicles — **PENDING**. R4.5 audio — **PENDING**.

## R4 automation completion

R4 vehicle/presentation/model folder migration is **AUTOMATION DONE — HUMAN PASS PENDING**.

Seventeen implementation files now live under responsibility folders:
- common vehicle modules under `src/vehicles/`;
- authored model controllers under `src/vehicles/models/`;
- truck/trailer under `src/vehicles/truck/`.

Moved common modules:
- `vehicle-system.js`;
- `vehicle-visuals.js`;
- `vehicle-presentation.js`;
- `vehicle-presentation-v21.29.js`;
- `vehicle-authored-registry.js`;
- `vehicle-render-contract.js`;
- `vehicle-glb-entries.js`;
- `deferred-glb-system.js`;
- `vehicle-placement-controller.js`.

Moved authored controllers:
- `civic-glb.js`;
- `countach-glb.js`;
- `f1-glb.js`;
- `i3-glb.js`;
- `id4-glb.js`;
- `sonata-glb.js`;
- `wrx-glb.js`.

Moved truck module:
- `truck-trailer.js`.

Preserved contracts include:
- all authored registry `modulePath` + dynamic-import pairs;
- lazy GLB loading and production code splitting;
- `import.meta.url` asset depth for authored models/truck;
- multiplayer adapter/registry/render-contract boundaries;
- vehicle lighting/material/controller behavior;
- truck/trailer behavior;
- placement stable-start logic;
- suspension, anti-roll, airborne and landing presentation behavior.

Historical QA debt discovered and modernized without runtime behavior changes:
- V21.23 truck QA updated to the accepted V21.23.2+ hairpin steering calibration;
- `longitudinalScales()` ownership updated to current `driving-runtime-base.js` responsibility;
- V21.26 placement QA updated to current `targetCum` / `px,pz` contract;
- V21.26 wheel-ground QA updated to accepted R14 core/outer blend support;
- V21.26 Overpass QA updated from the retired Private.coffee fallback to the current `overpass-api.de`, Kumi and NCHC mirror set;
- R2/C6/code-split path assertions retargeted to the new vehicle folders.

Evidence:
- focused R4 candidate run `33464463621` — PASS;
- integrated vehicle-state `dev` @ `b718675b8d88a810c168216bf57be97546e35719`;
- Dev Integration `33465049654` — PASS, 89/89.

No physics constants/equations, lighting tuning, GLB scaling, materials or multiplayer protocol semantics were intentionally changed.

## R4.5 audio completion

R4.5 is **AUTOMATION DONE — HUMAN PASS PENDING**. The user explicitly approved this small low-risk structural lot before R5 physics.

Moved as exact content-preserving renames:
- `src/audio.js` -> `src/audio/audio.js`;
- `src/audio-base.js` -> `src/audio/audio-base.js`.

Preserved contracts:
- `main.js` is the sole public production importer;
- `audio.js` and `audio-base.js` remain sibling modules;
- no dynamic imports were introduced;
- application-relative MP3 URLs remain byte-for-byte `./assets/audio/...` after the module move;
- tire-squeal / brake-squeal linkage and curves remain unchanged.

Permanent gate: `qa-source-tree-audio.mjs`, now included in Dev Integration.

Evidence:
- read-only audio audit run `33465393725` — PASS;
- first atomic migration run `33465459572` validated the move but its final push lost a clean ref race to the trigger commit; no code defect;
- successful atomic migration run `33465478566`;
- focused final candidate run `33465652119` — PASS;
- integrated `dev` @ `340b1212bf5eb53b44cedd34df37fa22f0f84824`;
- Dev Integration `33465706009` — **PASS, 90/90**.

GitHub recognized both audio modules as 100% renames with zero content changes.

## Exact next action

Perform one **combined 5–10 minute human smoke** for R4 vehicles + R4.5 audio on current `dev`.

Do not start R5 physics/runtime until the user reports PASS.

Human spot-check should cover:
- normal startup / route load;
- several authored vehicles load and scale/placement correctly;
- WRX/Civic-or-ID.4/F1 and truck/trailer if practical;
- brake/reverse/night/indicator lighting on a few vehicles;
- truck camera/steering/trailer still feel normal;
- audio enable/disable and general engine/EV/F1 sound;
- tire squeal during a hard turn/skid and brake squeal if easy to trigger;
- no missing-audio errors, new stutter or FPS degradation.

After human PASS: mark R4 + R4.5 DONE, then create a narrow **read-only R5 physics/runtime audit**. No R5 runtime file move or physics tuning before that audit.

---

# 2. Stable baseline / release rule

`main` is rollback/reference. New work happens on `dev` or narrow `audit/...` / `cleanup/...` branches.

Never advance `main` unless:
- actual integrated `dev` HEAD is green;
- required human gameplay validation is complete;
- the user explicitly approves promotion.

---

# 3. Operating principles

1. **One intent per commit.** Path move, rename, QA modernization, bug fix, behavior evolution and docs are separate intents.
2. **Phase R must not tune behavior.** Preserve physics, visuals, terrain, imagery, frame pacing, traffic and multiplayer behavior.
3. **Move first, rename later.** Historical names are Phase O.
4. **Audit before editing.** Every R/O item starts read-only.
5. **Tests protect behavior, not obsolete locations.** Retarget stale path assertions instead of restoring old architecture.
6. **Candidate before dev.** Material structural work goes through a narrow candidate + focused QA.
7. **Full Dev Integration on the actual final `dev` HEAD.** Candidate green alone is not completion.
8. **Periodic human checkpoints.** Use them after meaningful structural clusters and whenever behavior/visual/performance risk rises.
9. **No silent debt discoveries.** New material debt gets recorded here before moving on.

---

# 4. Target source-tree direction

```text
src/
  main.js
  app/
  input/
  ui/
  routing/
  services/
  audio/
  traffic/
  multiplayer/
  vehicles/
    models/
    truck/
  physics/
  world/
    road/
    terrain/
    imagery/
    scenery/
    forest/
    water/
    streaming/
  styles/
```

Public bootstrap/compatibility facades may remain at root when they provide a useful stable boundary. R9 will eventually enforce an explicit root allowlist.

---

# 5. PHASE R — Source tree organization

## R1 — Exact path/import/QA inventory [P0]

**DONE — 2026-08-31**

Permanent `qa/DEV_INTEGRATION_AUDIT.mjs` records source reachability, unresolved relative imports, root/nested layout, dynamic imports, ownership buckets, QA/CI path contracts and size/fan-in/fan-out.

Baseline: 116/116 runtime reachable, zero browser-graph orphans, zero unresolved reachable imports.  
Key run: `33444437121` — PASS.

## R2 — Multiplayer folder migration [P1]

**DONE — automation + human PASS**

Root public lazy facades retained:
- `src/multiplayer.js`;
- `src/multiplayer-visuals.js`.

Seven internal implementations live under `src/multiplayer/`. Lazy loading/code splitting preserved. Permanent gate: `qa-source-tree-r2-multiplayer.mjs`.

Evidence includes candidate run `33455749888`, Dev Integration `33455977023`, and human smoke PASS (“tout est beau”).

## R3 — Civil traffic folder migration [P1]

**DONE — automation + human PASS**

The full traffic implementation family lives under `src/traffic/`:
- `civil-traffic.js`;
- `civil-traffic-local.js`;
- `civil-traffic-network-bridge.js`;
- `civil-traffic-pool.js`;
- `civil-traffic-preload.js`.

Permanent gate: `qa-source-tree-r3-traffic.mjs`.

Evidence includes audit runs `33459624185`, `33459656074`, candidate runs `33460198735`, `33460300489`, Dev Integration `33460497791`, and human traffic smoke PASS.

## R4 — Vehicle/presentation/model folder migration [P1/P2]

**AUTOMATION DONE — HUMAN PASS PENDING**

Seventeen implementation files now live under `src/vehicles/`, `src/vehicles/models/`, and `src/vehicles/truck/` as recorded in CURRENT CHECKPOINT.

The move preserved lazy authored GLB loading, multiplayer authored-controller parity, lights/material bindings, placement, truck/trailer and presentation behavior. Historical production names such as `vehicle-presentation-v21.29.js` remain intentionally unchanged until Phase O.

Human checkpoint: quick vehicle/lighting/truck spot-check, combined with R4.5 audio below.

## R4.5 — Audio folder migration [P2]

**AUTOMATION DONE — HUMAN PASS PENDING**

`audio.js` and `audio-base.js` now live under `src/audio/` as exact content-preserving renames. MP3 URL literals remain application-relative `./assets/audio/...` and therefore were deliberately not depth-adjusted.

Permanent gate: `qa-source-tree-audio.mjs`.

Human checkpoint is combined with R4 to avoid unnecessary test interruptions.

## R5 — Physics/runtime folder consolidation [P2]

**BLOCKED ONLY BY R4/R4.5 HUMAN SPOT-CHECK**

After human PASS, begin with a **read-only exact-path/import/QA/CI audit** before any move.

Candidate family to classify:
- `vehicle-dynamics*`;
- `driving-runtime*`;
- `transmission-*`;
- `wheel-ground-support.js`;
- `skidmarks.js`.

Any path-only candidate must make **zero equation/constant changes** and preserve all accepted R2–R23 driving behavior.

Requires R-tests, 288-case matrix, stress, build and full integration. Human driving validation is required if any behavior changes; a pure path move may use the next periodic human checkpoint if all automated gates are green.

## R6 — Road/scenery/forest/water migration [P2]

**PENDING R5**

Sub-lots:
- R6a road/signs/bridges;
- R6b scenery renderer/data;
- R6c forest;
- R6d water.

Preserve road-sign scheduling and forest frame pacing exactly.

## R7 — App/input/ui/routing/services migration [P2]

**PENDING R6**

Preserve CSS paths, settings identity/persistence, startup order, controls and desktop Overpass behavior.

## R8 — Terrain/imagery/local-world/streaming migration [P3 — LAST]

**DEFERRED UNTIL R2–R7 STABLE**

Performance-sensitive families:
- `terrain*`;
- `imagery*`;
- `local-world-builder*`;
- `streaming-coordinator*`;
- `world-streaming.js`.

Requires dedicated audit and **mandatory long-route human validation** with imagery ON/OFF, cache reuse, repeated world refreshes and FPS/hitch observation.

## R9 — Permanent root-cleanliness gate [P2]

**PENDING R8**

Add an explicit allowlist for files permitted directly under `src/`.

---

# 6. PHASE O — Responsibility naming / historical layer cleanup

Begin only after relevant Phase R folders are stable.

- **O1 Multiplayer:** replace misleading `m3`/`v18` production names with responsibility names.
- **O2 Road furniture:** replace `p930`/`p937` names while preserving construction vs scheduling layers.
- **O3 Vehicle presentation:** remove `vehicle-presentation-v21.29.js` historical name while preserving suspension/airborne/landing/anti-roll behavior.
- **O4 Scenery renderer:** replace `p9`/`p933` names while preserving startup readiness and forest rendering.
- **O5 Audio:** rename/flatten `audio-base.js` only if ownership audit proves useful.
- **O6 Driving runtime:** clarify `driving-runtime-base.js` vs public runtime without behavior change.
- **O7 Terrain/imagery/local-world/streaming:** only after R8 + performance baselines.

---

# 7. PHASE C — Corrections / maintenance

## C-M1 — Dependency/security audit [P1/P2]

**NOT STARTED**

Known discovery: `npm ci` reports 25 vulnerabilities (3 low, 21 high, 1 critical).

Rules:
- inspect exact dependency tree;
- distinguish shipped/runtime risk from dev/build-only transitive debt;
- no blind `npm audit fix --force`;
- validate Electron/Forge/Vite/package changes separately.

## C-M2 — GitHub Actions runtime hygiene [P2/P3]

**NOT STARTED**

Actions warn about Node 20 action-runtime deprecation/forced Node 24. Audit action versions separately; do not mix with Phase R moves.

---

# 8. PHASE E — Feature evolution

Feature work is allowed after stable structural checkpoints. Every feature needs explicit goal, narrow branch, dedicated QA where feasible, full integration for core changes and human validation for user-visible behavior.

---

# 9. Validation matrix

| Change | Minimum automated validation | Human |
|---|---|---|
| docs/audit only | relevant audit/build | no |
| multiplayer path-only | MP + M4.14/M4.15 + code split + full integration | periodic smoke |
| traffic path-only | traffic + shared/live MP + full integration | periodic smoke |
| vehicle path-only | presentation/lights/truck/MP adapter + full integration | quick spot-check |
| audio path-only | audio boundary + skid audio + build + full integration | combine with nearby checkpoint |
| physics/runtime | R-tests + 288 matrix + stress + full integration | required if behavior changes |
| road/forest | subsystem + frame pacing + full integration | if visible/perf risk |
| terrain/imagery/streaming | complete subsystem + stress/build/full integration | **long-route mandatory** |
| dependency/toolchain | package/build + affected QA + full integration | desktop/package smoke when relevant |

---

# 10. Branch conventions

- read-only investigation: `audit/<scope>`
- structural candidate: `cleanup/<scope>`
- bug correction: `fix/<scope>`
- feature: `feature/<scope>`

---

# 11. Interrupted-work checkpoint requirements

If an item is interrupted, CURRENT CHECKPOINT must include:
- active branch + exact SHA;
- last green run;
- last failed run + exact reason;
- source files already modified;
- QA/CI files already modified;
- invariants that must not change;
- exact next action.

---

# 12. Roadmap summary

**R1 DONE → R2 DONE + human PASS → R3 DONE + human PASS → R4 vehicles automation DONE / human pending → R4.5 audio automation DONE / human pending → R5 physics/runtime after combined human PASS → R6 road/scenery/forest/water → R7 app/UI/services → R8 terrain/imagery/streaming → R9 root gate → Phase O historical naming → maintenance/features as prioritized.**

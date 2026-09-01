# World Drive — Evolution & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable fallback: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

This document supersedes archived cleanup/evolution plans for active work. Historical detail belongs under `docs/archive/`.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding/architecture/QA conversation:

1. Read this file from the **current `dev` branch**.
2. Read live HEADs of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If a checkpoint names an audit/candidate branch, inspect that branch and its latest workflow.
6. Resume the exact **Next action** unless the user changes priority.
7. If chat memory disagrees with GitHub, **GitHub + this file win**.
8. Never mark structural work DONE without commit/run evidence and required human validation.
9. Work in small certified blocks and stop for periodic human checkpoints.
10. Before ending meaningful work, update this checkpoint with branch/SHA, validation state, discoveries, prohibitions and exact next action.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization  
**Active item:** **R5b — physics/runtime follow-up audit**  
**State:** **READ-ONLY AUDIT NEXT — NO R5b RUNTIME MOVE STARTED**  
**Current validated dev HEAD before this documentation commit:** `24ecfa99e69ae350d3978d23c554b01b04d89228`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Latest exact-head full integration:** Dev Integration run `33562578540` on `24ecfa99e69ae350d3978d23c554b01b04d89228` — **PASS**  
**Functional steps:** **92/92 green**  
**Latest human validation:** **PASS** — user: “tout est beau, pass!” after the QA-root-layout integration.

## What is now closed

### R2 — Multiplayer folder migration

**DONE — automation + human PASS.**

- Public root lazy facades intentionally retained:
  - `src/multiplayer.js`
  - `src/multiplayer-visuals.js`
- Internal multiplayer implementation lives under `src/multiplayer/`.
- Permanent gate: `qa/qa-source-tree-r2-multiplayer.mjs`.
- Evidence includes candidate run `33455749888`, Dev Integration `33455977023`, human smoke PASS.

### R3 — Civil traffic folder migration

**DONE — automation + human PASS.**

Implementation lives under `src/traffic/`:

```text
src/traffic/
  civil-traffic.js
  civil-traffic-local.js
  civil-traffic-network-bridge.js
  civil-traffic-pool.js
  civil-traffic-preload.js
```

Permanent gate: `qa/qa-source-tree-r3-traffic.mjs`.

Evidence includes audit runs `33459624185`, `33459656074`, candidate runs `33460198735`, `33460300489`, Dev Integration `33460497791`, human traffic smoke PASS.

### R4 — Vehicle/presentation/model folder migration

**DONE — automation + human PASS.**

Seventeen implementation files now live under responsibility folders:

```text
src/vehicles/
  vehicle-system.js
  vehicle-visuals.js
  vehicle-presentation.js
  vehicle-presentation-v21.29.js
  vehicle-authored-registry.js
  vehicle-render-contract.js
  vehicle-glb-entries.js
  deferred-glb-system.js
  vehicle-placement-controller.js
  models/
    civic-glb.js
    countach-glb.js
    f1-glb.js
    i3-glb.js
    id4-glb.js
    sonata-glb.js
    wrx-glb.js
  truck/
    truck-trailer.js
```

Preserved contracts:
- authored registry `modulePath` + dynamic-import pairs;
- lazy GLB loading and production code splitting;
- `import.meta.url` asset resolution;
- multiplayer adapter/registry/render-contract boundaries;
- model scale/orientation/wheels and lighting/material/controller behavior;
- truck/trailer behavior;
- placement stable-start logic;
- suspension, anti-roll, airborne and landing presentation behavior.

Historical QA assumptions were modernized only where architecture had already evolved; no intentional physics/lighting/model tuning was mixed into the move.

Key evidence:
- focused candidate run `33464463621` — PASS;
- integrated vehicle-state `dev` @ `b718675b8d88a810c168216bf57be97546e35719`;
- Dev Integration `33465049654` — PASS;
- human vehicle smoke — PASS.

### R4.5 — Audio folder migration

**DONE — automation + human PASS.**

Exact content-preserving moves:

```text
src/audio.js      -> src/audio/audio.js
src/audio-base.js -> src/audio/audio-base.js
```

Preserved contracts:
- `main.js` remains the public production importer;
- sibling relationship between both audio modules;
- no new dynamic imports;
- application-relative MP3 URLs remain `./assets/audio/...`;
- tire-squeal/brake-squeal curves and linkage unchanged.

Permanent gate: `qa/qa-source-tree-audio.mjs`.

Evidence:
- audit `33465393725` — PASS;
- successful atomic migration `33465478566`;
- focused candidate `33465652119` — PASS;
- integrated `dev` @ `340b1212bf5eb53b44cedd34df37fa22f0f84824`;
- Dev Integration `33465706009` — PASS;
- exact documentation-head integration `33465873634` — PASS;
- human smoke — PASS.

### R5a — Core vehicle-dynamics move

**DONE — automation. Current integrated dev also passed the latest human smoke.**

Moved into `src/physics/`:

```text
src/physics/vehicle-dynamics.js
src/physics/vehicle-dynamics-core.js
src/physics/vehicle-dynamics-traction-steering.js
```

Permanent gate:
- `qa/qa-source-tree-r5a-vehicle-dynamics.mjs`

Evidence:
- path-only move commit: `3b0f878996996406ba754331743923a66b1cb6b1`;
- final R5a housekeeping state before the next cleanup: `28e643ef3c4979390aa1d9caaa5101b0d1b497ad`;
- current full Dev Integration `33562578540` re-certifies R5a together with the current tree.

No physics equation/constant tuning was intentionally part of R5a.

### QA root-layout cleanup

**DONE — automation + human PASS.**

Purpose: remove legacy root-level `qa-*.mjs` clutter and make `qa/` the canonical QA location.

Completed work:
- legacy root QA modules moved into `qa/`;
- workflow/docs path contracts retargeted;
- moved QA files had their filesystem-root assumptions corrected where required;
- forest/streaming QA path-context false failures corrected without changing runtime behavior;
- temporary diagnostic/candidate workflows removed before integration;
- permanent boundary added: `qa/QA_ROOT_LAYOUT_QA.mjs`;
- `.github/workflows/qa-dev-integration.yml` permanently calls canonical `qa/...` paths;
- **no `src/` runtime file changed in this cleanup**.

Evidence:
- final candidate certification included layout/source graph, ownership/diagnostics, driving/traffic, forest/streaming, `qa:stress`, 288-case driving matrix, build and code-split — PASS;
- candidate cleanup HEAD before integration: `24ecfa99e69ae350d3978d23c554b01b04d89228`;
- `dev` fast-forwarded cleanly from `28e643ef3c4979390aa1d9caaa5101b0d1b497ad` to `24ecfa99e69ae350d3978d23c554b01b04d89228`, no force/divergence;
- exact-head Dev Integration run `33562578540` — PASS, **92/92 functional steps green**;
- human smoke: **PASS — “tout est beau, pass!”**.

## R5b — next read-only audit

R5b must begin with an **exact-path/import/QA/CI inventory only**. No file move, equation edit, constant change or behavior tuning until the audit is green and the candidate boundary is frozen.

### Exact root candidate family to audit

```text
src/driving-runtime.js
src/driving-runtime-base.js
src/transmission-controller.js
src/transmission-network-state.js
src/transmission-runtime-bridge.js
src/wheel-ground-support.js
src/skidmarks.js
```

### Already consolidated by R5a — dependency boundaries, not R5b relocation targets

```text
src/physics/vehicle-dynamics.js
src/physics/vehicle-dynamics-core.js
src/physics/vehicle-dynamics-traction-steering.js
```

### Existing nested physics modules — dependency boundaries

At minimum audit interactions with:
- `src/physics/airborne-dynamics.js`;
- `src/physics/driveline-relative-dynamics.js`;
- `src/physics/maneuver-state.js`;
- `src/physics/momentum-direction.js`;
- `src/physics/wheelspin-state.js`;
- `src/physics/yaw-authority.js`;
- steering/tire/surface/per-wheel/fixed-step modules already under `src/physics/`.

### Audit-only companion modules

Map ownership and imports before deciding whether they belong in a later sub-lot:

```text
src/braking.js
src/abs-system.js
src/wheel-friction.js
src/truck-physics-adapter.js
```

### Boundaries R5b must freeze

- `src/main.js` imports and runtime startup order;
- `src/multiplayer/` local-authority vs remote-visual behavior;
- `src/vehicles/` presentation/model/controller boundaries;
- truck/trailer + truck physics adapter boundaries;
- transmission network-state and local gear semantics;
- `Number(null)`/diagnostic ownership semantics already protected by C6 gates;
- wheel-ground R14 terrain→road re-entry support;
- skidmark/contact alignment;
- braking/ABS/handbrake/J-turn behavior;
- FWD power-understeer counter-yaw;
- EV handbrake/J-turn momentum and rotation;
- F1 front-slip/steering behavior;
- crest launch and oblique landing;
- every direct QA/CI path assumption;
- build/code-split boundaries;
- whether any public/root facade should intentionally remain at root.

### R5b prohibitions

Do **not** mix into R5b:
- tire/friction/load-transfer/yaw/steering/brake tuning;
- transmission shift/clutch/gear semantic changes;
- handbrake/J-turn/drift behavior changes;
- wheel support/re-entry tuning;
- skidmark visual tuning;
- historical-name cleanup;
- dependency/security fixes;
- GitHub Actions runtime maintenance.

### Exact next action

Create a narrow **read-only R5b audit branch** from the current `dev`, inventory the seven exact root candidates plus companion boundaries, map all production imports and QA/CI hard-coded paths, and run a focused audit. **Do not create a move candidate until the audit is green.**

---

# 2. Stable baseline / release rule

`main` is rollback/reference. New work happens on `dev` or narrow `audit/...` / `cleanup/...` branches.

Never advance `main` unless:
- actual integrated `dev` HEAD is green;
- required human gameplay validation is complete;
- the user explicitly approves promotion.

---

# 3. Operating principles

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

---

# 4. Protected behavior contracts

Structural cleanup must preserve the following unless the user explicitly opens behavior work.

## Driving / physics

- per-wheel tire force and countersteer coupling;
- ABS and locked-tire force direction;
- service braking, reverse and J-turn behavior;
- grade gravity and load transfer;
- trajectory stability/snapback protection;
- tire peak/drift behavior;
- progressive high-speed steering;
- terrain→road support re-entry;
- skidmark/contact alignment;
- FWD power-understeer counter-yaw;
- EV momentum/handbrake/J-turn behavior;
- rear locked-tire lateral force;
- F1 front-slip/yaw/steering authority;
- crest launch and oblique landing stability.

## Vehicles / visuals

Protect authored Countach, ID.4, WRX, Civic, Sonata, i3, F1 and truck/trailer behavior, including:
- scale/orientation/wheels;
- brake/reverse/night/indicator lights;
- authored multiplayer controller parity;
- model/material bindings;
- truck camera and trailer articulation;
- stable route placement/reset.

## Terrain / streaming / performance

Protect:
- robust extreme road mesh;
- mountain crests and road banking limits;
- imagery/procedural transitions;
- cache reuse and preload behavior;
- forest frame pacing and queue maintenance;
- near/medium/far terrain continuity;
- photo ON/OFF quality;
- low-hitch long-route behavior.

Performance-sensitive terrain/streaming work stays late in Phase R.

---

# 5. Target source-tree direction

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

Public bootstrap/compatibility facades may intentionally remain at root when they provide a useful stable boundary. A later root-cleanliness gate will enforce the final allowlist.

---

# 6. PHASE R — Source tree organization roadmap

- **R1 — runtime path/import/QA inventory:** DONE.
  - permanent `qa/DEV_INTEGRATION_AUDIT.mjs`;
  - baseline 116/116 runtime reachable, zero unresolved/orphans;
  - key run `33444437121` PASS.
- **R2 — multiplayer:** DONE automation + human PASS.
- **R3 — traffic:** DONE automation + human PASS.
- **R4 — vehicles/presentation/models/truck:** DONE automation + human PASS.
- **R4.5 — audio:** DONE automation + human PASS.
- **R5a — core vehicle dynamics into `src/physics/`:** DONE automation; current integrated dev human smoke PASS.
- **QA root-layout cleanup:** DONE automation + human PASS.
- **R5b — runtime/transmission/wheel support/skidmarks:** NEXT, read-only audit first.
- **R6 — road/scenery/forest/water:** PENDING R5.
  - split into narrow sub-lots; preserve road-sign scheduling and forest frame pacing.
- **R7 — app/input/ui/routing/services:** PENDING R6.
  - preserve CSS paths, settings identity/persistence, startup order and controls.
- **R8 — terrain/imagery/local-world/streaming:** LAST / performance-sensitive.
  - dedicated audit;
  - mandatory long-route human validation with imagery ON/OFF, cache reuse, repeated refreshes and FPS/hitch observation.
- **R9 — permanent root-cleanliness gate:** after structural migrations stabilize.

---

# 7. PHASE O — Responsibility naming / historical cleanup

Only after relevant Phase R folders are stable.

- **O1 Multiplayer:** replace historical `m3`/`v18` production names with responsibility names.
- **O2 Road furniture:** replace `p930`/`p937` historical names while preserving construction/scheduling layers.
- **O3 Vehicle presentation:** replace `vehicle-presentation-v21.29.js` only after presentation ownership is stable.
- **O4 Scenery renderer:** replace `p9`/`p933` names without disturbing startup/forest behavior.
- **O5 Audio:** reconsider `audio-base.js` naming only if ownership audit proves useful.
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

For structural work, use the smallest focused gate that proves the candidate plus the permanent full gate on final `dev`.

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant source-tree boundary |
| QA layout | `qa/QA_ROOT_LAYOUT_QA.mjs` |
| Driving physics | `npm run qa:stress` + `qa/DEV_DRIVING_SIM_QA.mjs` + relevant grip gates |
| Braking / J-turn / handbrake | R8/R9/R17–R20 grip gates |
| High-speed / FWD / F1 | R11–R13, R16, R21–R23 gates |
| Wheel support / airborne | R14 + crest-launch + oblique-landing gates |
| Traffic / MP traffic | R1/pool/preload/MP1/live traffic gates |
| Multiplayer authored visuals | registry/adapter + M4.14/M4.15 where relevant |
| Vehicle lighting/models | Sonata/WRX and authored vehicle model/lighting gates where relevant |
| Forest / streaming | active forest + P9.29/P9.35–P9.42 + road-sign runtime |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | `.github/workflows/qa-dev-integration.yml` on exact final `dev` HEAD |

A green candidate is not enough. The **actual final `dev` HEAD** must pass Dev Integration.

---

# 10. Human checkpoint policy

Automation cannot replace user-visible validation.

Use human checks periodically rather than after every trivial commit. Mandatory/high-value checkpoints include:
- after visible vehicle/model/presentation moves;
- after meaningful physics/runtime structural clusters;
- after multiplayer boundary changes;
- after terrain/imagery/streaming changes;
- before promotion to `main`.

Typical driving smoke:
- startup + route load;
- several vehicles;
- braking in a curve;
- high-speed steering;
- handbrake/J-turn if relevant;
- crest launch/landing if relevant;
- route reset/placement;
- quick night/reverse/brake light check when vehicle paths changed;
- multiplayer visual check when MP paths changed;
- FPS/hitch observation for performance-sensitive work.

Do not start the next high-risk structural phase until the planned human checkpoint passes.

---

# 11. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires all three:
1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval to promote.

Until then, **do not move `main`**.

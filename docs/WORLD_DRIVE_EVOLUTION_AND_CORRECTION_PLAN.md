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
**Active item:** R3 — civil traffic folder migration  
**State:** **AUTOMATION DONE — HUMAN TRAFFIC SMOKE REQUIRED BEFORE R4**  
**Integrated R3 runtime/dev HEAD before this documentation commit:** `5467089b2aa10340b70fbefdb2a6a9ed0df3117a`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Last green full integration:** Dev Integration run `33460390294` on `5467089b2aa10340b70fbefdb2a6a9ed0df3117a` — **PASS (89/89 functional steps)**  
**Human validation:** R2 multiplayer smoke — PASS. R3 traffic smoke — **PENDING**.

## R3 automation completion

The full traffic implementation family now lives under `src/traffic/`:
- `civil-traffic.js`
- `civil-traffic-local.js`
- `civil-traffic-network-bridge.js`
- `civil-traffic-pool.js`
- `civil-traffic-preload.js`

No `civil-traffic*.js` implementation remains directly under `src/`.

External boundaries:
- `src/driving-runtime.js` imports `./traffic/civil-traffic.js`;
- `src/multiplayer.js` imports `./traffic/civil-traffic-network-bridge.js`.

Move-sensitive contracts preserved:
- pool -> preload remains a lazy sibling `import('./civil-traffic-preload.js')`;
- Sonata `import.meta.url` paths correctly moved one directory deeper to `../assets/2006_hyundai_sonata.glb`;
- generic passenger-pack URLs remain application-relative `./assets/traffic/...`;
- `fetch(url,{cache:'force-cache'})` preserved;
- preload remains sequential Sonata -> generic pack;
- R7 local engine behavior preserved;
- max active agents remains 2;
- right-hand lane logic/cooldowns unchanged;
- Traffic MP1 authority/follower, sanitization and live relay behavior unchanged;
- canonical diagnostics remain `traffic.network`, `traffic.preload`, `traffic.runtime`, `traffic.pool`;
- compatibility `WorldDriveTraffic` / `WorldDriveTrafficPool` retained;
- functional `WorldDriveTrafficSpawn` retained.

Permanent gate:
- `qa-source-tree-r3-traffic.mjs`;
- registered in `.github/workflows/qa-dev-integration.yml` immediately after the R2 boundary gate.

Evidence:
- R3 audit branch: `audit/source-tree-r3-traffic`;
- audit runs `33459624185` and `33459656074` — PASS;
- candidate branch: `cleanup/source-tree-r3-traffic`;
- final candidate gate run `33460300489` — PASS;
- candidate traffic behavior/build gate run `33460198735` — PASS;
- integrated `dev` commit `5467089b2aa10340b70fbefdb2a6a9ed0df3117a`;
- final Dev Integration `33460390294` — PASS, including R2/R3 boundaries, A–C6, full stress, 288-case driving matrix, traffic local/pool/preload/shared/live, terrain, forest/frame pacing, M4.14/M4.15, route smoke, production build and code split.

**Human test requested now:** short normal-game traffic smoke. Verify startup, several minutes of driving, civil traffic presence/variety, lane/respawn behavior, no new stutter/FPS issue, and shared multiplayer traffic if convenient.

**Next action after human PASS:** mark R3 DONE and start **R4 read-only vehicle/presentation/model path audit**. Do not move vehicle files before that audit is green.

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
- `src/multiplayer.js`
- `src/multiplayer-visuals.js`

Seven internal implementations live under `src/multiplayer/`. Lazy loading/code splitting preserved. Permanent gate: `qa-source-tree-r2-multiplayer.mjs`.

Evidence includes candidate run `33455749888`, Dev Integration `33455977023`, and human smoke PASS (“tout est beau”).

## R3 — Civil traffic folder migration [P1]

**AUTOMATION DONE — HUMAN PASS PENDING**

See CURRENT CHECKPOINT above.

## R4 — Vehicle/presentation/model folder migration [P1/P2]

**PENDING R3 HUMAN PASS**

Start with a read-only exact-path/dynamic-import/asset/QA audit.

Candidate families to classify:
- `vehicle-system.js`;
- `vehicle-visuals.js`;
- `vehicle-presentation*.js`;
- `vehicle-authored-registry.js`;
- `vehicle-render-contract.js`;
- `vehicle-glb-entries.js`;
- `deferred-glb-system.js`;
- authored vehicle model controllers (`*-glb.js`);
- `truck-trailer.js`.

Target direction:
- common vehicle modules under `src/vehicles/`;
- authored model controllers under `src/vehicles/models/`;
- truck/trailer under `src/vehicles/truck/`.

Important: `vehicle-authored-registry.js` owns hard-coded `modulePath` strings + dynamic imports. Move these contracts atomically. Do not combine R4 with suspension/anti-roll tuning or historical-name cleanup.

Human checkpoint after R4 will be a vehicle/lighting/truck spot-check because that migration has higher visible risk than R3.

## R5 — Physics/runtime folder consolidation [P2]

**PENDING R4**

Move `vehicle-dynamics*`, `driving-runtime*`, `transmission-*`, `wheel-ground-support.js`, `skidmarks.js` under `src/physics/` with **zero equation/constant changes**.

Requires R-tests, 288-case matrix, stress and full integration.

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

**R1 DONE → R2 DONE (automation + human PASS) → R3 automation DONE / human PASS pending → R4 vehicles → R5 physics/runtime → R6 road/scenery/forest/water → R7 app/UI/services → R8 terrain/imagery/streaming → R9 root gate → Phase O historical naming → maintenance/features as prioritized.**

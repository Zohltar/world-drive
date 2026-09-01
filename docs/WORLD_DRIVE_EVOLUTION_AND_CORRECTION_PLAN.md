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
**Active item:** R4 — vehicle/presentation/model folder migration  
**State:** **READ-ONLY AUDIT ACTIVE — no R4 runtime file moved yet**  
**Current validated dev HEAD before this documentation commit:** `7b0ca71385f89edbe5ab6fba9b883f018ea422e3`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Last green full integration:** Dev Integration run `33460497791` on `7b0ca71385f89edbe5ab6fba9b883f018ea422e3` — **PASS (89/89 functional steps)**  
**Human validation:** R2 multiplayer smoke — PASS. R3 traffic smoke — **PASS, user reported “pass”**.

## R3 completion

R3 is **DONE — automation + human PASS**.

The full traffic implementation family lives under `src/traffic/`:
- `civil-traffic.js`;
- `civil-traffic-local.js`;
- `civil-traffic-network-bridge.js`;
- `civil-traffic-pool.js`;
- `civil-traffic-preload.js`.

Preserved contracts include:
- lazy pool -> preload import;
- corrected Sonata `import.meta.url` asset depth;
- application-relative generic pack URLs;
- sequential preload and force-cache behavior;
- R7 local engine behavior;
- max active agents = 2;
- lane/cooldown behavior;
- Traffic MP1 authority/follower + live relay semantics;
- diagnostics + compatibility globals + `WorldDriveTrafficSpawn`.

Permanent gate: `qa-source-tree-r3-traffic.mjs` in Dev Integration.

Evidence:
- audit runs `33459624185`, `33459656074` — PASS;
- candidate runs `33460198735`, `33460300489` — PASS;
- integrated `dev` runtime commit `5467089b2aa10340b70fbefdb2a6a9ed0df3117a`;
- documented validated HEAD `7b0ca71385f89edbe5ab6fba9b883f018ea422e3`;
- Dev Integration `33460497791` — PASS, 89/89;
- human traffic smoke — PASS.

## R4 next action

Create `audit/source-tree-r4-vehicles` from current `dev` and perform a **read-only exact-path/dynamic-import/asset/QA/CI audit** before moving any vehicle file.

Candidate families to classify, not yet approved for movement:
- `vehicle-system.js`;
- `vehicle-visuals.js`;
- `vehicle-presentation.js`;
- `vehicle-presentation-v21.29.js`;
- `vehicle-authored-registry.js`;
- `vehicle-render-contract.js`;
- `vehicle-glb-entries.js`;
- `deferred-glb-system.js`;
- `vehicle-placement-controller.js`;
- authored model controllers: `civic-glb.js`, `countach-glb.js`, `f1-glb.js`, `i3-glb.js`, `id4-glb.js`, `sonata-glb.js`, `wrx-glb.js`;
- `truck-trailer.js`.

Audit must freeze:
- all production importers/imported dependencies;
- all dynamic imports and hard-coded `modulePath` strings;
- all `import.meta.url` / asset URL depth contracts;
- exact QA path contracts and CI path triggers;
- multiplayer vehicle adapter/registry/visual boundaries;
- deferred/lazy GLB loading and production code splitting;
- vehicle lighting/material/controller contracts;
- truck/trailer model and physics-facing boundaries;
- presentation suspension/airborne/landing/anti-roll behavior;
- whether `vehicle-placement-controller.js` belongs in R4 or should remain with runtime/physics consolidation.

**Do not do during R4 audit/candidate:**
- no physics equation/constant changes;
- no suspension/anti-roll tuning;
- no lighting/material tuning;
- no GLB/model replacement or rescaling;
- no historical-name cleanup (`v21.29`, etc. stays Phase O);
- no multiplayer protocol changes;
- no dependency/toolchain maintenance mixed into the move.

**Next action:** complete R4 audit and lock a path/behavior boundary. Only then create a narrow path-only candidate under `src/vehicles/`, `src/vehicles/models/`, and `src/vehicles/truck/` if audit evidence is green.

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

See CURRENT CHECKPOINT completion record above.

## R4 — Vehicle/presentation/model folder migration [P1/P2]

**ACTIVE — READ-ONLY AUDIT**

Start with a read-only exact-path/dynamic-import/asset/QA audit. Target direction after a green audit:
- common vehicle modules under `src/vehicles/`;
- authored model controllers under `src/vehicles/models/`;
- truck/trailer under `src/vehicles/truck/`.

Important: `vehicle-authored-registry.js` owns hard-coded `modulePath` strings + dynamic imports. Move those contracts atomically. Do not combine R4 with suspension/anti-roll refactoring or historical-name cleanup.

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

**R1 DONE → R2 DONE → R3 DONE (automation + human PASS) → R4 vehicles ACTIVE / audit → R5 physics/runtime → R6 road/scenery/forest/water → R7 app/UI/services → R8 terrain/imagery/streaming → R9 root gate → Phase O historical naming → maintenance/features as prioritized.**

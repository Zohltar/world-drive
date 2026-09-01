# World Drive — Evolution & Correction Plan

Date created: 2026-08-31  
Repository: `Zohltar/world-drive`  
Canonical work branch: `dev`  
Stable branch: `main`  
Stable baseline: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical execution and restart source of truth**

> This file supersedes the completed A/B/C cleanup plans and the original post-C6 Plan D. Historical documents are under `docs/archive/`.
>
> The goal is no longer cleanup for cleanup’s sake. Keep the validated game behavior stable while improving structure, clarifying ownership, correcting proven defects, and enabling future evolution.

---

# 0. Mandatory restart protocol

At the start of every new World Drive conversation involving code, architecture, QA, GitHub or technical planning:

1. Read this file from the **current `dev` branch** before proposing code changes.
2. Read the live HEAD of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If the checkpoint names an audit/candidate branch, inspect that branch and its latest workflow result.
6. Read the completion/work-log entries for the active phase.
7. Resume the exact **Next action** unless the user explicitly changes priority.
8. If chat memory disagrees with GitHub, **GitHub + this file win**.
9. Never mark an item DONE until commits, QA evidence and any required human validation are recorded here.
10. Before ending a meaningful work session, update this checkpoint with the exact branch/SHA, validation state, discoveries, prohibitions and next action.

A future session must never infer progress from task names alone. It must verify branch + SHA + workflow evidence.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization  
**Active item:** R2 — multiplayer folder migration  
**State:** **AUTOMATION DONE — HUMAN VALIDATION REQUIRED BEFORE R3**  
**Integrated dev commit:** `1eef3825e8ea56b28ac49e8e17e828fbbf1c042d`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Last green full integration:** Dev Integration run `33455822616` on `1eef3825e8ea56b28ac49e8e17e828fbbf1c042d` — **PASS**, including the permanent R2 boundary gate, full stress, 288 driving cases, physics/grip R2–R20, terrain, traffic, forest/frame pacing, M4.14/M4.15 GPU, live route smoke, production build and code split.  
**Human validation:** **PENDING by explicit user request. Do not start R3 until the user reports the smoke test result.**

**R2 result:**
- public compatibility/lazy facades intentionally remain at root:
  - `src/multiplayer.js`
  - `src/multiplayer-visuals.js`
- seven internal implementation modules moved under `src/multiplayer/`:
  - `multiplayer-client-m3.js`
  - `multiplayer-visuals-m3.js`
  - `multiplayer-visuals-v18.js`
  - `multiplayer-fallback-visual.js`
  - `multiplayer-support-math.js`
  - `multiplayer-vehicle-adapter.js`
  - `multiplayer-vehicle-registry.js`
- lazy `import()` boundaries remain lazy and production code splitting is preserved;
- legacy `m3`/`v18` filenames were deliberately retained for Phase O rather than mixed into the path move;
- QA/CI exact-path contracts were retargeted instead of restoring obsolete root locations;
- `qa-source-tree-r2-multiplayer.mjs` is now a permanent Dev Integration boundary gate;
- post-R2 import audit reports all 116 source-code files runtime reachable, zero browser-graph orphans and zero unresolved reachable relative imports.

**R2 automated evidence:**
- read-only audit branch: `audit/source-tree-r2-multiplayer`;
- audit run `33444942008` — PASS;
- candidate branch: `cleanup/source-tree-r2-multiplayer`;
- focused exact-head candidate run `33455749888` — PASS;
- integrated to `dev` by fast-forward at `1eef3825e8ea56b28ac49e8e17e828fbbf1c042d`;
- final Dev Integration run `33455822616` — PASS.

**Next action:** **HUMAN SMOKE TEST ONLY.** Launch the current `dev`, verify normal startup/gameplay and, if practical, a host/join multiplayer session with one remote authored vehicle. Confirm no obvious import/load regression, remote presentation still behaves normally, vehicle switching/local driving is normal, and FPS/stutter feel unchanged. If the human smoke passes, record PASS here and begin R3 with a new read-only traffic path audit. If it fails, stop Phase R and isolate the observed regression before any R3 work.

**Do not do before the human R2 result:**
- do not start R3 traffic migration;
- do not rename `m3`/`v18` historical multiplayer layers;
- do not flatten multiplayer implementation layers;
- do not tune multiplayer, physics, traffic or visuals;
- do not mix C-M1 dependency remediation or C-M2 Actions maintenance into this checkpoint.

---

# 2. Stable baseline / release rule

`main` is the rollback/reference branch. New work happens on `dev` or narrow `audit/...` / `cleanup/...` branches.

Never advance `main` unless:
- the actual integrated `dev` HEAD is green;
- required human gameplay validation is complete;
- the user explicitly approves promotion.

The current stable post-C6 build is V21.31 with `worldDriveChannel: stable`; `dev` uses `worldDriveChannel: dev`.

---

# 3. Operating principles

1. **One intent per commit.** Path move, ownership rename, QA modernization, bug correction, behavior evolution and documentation are separate intents.
2. **Structural work must not tune behavior.** Preserve accepted physics, visuals, terrain, imagery, frame pacing, traffic and multiplayer behavior.
3. **Move first, rename historical layers later.** Phase R organizes paths; Phase O clarifies historical production names after path stability.
4. **Audit before editing.** Each R/O item starts with an exact import/writer/reader/QA/path-contract audit.
5. **Tests protect behavior, not obsolete locations.** Update stale source-location assertions instead of restoring old architecture.
6. **Candidate before dev.** Material changes go through a narrow candidate branch and focused QA before integration.
7. **Full Dev Integration on actual final dev HEAD.** Candidate green alone is not completion.
8. **Human validation where meaningful.** Terrain/streaming, visual/handling and user-facing behavior changes require the appropriate real-game test.
9. **Keep documentation current.** Every meaningful completion/discovery updates this file in the same work session.
10. **No silent debt discoveries.** Material new debt is added to this plan before moving on.

---

# 4. Target source-tree direction

This is a design map, not permission for one giant move.

```text
src/
  main.js
  assets/

  app/
    application-settings.js
    loaded-settings-application.js
    diagnostics.js
    version.js

  input/
    keyboard-controls.js
    gamepad.js

  ui/
    startup-ui.js
    v21-menu.js
    instrument-cluster.js
    minimap.js
    heading-compass.js
    route-planner-ui.js

  routing/
    routing.js
    routing-service.js
    route-lifecycle.js
    route-presets.js
    route-challenge.js
    geocoding.js

  services/
    cache.js
    overpass.js
    desktop-overpass-transport.js

  audio/
    audio.js
    audio-base.js        # responsibility rename deferred to Phase O

  traffic/
    civil-traffic*.js

  multiplayer/
    # public root facades may remain at src/ while they are useful compatibility/lazy boundaries
    multiplayer-client-m3.js
    multiplayer-visuals-m3.js
    multiplayer-visuals-v18.js
    multiplayer-fallback-visual.js
    multiplayer-support-math.js
    multiplayer-vehicle-adapter.js
    multiplayer-vehicle-registry.js

  vehicles/
    vehicle-system.js
    vehicle-visuals.js
    vehicle-presentation*.js
    vehicle-authored-registry.js
    vehicle-render-contract.js
    vehicle-glb-entries.js
    deferred-glb-system.js
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

  physics/
    # existing focused modules plus, after R5:
    vehicle-dynamics*.js
    driving-runtime*.js
    transmission-*.js
    wheel-ground-support.js
    skidmarks.js

  world/
    road/
    terrain/
    imagery/
    scenery/
    forest/
    water/
    streaming/

  styles/
    styles.css
    v21-ui.css
```

`src/main.js` remains the obvious browser/composition entry point. `src/assets/` is not moved during Phase R unless a separate asset audit justifies it.

---

# 5. PHASE R — Source tree organization

Goal: reduce the overloaded `src/` root while making subsystem ownership obvious. **No behavior tuning is allowed in Phase R.**

## R1 — Exact path/import/QA inventory [P0]

Status: **DONE — 2026-08-31**

Implementation:
- extended permanent `qa/DEV_INTEGRATION_AUDIT.mjs` instead of creating a second long-term audit;
- inventory now records root/nested source layout, reachability, unresolved imports, dynamic imports, ownership buckets, exact `src/...` path contracts in QA/CI/Electron/build files, file sizes and fan-in/fan-out;
- every root JS file must classify into a proposed responsibility domain.

Audit history:
- temporary branch `audit/source-tree-r1` created with standalone audit/workflow; its new Actions run remained queued and was superseded by the permanent Dev Integration approach;
- `21a8c9800b36aa1d2e87cb2d45e5e034bcbda5ef` — first permanent R1 extension;
- run `33444264399` failed only because the new ownership classifier omitted 15 legitimate root modules; no runtime/subsystem failure occurred;
- `9a26072353a41991dd636e8a6610f23b4ff5a1ff` — corrected classifier;
- Dev Integration run `33444437121` — **PASS**, including all A/B/C/C6 gates, full stress, 288 driving cases, physics R2–R20, terrain, traffic, forest/frame pacing, M4.14/M4.15, live route smoke and production build/code split.

Measured baseline:
- 116 source code files;
- 116 runtime reachable;
- zero browser-graph orphans;
- zero unresolved reachable relative imports;
- zero unclassified root JS files.

Runtime behavior change: **none**.  
Human validation: **not required**.

## R2 — Multiplayer folder migration [P1]

Status: **AUTOMATION DONE — HUMAN VALIDATION PENDING**

Final architecture:
- retain public root facades `src/multiplayer.js` and `src/multiplayer-visuals.js` so `main.js` and compatibility consumers keep stable entry points;
- move the seven internal implementation modules into `src/multiplayer/`;
- preserve all historical filenames for later Phase O responsibility renames.

Path-sensitive contracts preserved:
- `src/multiplayer-visuals.js` still lazy-loads the maintained visual implementation, now at `./multiplayer/multiplayer-visuals-m3.js`;
- `src/multiplayer.js` still lazy-loads the maintained client, now at `./multiplayer/multiplayer-client-m3.js`;
- production build still produces lazy multiplayer chunks;
- civil-traffic/network boundaries still consume the stable public facade.

Automation completion record:
- Item: R2 multiplayer folder migration;
- Date: 2026-08-31;
- Audit branch/run: `audit/source-tree-r2-multiplayer`, run `33444942008` PASS;
- Candidate branch/run: `cleanup/source-tree-r2-multiplayer`, run `33455749888` PASS;
- Integrated dev commit: `1eef3825e8ea56b28ac49e8e17e828fbbf1c042d`;
- Final Dev Integration run: `33455822616` PASS;
- Files moved: seven multiplayer implementation modules;
- Files intentionally retained at root: the two public lazy facades;
- Behavior changed: **no**;
- Material discoveries: 20 QA/CI path-contract files were inventoried during the audit; relevant multiplayer contracts were retargeted. Existing C-M1 dependency and C-M2 Actions-runtime debt remain separate;
- Human validation: **required by user checkpoint — pending**;
- Result: automated R2 complete; R3 blocked on human smoke;
- Next item/action: human R2 smoke, then R3 read-only audit if PASS.

## R3 — Civil traffic folder migration [P1]

Status: **BLOCKED UNTIL R2 HUMAN PASS**

Move the full `civil-traffic*` family into `src/traffic/` while preserving:
- R7 local engine;
- pool/preload behavior;
- Traffic MP1 authority/follower semantics;
- network bridge;
- C6 diagnostics;
- `WorldDriveTrafficSpawn` functional command.

## R4 — Vehicle/presentation/model folder migration [P1/P2]

Status: PENDING R3

Move vehicle system/visual/presentation/registry/render-contract/GLB entry modules, authored models into `src/vehicles/models/`, and truck/trailer into `src/vehicles/truck/` after an exact dynamic-path audit.

Important known contract: `vehicle-authored-registry.js` contains hard-coded `modulePath` strings and dynamic `import()` callbacks for ID.4, WRX, Civic, Sonata, F1, Countach, i3 and truck/trailer. These exact paths must migrate together.

Do not combine R4 with suspension/anti-roll refactoring.

## R5 — Physics/runtime folder consolidation [P2]

Status: PENDING R4

Move `vehicle-dynamics*`, `driving-runtime*`, `transmission-*`, `wheel-ground-support.js` and `skidmarks.js` under `src/physics/` with **zero equation/constant changes**.

Required: complete relevant R-series tests, 288-case matrix, stress and Dev Integration.

## R6 — Road/scenery/forest/water folder migration [P2]

Status: PENDING R5

Sub-lots:
- R6a road/signs/bridges;
- R6b scenery renderer/data;
- R6c forest;
- R6d water.

Preserve road-sign scheduling and forest frame-pacing exactly.

## R7 — App/input/ui/routing/services folder migration [P2]

Status: PENDING R6

Lower gameplay risk but high import fan-out. Preserve CSS paths, settings identity/persistence, startup order, controls and desktop Overpass behavior.

## R8 — Terrain/imagery/local-world/streaming folder migration [P3 — LAST]

Status: DEFERRED UNTIL R2–R7 STABLE

Families:
- `terrain*`;
- `imagery*`;
- `local-world-builder*`;
- `streaming-coordinator*`;
- `world-streaming.js`.

These are performance sensitive. Require dedicated path/runtime-contract audit and a long-route human validation after integration: imagery ON/OFF, cache reuse, several world refreshes, FPS/hitch observation.

## R9 — Permanent root-cleanliness gate [P2]

Status: PENDING R8

After migration, add an allowlist for files permitted directly under `src/`. Expected minimal root is approximately `main.js` plus only explicitly justified bootstrap/compatibility entry points.

---

# 6. PHASE O — Responsibility naming / historical layer cleanup

Begin after the relevant Phase R folder is stable. Do not merge these renames into path moves.

- **O1 Multiplayer visuals:** replace misleading `m3`/`v18` production names with responsibility names while preserving lazy facade, support solver and authored presentation separation.
- **O2 Road furniture:** replace `p930`/`p937` names while preserving incremental sign construction vs idle/coalesced scheduling.
- **O3 Vehicle presentation:** remove `vehicle-presentation-v21.29.js` historical ownership name; preserve suspension/airborne/landing and anti-roll behavior.
- **O4 Scenery renderer:** replace `p9`/`p933` names while preserving route-aware startup readiness and forest rendering.
- **O5 Audio:** replace generic `audio-base.js` only if an ownership audit confirms a useful core/wrapper split.
- **O6 Driving runtime:** map `driving-runtime-base.js` vs public runtime before any rename/flattening; physics/runtime-sensitive.
- **O7 Terrain/imagery/local-world/streaming:** only after R8 and performance baselines; no cosmetic big-bang flattening.

---

# 7. PHASE C — Corrections / maintenance

Corrections can interrupt R/O when a real defect is found. They must be isolated from structural commits.

## C-M1 — Dependency/security audit [P1/P2]

Status: **NEW — NOT STARTED**

Discovery during R1 CI:
- `npm ci` reported 25 dependency vulnerabilities: 3 low, 21 high, 1 critical.

Rules:
- inspect the exact `npm audit` dependency tree;
- distinguish shipped/runtime risk from dev/build-only transitive dependencies;
- do **not** run blind `npm audit fix --force`;
- evaluate Electron/Forge/Vite updates with packaging/build QA;
- handle security-relevant runtime exposure first.

This is a separate maintenance item and must not be mixed into Phase R file moves.

## C-M2 — GitHub Actions runtime hygiene [P2/P3]

Status: **NEW — NOT STARTED**

GitHub Actions currently warns that Node 20-based action runtimes are deprecated/being forced to Node 24. Audit `actions/checkout`, `actions/setup-node` and other actions when appropriate. Preserve workflow behavior and path-scoped gates.

---

# 8. PHASE E — Feature evolution

New gameplay/features are allowed after a stable structural checkpoint. Every feature gets:
- explicit behavior goal;
- narrow branch;
- dedicated QA where feasible;
- full Dev Integration for core changes;
- human validation for user-visible behavior.

Never hide feature work inside R/O maintenance.

---

# 9. Validation matrix

| Change type | Minimum automated validation | Human validation |
|---|---|---|
| docs/audit only | relevant audit + build when applicable | no |
| path-only multiplayer | multiplayer + M4.14/M4.15 + code split + Dev Integration | quick smoke checkpoint |
| path-only traffic | traffic + shared/live MP + Dev Integration | optional, but use periodic human checkpoint by user request |
| path-only vehicle | presentation/lights/truck/MP adapter + Dev Integration | quick spot-check |
| physics/runtime | dedicated R-tests + 288 matrix + stress + Dev Integration | required if behavior changes |
| road/forest | subsystem + frame pacing + Dev Integration | required if visible/perf behavior changes |
| terrain/imagery/streaming | complete subsystem + stress + build + Dev Integration | **long-route mandatory** |
| dependency/toolchain | build/package + affected QA + Dev Integration | desktop/package smoke when relevant |

---

# 10. Branch conventions

- read-only investigation: `audit/<scope>`
- structural/cleanup candidate: `cleanup/<scope>`
- bug correction: `fix/<scope>`
- feature evolution: `feature/<scope>`

Do not do experimental work directly on `main`.

---

# 11. Completion record template

For every completed item, append/update a record containing:

- Item:
- Date:
- Audit branch/run:
- Candidate branch/run:
- Integrated dev commit:
- Final Dev Integration run:
- Files moved/changed:
- Behavior changed: yes/no; if yes, exact intended change:
- Material discoveries:
- Human validation: required/not required + result:
- Result:
- Next item/action:

For an interrupted item, CURRENT CHECKPOINT must additionally contain:
- exact active branch + SHA;
- last green run;
- last failed run and precise reason;
- source files already modified;
- QA files already modified;
- invariants that must not change;
- exact next action.

---

# 12. Roadmap summary

Current sequence:

**R1 DONE → R2 AUTOMATION DONE / HUMAN PASS PENDING → R3 traffic → R4 vehicles → R5 physics/runtime → R6 world road/scenery/forest/water → R7 app/UI/services → R8 terrain/imagery/streaming → R9 root gate → Phase O historical naming → corrections/features as prioritized.**

Maintenance items C-M1/C-M2 are tracked separately and may be prioritized when appropriate, but must not contaminate structural commits.

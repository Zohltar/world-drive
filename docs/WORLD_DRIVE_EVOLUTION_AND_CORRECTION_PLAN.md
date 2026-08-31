# World Drive — Evolution & Correction Plan

Date created: 2026-08-31
Repository: `Zohltar/world-drive`
Canonical work branch: `dev`
Stable release branch: `main`
Stable baseline at plan creation: `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`
Audit/development baseline immediately before this document: `dev` @ `290d16e328b7c0756fecffc34e5a80479304be82`
Status: **ACTIVE — canonical post-C6 source of truth**

> This document supersedes `WORLD_DRIVE_TECH_DEBT_PLAN_D.md` as the active execution plan. The older Plan D remains historical audit evidence.
>
> The objective is no longer cleanup for cleanup's sake. World Drive has a validated stable baseline. Future work should improve repository structure, clarify ownership, correct proven defects, and evolve systems without regressing gameplay, visual quality, physics, streaming smoothness, or multiplayer behavior.

---

# 0. Mandatory continuity / restart protocol

This section exists specifically so a new ChatGPT conversation can resume work correctly even if all conversational context is lost.

At the beginning of **every new World Drive conversation** involving code, architecture, QA, GitHub or technical planning:

1. Read this file from the current `dev` branch **before proposing or changing code**.
2. Read the live GitHub HEAD of both `dev` and `main`.
3. Read the **CURRENT CHECKPOINT** section below.
4. Inspect the latest `Dev Integration QA` run for the exact current `dev` HEAD.
5. If the checkpoint names a candidate/audit branch, inspect that branch and its latest workflow result before creating anything new.
6. Read the work-log entries for the active item.
7. Resume the exact `Next action` written in the checkpoint unless the user explicitly changes priority.
8. Never assume old chat memory is newer than this file + live GitHub state.
9. Never mark an item DONE until its completion record, commit(s), QA evidence and any required human validation are written into this document.
10. Before ending a meaningful work session, update **CURRENT CHECKPOINT** so a future conversation knows exactly where work stopped.

If chat memory and GitHub disagree, **GitHub + this file win**.

---

# 1. CURRENT CHECKPOINT — update after every meaningful work session

**Plan phase:** R — Source tree organization

**Active item:** R1 — inventory and path-contract audit

**State:** NOT STARTED

**Working branch:** `dev` until the R1 audit creates a narrow `audit/...` branch.

**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`

**Known validated development baseline before plan creation:** `290d16e328b7c0756fecffc34e5a80479304be82`

**Last known full integration evidence before this plan:** Dev Integration QA on the post-C6 development baseline passed, including the runtime import/debt audit, ownership gates, C6.1–C6.12, full V21.31 stress, 288-case driving matrix, terrain, traffic, forest/frame pacing, multiplayer WebGL paths and production build.

**Human validation:** PASS after C6; user reported normal gameplay was good before promotion to `main`.

**Next action:** perform R1 as a **read-only repository/path audit**. Build an exact module inventory, current import graph, source-root file list, dynamic-import/path-sensitive QA list and proposed folder ownership map. Do not move runtime files during R1.

**Do not do yet:** do not start D1 historical-layer renaming and do not move terrain/streaming files before R1 establishes path contracts.

---

# 2. Operating principles

## 2.1 Stable means stable

`main` is the rollback/reference branch. New architecture, reorganization and fixes happen on `dev` or narrow audit/candidate branches first.

Never move `main` forward until:
- the integrated `dev` HEAD is green;
- required human validation is complete;
- the user explicitly approves promotion.

## 2.2 No mixed-intent commits

A commit should do one thing:
- path-only/module move;
- responsibility rename;
- QA modernization;
- bug correction;
- behavior evolution;
- documentation/checkpoint update.

Do not hide behavior changes inside repository reorganization.

## 2.3 Preserve accepted behavior by default

Structural work must preserve:
- driving feel and R2–R23 physics invariants;
- braking in curves;
- crest/jump/landing behavior;
- road/terrain geometry and banking;
- imagery quality and cache behavior;
- forest density/frame pacing;
- traffic behavior;
- multiplayer exact gear/state/rendering;
- authored vehicle lights and presentation;
- HUD/minimap sign readout;
- startup and route-loading behavior.

A change to those behaviors requires its own explicit correction/evolution item.

## 2.4 Move first only when ownership is understood

A messy root directory is worth fixing, but path reorganization must follow a dependency audit. Historical filenames may still be real runtime owners.

## 2.5 Tests protect behavior, not obsolete locations

When a path-only move makes an old source-location assertion fail:
- preserve the behavioral invariant;
- update the QA to the new canonical path;
- never restore obsolete architecture merely to satisfy an old string assertion.

---

# 3. Target source-tree architecture

This is the intended **direction**, not permission to move everything at once.

```text
src/
  main.js                    # composition/bootstrap root

  app/
    application-settings.js
    loaded-settings-application.js
    version.js
    diagnostics.js

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
    elevation.js

  audio/
    audio.js
    audio-core.js            # eventual responsibility name for audio-base.js if audit supports it

  traffic/
    civil-traffic.js
    civil-traffic-local.js
    civil-traffic-pool.js
    civil-traffic-preload.js
    civil-traffic-network-bridge.js

  multiplayer/
    client.js                # eventual responsibility name; not an automatic rename
    client-core.js           # only if ownership audit supports it
    visuals.js
    visual-presentation.js
    visual-support.js
    vehicle-adapter.js
    vehicle-registry.js
    support-math.js
    fallback-visual.js

  vehicles/
    system.js
    visuals.js
    presentation.js
    authored-registry.js
    render-contract.js
    glb-entries.js
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
    # existing focused physics modules remain here
    vehicle-dynamics.js
    vehicle-dynamics-core.js
    vehicle-dynamics-traction-steering.js
    driving-runtime.js
    driving-runtime-core.js   # eventual responsibility rename only after audit
    transmission-controller.js
    transmission-network-state.js
    transmission-runtime-bridge.js
    wheel-ground-support.js
    skidmarks.js

  world/
    road/
      road-geometry.js
      road-furniture.js
      signs.js
      bridges.js

    terrain/
      terrain.js
      # historical active layers renamed only after ownership audit

    imagery/
      imagery.js

    scenery/
      scenery-data.js
      scenery-renderer.js

    forest/
      forest-authored-lite.js
      forest-chunk-streamer.js
      forest-chunk-streamer-core.js
      forest-proxy-assets.js
      forest-streaming-policy.js
      forest-terrain-sampler.js
      forest-water-assets.js
      frame-runtime-profiler.js

    water/
      water-data.js
      water-renderer.js

    streaming/
      world-streaming.js
      streaming-coordinator.js
      local-world-builder.js

  styles/
    styles.css
    v21-ui.css
```

Notes:
- This tree is a **design map**, not a one-commit migration target.
- Exact final folder names may be adjusted by R1 if the import graph reveals better boundaries.
- `main.js` should remain at `src/main.js` as the obvious browser entry/composition root.
- Asset paths remain under `src/assets/` unless a separate asset-organization audit proves a move is safe and useful.

---

# 4. PHASE R — Organize `src/` by responsibility

Goal: reduce the overloaded `src/` root while making subsystem ownership immediately visible.

This phase is structural. **No behavior tuning is allowed inside R items.**

## R1 — Exact path/import/QA inventory [P0]

Status: **NEXT**

Create a read-only audit that records:
- every production JS/CSS file under `src/`;
- runtime reachability from `src/main.js`;
- static imports;
- dynamic imports;
- path strings used by QA/source assertions;
- build/Electron references to `src/...` paths;
- files loaded indirectly rather than by ES import;
- current file sizes and major dependency fan-in/fan-out;
- proposed subsystem/folder for each root-level module.

Special attention:
- lazy `import()` paths in multiplayer;
- Electron/preload paths;
- QA that opens source files by exact filename;
- CSS imports and asset-relative URLs;
- path-scoped GitHub Actions triggers.

Acceptance:
- exact inventory committed as QA/report artifact;
- zero runtime change;
- production build PASS;
- runtime import/debt audit PASS;
- proposed folder map has no unclassified root JS file except deliberately retained entrypoints.

## R2 — Move multiplayer into `src/multiplayer/` [P1]

Status: PENDING R1

Candidate set includes:
- `multiplayer.js`
- `multiplayer-client-m3.js`
- `multiplayer-visuals.js`
- `multiplayer-visuals-m3.js`
- `multiplayer-visuals-v18.js`
- `multiplayer-fallback-visual.js`
- `multiplayer-support-math.js`
- `multiplayer-vehicle-adapter.js`
- `multiplayer-vehicle-registry.js`

Rules:
- path move first; responsibility renaming only if explicitly included in a small sub-item;
- preserve lazy code splitting exactly;
- preserve packet/state semantics exactly.

Validation:
- multiplayer protocol + exact gear;
- shared/live traffic;
- adapter/registry/support math;
- M4.14 authored reverse WebGL;
- M4.15 network-to-WebGL reverse;
- production code-split QA;
- full Dev Integration.

Human validation: recommended quick multiplayer/session smoke if available because dynamic import paths change.

## R3 — Move civil traffic into `src/traffic/` [P1]

Status: PENDING R2

Move the full `civil-traffic*` family together.

Preserve:
- R7 local engine;
- pool/preload semantics;
- Traffic MP1 authority/follower behavior;
- network bridge;
- canonical diagnostics;
- `WorldDriveTrafficSpawn` command contract.

Validation:
- all traffic QAs + C6 traffic diagnostics + multiplayer shared/live traffic + Dev Integration.

## R4 — Move vehicle presentation/model modules into `src/vehicles/` [P1/P2]

Status: PENDING R3

First structural lot:
- vehicle system/visual/presentation/registry/render-contract/GLB entry files;
- authored model files into `src/vehicles/models/`;
- truck/trailer into `src/vehicles/truck/` if R1 confirms no path-sensitive asset assumptions.

Do **not** combine this structural move with suspension/anti-roll refactoring.

Validation:
- all authored-vehicle light/presentation QA;
- vehicle switching;
- truck/trailer QA;
- anti-roll/suspension/jump regressions;
- multiplayer adapter paths;
- build/code split;
- Dev Integration.

Human validation: quick vehicle-switch + lights + camera/presentation spot-check.

## R5 — Consolidate physics/runtime modules under `src/physics/` [P2]

Status: PENDING R4

Potential moves:
- `vehicle-dynamics*.js`
- `driving-runtime*.js`
- `transmission-*.js`
- `wheel-ground-support.js`
- `skidmarks.js`

No physics equations or constants may change in this phase.

Validation:
- complete R2–R23 regression set;
- 288-case matrix;
- full stress;
- transmission/clutch/wheelspin;
- suspension/ground-support/skid alignment;
- Dev Integration.

Human validation: not required for pure path-only changes if complete physics/integration QA is green; required if any behavior diff is introduced.

## R6 — Move road/scenery/forest/water domains under `src/world/` [P2]

Status: PENDING R5

Perform as separate sub-lots, not one giant commit:
- R6a road/signs/bridges;
- R6b scenery renderer/data;
- R6c forest modules;
- R6d water modules.

Preserve forest frame-pacing and road-sign scheduling exactly.

Validation: relevant subsystem QA + full Dev Integration after each integrated sub-lot.

## R7 — Move app/input/ui/routing/services modules [P2]

Status: PENDING R6

These are lower gameplay risk but high import fan-out. Use R1 dependency data to choose ordering.

Keep `src/main.js` as the composition root.

Special checks:
- CSS path imports;
- settings persistence identity;
- keyboard/gamepad bindings;
- route startup order;
- desktop Overpass bridge;
- Electron packaging/build.

## R8 — Terrain / imagery / local-world / streaming folder move [P3 — last structural move]

Status: DEFERRED UNTIL R2–R7 STABLE

Move the performance-sensitive families into responsibility folders **without flattening them yet**.

Families:
- `terrain*`
- `imagery*`
- `local-world-builder*`
- `streaming-coordinator*`
- `world-streaming.js`

Required before source move:
- dedicated path-contract audit;
- freeze dynamic/runtime bridge expectations;
- full terrain/imagery/streaming regression baseline.

Required after integration:
- full Dev Integration;
- production build;
- long-route human validation with imagery ON/OFF, cache reuse, several world refreshes, FPS/hitch observation.

## R9 — Root cleanliness permanent gate [P2]

Status: PENDING R8

After structural migration stabilizes, add a permanent QA allowlist for files permitted directly under `src/`.

Expected minimal root surface should be approximately:
- `main.js`;
- possibly a small number of deliberate compatibility/bootstrap entrypoints if R1 proves they are justified.

The gate should fail if new subsystem implementation files are later added casually to `src/` root.

---

# 5. PHASE O — Remove historical production naming / clarify ownership

Begin only after the relevant modules are in their responsibility directories. This phase incorporates and supersedes the active execution portion of Plan D.

## O1 — Multiplayer visual ownership names [P1]

Historical targets:
- `multiplayer-visuals-v18.js`
- `multiplayer-visuals-m3.js`

Goal:
- `visual-support` should own support chassis/terrain solve;
- authored remote presentation/smoothing should have a responsibility name;
- lazy facade remains the public boundary.

No network/rendering behavior change.

## O2 — Road-furniture ownership names [P1/P2]

Historical targets:
- `road-furniture-p930.js`
- `road-furniture-p937.js`

Preserve two real responsibilities:
- incremental sign construction;
- idle/coalesced scheduling + combined diagnostics.

Do not flatten solely to reduce file count.

## O3 — Vehicle-presentation ownership [P2]

Historical target:
- `vehicle-presentation-v21.29.js`

Establish explicit ownership for:
- suspension/ground-following presentation;
- airborne/landing presentation;
- anti-roll visual coupling.

Human visual/handling spot-check required if more than naming/import ownership changes.

## O4 — Scenery-renderer ownership names [P2]

Historical targets:
- `scenery-renderer-p9.js`
- `scenery-renderer-p933.js`

Preserve:
- actual scenery/forest rendering;
- route-aware startup readiness;
- directional front/rear coverage;
- timeout behavior;
- C6 diagnostic aliases until a separate compatibility decision is made.

## O5 — Audio core naming [P2]

Historical/generic target:
- `audio-base.js`

Rename only if audit confirms the current two-module split is valuable. Tire/skid audio remains a separate modern layer unless a behavior-focused refactor justifies otherwise.

## O6 — Driving runtime ownership map and naming [P2/P3]

Historical/generic target:
- `driving-runtime-base.js`

Start read-only. The public `driving-runtime.js` owns substantial modern behavior and must not be merged blindly.

Any changes require full driving/transmission/traffic/lighting regression coverage.

## O7 — Terrain / imagery / local-world / streaming historical layers [P3]

This is the final naming/architecture cleanup, not a cosmetic sweep.

Before altering names/boundaries, document exact ownership of:
- terrain base road-bed;
- horizon preparation/commit;
- transition preparation/install;
- imagery rendered-ground sampler and prefetch;
- prepared local-world staging/commit;
- forest retention;
- adaptive streaming/hitch attribution;
- live P9.23 runtime bridge.

Human long-route validation is mandatory after any material integration.

---

# 6. PHASE C — Correction pipeline for newly discovered bugs

The project currently has no known user-visible regression after C6 human validation. This section defines how future defects enter the plan without derailing structural work.

## Priority

### C-P0 — release blocker
Examples:
- crash/startup failure;
- route cannot load;
- corrupted persistent data;
- catastrophic physics regression;
- stable multiplayer unusable;
- production build broken.

Action: stop structural work immediately and fix first.

### C-P1 — major gameplay/visual/performance regression
Examples:
- braking/steering/jump behavior materially wrong;
- terrain intersects road;
- severe hitches/micro-stutters return;
- imagery or cache stops functioning;
- traffic/network behavior incorrect;
- vehicle lights/presentation visibly broken.

Action: normally interrupt the active structural item, create a dedicated fix branch, reproduce with QA, fix, validate, integrate, then resume from the checkpoint.

### C-P2 — moderate defect / quality problem
Examples:
- localized visual artifact;
- UI inconsistency;
- minor vehicle-model issue;
- non-critical diagnostic/tooling problem.

Action: record here and schedule around the current structural item unless the user prioritizes it.

### C-P3 — polish / idea
Record separately. Do not mix with cleanup merely because the same file is being touched.

## Mandatory bug workflow

1. Record reproduction and expected behavior.
2. Identify last known good baseline when possible.
3. Add or modernize a regression test before/with the fix.
4. Keep fix commit separate from directory/ownership movement.
5. Run domain QA + full Dev Integration when core runtime is touched.
6. Human-test user-visible fixes before promotion to stable.
7. Update CURRENT CHECKPOINT and work log before resuming interrupted structural work.

---

# 7. PHASE E — Feature evolution after architecture stabilizes

Feature work may happen before all O items finish if the user prioritizes it, but each feature should enter this plan explicitly before implementation.

Potential evolution domains, not automatically approved work:
- richer traffic behavior/variety;
- multiplayer/session evolution;
- route and world-generation improvements;
- more authored vehicles;
- vehicle-specific lighting/presentation improvements;
- better road metadata/signage;
- cache/offline robustness;
- driving-physics evolution based on observed gameplay, not test chasing;
- UI/settings improvements.

Rule: architecture cleanup must never be used as an excuse to sneak in feature behavior, and feature work must not opportunistically reorganize unrelated subsystems.

---

# 8. Validation matrix

## Path-only / responsibility-only move
Minimum:
- exact import/path audit;
- relevant subsystem QA;
- production build;
- code-split QA if dynamic imports are involved;
- full Dev Integration on final integrated `dev` HEAD.

## Physics/runtime behavior
Minimum:
- relevant dedicated R tests;
- transmission/wheelspin/support tests as applicable;
- `DEV_DRIVING_SIM_QA` 288 cases;
- full stress;
- production build;
- Dev Integration;
- human driving test when behavior changes.

## Terrain/imagery/streaming
Minimum:
- terrain/road/imagery/forest/frame-pacing QA;
- live route smoke;
- full stress;
- production build;
- Dev Integration;
- human long-route test mandatory for material changes.

## Multiplayer
Minimum:
- protocol/exact gear;
- traffic shared/live;
- registry/adapter/support;
- M4.14/M4.15 WebGL paths;
- code split;
- Dev Integration;
- human session smoke when connection/loading behavior changes.

## Vehicle visuals/lights
Minimum:
- authored vehicle presentation/light QA;
- reverse/brake/night/indicator coverage where relevant;
- suspension/anti-roll if presentation changes;
- Dev Integration;
- human visual spot-check for material rendering changes.

---

# 9. Branch / commit convention

Recommended branch prefixes:
- `audit/...` — read-only analysis, scanners, reports;
- `structure/...` — path/folder changes only;
- `cleanup/...` — ownership/naming cleanup;
- `fix/...` — proven defect correction;
- `feature/...` — intentional new behavior.

For risky changes:
1. branch from current green `dev`;
2. candidate QA;
3. materialize narrow commit;
4. integrate to `dev` only when green;
5. run permanent/domain gate;
6. run full Dev Integration on actual final `dev` HEAD;
7. perform required human validation;
8. update this document.

---

# 10. Completion record template

Every completed item must add a record using this shape:

```text
## YYYY-MM-DD — <item> completed

- Starting dev HEAD:
- Audit branch / run:
- Candidate branch:
- Runtime/path commits:
- QA commits:
- Candidate workflow run:
- Permanent gate run:
- Final Dev Integration run:
- Human validation: PASS / NOT REQUIRED / PENDING
- Behavior changes: none / explicit summary
- Files/modules moved or renamed:
- Material discoveries:
- Deferred follow-ups:
- Result:
- Next item:
```

If an item is interrupted by a bug or conversation end, write an **IN PROGRESS checkpoint** instead of pretending it is complete.

---

# 11. Conversation-end checkpoint template

Before a long session ends or context becomes large, update section 1 with:

```text
Active item:
State: AUDIT / CANDIDATE / INTEGRATED / HUMAN VALIDATION / DONE
Working branch:
Working HEAD:
Candidate branch + HEAD:
Last green workflow + run ID:
Last failed workflow + exact failure, if any:
Runtime files changed:
QA files changed:
Important discoveries:
What must NOT be changed:
Human validation status:
Next exact action:
```

This is mandatory continuity metadata, not optional documentation polish.

---

# 12. Immediate roadmap

Execution order unless the user changes priority:

1. **R1** exact source/path/import/QA audit.
2. **R2** multiplayer folder migration.
3. **R3** civil-traffic folder migration.
4. **R4** vehicles/models/truck folder migration.
5. **R5** physics/runtime root cleanup.
6. **R6** road/scenery/forest/water world folders.
7. **R7** app/input/ui/routing/services folders.
8. **R8** terrain/imagery/local-world/streaming move with mandatory human long-route validation.
9. **R9** permanent `src/` root-cleanliness gate.
10. **O1–O7** responsibility/historical naming cleanup, starting with multiplayer and road furniture.
11. Continue with corrections/features according to observed gameplay and user priorities.

The order deliberately puts the most performance-sensitive world-generation/streaming move late, after the repository has already proven the folder-migration process on safer domains.

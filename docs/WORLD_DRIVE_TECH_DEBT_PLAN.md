# World Drive — Persistent Technical Debt & Cleanup Plan

> **Purpose**: this file is the persistent source of truth for technical-debt cleanup and architectural stabilization work. It is intentionally stored in the repository so it can be recovered at the start of a new conversation after ChatGPT context limits are reached.
>
> **Rule**: every meaningful cleanup/fix completed from this plan must update this file in the same work session before the task is considered done.

---

## 0. Continuity protocol for future sessions

At the start of a new World Drive conversation, do this before proposing new cleanup work:

1. Read this file from `dev`.
2. Read the current `dev` HEAD and recent commits.
3. Check the latest `Dev Integration QA` run for that HEAD.
4. Resume from the first unchecked task in the priority order below unless the user explicitly changes priorities.
5. After each correction:
   - mark the task done here;
   - record the commit SHA;
   - record the QA/build evidence;
   - note any follow-up discovered during implementation.

Do **not** assume old conversation memory is more current than this file + GitHub.

---

## 1. Current project state at creation of this file

- Repository: `Zohltar/world-drive`
- Active development branch: `dev`
- Stable baseline: V21.31 on `main`
- `dev` HEAD when this file was created: `1af62930ab66094888ec0280cc3f0ef254a1624a`
- Latest major physics correction: **Grip R20**
  - source commit: `a4ad67309be63e4bde7f75bb4087d3116913157f`
  - purpose: reduce excessive lateral restoring force from rear tires locked by the handbrake so ID.4/i3 and other rear-heavy vehicles can rotate through 90°.
- R20 runtime regression is permanent and validates full-runtime handbrake rotation.
- Dev Integration QA passed cleanly on the post-R20 cleanup HEAD.

### Recent physics chain that must not regress

- R7: per-wheel physical tire-force / countersteer coupling
- R8: ABS + locked-tire force direction
- R9: independent service brake / reverse / J-turn braking
- R10: separate grade gravity from tire load transfer
- R11: prevent elastic high-speed trajectory snapback
- R12: keep tire-peak cornering out of drift mode
- R13: more progressive high-speed steering input curve
- R14: smooth terrain→road wheel support re-entry
- R15/R15.1: per-vehicle skid-mark alignment
- R16: prevent FWD power-understeer from becoming counter-yaw
- R17/R17.1: preserve EV drive-force/momentum through high sideslip
- R18: EV rear-wheel handbrake lock + low-speed momentum preservation
- R19: remove legacy 90° J-turn steering/yaw wall
- R20: reduce rear locked-tire lateral force during handbrake drift
- R21: prevent high-downforce F1 front-slip loss from creating an opposing legacy counter-yaw
- R22/R22.1: F1-specific ultra-high-speed stick curve; 0–150 km/h preserves accepted R13 behavior, >150 km/h progressively compresses analog input
- R22: progressively soften F1 analog steering above ~145 km/h while preserving full-stick mechanical lock
- R23: remove legacy drift/yaw authority from the F1; real slip trajectory now uses per-wheel physical forces directly, with stale V21.21 F1 steering/stability QA retired

---

## 2. Audit findings summary

A static audit was run on branch `audit/code-debt-r20`.

Audit result at time of creation:

- 118 JavaScript source modules under `src/`
- 109 reachable from the browser runtime (`src/main.js`)
- 9 browser-runtime orphan modules
- no unresolved relative imports in the active runtime graph
- 209 QA files inspected
- multiple historical wrapper/version layers remain active
- several old QA scripts validate implementations no longer used by the game

### Runtime orphan modules found

These are not reachable from `src/main.js` at the time of the audit:

- `src/forest-chunk-streamer-p912.js`
- `src/forest-chunk-streamer-p928.js`
- `src/forest-runtime-data/forest-pack-00.js`
- `src/forest-terrain-sampler.js`
- `src/physics/wrx-authority-controller.js`
- `src/pine-tree-runtime.js`
- `src/road-geometry-v21.31.js`
- `src/road-metadata.js`
- `src/vehicle-presentation-wrapper.js`

Not all should be deleted blindly: some are referenced by historical QA and must be migrated first.

---

# 3. Priority work plan

## CLEANUP A — Low-risk cleanup and QA truthfulness

Goal: remove dead code and ensure green QA actually tests the code the game executes.

### A1 — Fix stale V21.31 road QA **[P0]**

Status: **DONE — 2026-08-30**

Problem:
- runtime imports `src/road-geometry.js`;
- several V21.31 tests still import `src/road-geometry-v21.31.js`;
- therefore part of the green stress suite validates an obsolete implementation instead of the active road system.

Known stale tests include at least:
- `qa/V21_31_ROAD_SMOOTHING_QA.mjs`
- `qa/V21_31_SUPERELEVATION_QA.mjs`
- `qa/V21_31_SUPERELEVATION_ENVELOPE_QA.mjs`
- `qa/V21_31_LEGACY_TERRAIN_AUTHORITY_QA.mjs`
- `qa/STRESS_ROUTE_PRESETS_LIVE.mjs` may also reference the obsolete module and must be checked.

Required correction:
- migrate tests to the active `src/road-geometry.js` API/semantics;
- update expectations where the active banking model differs;
- run all V21.31 road tests and full Dev Integration QA;
- only then remove `src/road-geometry-v21.31.js`.

Acceptance:
- no QA imports `road-geometry-v21.31.js`;
- file removed;
- active road geometry is what the stress suite validates.

Completion record:
- Commits: `9a9a38e1` (road smoothing QA), `f1df3bfe` (banking QA), `dd82a92b` (bank envelope QA), `2965001f` (terrain authority QA), `7de31f62` (live preset stress), `1073ffaa` (obsolete implementation removed), `aa266843` (temporary runner cleanup).
- QA: full V21.31 regression stress PASS; active road deterministic QA PASS; Grip R2–R20 PASS; terrain/road banking PASS; live route preset smoke PASS; WebGL PASS; production build PASS; production code split PASS.
- Active banking reference measured before migration: R100≈6.00°, R180≈3.96°, R250≈2.95°, R400≈1.98°, R500≈1.65°, R700≈1.28°, R1000≈1.00°, R2000≈0.675°; straight-road crossfall is bounded to 1°.
- Result: no runtime dependency on `src/road-geometry-v21.31.js`; all migrated QA now exercises `src/road-geometry.js`; obsolete module deleted.

---

### A2 — Remove dead WRX authority bridge **[P0/P1]**

Status: **DONE — 2026-08-30**

Problem:
- `src/physics/wrx-authority-controller.js` is no longer in the runtime graph;
- it is an old V21.27 WRX-only transitional authority bridge;
- it still contains historical caps and WRX-specific semantics that can confuse future work;
- three old WRX QA scripts still import it.

Known QA references:
- `qa/V21_27_WRX_AUTHORITY_QA.mjs`
- `qa/V21_27_WRX_BREAKAWAY_RECOVERY_QA.mjs`
- `qa/V21_27_WRX_CORNER_STABILITY_QA.mjs`

Required correction:
- determine which invariants remain valuable;
- migrate those invariants to tests of the current common R7–R20 runtime/solver;
- remove obsolete tests that only validate the abandoned controller;
- delete `wrx-authority-controller.js`.

Acceptance:
- no runtime or QA references old WRX authority controller;
- equivalent modern stability/breakaway coverage retained where useful.

Completion record:
- Modern retained invariant QA: `f18b888c` initial A2 test, refined in `5615091e` to preserve only valid current invariants; permanent CI gate added in `9d46f81b`.
- Removal commits: `43559bf5` retired WRX authority bridge; `cc533e07` old authority QA; `0dd47840` old breakaway-recovery QA; `8607ab15` old corner-stability QA.
- QA: full V21.31 stress PASS; 288-case driving matrix PASS; Grip R2–R20 PASS; Cleanup A2 common WRX tire stability PASS; terrain/traffic/forest PASS; M4.14/M4.15 WebGL PASS; live route smoke PASS; production build and code split PASS.
- Retained modern invariants: WRX front/rear tire utilization remains balanced at ordinary slip, lateral force rises progressively through tire peak, post-peak sliding force remains bounded, and the common per-wheel solver does not invent straight-line yaw/lateral acceleration.
- Deliberately rejected obsolete duplicate: the first A2 draft tried to assert rear handbrake lock in an isolated solver setup. That assertion was removed rather than tuning physics to satisfy it because current handbrake drivetrain/runtime behavior is authoritatively covered by R18/R20.
- Result: no runtime or QA dependency remains on `src/physics/wrx-authority-controller.js`; the WRX now has no hidden special chassis-authority implementation.

---

### A3 — Remove duplicate vehicle presentation wrapper **[P1]**

Status: **DONE — 2026-08-30**

Problem:
- `src/vehicle-presentation-wrapper.js` is not runtime-reachable;
- its anti-roll presentation layer has effectively been integrated into `src/vehicle-presentation.js`;
- keeping both makes it unclear which one owns anti-roll visual behavior.

Required correction:
- confirm no QA/tools import the wrapper;
- delete it;
- run suspension, anti-roll, jump/landing and full integration QA.

Completion record:
- Removal commit: `5802aa07` — deleted `src/vehicle-presentation-wrapper.js`.
- Reference audit: no runtime, QA or tooling references to `vehicle-presentation-wrapper` or `createAntiRollPresentation` remained before deletion.
- Ownership after cleanup: active anti-roll presentation behavior is solely in `src/vehicle-presentation.js` over `vehicle-presentation-v21.29.js`.
- QA: full V21.31 stress PASS; 288 driving cases PASS; V21.30 anti-roll visual/balance PASS; Grip R6/R14 and crest/oblique-landing regressions PASS; R2–R20 PASS; forest/frame-pacing PASS; M4.14/M4.15 WebGL PASS; live route smoke PASS; production build and code split PASS.

---

### A4 — Review/remove fully unreferenced orphan modules **[P1]**

Status: **DONE — 2026-08-30**

Candidates with no runtime and no QA references at audit time:
- `src/forest-runtime-data/forest-pack-00.js`
- `src/forest-terrain-sampler.js`
- `src/pine-tree-runtime.js`
- `src/road-metadata.js`

Required correction:
- verify no dynamic string-based loader or build tooling references them;
- delete only after confirmation;
- build and run relevant forest/road integration tests.

Special note:
- `pine-tree-runtime.js` embeds a large base64 geometry payload; removing it is useful for repository clarity if genuinely unused.

Completion record:
- Exact-reference audit branch: `audit/code-debt-a4`; strict scanner commit `47a06cf8` verified no exact runtime/QA/tooling imports and no convention-based dynamic loader for the four candidates.
- Removal commits: `5f6e4c98` forest pack; `661cbcc2` obsolete forest terrain sampler; `40c5329d` embedded pine runtime; `ddf40364` unused road metadata service.
- Important audit correction: the first scanner pass produced a false positive because `forest-terrain-sampler` is a substring of the active `forest-terrain-sampler-p912.js` name and `createForestTerrainSampler` is a prefix of `createForestTerrainSamplerP912`. Exact matching confirmed the deleted sampler was not used. The active P9.29 streamer still imports `forest-terrain-sampler-p912.js`, which remains intact.
- QA: Dev Integration run `33330678552` PASS end-to-end: V21.31 stress, 288 driving cases, Grip R2–R20, terrain/road banking, all active forest startup/prefetch/frame-pacing checks, M4.14/M4.15 WebGL, live route smoke, dependency audit, production build and code split.
- Result: all four A4 orphan modules are removed without changing active forest, road or physics behavior.

---

### A5 — Retire old forest P9.12 / P9.28 implementations **[P1]**

Status: **DONE — 2026-08-30**

Problem:
- active runtime path is currently approximately:
  - `forest-chunk-streamer.js`
  - → `forest-chunk-streamer-p929-wrapper.js`
  - → `forest-chunk-streamer-p929.js`
- P9.12 and P9.28 modules are runtime-orphans but still referenced by old QA.

Known references:
- `qa-forest-p912-stress.mjs`
- `qa-forest-p928-instrumentation.mjs`

Required correction:
- determine whether those QA invariants are still meaningful;
- port useful invariants to active P9.29/P9.40/P9.41 path;
- delete obsolete implementations and obsolete QA.

Do not disturb current forest frame-pacing behavior just to simplify names.

Completion record:
- Audit branch: `audit/code-debt-a5`; strict active-path/reference audit confirmed `forest-chunk-streamer.js -> forest-chunk-streamer-p929-wrapper.js -> forest-chunk-streamer-p929.js` and no active import of the historical P9.12/P9.28 streamers.
- Historical truth check: the old P9.28 QA was already stale and failed because it still required the public entry point to route through P9.28. The old P9.12 stress QA still contained useful generic invariants, so those were migrated instead of discarded.
- Migrated coverage: new `qa-forest-active-stress.mjs` preserves chunk-ring/burst/refresh/matrix-memory/StaticDrawUsage/double-buffer invariants against the active P9.29/P9.40 implementation; `qa-forest-active-runtime.mjs` replaces the misleading P9.12-named runtime mock; `qa-forest-p929-frame-budget.mjs` now also owns the useful zero-polling, policy-neutral and >20 ms hitch-feed diagnostics invariants.
- Final atomic cleanup commit on `dev`: `8e903c1a` — added active QA and permanent CI gates, updated forest workflows, removed `src/forest-chunk-streamer-p912.js`, `src/forest-chunk-streamer-p928.js`, `qa-forest-p912-stress.mjs`, `qa-forest-p928-instrumentation.mjs` and the stale `qa-forest-p912-runtime.mjs` filename.
- Important exception: `src/forest-terrain-sampler-p912.js` remains ACTIVE and intentionally retained; the current P9.29/P9.40 streamer imports its optimized terrain sampler despite the historical filename.
- Candidate audit run `33332587396`: PASS including strict reference audit, active stress/runtime/P9.29 diagnostics, P935/P936/P939/P940/P941, runtime debt audit and build.
- Final Dev Integration run `33332675790`: PASS all 57 steps including V21.31 stress, 288 driving cases, Grip R2–R20, active forest policy/stress/runtime/P9.29, frame-pacing stack, M4.14/M4.15 WebGL, live route smoke, dependency audit, production build and code split.
- Result: historical streamer ownership is gone; active forest behavior and frame-pacing policy are unchanged and now covered by accurately named current-path QA.

---

### A6 — Unify version/build branding **[P1]**

Status: **DONE — 2026-08-30**

Current mismatch found during audit:
- `src/version.js`: `21.31 stable`
- `package.json`: `21.24.94`
- `electron/main.cjs`: hard-coded `21.21.12` in window title/User-Agent

Also, the `dev` branch currently reports `stable` through `src/version.js`, despite comments saying development branches should identify themselves as dev.

Required correction:
- establish one canonical build/version source;
- make browser UI, Electron title, User-Agent and packaging consume it;
- remove obsolete DOM-wide legacy-version text replacement if no longer required;
- ensure release process can explicitly set `stable`, while `dev` remains clearly labeled `dev`.

Acceptance:
- one version source of truth;
- no stale hard-coded V21.xx strings in runtime branding code except intentional migration docs/tests.

Completion record:
- Initial atomic branding commit: `9ab5ed8c` — aligned package/lock to semver `21.31.0`, made web branding and Electron title/User-Agent derive from `package.json`, removed hard-coded V21.25 HTML labels, and added permanent `qa-version-branding-a6.mjs`.
- Final semantic cleanup: `7f757ca5` — development channel is explicitly `dev` on `dev`, and the legacy DOM-wide MutationObserver/version-text rewrite was removed. Static HTML now exposes only explicit branding placeholders.
- Source of truth: `package.json` owns `version` + `worldDriveChannel`; `package-lock.json` mirrors the machine version; `src/version.js` and Electron derive from the package metadata.
- QA: candidate branding audit `33333279610` PASS; initial Dev Integration `33333169584` PASS 58 steps; final Dev Integration `33334578131` PASS 58 steps with `V21.31 dev`, Grip R2–R20, forest, WebGL, live route smoke and production build/code split.
- Release rule: `stable` is reserved for explicit release promotion; development builds identify themselves as `dev`.
- Result: one authoritative version/build metadata source and no global DOM text-rewriting fallback remain.

---

### A7 — Root-level legacy file cleanup **[P3]**

Status: **DONE — 2026-08-30**

Audit candidates:
- `FIX_VERSION_DISPLAY_V20_13.ps1`
- `FIX_VERSION_DISPLAY_V20_13_ROBUST.ps1`
- `README_PACKAGING_V21_24_1.md`
- `index.html.encoding-backup`
- `CLEANUP_V21_25.md` (decide archive vs delete; may still be useful historical documentation)

Required correction:
- preserve anything historically useful under `docs/archive/` if desired;
- remove obsolete executable patch scripts/backups from repo root.

Completion record:
- Final commit: `7f2320ef` — removed obsolete V20.13 PowerShell version patchers and `index.html.encoding-backup`; archived historical V21.25 cleanup and V21.24 packaging notes under `docs/archive/`; replaced stale root `README_PACKAGING.md` with current A6-based packaging instructions.
- Additional audit finding: the unversioned root `README_PACKAGING.md` was itself a V21.24.64 snapshot, so it was archived as `docs/archive/README_PACKAGING_V21_24_64.md` rather than retained as current guidance.
- Permanent gate: `qa-repo-hygiene-a7.mjs` prevents the removed root debris/version patchers from returning and verifies current packaging documentation.
- Audit run `33334758106`: PASS A6 branding, A7 hygiene, runtime debt audit, production build and code split.
- Final Dev Integration run `33334825498`: PASS all 59 steps including A6/A7 gates, V21.31 stress, 288 driving cases, Grip R2–R20, forest/frame pacing, WebGL, live route smoke and build/code split.
- Result: repository root now contains current entry points/docs only; historical notes are clearly marked as archives.

---

## CLEANUP B — Physics architecture stabilization

Goal: prevent another R17–R20 situation where old helper semantics silently conflict with the current physical solver.

**Important:** no big-bang rewrite. One small extraction/consolidation at a time, full R2–R20 regressions after every step.

### B1 — Remove dead `postSpinSteeringAuthority` indirection **[P0/P1]**

Status: **DONE — 2026-08-30**

Problem:
- historical anti-spin helper remains in the active runtime;
- after R4 it effectively returns `1`, so calls multiply by a no-op;
- the name encourages future reintroduction of a hidden steering authority cap.

Required correction:
- remove runtime dependence on the no-op helper;
- update QA to explicitly forbid reintroduction of hidden post-spin steering caps.

Completion record:
- Final dev commit: `3c38bdf6` — removed the no-op `postSpinSteeringAuthority()` helper, its runtime variable and all four ×1 multipliers from bicycle yaw, requested/signed lateral acceleration and RWD power-oversteer yaw.
- QA migration: `qa-grip-drift-r4.mjs` now forbids the legacy helper/indirection from returning; stale V21.28 fleet and ID.4 QA were migrated to verify full reverse-relative steering speed directly instead of importing the removed helper.
- Candidate run `33335148086`: PASS R4/R7/R11/R12/R19/R20 runtime 180°, full V21.31 stress, driving simulation matrix and production build.
- Final Dev Integration run `33335226308`: PASS all 59 steps including R2–R20, 288 driving cases, forest/frame pacing, M4.14/M4.15 WebGL, live route smoke and production build/code split.
- Validation history: targeted B1 testing exposed every hidden consumer before merge (requested/signed lateral acceleration, RWD power-oversteer and two stale V21.28 QA), so no compatibility shim was retained.
- Human test: not required; B1 removes only multiplications by an exact constant `1` and the complete runtime/regression suite is unchanged.
- Result: no hidden post-spin steering-authority cap or compatibility API remains in the active runtime.

---

### B2 — Rename/refactor J-turn entry semantics **[P0]**

Status: **DONE — 2026-08-30**

Problem:
- `jTurnTransientYawActive()` historically sounded like an active-state predicate;
- after R19, actual maneuver state is latched and the old condition is really closer to an **entry eligibility** condition;
- misuse of the old predicate contributed to the 90° wall returning.

Required correction:
- rename toward `jTurnEntryEligible()` or equivalent;
- make entry predicate, latched state, and exit condition explicit and separate;
- preserve R19 full rotation regression.

Completion record:
- Final dev commit: `ec03c889` — renamed the old instantaneous predicate to `jTurnEntryEligible()`, extracted `jTurnExitEligible()`, renamed the latched transition helper to `advanceJTurnLatchedState()`, renamed runtime state to `jTurnLatchedActive`, and removed the ambiguous `jTurnYawActive` alias.
- Thresholds and behavior are unchanged: entry remains reverse body speed < -4 m/s, speed >= 8.5 m/s and steering >= .12; exit remains handbrake/airborne/off-pavement, speed < 2.5 m/s, steering < .05, or forward realignment (body speed > 2 m/s with sideslip < .10 rad).
- R19 QA now explicitly proves that at 90 degrees entry eligibility is false, exit eligibility is false, while the latched maneuver remains active; Portland QA now tests entry eligibility rather than calling it active state.
- Candidate run `33335558761`: PASS Portland, R9/R17/R18/R19/R20 runtime 180, full V21.31 stress, driving matrix and production build.
- Final Dev Integration run `33335628553`: PASS all 59 steps including Grip R2–R20, 288 driving cases, forest/frame pacing, WebGL, live route smoke and production build/code split.
- Human test: not required for B2 because this is a semantic/state naming refactor with identical thresholds and equations.
- Result: entry, latched active state and exit are now distinct concepts in code, closing the naming trap that previously helped reintroduce the 90-degree J-turn wall.

---

### B3 — Extract maneuver state from `driving-runtime-base.js` **[P0/P1]**

Status: **DONE — 2026-08-30**

Proposed module:
- `src/physics/maneuver-state.js`

Owns:
- J-turn entry/latched/exit state;
- handbrake transient state;
- rear handbrake slip state;
- maneuver-specific state transitions only.

Must not own tire forces or general yaw physics.

Reason:
- `driving-runtime-base.js` currently contains too many historical P/R guards and is a conflict hotspot.

Completion record:
- Runtime extraction commit: `d619c505` — added `src/physics/maneuver-state.js`, moved J-turn entry/exit/latch helpers plus rear-handbrake slip transient state out of `driving-runtime-base.js`, and preserved their original frame ordering.
- Permanent CI gate commit / current validated HEAD: `c01b0c7f` — added `qa-maneuver-state-b3.mjs` to Dev Integration.
- Ownership boundary: maneuver-state owns only J-turn latch memory and rear-handbrake slip memory/transitions; tire-force solver, general yaw physics, momentum direction and vehicle calibration remain outside this module.
- Historical QA cleanup: `V21_27_HANDRAKE_180_LOW_SPEED_QA.mjs` was updated to current R4 semantics (handbrake-held spin keeps steering-speed magnitude; released steering follows body-longitudinal cosine through 90 degrees) and its brittle 20 km/h transition bound was widened around the unchanged current formula.
- Candidate validation run `33337076416`: PASS B3 ownership QA, maneuver regressions, full V21.31 stress, 288-case driving matrix and production build.
- Final Dev Integration run `33337214381`: PASS all 60 steps including the permanent B3 gate, Grip R2–R20, forest/frame pacing, WebGL, live route smoke and production build/code split.
- Human validation: **pending** — ID.4/i3 handbrake-turn and J-turn continuity plus WRX/Civic comparison must be checked in-game before B3 is marked DONE.
- Human-validation interruption: F1 high-speed front-slip exposed a separate counter-yaw defect; fixed as Grip R21 on `dev` (`97e73d7d`) with permanent QA workflow commit `434dd0bc`. B3 remains pending until the requested in-game maneuver checks, now including F1 high-speed understeer feel, are confirmed.
- Steering human-feedback record: initial R22 was accepted from 0–150 km/h but remained **much too sensitive above 150 km/h**. R22.1 therefore freezes the accepted R13 mapping through 150 km/h, moves ultra-high-speed tuning into the explicit F1 profile, ramps exponent 4→9 from 150→260 km/h, and plateaus thereafter. Final source/QA commit on `dev`: `132c5bf2`; audit validation run `33341044464`; permanent R22 gate run `33341109576`; final Dev Integration run `33341109581` PASS 60/60. Representative half-stick mapping: 150=6.25%, 170=4.62%, 180=3.32%, 200=1.40%, 220=0.55%, 250=0.21%, 260+=0.195%; 85% stick at 300 km/h=23.2%; full stick remains 100%. Human validation remains pending for >150 km/h steering feel.
- Follow-up steering calibration: F1 remained too reactive at high speed even after R21. Grip R22 source commit `49223ab` adds a racecar-only second input-exponent stage from ~145 km/h to ~324 km/h; permanent QA workflow commit `2d3274ac`; clean post-temp HEAD `39fe2d36`. Half-stick mapping: ~6.2% rack at 150 km/h, 2.8% at 220, 1.7% at 250, 0.86% at 300; 100% stick remains 100% rack. R22 targeted run `33340583498`, permanent R22 run `33340620476`, final clean Dev Integration run `33340642930` all PASS. Human validation pending for F1 steering feel at 180–300+ km/h.
- Human validation: **PASS — 2026-08-30**. User confirmed ID.4/i3 handbrake-turn and J-turn continuity, WRX/Civic comparison, F1 180–300+ km/h steering feel and high-speed front-understeer behavior are all good in-game.
- Result: automated equivalence, ownership boundaries and requested driver-feel/continuous-rotation checks are all validated; B3 is closed.

---

### B4 — Extract momentum-direction ownership **[P0/P1]**

Status: **DONE (2026-08-30)**

Proposed module:
- `src/physics/momentum-direction.js`

Owns:
- `velocityHeading` state evolution;
- body-relative longitudinal/lateral velocity helpers;
- momentum-heading canonicalization near true stop;
- opposing drive/momentum crossing handling.

Reason:
- `velocityHeading` is currently referenced in many places and has repeatedly been the source of trajectory/drift/J-turn conflicts.

Acceptance:
- one clearly documented owner of momentum direction;
- R9/R11/R17/R19 regressions remain green.

Completion record:
- Ownership audit branch: `audit/momentum-b4`; audit workflow commit `ef564c30`.
- Audit run `33342452650`: PASS. All frame-by-frame physical writes to `velocityHeading` remain concentrated in `src/driving-runtime-base.js`; `main.js` only owns storage/init/reset/serialization and `vehicle-placement-controller.js` only realigns momentum on explicit placement/reset. Multiplayer keeps a separate remote/interpolated representation and is outside B4 physical ownership.
- Planned extraction boundary: body-relative longitudinal/steering projection, true-stop canonicalization, opposing body-drive crossing reconstruction, low-speed momentum following, force-derived trajectory rotation and momentum-heading rotation limiting move into `src/physics/momentum-direction.js` while global state storage remains unchanged.
- R23 prerequisite completed before extraction: source `ff36b40c`, permanent F1 ownership QA `52023fe9`, stale F1 QA cleanup `c6933883`, current steering-rack gate `acb467ff`; R23 workflow `33342416319` PASS and Dev Integration `33342416332` PASS 60/60.
- Candidate source commit: `c1b780e3`; integration source commit on `dev`: `aaa3b009`.
- Numerical-equivalence QA: `qa-momentum-direction-b4.mjs` compares the extracted owner against the exact pre-B4 equations over 25,000 deterministic randomized states; candidate run `33343053835` PASS with max error exactly 0.
- R11 and R23 source-location QA were migrated to the new momentum owner; equations/thresholds were unchanged.
- Permanent B4 gate commit: `877f0398`; gate run `33343158212` PASS.
- Dev Integration commit: `0e895fb1`; final run `33343173064` PASS all 61 steps, including 288 driving cases, 80,000 stress samples, R9/R11/R17/R18/R19/R20/R21/R23, WebGL, live route smoke and production build/code split.
- Human validation: not required; this was a strict ownership extraction with bit-for-bit-equivalent momentum evolution in the randomized equivalence harness.
- Result: `src/physics/momentum-direction.js` is now the single owner of physical `velocityHeading` evolution and body-relative momentum helpers; `main.js` retains storage/init/reset only.

---

### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**

Status: **DONE — 2026-08-30**

Canonical module:
- `src/physics/yaw-authority.js`

Owns:
- transition between normal bicycle-model yaw and per-wheel force-authoritative yaw;
- `driftKinematicCoupling` semantics and physical-authority gate;
- front/rear dominance and four-wheel-slide conditioning of the bicycle target;
- RWD legacy power-oversteer contribution where still enabled;
- R16/R21 legacy grip-yaw filtering;
- physical-vs-legacy yaw acceleration blend;
- yaw settling response and frame-by-frame `dynamicYawRate` integration.

Goal:
- make it impossible for multiple hidden yaw authorities to simultaneously fight each other.

Completion record:
- Ownership audit branch: `audit/yaw-b5`; audit workflow commit `3fe7c458`; audit run `33343248476` PASS.
- Audit result: local player chassis yaw authority was concentrated in `src/driving-runtime-base.js`. Multiplayer peer extrapolation and articulated trailer yaw are separate domains and remain outside B5.
- Candidate source commit: `812780c7` on `cleanup/yaw-b5`.
- Numerical-equivalence QA: `qa-yaw-authority-b5.mjs` compares the extracted owner against the exact pre-B5 equations over 30,000 deterministic randomized states; final candidate run `33343672832` PASS with max error exactly 0.
- Critical regressions PASS in the candidate: R7, R11, R16, R17, R19, R20, R21 and R23, plus the 288-case driving matrix, 80,000-sample stress suite and production build.
- Integration source commit on `dev`: `d02987ad`.
- Permanent B5 gate commit: `3f52ebba`; gate run `33343954812` PASS.
- Dev Integration gate commit: `e3a5ae42`. The first run correctly exposed one stale source-location assertion in R6: airborne yaw had moved to the B5 owner while the QA still searched `driving-runtime-base.js`.
- R6 ownership migration commit: `72f6cc10`; it now verifies runtime delegation to `advanceYawAuthority()` and the zero airborne kinematic-yaw response in `src/physics/yaw-authority.js`. No equation or threshold changed.
- Final Dev Integration run `33344066041`: PASS all 62 steps, including B3/B4/B5 ownership gates, 288 driving cases, 80,000 stress samples, Grip R2–R20, forest/frame pacing, M4.14/M4.15 WebGL, live route smoke and production build/code split.
- Human validation: not required for B5 because the extracted yaw update is numerically identical to the old implementation over 30,000 randomized states.
- Separate stale-QA finding: `qa/V21_27_CG_CONTACT_GEOMETRY_QA.mjs` already fails on the pre-B5 `dev` baseline; verification run `33343640402`. It is not a B5 regression and must be handled as separate technical debt rather than changing B5 physics to satisfy it.
- Result: `src/physics/yaw-authority.js` is now the single owner of local chassis yaw-authority arbitration and `dynamicYawRate` evolution; tire-force generation remains in the per-wheel solver and momentum direction remains in B4.

---

### B6 — Eliminate hidden wheelspin state and duplicate authority **[P0]**

Status: **DONE — 2026-08-30**

Canonical persistent-state module:
- `src/physics/wheelspin-state.js`

Resulting ownership:
- `driving-runtime.js` / `wheelspin-state.js` own persistent clutch-breakaway wheelspin level, hold duration and dynamic grip factor;
- `vehicle-dynamics-v21.29.js` is stateless and calculates instantaneous driven-wheel tire utilization from explicit requested/applied propulsion values;
- skidmarks and `WorldDriveRuntimeWheelspin` are observers/diagnostics, not alternate physics state;
- deprecated `WorldDriveWheelSpinTelemetry` and the hidden `latestRawDriveDemandAccel` / `latestAppliedDriveAccel` handoff are removed.

Acceptance:
- wheelspin result does not depend on unrelated call order;
- no hidden traction→grip module memory remains;
- requested/applied propulsion values are explicit;
- one persistent wheelspin owner;
- clutch-dump, FWD, RWD, AWD and truck cases remain correct.

Completion record:
- Ownership audit branch: `audit/wheelspin-b6`; audit workflow commit `de7e72f4`; audit run `33344102940` PASS. The audit confirmed three old layers: V21.29 hidden demand globals, runtime persistent wheelspin, and global telemetry/observer coupling.
- Interim plan sync commit: `0f2ae313` recorded the audit and intended ownership before source changes.
- Candidate source commit: `54d4f516` on `cleanup/wheelspin-b6`; candidate validation run `33344433491` PASS.
- `qa-wheelspin-state-b6.mjs` validates 42,000 deterministic persistent-state transitions against the exact pre-B6 equations with max error 0 and explicitly interleaves unrelated traction calls to prove grip call-order independence.
- V21.29 clutch/wheelspin coverage migrated to explicit demand inputs: Civic clutch-dump slip, Civic wheelspin, runtime wheelspin ownership and V21.31 airborne tire-state QA.
- Full candidate validation PASS: complete V21.29 combustion clutch/wheelspin suite, R9/R11/R16/R17/R18/R19/R20/R21/R23, 288-case driving matrix, 80,000-sample stress and production build.
- Integration source commit on `dev`: `d4423346`.
- Permanent B6 gate commit: `0247c879`; permanent gate run `33344541640` PASS.
- Dev Integration gate commit / final validated HEAD at completion: `92a6e77b`; final Dev Integration run `33344573404` PASS all 63 steps including B3/B4/B5/B6 ownership gates, stress, 288 cases, WebGL, live route smoke and production build/code split.
- Human validation: not required for B6. Persistent wheelspin evolution is numerically identical, clutch-dump behavior is explicitly covered across drivetrain classes, and the complete integration suite is green.
- Result: the order-dependent V21.29 traction→grip memory is gone; persistent wheelspin has one explicit owner and downstream systems only observe it.

---

### B7 — Review `legacyGripYawAcceleration` **[P1]**

Status: **DONE — 2026-08-30**

Question resolved:
- the legacy grip-loss yaw term is still useful only as a **narrow low-physical-authority fallback**;
- it is not allowed to compete with the R7+ per-wheel physical yaw solver once physical authority rises.

Required correction completed:
- reviewed the fallback across normal cornering, FWD power understeer, countersteer and handbrake/J-turn regimes;
- retained the narrow behavior but renamed/documented it as `gripLossFallbackYawAcceleration`;
- physical authority now progressively owns the transition, with R16/R21 suppression preventing opposing front-dominated fallback yaw;
- F1 physical-only behavior remains explicitly opted out of the legacy assist path.

Completion record:
- Source clarification commit: `b5511a86` — clarified grip-loss fallback yaw ownership.
- Permanent QA commit / validated B7 HEAD: `7ae77cd3` — added `qa-yaw-fallback-b7.mjs` and permanent B7 workflow coverage.
- Numerical QA: 30,000 deterministic fallback/authority samples, max equivalence error 0; low-authority fallback remains materially active where intended, then hands off to physical authority.
- Dedicated B7 run `33345155340`: PASS.
- Dev Integration run `33345155259`: PASS.
- Subsequent requested in-game maneuver/F1 validation: PASS on 2026-08-30.
- Result: no ambiguous legacy yaw owner remains; the retained fallback has a documented narrow authority regime and permanent regression coverage.

---

## CLEANUP C — Broader architecture consolidation

Goal: reduce historical implementation layers after low-risk and physics cleanup are stable.

### C1 — Flatten `vehicle-dynamics-base → v21.29 → vehicle-dynamics` **[P1/P2]**

Status: **DONE — 2026-08-30**

Resulting responsibility-based layers:
- `src/vehicle-dynamics-core.js` — generalized pure dynamics math/foundation;
- `src/vehicle-dynamics-traction-steering.js` — clutch-demand/wheelspin and R3/R13/R22 steering ownership;
- `src/vehicle-dynamics.js` — canonical public facade plus anti-roll/stationary-yaw/airborne wrapper behavior.

Correction completed:
- removed the historical filenames `src/vehicle-dynamics-base.js` and `src/vehicle-dynamics-v21.29.js`;
- kept the mathematical bodies behavior-equivalent while renaming boundaries by responsibility instead of release number;
- runtime composition continues to consume only `src/vehicle-dynamics.js`;
- migrated B4/B6/R23 source-location QA and CI triggers to the new owners;
- added a permanent C1 gate that forbids reintroduction of either historical filename in source, QA or CI.

Completion record:
- Ownership/reference audit branch `audit/vehicle-dynamics-c1`; audit run `33346403163`: PASS.
- First deterministic candidate run `33346748390`: all technical C1/steering/wheelspin/clutch/V21.30/V21.31, 288-case driving matrix, 80,000-sample stress and production-build checks passed; final workflow push alone failed because the Actions token could not modify workflow files.
- Final materialized candidate run `33347058877`: PASS including C1 ownership, R3/R13/R22, B4/B6, clutch and V21.30/V21.31 regressions, 288 driving cases, stress and production build.
- Historical layer removal commit: `84cc707a`.
- First permanent C1 gate run `33347179269` correctly exposed three stale ownership references (B4 CI, R23 CI and R23 QA); these were migrated instead of weakening the gate.
- Follow-up commits: `8c2fd391` (R23 QA), `ae5f588d` (B4 CI), `1d146e71` (R23 CI), `f85e03d5` (permanent C1 coverage extended to those ownership paths).
- Final permanent C1 gate run `33347258753`: PASS.
- Final Dev Integration run `33347258757`: PASS all 63 steps, including stress, 288 driving cases, R2–R20, forest/frame-pacing, WebGL, live route smoke, production build and code split.
- Human validation: not required for C1; the transformation is ownership/naming-only and the requested B3/R21–R23 in-game validations had already passed before C1.
- Result: version-number dynamics layers are gone; active ownership is visible from responsibility names and the runtime has one canonical import boundary.

---

### C2 — Flatten transmission controller layers **[P1/P2]**

Status: **IN PROGRESS — audit complete 2026-08-30**

Current layering before correction:
- `transmission-controller-base.js`
- `transmission-controller.js`

Audit findings:
- the only active source consumer of `transmission-controller-base.js` is the canonical `transmission-controller.js`; there is no independent runtime consumer that requires the base layer to remain;
- the base controller contains several forward-gear coercions such as `Number(x)||1`, so selector state `0` cannot remain Neutral inside that layer without the wrapper repairing it afterward;
- the current canonical wrapper already owns the authoritative selector contract `R=-1 / N=0 / D=1..N`, publishes the exact displayed gear to `transmission-network-state.js`, and the runtime bridge/multiplayer path preserve Neutral exactly;
- existing current-path D/N/R, body-relative transmission, clutch, wheelspin and multiplayer protocol regressions all pass on the pre-C2 baseline;
- `qa/V21_26_TRANSMISSION_REFACTOR_QA.mjs` is stale before C2: it still expects implementation ownership to reside directly in `transmission-controller.js` even though the heavy logic is currently hidden in the base layer, and it also carries the obsolete convention that EV forward may be represented by gear `0`. That historical assertion must be migrated rather than forcing the runtime back to an ambiguous Neutral/forward contract.

Required correction:
- consolidate selector/gear semantics in one canonical `transmission-controller.js`;
- remove `transmission-controller-base.js`;
- make Neutral explicitly owned as exact gear `0` rather than relying on post-update wrapper repair;
- preserve reverse `-1` and exact forward gear `1..N`;
- preserve clutch/free-rev/rev-limiter/autopilot behavior and body-relative drive direction;
- preserve multiplayer serialization and reverse-light behavior sourced from the exact authoritative gear;
- modernize stale V21.26 transmission QA to the current D/N/R contract;
- add a permanent C2 ownership/selector regression before integration.

Audit evidence:
- audit branch: `audit/transmission-c2`;
- ownership/current-regression audit run `33347455580`: PASS;
- expanded truth-check run `33347531229`: current D/N/R + multiplayer regressions PASS and production build PASS; the historical V21.26 refactor QA fails on the untouched pre-C2 architecture, proving it is stale rather than a C2 regression.

Implementation state:
- candidate branch `cleanup/transmission-c2` created;
- deterministic consolidation tooling staged, but no C2 source change has been integrated into `dev` yet;
- C2 remains open until candidate QA, stress/driving matrix/build, permanent C2 gate and final Dev Integration all pass.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### C3 — Flatten road geometry layers after A1 **[P2]**

Status: **TODO**

Current active layers include `road-geometry-base.js` + `road-geometry.js`.

Required correction:
- only after stale V21.31 alternate implementation is removed;
- decide whether base/facade split is still useful;
- prefer responsibility-based extraction over version-number filenames.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### C4 — Modernize forest file naming/layers **[P2]**

Status: **TODO**

Current active code contains historical names such as P9.29/P9.40/P9.41 even though those are now the production path.

Do this only after A5 and after performance remains stable.

Possible direction:
- canonical `forest-chunk-streamer-core.js`
- canonical `forest-chunk-streamer.js`
- canonical diagnostics module

Do not merge performance-sensitive code just for aesthetics.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### C5 — Reduce `main.js` size / responsibilities **[P2]**

Status: **TODO**

Audit size at creation: ~3247 lines / ~100 KB.

Potential extractions:
- app/bootstrap composition;
- route state + geographic transforms;
- settings lifecycle;
- renderer/frame-pacing setup;
- vehicle selection/runtime wiring;
- diagnostics publishing.

Rule:
- `main.js` should become a composition root, not another place containing vehicle/terrain/physics rules.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### C6 — Consolidate diagnostic globals **[P2]**

Status: **TODO**

Current runtime exposes many globals accumulated over development, including forest P9.xx aliases, physics shadow, traffic, multiplayer and wheelspin telemetry.

Proposed direction:

```js
globalThis.WorldDriveDiagnostics = {
  framePacing,
  forest,
  physics,
  traffic,
  multiplayer,
  wheelspin,
  streaming
};
```

Then keep temporary aliases only for a defined migration window if old QA requires them.

Completion record:
- Commit: _pending_
- QA: _pending_

---

# 4. Items intentionally NOT scheduled for immediate deletion

## Cache migrations

`src/cache.js` contains substantial legacy V5.2 migration logic. Keep for now unless we can establish a minimum supported upgrade version or instrument that migration paths are no longer used.

## Multiplayer compatibility upgrades

Functions such as legacy multiplayer payload/state upgrades should remain until protocol compatibility policy is explicitly defined.

## `electron/preload.cjs`

The static import audit may classify it as orphaned, but Electron loads it through `BrowserWindow.webPreferences.preload`; it is not dead solely because the JS import graph does not reference it.

---

# 5. Cleanup execution rules

These rules are mandatory while working this plan:

1. **No large rewrite.** Small commits with one architectural intent each.
2. **Never reduce visual quality merely to simplify/performance-tune cleanup.**
3. **Never tune vehicle grip to hide an architectural conflict.**
4. For physics changes, run at minimum relevant dedicated R-tests plus:
   - `qa/DEV_DRIVING_SIM_QA.mjs`
   - `npm run qa:stress`
   - production build
5. For changes touching core runtime/physics, run full `Dev Integration QA` before declaring completion.
6. If a stale QA is discovered, fix the QA before trusting green CI.
7. Old behavior tests should not force reintroduction of a bug; update/remove obsolete tests when their invariant is no longer valid and document why.
8. Keep temporary patchers/workflows out of final `dev` state.
9. Update this file after every completed item or material new discovery.
10. If implementation uncovers a new debt item, add it here immediately under the correct priority before moving on.

---

# 6. Recommended next task

**Next: C2 — Flatten transmission controller layers.**

Start with an ownership/semantic audit of `transmission-controller-base.js` and `transmission-controller.js`. Preserve exact D/N/R behavior, make Neutral explicit without wrapper repair, retain multiplayer transmission serialization compatibility, and add a permanent C2 regression before removing any layer.

---

# 7. Work log

## 2026-08-30 — C2 audit completed: transmission selector ownership

- Confirmed `transmission-controller-base.js` has only one active source consumer: the canonical controller wrapper.
- Confirmed the hidden base layer coerces non-forward selector values toward first gear, while the wrapper repairs `N=0` afterward.
- Established the authoritative current contract as `R=-1 / N=0 / D=1..N`, already preserved by multiplayer serialization and runtime lighting consumers.
- Current D/N/R, body-relative, clutch, wheelspin and multiplayer regressions PASS; audit runs `33347455580` and `33347531229`.
- Identified `V21_26_TRANSMISSION_REFACTOR_QA` as stale on the untouched pre-C2 baseline; its old implementation-location/EV-forward assumptions must be migrated, not used to retune runtime behavior.
- Candidate consolidation is on `cleanup/transmission-c2`; no C2 source change is on `dev` yet.

## 2026-08-30 — C1 completed: vehicle dynamics layers renamed by responsibility

- Audited all direct consumers of the historical base/V21.29 layers before changing ownership.
- Replaced release-number layering with `vehicle-dynamics-core.js`, `vehicle-dynamics-traction-steering.js` and the canonical `vehicle-dynamics.js` facade without retuning equations.
- The permanent C1 gate deliberately caught three stale B4/R23 ownership references after integration; all three were migrated and the gate was strengthened rather than relaxed.
- Final C1 gate `33347258753` PASS; final Dev Integration `33347258757` PASS all 63 steps.
- Next focus: C2 transmission-controller consolidation.

## 2026-08-30 — B7 completed: grip-loss fallback yaw ownership narrowed

- Reviewed the former `legacyGripYawAcceleration` role after R7–R23.
- Retained only the low-physical-authority fallback, renamed/documented its ownership and protected the physical-solver handoff with permanent QA.
- Dedicated B7 `33345155340` PASS; Dev Integration `33345155259` PASS.

## 2026-08-30 — B3 human validation completed

- User confirmed ID.4/i3 handbrake/J-turn continuity, WRX/Civic comparison and F1 high-speed steering/understeer behavior are all good in-game.
- B3 is now fully DONE; its automated ownership/equivalence evidence plus human driver-feel acceptance are both complete.

## 2026-08-30 — Grip R21: F1 high-speed front-slip counter-yaw

- Human validation of B3 exposed abnormal F1 behavior at high speed when the front axle lost grip: the chassis could appear to turn away from the intended trajectory.
- Full-runtime probe showed the F1 legacy front-force-loss yaw term reaching roughly -72 deg/s² at 220 km/h, -110 deg/s² at 260 km/h and -131 deg/s² near 300 km/h, versus only about +/-3–4 deg/s² on WRX/Countach.
- Root cause: R16 detected front saturation only from axle slip telemetry. On the F1 both axle slip values could saturate equally while the front retained materially less lateral force, letting the large opposing legacy yaw moment re-enter.
- R21 extends the R16 semantic filter with actual front/rear lateral-force retention scales. When the front axle is materially more force-limited and legacy yaw opposes the bicycle steering direction, that legacy counter-yaw is suppressed; real drift/countersteer remains owned by the per-wheel physical solver.
- Source commit on dev: `97e73d7d`; permanent R21 QA workflow commit/current validated code HEAD before this docs update: `434dd0bc`.
- Candidate run `33340074664`: PASS R21 full-runtime 180/220/260/300 km/h probe, R4/R7/R11/R12/R16/R19/R20, V21.31 stress, 288 driving cases and build.
- Permanent R21 workflow run `33340235290`: PASS. Final Dev Integration run `33340235275`: PASS all 60 steps.
- Required human check: F1 at roughly 220–300 km/h, provoke front understeer. It should plow/widen the line while continuing to yaw in the commanded direction; it must not pull/rotate opposite the steering/trajectory. Compare to WRX/Countach.
- B3 remains HUMAN VALIDATION PENDING.

## 2026-08-30 — B3 automation complete; human maneuver validation pending

- Extracted maneuver-specific transient state into `src/physics/maneuver-state.js` while preserving exact frame-order update points in the runtime.
- Added permanent ownership QA preventing maneuver-state from absorbing tire/yaw physics.
- Modernized one stale V21.27 handbrake QA to the current R4 semantics without changing runtime formulas.
- Candidate `33337076416` PASS; final Dev Integration `33337214381` PASS 60 steps.
- Hold B4 until ID.4/i3 handbrake/J-turn and WRX/Civic comparison are manually validated.

## 2026-08-30 — B2 completed: J-turn entry/latch/exit semantics made explicit

- Replaced the misleading instantaneous `jTurnTransientYawActive` naming with explicit entry, exit and latched-state helpers.
- Preserved all R19 thresholds and full-rotation behavior.
- Migrated R19 and Portland QA to distinguish entry eligibility from active maneuver state.
- Candidate run `33335558761` and final Dev Integration `33335628553` passed.
- No human test required for B2; B3 will require targeted human maneuver validation after automation.
- Next focus: B3 maneuver-state extraction.

## 2026-08-30 — B1 completed: dead post-spin steering authority removed

- Removed the V21.27-era no-op authority helper and four remaining ×1 runtime multipliers.
- Migrated two stale V21.28 QA that still imported the obsolete helper.
- Targeted runtime tests caught all hidden consumers before transfer to dev.
- Candidate run `33335148086` and final Dev Integration `33335226308` both passed.
- No human test required because B1 is numerically behavior-neutral.
- Next focus: B2 J-turn entry/latched/exit semantics.

## 2026-08-30 — A6/A7 completed: branding source unified and repository root cleaned

- Unified web, Electron, Squirrel/package and displayed branding around package metadata; development builds now identify as `V21.31 dev`.
- Removed the legacy DOM-wide version MutationObserver and all static application version labels from `index.html`.
- Archived historical cleanup/packaging notes and deleted obsolete version patch scripts plus the encoding backup.
- Added permanent A6 branding and A7 repository-hygiene gates to Dev Integration.
- Final A6 QA: `33334578131` PASS 58 steps. Final A7 QA: `33334825498` PASS 59 steps.
- Next focus: B1 physics architecture cleanup, starting with the no-op `postSpinSteeringAuthority`.

## 2026-08-30 — A5 completed: historical forest streamers retired

- Confirmed the live path is P9.29/P9.40/P9.41 and old P9.12/P9.28 streamers had no runtime ownership.
- Proved the P9.28 QA was stale, while migrating the still-useful P9.12 stress invariants to current-path tests.
- Renamed the active forest runtime mock so its filename now reflects what it really tests.
- Removed both historical streamer implementations and obsolete QA references in one atomic dev commit.
- Kept `forest-terrain-sampler-p912.js` because it remains an intentional active optimization dependency.
- Final Dev Integration QA passed all 57 steps.
- Next focus: A6 version/build branding consistency.

## 2026-08-30 — A4 completed: fully unreferenced orphan modules removed

- Audited exact imports, symbol references, build/tool references and dynamic loaders on a separate audit branch.
- Tightened the scanner after a substring false positive involving the active `forest-terrain-sampler-p912.js`.
- Removed the unused forest runtime pack, obsolete generic terrain sampler, embedded pine runtime payload and road metadata service.
- Full Dev Integration QA passed after all four deletions, including forest/frame pacing, roads, WebGL and production build/code split.
- Next focus: A5 historical P9.12/P9.28 forest streamer implementations and stale QA.

## 2026-08-30 — A3 completed: duplicate presentation wrapper removed

- Confirmed `src/vehicle-presentation-wrapper.js` and its `createAntiRollPresentation` export had no consumers.
- Deleted the duplicate wrapper; active anti-roll visual ownership remains in `src/vehicle-presentation.js`.
- Full Dev Integration QA passed after deletion, including anti-roll, suspension/jump/landing, R2–R20, WebGL and production build/code split.
- Next focus: A4 fully unreferenced orphan modules.

## 2026-08-30 — A2 completed: retired WRX-only authority bridge

- Confirmed the V21.27 WRX authority bridge was absent from the runtime graph and its three QA files validated abandoned WRX-only architecture.
- Added a permanent modern WRX tire-stability test against the common R7+ tire/per-wheel path.
- Preserved useful tire progression/load-balance invariants without recreating obsolete handbrake assumptions already superseded by R18/R20.
- Deleted the old WRX authority controller and all three authority-specific QA files.
- Full Dev Integration QA passed after deletion, including R2–R20, WebGL, live route smoke and production build/code split.
- Next focus: A3 duplicate vehicle presentation wrapper.

## 2026-08-30 — A1 completed: active road QA truthfulness

- Measured the banking semantics of the active `src/road-geometry.js` implementation before changing tests.
- Migrated four deterministic V21.31 road QA files plus the live route preset stress test away from obsolete `src/road-geometry-v21.31.js`.
- Updated obsolete ~1.5°/flat-hairpin expectations to the active engineered banking envelope (up to 6° on persistent tight curves, 1° straight crossfall cap).
- Deleted `src/road-geometry-v21.31.js`.
- Full Dev Integration QA passed after deletion, including R2–R20, live route smoke, WebGL, production build and code split.
- Next focus: A2 dead WRX authority bridge.

## 2026-08-30 — Plan created

- Completed static code-debt audit on temporary branch `audit/code-debt-r20`.
- Confirmed 9 browser-runtime orphan modules.
- Confirmed stale V21.31 road QA imports obsolete `road-geometry-v21.31.js`.
- Confirmed historical WRX authority controller is no longer runtime-reachable but still held alive by old QA.
- Confirmed duplicate dead `vehicle-presentation-wrapper.js`.
- Identified hidden wheelspin module-global state and duplicated wheelspin authority as a future physics architecture risk.
- Identified version mismatch across browser/package/Electron.
- Created this persistent cleanup plan on `dev`.


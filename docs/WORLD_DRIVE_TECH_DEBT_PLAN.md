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

Status: **TODO**

Problem:
- `jTurnTransientYawActive()` historically sounded like an active-state predicate;
- after R19, actual maneuver state is latched and the old condition is really closer to an **entry eligibility** condition;
- misuse of the old predicate contributed to the 90° wall returning.

Required correction:
- rename toward `jTurnEntryEligible()` or equivalent;
- make entry predicate, latched state, and exit condition explicit and separate;
- preserve R19 full rotation regression.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### B3 — Extract maneuver state from `driving-runtime-base.js` **[P0/P1]**

Status: **TODO**

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
- Commit: _pending_
- QA: _pending_

---

### B4 — Extract momentum-direction ownership **[P0/P1]**

Status: **TODO**

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
- Commit: _pending_
- QA: _pending_

---

### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**

Status: **TODO**

Proposed module:
- `src/physics/yaw-authority.js`

Owns:
- transition between normal bicycle-model yaw and per-wheel force-authoritative yaw;
- `forceDominatedDrift` decision;
- `driftKinematicCoupling` semantics;
- legacy grip-yaw fallback only if still demonstrably required.

Goal:
- make it impossible for multiple hidden yaw authorities to simultaneously fight each other.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### B6 — Eliminate hidden wheelspin state and duplicate authority **[P0]**

Status: **TODO**

Problem:
- `vehicle-dynamics-v21.29.js` stores module-global intermediates such as:
  - `latestRawDriveDemandAccel`
  - `latestAppliedDriveAccel`
- one call writes them and another later call consumes/reset them;
- this creates order-dependent behavior.
- `driving-runtime.js` also has its own wheelspin state/hold/grip behavior, so wheelspin authority is split.

Required correction:
- pass explicit values into tire-grip evaluation:
  - requested propulsion acceleration;
  - applied propulsion acceleration;
  - clutch state/shock where relevant;
- remove module-global handoff;
- decide one authoritative wheelspin state path;
- keep visual/audio/skid consumers as observers, not alternate physics authorities.

Acceptance:
- wheelspin result does not depend on unrelated call order;
- clutch-dump, FWD, RWD, AWD and truck cases remain correct.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### B7 — Review `legacyGripYawAcceleration` **[P1]**

Status: **TODO**

Question to answer:
- Is it still physically required after R7–R20, or only acting as a fallback from the old architecture?

Required correction:
- instrument/compare with and without it in normal cornering, FWD power understeer, countersteer and handbrake/J-turn;
- remove if redundant;
- if retained, rename and document the exact narrow regime where it is authoritative.

Completion record:
- Commit: _pending_
- QA: _pending_

---

## CLEANUP C — Broader architecture consolidation

Goal: reduce historical implementation layers after low-risk and physics cleanup are stable.

### C1 — Flatten `vehicle-dynamics-base → v21.29 → vehicle-dynamics` **[P1/P2]**

Status: **TODO**

Current layering:
- `vehicle-dynamics-base.js`
- `vehicle-dynamics-v21.29.js`
- `vehicle-dynamics.js`

Problem:
- fixes can be applied to the wrong layer (this already happened during R13 work);
- ownership of active behavior is difficult to see.

Required correction:
- after B-series cleanup, consolidate into a canonical module or a small set of responsibility-based modules;
- preserve compatibility only at import boundary if needed temporarily.

Completion record:
- Commit: _pending_
- QA: _pending_

---

### C2 — Flatten transmission controller layers **[P1/P2]**

Status: **TODO**

Current layering:
- `transmission-controller-base.js`
- `transmission-controller.js`

Audit note:
- base controller often assumes forward gears are `>=1` using patterns like `Number(x)||1`;
- current D/N/R wrapper repairs selector semantics, but this is an implicit fragile contract.

Required correction:
- consolidate selector/gear semantics in one controller;
- represent Neutral explicitly without depending on wrapper repair;
- add regression for exact D/N/R state and multiplayer transmission serialization.

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

**Next: B2 — make J-turn semantics explicit by separating entry eligibility, latched active state and exit conditions while preserving R19 behavior exactly.**

Start as a behavior-neutral refactor: rename `jTurnTransientYawActive()` to `jTurnEntryEligible()`, move the active-state exit checks into a clearly named helper, migrate R19 QA, and run R9/R17/R18/R19/R20 plus the complete Dev Integration suite before any later extraction into B3.

---

# 7. Work log

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


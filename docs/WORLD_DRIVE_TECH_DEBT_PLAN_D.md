# World Drive — Post-C6 Technical Debt Audit / Plan D

Date: 2026-08-31
Audit base: `dev` @ `c24c9b3112031378eb3d8f86720852fea09a41ad`
Stable release: `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`
Status: **AUDIT COMPLETE — Plan D ready; no runtime change made by this audit**

## 1. Context

C6 is complete and human gameplay validation passed. The validated post-C6 code was promoted to `main`; the stable branch differs from development only by `package.json -> worldDriveChannel` (`stable` on `main`, `dev` on `dev`).

A fresh read-only audit was then performed on the new `dev` baseline. The purpose was not to continue cleanup by inertia, but to determine what technical debt still materially exists after Cleanups A, B and C.

The current codebase no longer exposes the same class of obvious dead/orphan runtime modules that drove Cleanup A. Current Dev Integration also runs the runtime import/debt audit, repository hygiene checks, ownership checks, full stress, the 288-case driving matrix, terrain/traffic/forest regressions, multiplayer WebGL paths and production build successfully on the new development baseline.

The dominant remaining debt is now **active historical layering**: current behavior is still composed through files named after old release/prototype stages even though those files remain legitimate runtime owners.

This is an ownership/readability problem first, not evidence of broken behavior.

## 2. Audit findings

### 2.1 Historical layers that remain active

#### Road furniture

Current path:
- `road-furniture.js`
- -> `road-furniture-p937.js`
- -> `road-furniture-p930.js`

This is real composition, not dead code. P9.30 owns sign construction/incremental work; P9.37 adds coalesced idle scheduling and the combined road-sign diagnostic snapshot.

#### Scenery renderer

Current path:
- `scenery-renderer.js`
- -> `scenery-renderer-p933.js`
- -> `scenery-renderer-p9.js`

The upper layer still owns real route-aware startup forest readiness semantics (historical P9.33/P9.34/P9.35), including front/rear directional coverage and startup timeout behavior.

#### Terrain

Current path:
- `terrain.js`
- -> `terrain-p926.js`
- -> `terrain-p925.js`

All three layers are functional:
- P9.25 base terrain/road-bed implementation;
- P9.26 distant horizon preparation/commit;
- current layer adds P9.27 road-transition preparation and frame-budgeted installation.

This is performance-sensitive and must not be flattened as a cosmetic cleanup.

#### Local-world builder

Current path:
- `local-world-builder.js`
- -> `local-world-builder-p926.js`
- -> `local-world-builder-p925.js`

The current layer owns real P9.37/P9.38 behavior: staged road-mesh preparation, prepared commit replay, forest retention and interaction with terrain transition preparation.

The retained `__WORLD_DRIVE_P923_LOCAL_WORLD__` bridge is an active streaming contract and remains intentionally out of cosmetic cleanup scope.

#### Imagery

Current path:
- `imagery.js`
- -> `imagery-p913.js`

The upper layer owns real modern behavior: rendered-ground sampling aligned to visible terrain/road geometry and reduced route-ahead prefetch pressure while visible imagery retains full-quality composition.

#### Multiplayer visuals

Current path:
- `multiplayer-visuals.js` — lazy facade / code-split boundary
- -> `multiplayer-visuals-m3.js` — authored remote presentation, smoothing and adapter pipeline
- -> `multiplayer-visuals-v18.js` — support chassis / terrain support solver

The historical `v18` filename is especially misleading: its current responsibility is a support layer for the modern multiplayer visual pipeline, not a V18 implementation.

#### Vehicle presentation

Current path:
- `vehicle-presentation.js`
- -> `vehicle-presentation-v21.29.js`

The versioned file still owns core suspension/airborne/landing presentation while the public wrapper adds modern anti-roll visual coupling. This is a strong ownership-cleanup candidate, but it is visual/physics-adjacent.

#### Driving runtime

Current path:
- `driving-runtime.js`
- -> `driving-runtime-base.js`

The public layer now owns substantial modern behavior around transmission runtime state, clutch/service-brake handling, wheelspin persistence, authoritative brake/reverse presentation, traffic integration and truck low-speed torque behavior. The base layer remains large and active. This boundary should be audited by responsibility before any flattening.

#### Audio

Current path:
- `audio.js`
- -> `audio-base.js`

The public layer adds skid-linked tire audio and filtering on top of the base vehicle audio engine. This is a real responsibility split; the generic `base` name is the debt, not necessarily the existence of two modules.

#### Streaming coordinator

Current path:
- `streaming-coordinator.js`
- -> `streaming-coordinator-p913.js`

The public layer adds prepared-world refreshes, scenery-only refresh paths, adaptive hitch handling, visual-job attribution, imagery guards and live P9.23 local-world bridge consumption. This is one of the most performance-sensitive remaining chains.

### 2.2 Intentionally retained compatibility / migration surfaces

Do not remove merely to make the repository look cleaner:

- V5.2 localStorage -> IndexedDB cache migration in `cache.js` until a minimum supported upgrade version is explicitly established;
- multiplayer legacy packet/state upgrade paths until protocol compatibility policy is explicitly changed;
- `electron/preload.cjs`, which Electron loads outside the browser import graph;
- `__WORLD_DRIVE_P923_LOCAL_WORLD__`, an active streaming runtime bridge;
- C6-approved diagnostic aliases and traffic direct-local compatibility surfaces;
- platform scheduling fallbacks/polyfills.

### 2.3 `main.js`

`main.js` remains large, but the C5 closure conclusion still holds. Its remaining large responsibilities are predominantly composition plus frame/route/terrain-sensitive runtime coordination. No new low-risk extraction is justified solely to lower the line count.

## 3. Plan D priority order

### D1 — Rename multiplayer visual support layers by responsibility [P1]

Goal: remove misleading historical filenames without altering lazy loading, bundle splitting, terrain support, authored GLB parity or network rendering.

Initial target:
- replace `multiplayer-visuals-v18.js` with a responsibility name such as `multiplayer-visual-support.js`;
- audit whether `multiplayer-visuals-m3.js` should similarly become an authored-presentation responsibility name, but do not combine that rename automatically with the first change.

Required validation:
- multiplayer support math/registry QA;
- M3 protocol/shared traffic QA;
- M4 authored adapter QA;
- M4.14 authored reverse WebGL;
- M4.15 network-to-WebGL reverse;
- production code-split QA;
- full Dev Integration before completion.

Why first: high clarity gain, small likely runtime diff, strong existing QA.

### D2 — Modernize road-furniture ownership names [P1/P2]

Goal: eliminate `p930`/`p937` production naming while preserving two legitimate responsibilities: sign construction and idle/coalesced scheduling.

Prefer responsibility-based modules rather than one large merge if separation remains useful.

Required validation:
- P9.30 sign construction/runtime invariants;
- P9.37 idle scheduling/coalescing;
- C5.4 geographic sign orchestration;
- minimap/HUD 5 s sign readout + fade/rearm;
- C6 road-sign diagnostics;
- stress/build.

### D3 — Modernize vehicle-presentation version layer [P2]

Goal: remove `vehicle-presentation-v21.29.js` as a historical production filename and establish explicit core/public ownership for suspension, airborne/landing and anti-roll presentation.

Do not tune suspension, anti-roll strength, wheel support or vehicle dimensions as part of this cleanup.

Required validation:
- suspension and airborne regressions;
- anti-roll visual/balance QA;
- crest/jump/landing and oblique-landing regressions;
- road re-entry support (R14);
- 288 driving cases + stress;
- human visual/handling spot-check after integration.

### D4 — Modernize scenery-renderer ownership names [P2]

Goal: replace `scenery-renderer-p9.js` / `scenery-renderer-p933.js` historical ownership names with responsibility names while preserving the startup readiness gate and forest rendering behavior exactly.

Required validation:
- forest startup readiness and directional coverage;
- active forest stress/runtime;
- frame-pacing/hitch attribution stack;
- route load/startup UI;
- production build;
- human startup/forest spot-check if implementation touches more than imports/names.

### D5 — Review generic base-layer names: audio and driving runtime [P2]

#### D5a — Audio

Audit whether `audio-base.js` can be renamed to an explicit engine/core responsibility without altering sound behavior. Avoid flattening unless the audit proves the separation adds no value.

#### D5b — Driving runtime

Perform a read-only ownership map of `driving-runtime-base.js` vs `driving-runtime.js`. Do not merge first and analyze later.

Any source change here is physics/runtime-sensitive and must preserve:
- D/N/R and exact gear publication;
- service brake independence;
- clutch and clutch-shock behavior;
- persistent wheelspin ownership;
- authoritative brake/reverse lights;
- traffic integration;
- truck low-speed torque behavior;
- R2-R23 accepted driving invariants.

### D6 — Terrain / imagery / local-world / streaming architecture [P3 — deferred]

This is the largest remaining historical-layer cluster and also the most dangerous to disturb.

Scope includes:
- `terrain-p925.js` / `terrain-p926.js` / `terrain.js`;
- `imagery-p913.js` / `imagery.js`;
- `local-world-builder-p925.js` / `local-world-builder-p926.js` / `local-world-builder.js`;
- `streaming-coordinator-p913.js` / `streaming-coordinator.js`;
- eventual deliberate replacement of the P9.23 global runtime bridge if architecture warrants it.

Do not start D6 as a cosmetic rename sweep. First create subsystem-specific ownership diagrams/contracts and freeze performance-sensitive budgets and commit ordering in QA. Human long-route validation is mandatory for any material D6 integration.

## 4. CI / QA maintenance note

The repository now has many dedicated historical cleanup workflows in addition to the comprehensive Dev Integration workflow. They remain useful as path-scoped permanent boundary gates, so they should not be deleted simply because A/B/C are complete.

A later CI-hygiene audit may consolidate workflow definitions only if it proves the same path-triggered protection and exact ownership checks remain. This is lower priority than correcting misleading active production ownership names.

## 5. Execution rules for Plan D

1. Start every D item with a read-only writer/import/QA ownership audit.
2. Prefer responsibility renames/extractions over behavioral rewrites.
3. One historical chain per candidate branch.
4. Preserve visual quality, physics and frame-pacing values exactly unless a separate user-requested behavior change exists.
5. Modernize stale QA source-location assertions instead of restoring obsolete architecture.
6. Candidate QA must be green before integration to `dev`.
7. Full Dev Integration must pass on the actual integrated `dev` HEAD.
8. Performance-sensitive terrain/streaming changes require human long-route validation.
9. Keep `main` stable; Plan D work happens on `dev` and narrow candidate branches.
10. Update this document after every completed D item or material audit discovery.

## 6. Recommended next task

**D1 — read-only multiplayer visual support ownership audit, then responsibility-only rename of `multiplayer-visuals-v18.js` if the audit confirms no hidden consumer.**

Do not alter rendering math, smoothing, GLB loading, lazy code splitting or network packet behavior during D1.

# World Drive — Canonical Development & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable rollback/reference: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

GitHub live state + this file override chat memory when they disagree.

This file is intentionally written for a future ChatGPT session that must resume the project with little or no conversational context. It therefore records not only what to do, but also why, what is already certified, what must not be touched, how to validate each block, and the exact current next action.

---

# 0. Mandatory restart protocol

At the start of **every** World Drive coding / architecture / QA conversation:

1. Read this file from current `dev` **before modifying anything**.
2. Read live HEADs of `dev` and `main`.
3. Inspect the latest `Dev Integration QA` for the **exact current `dev` HEAD**.
4. Inspect open GitHub issues and the **Current checkpoint / Active block** below.
5. If chat memory conflicts with GitHub or this file, trust GitHub + this file.
6. Resume the exact **Next action** unless the user explicitly changes priority.
7. Never move `main` without explicit user approval.
8. Human-visible FAIL overrides green automation.
9. One intent per commit. Do not mix behavior, dependency/security maintenance, Actions upgrades, file moves or unrelated cleanup.
10. Use the certified work pattern:

```text
read-only audit
→ dedicated candidate when runtime/behavior/security risk exists
→ focused QA
→ permanent regression coverage
→ exact-head Dev Integration
→ human checkpoint when visuals/runtime/physics/performance can change
→ integrate to dev
→ exact-head Dev Integration again
→ update this plan
```

11. Do not ask the user to test until the candidate has passed its targeted automated QA unless the test itself is explicitly diagnostic.
12. Do not report a block as DONE until its final `dev` HEAD is known and the exact-head QA state is verified.

## Fast restart checklist

A future session should be able to answer these five questions before work begins:

- What is `dev` HEAD?
- What is `main` HEAD?
- Is the exact `dev` HEAD green in Dev Integration?
- What is the active development block?
- What behavior is protected from incidental change?

If any answer is unknown, resolve it before coding.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **post-refactor hardening and correctness**  
**Architecture state:** **R1–R9 + Phase O DONE/CERTIFIED; R8 architecture FROZEN**  
**Runtime correction state:** issues #4 and #8 CLOSED / HUMAN PASS  
**Issue #2:** OPEN / watch-only / not reproduced  
**Certified `dev` baseline before this plan update:** `d1a5be3b4c547dc34ea4d396dcda0e383fa87268` — `Docs: close issue 8 correction backlog`  
**Exact-head Dev Integration on that baseline:** run `33814182310` — **PASS 100/100 functional steps**  
**Stable `main`:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — unchanged.

The codebase-wide post-refactor review found no systemic reason for another broad architecture refactor. The current architecture is usable and well covered. The next work is a set of **narrow correctness, security and runtime-efficiency blocks**, in priority order.

## Exact next action

Start **Block 1 — safe DOM rendering for network/user-derived text**.

Do not combine it with route concurrency, transition retirement, multiplayer hardening or any structural move.

---

# 2. Why this new plan exists

After the R1–R9 refactor and the issue #4/#8 correction work, a complete static review was performed across the current runtime tree, including:

- `src/main.js` composition root;
- app settings and diagnostics;
- input and UI;
- routing and geocoding;
- physics, wheel support and transmission;
- terrain, imagery, local-world and streaming;
- scenery/forest/water;
- vehicles and GLB presentation;
- browser multiplayer and LAN relay;
- Electron main/preload/runtime;
- Vite/build/packaging;
- source-tree and integration QA.

The review conclusion:

1. **No broad refactor is justified now.**
2. Physics/transmission/bridge support are currently stable; do not retune them casually.
3. There are a few concrete issues worth fixing one at a time.
4. One retired visual pipeline still consumes runtime work even though its output is hidden.
5. Some diagnostics should become more accurate before relying on them to debug issue #2.
6. Multiplayer/Electron security can be hardened without changing gameplay semantics.

---

# 3. Audit findings ledger

This table is the canonical forward backlog. Status must be updated here after each completed block.

| Priority | Finding | Primary files | Current status |
|---|---|---|---|
| P1 | Network/user-derived labels are inserted through `innerHTML` in parts of UI | `src/ui/route-planner-ui.js`, `src/ui/startup-ui.js`, possibly related UI helpers | **ACTIVE — Block 1** |
| P1 | Route creation can overlap; route generation exists but async continuations are not stale-guarded | `src/routing/route-lifecycle.js` | PLANNED — Block 2 |
| P2 | Retired `road-terrain-transition` is hidden but still prepared/allocated/committed | `src/terrain.js`, `src/local-world-builder.js`, `src/terrain/world-scene.js` | PLANNED — Block 3 |
| P2 | `visualJobs` timing records Promise creation time instead of full async completion time | `src/streaming-coordinator.js` | PLANNED — Block 4 |
| P2 | LAN WebSocket relay accepts broad LAN traffic with permissive handshake and no explicit session/rate/client policy | `server/multiplayer-server.mjs`, `electron/multiplayer-runtime.cjs` | PLANNED — Block 5A |
| P2 | Electron multiplayer IPC does not explicitly verify caller origin | `electron/main.cjs`, `electron/preload.cjs` | PLANNED — Block 5B |
| P3 | Overpass allowlists/proxy limits differ between Vite, browser transport and Electron | `vite.config.js`, `src/services/desktop-overpass-transport.js`, `electron/main.cjs`, `src/services/overpass.js` | PLANNED — Block 6 |
| P3 | `scene.add` is monkey-patched only to hide an already-retired transition | `src/terrain/world-scene.js` | Resolve together with Block 3 |
| P3 | `src/main.js` remains large composition root | `src/main.js` | **DEFERRED — no refactor without concrete benefit** |

## Severity meaning

- **P1**: correctness/security issue that should be handled before new feature work unless the user changes priority.
- **P2**: meaningful robustness/performance/diagnostic debt; fix after P1 blocks.
- **P3**: maintenance quality; do only when it naturally fits a proven block.

---

# 4. Development roadmap

## Block 1 — Safe DOM rendering for network/user-derived text

### Goal

Ensure any string originating from a remote service, route label, vehicle metadata or user-editable input is rendered as text unless HTML is fully static and controlled by World Drive.

### Known audit evidence

`src/routing/geocoding.js` accepts Nominatim `display_name`. `src/ui/route-planner-ui.js` currently places `p.name` into `innerHTML`. `src/ui/startup-ui.js` also interpolates route and vehicle strings into HTML templates.

### Expected implementation scope

Primary audit targets:

```text
src/ui/route-planner-ui.js
src/ui/startup-ui.js
src/ui/v21-menu.js
src/ui/minimap.js
```

Search the rest of runtime UI for dynamic `innerHTML` / `insertAdjacentHTML` / template-string DOM insertion before changing code.

### Rules

- Prefer `textContent`, `createElement`, `append`, `replaceChildren`.
- Static World Drive markup may remain `innerHTML` if it contains no dynamic/untrusted interpolation.
- Do not sanitize by fragile regex if text rendering solves the problem.
- Preserve exact visual layout and labels.
- Do not alter geocoding behavior, route selection or vehicle metadata semantics.

### Candidate

Use a dedicated candidate, e.g.:

```text
candidate/post-refactor-dom-safety-r1
```

### Required QA

Add focused permanent QA that proves:

- remote place names are not inserted as executable markup;
- route/vehicle labels remain displayed correctly;
- static menu HTML remains allowed where appropriate;
- no UI contract regression.

Also run:

```text
R7 UI boundary QA
R7 routing boundary QA
DEV_INTEGRATION_AUDIT.mjs
production build
production code split QA
```

### Human checkpoint

A quick visual smoke is required only if markup construction changes visible layout. Test route search results, startup vehicle chooser and route summary.

### Done when

Candidate QA green → human smoke if needed → integrate to `dev` → exact-head Dev Integration green → update this plan.

---

## Block 2 — Route lifecycle stale-generation guard

### Goal

Prevent an older asynchronous route creation from committing after a newer route request has already started.

### Problem model

`routeLifecycle.worldDrive.route.generation` already exists and `createRequestedRoute()` bumps it, but asynchronous continuations do not consistently verify that the operation still owns the active generation.

A slow earlier route can theoretically finish after a later route and mutate:

- route/segments;
- loading/status UI;
- DEM/imagery startup;
- final placement;
- scenery/metadata/sign prefetch.

### Implementation rule

Capture an operation generation/token at route creation start and verify it after meaningful `await` boundaries and before authoritative commits/UI completion.

Stale work should stop quietly and must not:

- overwrite the active route;
- hide/show loading UI incorrectly;
- reset the newer world;
- place the vehicle on the older route;
- emit misleading success/failure toast.

### Non-goals

- Do not change route providers.
- Do not retune routing timeout values unless a separate causal issue is proven.
- Do not modify forest readiness or terrain preload behavior.

### Required QA

Create a deterministic race test:

1. start route A;
2. before A resolves, start route B;
3. resolve B first;
4. resolve A later;
5. assert B remains authoritative and stale A cannot commit.

Run R7 routing/UI, route-start placement R8, forest readiness R8, Dev Integration and build.

### Human checkpoint

Recommended: in-game rapidly request two different presets/routes and confirm only the second becomes active.

---

## Block 3 — Stop generating the retired road-terrain transition presentation

### Goal

Eliminate CPU/allocation/commit work for `road-terrain-transition` now that human A/B proved the main refined ground is visually better without it.

### Current certified behavior

Issue #4 is CLOSED/HUMAN PASS because:

```text
road-terrain-transition
road-terrain-transition-p927-hold
```

are forced `visible=false` in `src/terrain/world-scene.js`.

The geometry generation remains alive only as a minimal-risk historical holdover.

### Why this block is separate

This changes streaming workload. It can improve frame pacing but must not accidentally change terrain state/road-bed physics or the protected P9.25/P9.26 terrain behavior.

### Required method

**Measure first.** Before candidate change, capture baseline diagnostics on a known route with several world refreshes:

- transition preparations;
- transition commits;
- transition max slice/commit timing;
- `visualJobs` road-transition activity;
- frame/hitch counts;
- local-world prepared commit timings.

Then make the narrowest candidate that disables **presentation preparation/commit only** while keeping road-bed state and terrain/physics authority intact.

Preferred final state:

- no transition mesh allocation;
- no transition geometry CPU work;
- no `road-transition` visual job;
- no global `scene.add` interception solely for this retired layer;
- identical Photo ON/OFF terrain and identical wheel support.

### Do not do

- Do not retune terrain heights.
- Do not remove protected road-bed state logic just because names contain “transition”.
- Do not edit road geometry/physics.
- Do not delete historical code until runtime ownership is proven unnecessary and QA is permanent.

### Required QA

- issue #4 regression gate;
- R8 terrain/world-scene/local-world/streaming source-tree QA;
- R8 baseline aggregate;
- frame-pacing QA;
- production build/code split;
- exact-head Dev Integration.

### Human checkpoint — mandatory

Photo OFF + Photo ON on:

- Manic-2 → Manic-5;
- Yungas / steep road;
- at least one bridge/large elevation change.

Also confirm no terrain-over-asphalt wedges/holes.

---

## Block 4 — Accurate asynchronous visual-job diagnostics

### Goal

Make `visualJobs` instrumentation measure actual asynchronous completion time, not merely synchronous Promise creation time.

### Why it matters

Issue #2 is watch-only and future debugging depends on reliable timing attribution. Incorrect async measurements can misidentify or hide the source of a hitch.

### Implementation concept

`src/streaming-coordinator.js` should distinguish:

- synchronous execution duration;
- asynchronous wall duration until Promise settles;
- success/failure;
- optional resolved job key/reason.

Avoid double-counting and preserve existing diagnostic aliases/contracts.

### Required QA

Use deterministic jobs:

- sync job taking measurable time;
- Promise job resolved after controlled delay;
- rejected Promise;
- thrown sync error.

Assert metrics reflect expected ownership without changing scheduling policy.

Run frame-runtime attribution, hitch attribution, R8 streaming baseline and Dev Integration.

### Human checkpoint

Not required if runtime scheduling policy is unchanged. If any scheduling behavior changes accidentally, stop and split the work.

---

## Block 5A — LAN multiplayer relay hardening

### Goal

Harden the existing presentation-only LAN relay without changing multiplayer protocol semantics or introducing accounts/cloud dependencies.

### Audit scope

Keep standalone and Electron relay behavior aligned:

```text
server/multiplayer-server.mjs
electron/multiplayer-runtime.cjs
```

### Candidate hardening areas

Evaluate in a read-only audit before implementation:

- explicit WebSocket path;
- allowed Origin policy suitable for browser/Electron LAN use;
- max clients;
- max messages/second per client;
- stricter mask/frame/protocol validation;
- maximum text payload and aggregate buffer size;
- cleanup on malformed/abusive frames;
- consistent standalone/Electron state sanitation.

### Non-goals

- no Internet matchmaking;
- no authentication system unless user explicitly requests it;
- no collision/server physics;
- no protocol redesign unless required by a proven issue.

### Required QA

Existing R2 multiplayer + live shared traffic + protocol contract tests, plus new malformed-frame/rate/client-limit coverage.

Human LAN smoke required after any handshake behavior change.

---

## Block 5B — Electron IPC caller-origin validation

### Goal

Ensure multiplayer IPC methods are accepted only from the trusted World Drive renderer origin.

### Scope

```text
electron/main.cjs
electron/preload.cjs
```

Electron already uses:

- `nodeIntegration:false`;
- `contextIsolation:true`;
- `sandbox:true`;
- `webSecurity:true`;
- blocked unexpected navigation/permissions.

Add an explicit caller validation layer around multiplayer IPC without broad Electron changes.

### Required QA

- trusted app origin can host/join/stop/status;
- synthetic/untrusted sender is rejected;
- desktop packaging/build remains green.

Human Windows multiplayer smoke recommended.

---

## Block 6 — Overpass proxy/configuration consistency

### Goal

Make browser-dev and Electron proxy allowlists/limits consistent and easier to reason about.

### Current drift

Different files currently know slightly different Overpass mirror lists and request-body limits.

Audit:

```text
src/services/overpass.js
src/services/desktop-overpass-transport.js
vite.config.js
electron/main.cjs
```

### Rules

- Do not restore Overpass as a mandatory primary hydro source.
- Preserve local-first Quebec hydro behavior.
- Preserve graceful failure/fallback semantics.
- Add bounded request body handling to Vite dev proxy if needed.
- Prefer one canonical allowlist definition only if doing so does not create an awkward browser/Node coupling; otherwise add permanent parity QA.

### Human checkpoint

Only required if browser/Electron network behavior changes visibly.

---

## Block 7 — Composition root reduction: deferred, evidence-driven only

`src/main.js` remains large. That is known debt, but the current refactor already extracted the major domain owners.

Do **not** begin another broad `main.js` decomposition merely to reduce line count.

A future extraction is allowed only when one of these is true:

- a concrete feature repeatedly requires editing the same coherent state/lifecycle cluster;
- a bug is caused by ownership ambiguity;
- testability is materially blocked by composition-root coupling;
- measurable startup/runtime improvement requires extraction.

Any such future block must name the exact responsibility being extracted and preserve the R9 root-layout and Phase O naming contracts.

---

# 5. Issue #2 watch-only protocol

Issue #2 — intermittent delayed terrain adjustment after route startup — remains **OPEN / NOT REPRODUCED / NO SPECULATIVE FIX**.

If it reappears, capture diagnostics **before the world converges**:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
localWorldPhases
p923
visualJobs
p939HitchAttribution
```

After Block 4, prefer the improved async visual-job timing in that evidence.

Do not tune terrain/imagery/streaming just to “see if it helps”. A correction requires reproducible evidence.

---

# 6. Certified architecture — preserve this unless a new plan block explicitly changes it

## R1–R7 — DONE

- source-root audit: DONE;
- multiplayer: DONE automation + human PASS;
- traffic: DONE automation + human PASS;
- vehicles/presentation/models/truck: DONE automation + human PASS;
- audio: DONE automation + human PASS;
- vehicle dynamics / wheel-ground / transmission ownership: CLOSED/CERTIFIED;
- road furniture/signs and road geometry/bridges: DONE;
- scenery moved; forest stays at accepted owner;
- water structural move was HUMAN FAIL and rolled back; water stays at accepted owner;
- Quebec local-first hydro / issue #3: DONE + human PASS;
- app/input/UI/routing/services: DONE automation + human PASS.

## R8 terrain / imagery / local-world / streaming — FROZEN

Current certified ownership:

```text
src/imagery.js
  -> src/imagery/imagery-p913.js

src/streaming-coordinator.js
  -> src/streaming-coordinator-p913.js
  -> src/streaming/streaming-coordinator-p913.js

src/local-world-builder.js
  -> src/local-world-builder-p926.js
  -> src/local-world/local-world-builder-p926.js
  -> src/local-world-builder-p925.js          # KEEP ROOT / protected

src/terrain.js                                 # KEEP ROOT / current P9.27 owner
  -> src/terrain-p926.js
  -> src/terrain/terrain-p926.js
  -> src/terrain/terrain-p925.js
  -> src/terrain-p925.js                       # KEEP ROOT / protected

src/world-scene.js
  -> src/terrain/world-scene.js

src/world-materials.js
  -> src/terrain/world-materials.js

src/elevation.js                               # KEEP ROOT / hot DEM owner
```

R8 structural moves are complete. No organization-only R8 moves are planned.

## R9 root cleanliness — DONE/CERTIFIED

Permanent gate:

```text
qa/qa-r9-root-cleanliness.mjs
.github/workflows/qa-r9-root-cleanliness.yml
```

## Phase O naming boundary — DONE/CERTIFIED

Keep current historical runtime lineage. Do not introduce new milestone/version-stamped runtime filenames casually.

---

# 7. Closed correction evidence that must not be lost

## Issue #4 — Photo OFF black procedural terrain patches

**CLOSED / HUMAN PASS.**

The black patches were isolated to the legacy `road-terrain-transition` presentation layer. Shadow, stencil, winding, shading-floor, vertex-color and polygon-offset probes were non-causal. An unlit fixed material removed the black, and hiding the transition entirely looked better in Photo OFF and Photo ON.

Current final correction:

```text
src/terrain/world-scene.js
```

sets the transition groups `visible=false` when added.

Block 3 may remove their **presentation workload**, but must preserve terrain/road-bed state and the human-approved visuals.

## Issue #8 — elevated road/bridge wheel support bleed

**CLOSED / HUMAN PASS.**

Measured pre-fix bad point:

- route distance `5.762 m`;
- road surface `2.889 m`;
- physical DEM `-2.113 m`;
- rendered ground `-1.640 m`;
- wheel support `2.786 m`.

Final correction in `src/physics/wheel-ground-support.js`:

- road core stays authoritative;
- outside core, detached road support more than `2.4 m` above natural terrain is rejected;
- ordinary embankment/cut blending and road re-entry remain intact.

Do not retune this while working on unrelated blocks.

---

# 8. Protected behavior / prohibitions

Preserve unless a future block has direct causal evidence and dedicated QA:

- accepted vehicle handling, suspension and tire behavior;
- road/bridge geometry;
- wheel-ground support including issue #8 behavior;
- terrain authority and DEM shape;
- Photo ON visual quality;
- forest density/readiness/streaming policy;
- local-first Quebec hydro behavior;
- water/scenery/sign semantics;
- routing and settings UX;
- multiplayer protocol semantics;
- cache persistence behavior;
- diagnostic aliases used by permanent QA;
- production code-split/lazy GLB behavior.

Forbidden unless explicitly chosen as its own block:

- `npm audit fix --force`;
- dependency upgrades mixed with feature/fix work;
- Actions runtime upgrades;
- broad file moves “for cleanliness”;
- historical naming churn;
- issue #2 speculative correction;
- road/terrain/forest tuning while fixing unrelated logic;
- generated Geofabrik/source regional data committed to Git without packaging decision;
- moving `main` without explicit approval.

---

# 9. Branch / commit / QA discipline

## Branching

Use `dev` as the certified integration branch.

For a material runtime/security/performance block:

```text
candidate/<short-purpose>-r1
```

Increment `r2`, `r3` only when the previous candidate was rejected or materially changed.

Docs-only checkpoint updates may go directly to `dev` when they contain no runtime behavior.

## Commits

One intent per commit. Typical sequence:

```text
Fix: <runtime intent>
QA: cover <intent>
Docs: checkpoint <block state>
```

Do not hide runtime + QA + unrelated cleanup in one commit.

## Exact-head rule

Before saying a candidate or `dev` is green, verify the workflow run's `head_sha` equals the HEAD being reported.

A green run on an older commit does not certify the current branch.

---

# 10. Validation matrix for the new roadmap

| Block / risk | Minimum validation |
|---|---|
| DOM safety | focused DOM safety QA + R7 UI + R7 routing + audit + build |
| Route race guard | deterministic stale-route race QA + R7 routing/UI + route-start R8 + forest readiness |
| Retired transition workload | issue #4 QA + R8 terrain/world-scene/local-world/streaming + frame pacing + mandatory human Photo ON/OFF |
| Async diagnostics | visual-job timing QA + frame-runtime + hitch attribution + R8 streaming |
| LAN relay hardening | R2 multiplayer + malformed protocol QA + live LAN human smoke |
| Electron IPC validation | Electron/desktop QA + multiplayer host/join smoke + build/package-relevant QA |
| Overpass parity | service/network QA + cache/fallback preservation + build |
| Any final integration | exact-head Dev Integration on final `dev` HEAD |

Automation cannot replace human-visible validation where visuals, physics, runtime timing or LAN behavior change.

---

# 11. Completion criteria for this roadmap

This post-refactor roadmap is considered complete when:

- Block 1 DOM safety is DONE;
- Block 2 route stale-generation guard is DONE;
- Block 3 retired transition no longer consumes presentation workload and human visuals remain PASS;
- Block 4 async timing diagnostics are accurate;
- Block 5A/5B multiplayer/Electron hardening are DONE or explicitly deferred by user decision;
- Block 6 Overpass consistency is DONE or documented as intentionally divergent with QA;
- issue #2 remains watch-only unless reproduced;
- exact final `dev` HEAD is green;
- this file records the final checkpoint and next feature priority.

Block 7 (`main.js` decomposition) is **not required** for roadmap completion.

---

# 12. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:

1. exact final `dev` green;
2. all required human checkpoints green;
3. no unresolved high-priority regression introduced by this roadmap;
4. **explicit user approval to move `main`**.

Until that approval is given, `main` must remain untouched.

---

# 13. Session handoff template

At the end of any future conversation that advances World Drive, update this file so the next session can resume without chat history.

The checkpoint should explicitly state:

```text
DEV HEAD:
commit message:
MAIN HEAD:
latest exact-head Dev Integration run + result:
active block:
candidate branch + candidate HEAD if any:
focused QA run + result:
human checkpoint result:
files changed:
what was proven:
what was eliminated:
exact next action:
things that must NOT be changed next:
```

If a human test is pending, say **HUMAN CHECKPOINT PENDING** explicitly. Never infer PASS from automation.

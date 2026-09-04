# World Drive — Canonical Development & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Current stable `main`: `9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` — `Docs: open post-refactor development plan`  
Previous rollback/reference: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
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
**Runtime correction state:** issues #4 and #8 CLOSED / HUMAN PASS; issue #9 OPEN / pre-existing terrain-over-road bug  
**Issue #2:** OPEN / watch-only / not reproduced  
**Issue #9:** OPEN / reproduced on Yungas / explicitly predates Block 3  
**Block 1 — DOM safety:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 2 — Route lifecycle stale-generation guard:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 3 — Retired road-terrain transition workload:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 4 — Accurate asynchronous visual-job diagnostics:** **ACTIVE**  
**Final Block 3 candidate:** `candidate/post-refactor-road-transition-r1` @ `1731cd476984ba736c61527e05bd00a5f36202d8`  
**Block 3 baseline run:** `33902426615` — **PASS** on `c31d8425a1f0f939873617c81632e77f950f7b0b`  
**Block 3 focused final run:** `33903521697` — **PASS** on `1731cd476984ba736c61527e05bd00a5f36202d8`  
**Block 3 human checkpoint:** **PASS** — Photo ON/OFF and steep-terrain testing accepted the scoped transition-work retirement. A terrain-over-asphalt defect was observed on Yungas, but the user explicitly confirmed it already existed before Block 3; it is tracked separately as issue #9.  
**Post-integration exact-head Dev Integration:** run `33913262016` — **PASS** on `1731cd476984ba736c61527e05bd00a5f36202d8`.  
**Stable `main`:** `9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` — fast-forwarded from `dev` on 2026-09-04 after explicit user approval.  
**Previous stable rollback/reference:** `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`.

This plan synchronization is docs-only and may place `dev` one commit ahead of the certified runtime/QA checkpoint and farther ahead of `main`; that is intentional and does not constitute a new runtime baseline.

The codebase-wide post-refactor review found no systemic reason for another broad architecture refactor. The current architecture is usable and well covered. The next work is a set of **narrow correctness, security and runtime-efficiency blocks**, in priority order.

## Exact next action

Start **Block 4 — accurate asynchronous `visualJobs` diagnostics** with a deterministic audit/test first.

Prove the current timing defect using four controlled jobs in `src/streaming-coordinator.js`:

- synchronous success with measurable duration;
- delayed Promise resolve;
- rejected Promise;
- synchronous throw.

Then make the narrowest instrumentation-only correction so async wall time is recorded through Promise settlement without changing visual-job scheduling, timeouts, ordering, error semantics or hitch policy. Do not combine this with issue #9 terrain work, multiplayer hardening, dependencies, Actions upgrades or structural moves.

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
4. The retired road-transition presentation workload identified by the review has now been removed and certified in Block 3.
5. Some diagnostics should become more accurate before relying on them to debug issue #2.
6. Multiplayer/Electron security can be hardened without changing gameplay semantics.

---

# 3. Audit findings ledger

This table is the canonical forward backlog. Status must be updated here after each completed block.

| Priority | Finding | Primary files | Current status |
|---|---|---|---|
| P1 | Network/user-derived labels are inserted through `innerHTML` in parts of UI | `src/ui/route-planner-ui.js`, `src/ui/startup-ui.js`, possibly related UI helpers | **DONE/CERTIFIED — HUMAN PASS** |
| P1 | Route creation can overlap; route generation exists but async continuations are not stale-guarded | `src/routing/route-lifecycle.js` | **DONE/CERTIFIED — HUMAN PASS — Block 2** |
| P2 | Retired `road-terrain-transition` is hidden but still prepared/allocated/committed | `src/terrain.js`, `src/local-world-builder.js`, `src/terrain/world-scene.js` | **DONE/CERTIFIED — HUMAN PASS — Block 3** |
| P2 | `visualJobs` timing records Promise creation time instead of full async completion time | `src/streaming-coordinator.js` | **ACTIVE — Block 4** |
| P2 | LAN WebSocket relay accepts broad LAN traffic with permissive handshake and no explicit session/rate/client policy | `server/multiplayer-server.mjs`, `electron/multiplayer-runtime.cjs` | PLANNED — Block 5A |
| P2 | Electron multiplayer IPC does not explicitly verify caller origin | `electron/main.cjs`, `electron/preload.cjs` | PLANNED — Block 5B |
| P3 | Overpass allowlists/proxy limits differ between Vite, browser transport and Electron | `vite.config.js`, `src/services/desktop-overpass-transport.js`, `electron/main.cjs`, `src/services/overpass.js` | PLANNED — Block 6 |
| P3 | `scene.add` is monkey-patched only to hide an already-retired transition | `src/terrain/world-scene.js` | **DONE — removed with Block 3** |
| P3 | `src/main.js` remains large composition root | `src/main.js` | **DEFERRED — no refactor without concrete benefit** |

## Severity meaning

- **P1**: correctness/security issue that should be handled before new feature work unless the user changes priority.
- **P2**: meaningful robustness/performance/diagnostic debt; fix after P1 blocks.
- **P3**: maintenance quality; do only when it naturally fits a proven block.

---

# 4. Development roadmap

## Block 1 — Safe DOM rendering for network/user-derived text

### Status

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

### Goal

Ensure any string originating from a remote service, route label, vehicle metadata or user-editable input is rendered as text unless HTML is fully static and controlled by World Drive.

### Audit evidence and certified result

Before correction, `src/routing/geocoding.js` accepted Nominatim `display_name`, `src/ui/route-planner-ui.js` placed `p.name` directly into `innerHTML`, and `src/ui/startup-ui.js` interpolated route and vehicle strings into HTML templates.

The read-only audit covered:

```text
src/ui/route-planner-ui.js
src/ui/startup-ui.js
src/ui/v21-menu.js
src/ui/minimap.js
src/ui/instrument-cluster.js
multiplayer UI/status surfaces
```

No comparable unsafe network/user-derived HTML insertion was found in the wider audited UI surfaces. The correction was therefore kept narrow to the two affected runtime files.

Certified implementation:

- remote geocoding place names are inserted with `textContent`;
- route summary labels are assembled as text nodes/content;
- vehicle names/descriptions are inserted with `textContent`;
- controlled static World Drive markup remains allowed through `innerHTML` where no untrusted interpolation exists;
- geocoding behavior, route selection and vehicle metadata semantics were not changed;
- visible classes/IDs and layout contracts were preserved.

### Candidate

```text
candidate/post-refactor-dom-safety-r1
```

Candidate/runtime commit:

```text
28ffbee1cc63f4a250e59d6d136d007854fcddc4
Security: render dynamic UI labels as text
```

### Permanent QA

Added:

```text
qa/qa-post-refactor-dom-safety-r1.mjs
.github/workflows/qa-post-refactor-dom-safety-r1.yml
```

and imported the permanent regression coverage into:

```text
qa/DEV_INTEGRATION_AUDIT.mjs
```

The focused QA deliberately feeds markup-looking remote/route/vehicle strings and proves they remain literal text rather than executable DOM.

Validation evidence:

- focused candidate run `33869854637`: **PASS**;
- R7 UI boundary QA: **PASS**;
- R7 routing boundary QA: **PASS**;
- runtime/source-tree audit: **PASS**;
- production build: **PASS**;
- production code-split QA: **PASS**;
- post-integration exact-head Dev Integration run `33871178836`: **PASS** on `28ffbee1cc63f4a250e59d6d136d007854fcddc4`.

### Human checkpoint

**PASS.** User accepted route search results, startup vehicle chooser, route summary and route launch after pulling the candidate.

### Done state

**DONE/CERTIFIED.** Do not reopen or broaden this block without new evidence.

---

## Block 2 — Route lifecycle stale-generation guard

### Status

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-route-generation-r7
```

Final candidate/runtime HEAD:

```text
d00acf06128dbd4eb3f75831d04c96d1a81d41cf
```

The user completed the rapid route-switch checkpoint and reported **PASS**.

### Goal

Prevent an older asynchronous route creation from committing after a newer route request has already started.

### Problem model

`routeLifecycle.worldDrive.route.generation` already existed and `createRequestedRoute()` bumped it, but asynchronous continuations did not consistently verify that the operation still owned the active generation.

A slow earlier route could theoretically finish after a later route and mutate:

- route/segments;
- loading/status UI;
- DEM/imagery startup;
- final placement;
- scenery/metadata/sign prefetch.

### Certified implementation

The route lifecycle now captures the request generation and validates ownership after meaningful asynchronous boundaries and before authoritative commits/UI completion.

Stale work stops quietly and cannot:

- overwrite the active route;
- hide/show loading UI incorrectly;
- reset the newer world;
- place the vehicle on the older route;
- emit misleading success/failure state.

The final candidate also preserves the active forest through speculative route requests and supports rapid A→B→A restoration without forcing the previous ~10 s forest rebuild. Forest route ownership/restoration remains aligned with the currently committed terrain; explicit terrain-height reprojection is allowed when retained forest matrices must follow a rebuilt terrain surface.

Protected public source/API contracts were preserved:

```text
async function loadRoute()
function resetWorldCaches()
```

Both remain no-argument public facades. Route-specific internal behavior stays behind private helpers.

The P9.35 forest readiness policy was **not retuned**:

- no readiness threshold change;
- no timeout change;
- no forest density change;
- no streamer-budget tuning as part of Block 2.

### Permanent QA / evidence

Permanent deterministic coverage includes:

- stale route A starts;
- route B starts before A resolves;
- B resolves first and remains authoritative;
- A resolves later and cannot publish geometry/UI/status/success/failure state;
- stale failsafe cannot overwrite the newer request;
- rapid A→B→A retains/restores A forest;
- stale B cannot later take forest/route ownership;
- retained forest can be reprojected to newly committed terrain height without rebuilding its route cache.

The final integrated runtime candidate was `d00acf06128dbd4eb3f75831d04c96d1a81d41cf`.

The first post-integration Dev Integration run `33891384598` failed only because the older `qa-forest-active-stress.mjs` contract still asserted that an instance matrix could be uploaded at exactly one source site. Runtime inspection proved the second site was intentional and pre-existing in the certified forest-retention work: one upload occurs on initial chunk-mesh creation and the second occurs during explicit terrain-height reprojection of retained forest.

The correction was therefore **QA-only**, not a runtime change:

```text
da42ab9ad43b89d10df0055985ac1d9a9672ba5c
QA: allow explicit forest terrain matrix reprojection
```

The QA now requires exactly those two legitimate upload sites and still rejects arbitrary matrix-upload growth.

Final exact-head Dev Integration before the Block 2 docs checkpoint:

```text
run 33892857490
head da42ab9ad43b89d10df0055985ac1d9a9672ba5c
PASS
```

### Human checkpoint

**PASS.** The user tested the final r7 candidate with rapid route switching. Returning to A retained/restored the forest without the earlier ~10 s refill and stale B did not regain control.

### Done state

**DONE/CERTIFIED.** Do not reopen or broaden this block without new evidence.

---

## Block 3 — Stop generating the retired road-terrain transition presentation

### Status

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-road-transition-r1
```

Final candidate HEAD:

```text
1731cd476984ba736c61527e05bd00a5f36202d8
```

### Goal

Eliminate CPU/allocation/commit work for the already-retired `road-terrain-transition` presentation while preserving the authoritative road-bed state, refined terrain surface, road geometry and wheel support.

### Baseline measurement

The mandatory measurement pass was committed QA-only and run before runtime removal:

```text
c31d8425a1f0f939873617c81632e77f950f7b0b
QA: measure retired road transition baseline
run 33902426615 — PASS
```

On the deterministic mountain profile, the hidden transition still consumed real work:

- synchronous full-rebuild hidden transition: **21.352 ms**;
- prepared P9.27 path: **3 preparations + 3 commits** for 3 refreshes;
- last prepared transition: **88.551 ms wall / 8.904 ms CPU**;
- prepared geometry: **972 vertices / 1600 triangles**;
- `visualJobs['road-transition']`: **3 runs**;
- the existing `visualJobs` metric undercounted the async work by roughly **88.346 ms**, reinforcing the need for Block 4.

### Certified implementation

The runtime change is deliberately narrow:

- synchronous P9.25 road-bed state and main-terrain rebuild still run;
- the retired synchronous transition visual returns before Group/geometry/material/color allocation;
- prepared commits no longer schedule `visualJobs['road-transition']`;
- P9.27 state-only road installation remains available for prepared world refreshes;
- historical transition helpers remain in source for rollback/reference, but are not entered by normal runtime;
- the `scene.add` monkey-patch used only to hide transition groups was removed;
- no terrain-height, road geometry, physics, wheel-support or streaming-budget retuning was made.

Final regression measurements show:

- transition meshes: **0**;
- P9.27 transition preparations: **0**;
- P9.27 transition commits: **0**;
- `visualJobs['road-transition']` runs: **0**;
- global transition `scene.add` interceptor: **absent**;
- road-bed/refined terrain authority: **preserved**;
- deterministic frame probe: **0 hitches**.

### Permanent QA / evidence

Permanent coverage locks:

- issue #4 approved refined-ground presentation;
- zero retired transition mesh allocation;
- zero prepared transition work/job activity;
- P9.22/P9.23/P9.27 compatibility contracts;
- R8 terrain/world-scene/local-world/streaming ownership;
- R8 baseline aggregate;
- P9.24 frame budget;
- P9.39/P9.41 attribution;
- wheel-ground road/terrain re-entry;
- route-start final placement;
- production build/code split;
- full Dev Integration audit.

Focused final candidate run:

```text
run 33903521697
head 1731cd476984ba736c61527e05bd00a5f36202d8
PASS
```

Post-integration exact-head Dev Integration:

```text
run 33913262016
head 1731cd476984ba736c61527e05bd00a5f36202d8
PASS
```

### Human checkpoint

**PASS.** The user accepted Block 3 after Photo ON/OFF and steep-terrain testing. During the Yungas test, terrain was seen intruding over the asphalt. The user explicitly stated this defect **already existed before Block 3 but had not been declared**. It is therefore not a Block 3 regression and is tracked separately as **issue #9 — Terrain occasionally intrudes over the road surface**.

### Done state

**DONE/CERTIFIED.** Do not re-enable or rebuild `road-terrain-transition` as a workaround for issue #9 without new causal evidence.

---

## Block 4 — Accurate asynchronous visual-job diagnostics

### Status

**ACTIVE.**

### Goal

Make `visualJobs` instrumentation measure actual asynchronous completion time, not merely synchronous Promise creation time.

### Why it matters

Issue #2 is watch-only and future debugging depends on reliable timing attribution. Block 3 baseline measurement directly demonstrated the current undercount: a transition preparation taking ~88.551 ms wall time could be reported as a ~sub-2-ms visual job because only Promise creation time was captured.

### Implementation concept

`src/streaming-coordinator.js` should distinguish:

- synchronous execution duration;
- asynchronous wall duration until Promise settles;
- success/failure;
- optional resolved job key/reason.

Avoid double-counting and preserve existing diagnostic aliases/contracts. **Do not change scheduling policy.**

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

# 5. Open issue protocols

## Issue #2 — delayed terrain adjustment after route startup

Issue #2 remains **OPEN / NOT REPRODUCED / NO SPECULATIVE FIX**.

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

## Issue #9 — terrain occasionally intrudes over the road surface

**OPEN / PRE-EXISTING / REPRODUCED ON YUNGAS.**

The user declared this during the Block 3 human checkpoint after observing a steep mountainside visibly crossing/covering part of the asphalt near the start of the Yungas route. The user explicitly confirmed the defect was already present before Block 3 and had simply not been declared previously.

Rules for future diagnosis:

- reproduce/measure first;
- treat Yungas as a confirmed reproduction area;
- investigate terrain/road intersection authority and coarse terrain triangles near steep cuts/switchbacks;
- preserve road geometry, wheel-ground physics and accepted issue #4 visuals;
- do **not** re-enable retired `road-terrain-transition` presentation as a workaround;
- do not mix this issue into Block 4 diagnostics unless the user explicitly changes priority.

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

Block 3 has now permanently stopped normal runtime from allocating/building/committing this retired presentation. The authoritative road-bed/refined terrain logic remains active and human-approved visuals remain PASS.

Do not reintroduce the transition presentation merely to mask another terrain defect.

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
- issue #9 is resolved or explicitly scheduled/deferred with its status recorded;
- exact final `dev` HEAD is green;
- this file records the final checkpoint and next feature priority.

Block 7 (`main.js` decomposition) is **not required** for roadmap completion.

---

# 12. Main promotion rule

`main @ 9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` is the current stable baseline, promoted from `dev` on 2026-09-04 after explicit user approval.

Previous rollback/reference:

`111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`.

Future promotion requires:

1. exact final `dev` green;
2. all required human checkpoints green;
3. no unresolved high-priority regression introduced by this roadmap;
4. **explicit user approval to move `main`**.

Until the next explicit approval, `main` must remain untouched.

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

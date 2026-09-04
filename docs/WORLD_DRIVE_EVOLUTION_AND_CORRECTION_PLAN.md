# World Drive — Canonical Development & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Current stable `main`: `9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` — `Docs: open post-refactor development plan`  
Previous rollback/reference: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

GitHub live state + this file override chat memory when they disagree.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding / architecture / QA conversation:

1. Read this file from current `dev` before modifying anything.
2. Read live HEADs of `dev` and `main`.
3. Inspect the latest `Dev Integration QA` for the exact current `dev` HEAD.
4. Inspect open GitHub issues and the Current checkpoint / Active block below.
5. If chat memory conflicts with GitHub or this file, trust GitHub + this file.
6. Resume the exact Next action unless the user explicitly changes priority.
7. Never move `main` without explicit user approval.
8. Human-visible FAIL overrides green automation.
9. One intent per commit. Do not mix behavior, dependency/security maintenance, Actions upgrades, file moves or unrelated cleanup.
10. Use the certified work pattern:

```text
read-only audit
→ dedicated candidate when runtime/behavior/security risk exists
→ focused QA
→ permanent regression coverage
→ exact-head integration QA
→ human checkpoint when visuals/runtime/physics/security behavior can change
→ integrate to dev
→ exact-head Dev Integration again
→ update this plan
→ exact-head Dev Integration on the docs checkpoint
```

11. Do not ask the user to test until the candidate has passed its targeted automated QA unless the test itself is explicitly diagnostic.
12. Do not report a block as DONE until the final `dev` HEAD and exact-head QA result are verified.

## Fast restart checklist

Before coding, be able to answer:

- What is `dev` HEAD?
- What is `main` HEAD?
- Is the exact `dev` HEAD green in Dev Integration?
- What is the active block?
- What behavior is protected from incidental change?

---

# 1. CURRENT CHECKPOINT

**Plan phase:** post-refactor hardening and correctness  
**Architecture state:** **R1–R9 + Phase O DONE/CERTIFIED; R8 architecture FROZEN**  
**Block 1 — DOM safety:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 2 — Route lifecycle stale-generation guard:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 3 — Retired road-terrain transition workload:** **DONE/CERTIFIED — HUMAN PASS**  
**Block 4 — Accurate asynchronous visual-job diagnostics:** **DONE/CERTIFIED — AUTOMATED; no human checkpoint required**  
**Block 5A — LAN WebSocket relay hardening:** **ACTIVE — READ-ONLY AUDIT FIRST**  
**Issue #2:** **OPEN / watch-only / not reproduced**  
**Issue #9:** **OPEN / reproduced on Yungas / explicitly predates Block 3**  
**Stable `main`:** `9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` — must remain untouched without explicit user approval.  
**Previous rollback/reference:** `111df5d84bf7fd700590abbd9c129b303ac92fad`.

## Block 4 certified checkpoint

Final candidate:

```text
candidate/post-refactor-visual-job-diagnostics-r1
fd248af831c3626f62c86329d093633509982004
```

Focused final run:

```text
33915664612 — PASS
```

Post-integration exact-head Dev Integration on the Block 4 runtime/QA candidate:

```text
33915756142 — PASS
head fd248af831c3626f62c86329d093633509982004
```

A separate stale C6 compatibility inventory then exposed a previously certified Block 2 `clearInterval` boundary in `src/forest-chunk-streamer-core.js`. The runtime was not changed. The QA-only compatibility correction is:

```text
b4785c8d76271bb139c4fa5e1506264b99a71fef
QA: recognize forest polling clearInterval boundary
```

Exact-head validation of that correction:

```text
C6 Final Global Boundary QA 33916468405 — PASS
Phase O Historical Naming Boundary QA 33916468411 — PASS
R8 Local-World Structure QA 33916468369 — PASS
R8 Imagery Structure QA 33916468337 — PASS
Dev Integration QA 33916468306 — PASS
```

The Block 4 runtime result is intentionally diagnostic-only:

- legacy `visualJobs.*.runs/lastMs/maxMs/avgMs` remain **synchronous CPU/invocation timing**;
- new `settledRuns`, `succeededRuns`, `failedRuns`, `inFlight`, `lastWallMs`, `maxWallMs`, `avgWallMs`, `lastOutcome`, `lastSettledAt` measure actual Promise settlement;
- async resolve/reject and sync return/throw are distinguished;
- P9.39 hitch attribution continues to use synchronous CPU time, so network/Promise wait is not falsely blamed for a frame hitch;
- the base scheduler, timeout policy, queue ordering, idle policy and error propagation semantics were not changed;
- no human checkpoint was required because scheduling behavior did not change.

## Exact next action

Start **Block 5A — LAN WebSocket relay hardening**, **read-only audit first**.

Audit the standalone and Electron LAN relay side by side:

```text
server/multiplayer-server.mjs
electron/multiplayer-runtime.cjs
```

Map the current handshake, WebSocket path, Origin behavior, payload/frame limits, masking/protocol validation, client lifecycle, client count, rate behavior, state sanitation and standalone/Electron parity before proposing any runtime change.

Do **not** combine Block 5A with:

- issue #9 terrain work;
- Block 5B Electron IPC caller-origin validation;
- dependency/npm vulnerability work;
- Actions upgrades;
- multiplayer gameplay/protocol redesign;
- server-side physics/collision;
- Internet matchmaking/authentication.

---

# 2. Audit findings ledger

| Priority | Finding | Primary files | Current status |
|---|---|---|---|
| P1 | Unsafe dynamic HTML insertion in UI | `src/ui/route-planner-ui.js`, `src/ui/startup-ui.js` | **DONE/CERTIFIED — Block 1 — HUMAN PASS** |
| P1 | Async route creation could overlap/stale-commit | `src/routing/route-lifecycle.js` | **DONE/CERTIFIED — Block 2 — HUMAN PASS** |
| P2 | Retired `road-terrain-transition` still consumed CPU/allocation/commit work | terrain/local-world/world-scene | **DONE/CERTIFIED — Block 3 — HUMAN PASS** |
| P2 | `visualJobs` measured Promise creation instead of async settlement | `src/streaming-coordinator.js` | **DONE/CERTIFIED — Block 4** |
| P2 | LAN relay lacks explicit bounded handshake/client/rate policy | `server/multiplayer-server.mjs`, `electron/multiplayer-runtime.cjs` | **ACTIVE — Block 5A — AUDIT FIRST** |
| P2 | Electron multiplayer IPC lacks explicit caller-origin validation | `electron/main.cjs`, `electron/preload.cjs` | PLANNED — Block 5B |
| P3 | Overpass allowlists/proxy limits differ across environments | Vite/browser/Electron Overpass paths | PLANNED — Block 6 |
| P3 | `src/main.js` remains large composition root | `src/main.js` | **DEFERRED — no refactor without concrete benefit** |

---

# 3. Certified completed blocks

## Block 1 — Safe DOM rendering

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Certified candidate/runtime commit:

```text
candidate/post-refactor-dom-safety-r1
28ffbee1cc63f4a250e59d6d136d007854fcddc4
Security: render dynamic UI labels as text
```

Key result:

- remote geocoding names, route labels and vehicle names/descriptions are rendered as text;
- controlled static World Drive markup remains allowed;
- route/geocoding/vehicle UX semantics were preserved.

Focused candidate run `33869854637`: PASS.  
Post-integration exact-head Dev Integration `33871178836`: PASS.  
Human checkpoint: PASS.

Do not broaden/reopen without new evidence.

---

## Block 2 — Route lifecycle stale-generation guard

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-route-generation-r7
d00acf06128dbd4eb3f75831d04c96d1a81d41cf
```

Key result:

- request generation ownership is checked after meaningful awaits and before authoritative route/UI/world commits;
- stale work cannot overwrite a newer route, loading/status UI, placement or success/failure state;
- stale failsafe is quiet;
- rapid A→B→A preserves/restores A forest instead of forcing the prior ~10 s refill;
- stale B cannot regain route/forest authority;
- retained forest may be explicitly reprojected to newly committed terrain heights without rebuilding its route cache;
- public no-arg `loadRoute()` and `resetWorldCaches()` facades remain protected;
- P9.35 thresholds/timeouts/density/streamer budgets were not retuned.

QA-only post-integration compatibility update:

```text
da42ab9ad43b89d10df0055985ac1d9a9672ba5c
QA: allow explicit forest terrain matrix reprojection
```

Final exact-head Dev Integration before docs: `33892857490` — PASS.  
Human checkpoint: PASS.

Do not broaden/reopen without new evidence.

---

## Block 3 — Retire hidden road-terrain transition workload

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-road-transition-r1
1731cd476984ba736c61527e05bd00a5f36202d8
```

Mandatory QA-only baseline:

```text
c31d8425a1f0f939873617c81632e77f950f7b0b
run 33902426615 — PASS
```

Baseline proved the hidden presentation still consumed real work:

- synchronous full-rebuild hidden transition: ~21.352 ms;
- prepared P9.27 path: 3 preparations + 3 commits in the test;
- last prepared transition: ~88.551 ms wall / ~8.904 ms CPU;
- 972 vertices / 1600 triangles;
- `visualJobs['road-transition']`: 3 runs.

Certified result:

- transition mesh allocations: 0;
- P9.27 transition preparations/commits: 0;
- `visualJobs['road-transition']`: 0;
- transition-only `scene.add` interceptor removed;
- road-bed/refined terrain authority preserved;
- no terrain-height, road geometry, wheel support, physics or streaming-budget retuning.

Focused final run `33903521697`: PASS.  
Post-integration Dev Integration `33913262016`: PASS.  
Human Photo ON/OFF + steep-terrain checkpoint: PASS.

A terrain-over-asphalt defect seen on Yungas was explicitly confirmed by the user as **pre-existing** and is tracked separately as issue #9.

Do not restore the retired transition presentation as a workaround for issue #9 without new causal evidence.

---

## Block 4 — Accurate asynchronous visual-job diagnostics

**DONE/CERTIFIED — AUTOMATED (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-visual-job-diagnostics-r1
fd248af831c3626f62c86329d093633509982004
```

Runtime owner changed:

```text
src/streaming-coordinator.js
```

Permanent QA added/updated:

```text
qa/qa-post-refactor-visual-job-timing-r1.mjs
qa/qa-p939-hitch-attribution.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-post-refactor-visual-job-diagnostics-r1.yml
```

Deterministic QA proves four cases:

- synchronous success;
- synchronous throw;
- delayed Promise resolve;
- delayed Promise reject.

The deterministic async cases prove separate ownership of CPU and wall time (for example 2 ms synchronous / 35 ms wall and 1 ms synchronous / 41 ms wall), while P9.39 continues to attribute the synchronous component only.

Focused final run:

```text
33915664612 — PASS
```

Post-integration runtime exact-head Dev Integration:

```text
33915756142 — PASS
head fd248af831c3626f62c86329d093633509982004
```

QA-only C6 compatibility correction:

```text
b4785c8d76271bb139c4fa5e1506264b99a71fef
QA: recognize forest polling clearInterval boundary
```

Exact-head Dev Integration after the QA-only compatibility correction:

```text
33916468306 — PASS
```

Human checkpoint: **not required** because no scheduling/runtime policy changed.

---

# 4. Active and future roadmap

## Block 5A — LAN WebSocket relay hardening

### Status

**ACTIVE — READ-ONLY AUDIT FIRST.**

### Goal

Harden the existing presentation-only LAN relay without changing multiplayer protocol/gameplay semantics or introducing accounts/cloud dependencies.

### Audit scope

Keep standalone and Electron relay behavior aligned:

```text
server/multiplayer-server.mjs
electron/multiplayer-runtime.cjs
```

Audit before implementation:

- HTTP Upgrade/WebSocket path acceptance;
- Origin policy for browser-dev and packaged Electron LAN use;
- client count / connection lifecycle;
- per-client message rate behavior;
- masking/frame/opcode/fragmentation/protocol validation;
- text payload maximum and aggregate fragmented-message buffer maximum;
- ping/pong/close handling;
- malformed/oversized client cleanup;
- state sanitation before broadcast;
- standalone/Electron parity and drift;
- existing permanent R2 multiplayer contracts that must stay stable.

### Candidate hardening areas

Only after evidence from the audit, consider:

- explicit WebSocket path;
- bounded Origin policy suitable for World Drive LAN use;
- max clients;
- max messages per time window per client;
- stricter mask/frame/protocol validation;
- bounded payload/aggregate buffers;
- deterministic cleanup of malformed/abusive clients;
- parity helpers/tests for standalone and Electron relay.

### Non-goals

- no Internet matchmaking;
- no authentication/account system unless explicitly requested;
- no server collision/physics;
- no multiplayer gameplay redesign;
- no protocol redesign unless required by a proven issue.

### Required QA after any change

- existing R2 multiplayer coverage;
- live shared traffic coverage;
- protocol contract tests;
- new malformed-frame/payload/rate/client-limit coverage;
- production build/code split as applicable;
- exact-head Dev Integration.

### Human checkpoint

Required if handshake/path/Origin/join behavior changes: browser/Electron LAN host/join smoke.

---

## Block 5B — Electron IPC caller-origin validation

### Status

PLANNED — separate from Block 5A.

### Goal

Ensure multiplayer IPC methods are accepted only from the trusted World Drive renderer origin.

Scope:

```text
electron/main.cjs
electron/preload.cjs
```

Electron already uses `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, and blocks unexpected navigation/permissions. Add explicit caller validation around multiplayer IPC without broad Electron changes.

Required QA:

- trusted app origin can host/join/stop/status;
- synthetic/untrusted sender is rejected;
- desktop build/package-relevant QA;
- human Windows multiplayer smoke recommended.

---

## Block 6 — Overpass proxy/configuration consistency

### Status

PLANNED.

Audit:

```text
src/services/overpass.js
src/services/desktop-overpass-transport.js
vite.config.js
electron/main.cjs
```

Rules:

- do not restore Overpass as a mandatory primary hydro source;
- preserve local-first Quebec hydro behavior;
- preserve graceful failure/fallback semantics;
- align/document mirror allowlists and request-body limits;
- prefer permanent parity QA if one shared module would create awkward browser/Node coupling.

Human checkpoint only if browser/Electron network behavior changes visibly.

---

## Block 7 — Composition root reduction

**DEFERRED — evidence-driven only.**

`src/main.js` may be extracted further only if a concrete feature/bug/testability/performance need proves a coherent ownership boundary. Do not refactor for line count or organization alone.

---

# 5. Open issue protocols

## Issue #2 — delayed terrain adjustment after route startup

**OPEN / NOT REPRODUCED / NO SPECULATIVE FIX.**

If it reappears, capture before convergence:

```text
WorldDriveFramePacing().imagery.r8GeometryRefresh
localWorldPhases
p923
visualJobs
p939HitchAttribution
```

For `visualJobs`, use the Block 4 distinction:

- legacy `lastMs/maxMs/avgMs` = synchronous CPU/invocation timing;
- `lastWallMs/maxWallMs/avgWallMs` = full Promise settlement wall time;
- `lastOutcome`, `inFlight`, success/failure counters = async state/outcome.

Do not tune terrain/imagery/streaming just to see if it helps. A correction requires reproducible evidence.

## Issue #9 — terrain occasionally intrudes over the road surface

**OPEN / PRE-EXISTING / REPRODUCED ON YUNGAS.**

Confirmed during Block 3 human testing near the start of Yungas. The user explicitly stated the bug existed before Block 3 and had simply not been declared.

Future diagnosis rules:

- reproduce/measure first;
- use Yungas as a confirmed reproduction area;
- inspect terrain/road intersection authority and coarse terrain triangles near steep cuts/switchbacks;
- preserve road geometry, wheel-ground physics and accepted issue #4 visuals;
- do not restore retired `road-terrain-transition` as a workaround;
- do not mix issue #9 into unrelated hardening blocks.

---

# 6. Certified architecture — preserve unless a block explicitly changes it

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

# 7. Protected correction evidence

## Issue #4 — Photo OFF black terrain patches

**CLOSED / HUMAN PASS.**

The black patches were isolated to the legacy `road-terrain-transition` presentation. Block 3 now prevents normal runtime from allocating/building/committing that retired presentation while preserving authoritative road-bed/refined terrain behavior.

Do not reintroduce the retired transition merely to mask another terrain defect.

## Issue #8 — elevated road/bridge wheel-support bleed

**CLOSED / HUMAN PASS.**

Protected correction in `src/physics/wheel-ground-support.js`:

- road core stays authoritative;
- outside core, detached road support >2.4 m above natural terrain is rejected;
- ordinary embankment/cut blending and road re-entry remain intact.

Do not retune during unrelated work.

---

# 8. Protected behavior / prohibitions

Preserve unless a future block has direct causal evidence and dedicated QA:

- accepted vehicle handling, suspension and tire behavior;
- road/bridge geometry;
- wheel-ground support including issue #8;
- terrain authority and DEM shape;
- Photo ON visual quality;
- forest density/readiness/streaming policy;
- local-first Quebec hydro behavior;
- water/scenery/sign semantics;
- routing/settings UX;
- multiplayer gameplay/protocol semantics;
- cache persistence;
- diagnostic aliases used by permanent QA;
- production code-split/lazy GLB behavior.

Forbidden unless explicitly chosen as its own block:

- `npm audit fix --force`;
- dependency upgrades mixed with feature/fix work;
- Actions runtime upgrades;
- broad file moves for cleanliness;
- historical naming churn;
- issue #2 speculative correction;
- road/terrain/forest tuning while fixing unrelated logic;
- generated Geofabrik/source regional data committed without packaging decision;
- moving `main` without explicit approval.

---

# 9. Branch / commit / QA discipline

Use `dev` as certified integration branch.

For material runtime/security/performance work:

```text
candidate/<short-purpose>-r1
```

Increment r2/r3 only when a candidate is rejected or materially redesigned.

Docs-only checkpoint updates may go directly to `dev`.

One intent per commit. Typical sequence:

```text
Fix/Diagnostics/Security: <runtime intent>
QA: cover <intent>
Docs: certify/checkpoint <block>
```

Before saying a candidate or `dev` is green, verify the workflow `head_sha` equals the HEAD being reported. A green run on an older commit does not certify the current branch.

---

# 10. Validation matrix

| Block / risk | Minimum validation |
|---|---|
| DOM safety | focused DOM QA + R7 UI/routing + audit + build |
| Route race guard | deterministic race + R7 routing/UI + route-start R8 + forest readiness |
| Retired transition | issue #4 + R8 terrain/world-scene/local-world/streaming + frame pacing + mandatory human Photo ON/OFF |
| Async diagnostics | deterministic sync/async/throw/reject timing + frame-runtime + hitch attribution + R8 streaming |
| LAN relay hardening | R2 multiplayer + malformed protocol/payload/rate/client QA + live LAN human smoke when handshake behavior changes |
| Electron IPC validation | Electron/desktop QA + host/join smoke + build/package-relevant QA |
| Overpass parity | service/network QA + cache/fallback preservation + build |
| Any final integration | exact-head Dev Integration on final `dev` HEAD |

Automation cannot replace human-visible validation where visuals, physics, runtime timing, LAN join/handshake behavior or other user-visible behavior changes.

---

# 11. Completion criteria

This roadmap is complete when:

- Blocks 1–4 are DONE;
- Block 5A/5B are DONE or explicitly deferred by user decision;
- Block 6 is DONE or documented as intentionally divergent with QA;
- issue #2 remains watch-only unless reproduced;
- issue #9 is resolved or explicitly scheduled/deferred with status recorded;
- exact final `dev` HEAD is green;
- this file records the final checkpoint and next feature priority.

Block 7 (`main.js` decomposition) is not required for roadmap completion.

---

# 12. Main promotion rule

`main @ 9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` is the current stable baseline, promoted from `dev` on 2026-09-04 after explicit user approval.

Previous rollback/reference:

`111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`.

Future promotion requires:

1. exact final `dev` green;
2. all required human checkpoints green;
3. no unresolved high-priority regression introduced by the roadmap;
4. explicit user approval to move `main`.

Until the next explicit approval, `main` must remain untouched.

---

# 13. Session handoff template

At the end of any conversation that advances World Drive, update this file with:

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

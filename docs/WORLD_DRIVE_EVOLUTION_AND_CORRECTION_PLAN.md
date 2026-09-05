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
**Block 5A — LAN WebSocket relay hardening:** **DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05)**  
**Block 5B — Electron IPC caller-origin validation:** **DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05)**  
**Block 6 — Overpass proxy/configuration consistency:** **ACTIVE — READ-ONLY AUDIT FIRST**  
**Issue #2:** **OPEN / watch-only / not reproduced**  
**Issue #9:** **OPEN / reproduced on Yungas / explicitly predates Block 3**  
**Issue #10:** **OPEN / steep-slope tire grip and steering instability / deferred**  
**Issue #11:** **OPEN / one civil-traffic model rotated ~90° / deferred**  
**Issue #12:** **OPEN / forest streaming falls behind after ~5 km / deferred**  
**Stable `main`:** `9055d5682afcf512c91b1ae7dc97dcb4b16d6d9e` — must remain untouched without explicit user approval.  
**Previous rollback/reference:** `111df5d84bf7fd700590abbd9c129b303ac92fad`.

## Block 5A certified checkpoint

Final human-tested candidate:

```text
candidate/post-refactor-lan-relay-hardening-r1
47eecf73d227c54d651fe02f3aaa4c9a75f9402a
```

Runtime commits:

```text
f8f629991b9c4ec3cce02062bc4038e240d77376
Security: harden standalone LAN WebSocket relay

3bb5f0cdec226a9d40b78dcf7b0a36c66b4fcc8e
Security: harden Electron LAN WebSocket relay
```

Certified relay policy, identical in standalone and Electron owners:

```text
WebSocket path                 /
max clients                    32
max text message               4096 bytes
max aggregate frame buffer     64 KiB
max application messages       120 / second / client
hello timeout                  10 s
max HTTP header                8192 bytes
Origin                         absent OR loopback/private/same-host
```

Protected semantics preserved:

- `hello`, `welcome`, `snapshot`, `refresh-state`, `state`, `roster`, `leave`;
- state sanitation;
- 30 Hz maintained client contract;
- Traffic MP1 forwarding;
- packaged Electron LAN host/join UX.

Focused candidate run `33920069528`: PASS.  
Post-integration stale-QA discovery run `33973743821`: FAIL only because legacy M4.13 intentionally exceeded the new 120/s abuse ceiling.  
QA-only correction `abd3d875623e935cdc36f98601f0837f0a610168`: M4.13 keeps all 320 packets but sends bounded bursts.  
Exact-head Dev Integration `33973907521`: PASS.  
Human LAN checkpoint: PASS.

Human-smoke environment note, **out of Block 5A scope**: the local Windows checkout contains `public/world-data` with 38,018 files / ~16.8 GB. A production Vite build copies that local public dataset into `dist`, making local desktop startup/build take many minutes. The smoke used a temporary local move/build/restore workaround. Any permanent packaging/build optimization must be a separate block and must preserve local-first Quebec hydro semantics.

## Block 5B certified checkpoint

Final human-tested candidate:

```text
candidate/post-refactor-electron-ipc-origin-r1
7858826f89c6f869cab187316b392799ce78ba79
```

Security/runtime commits:

```text
58d6c8a517c6c93845c6929885b1062592cb6a8b
Security: add Electron IPC caller-origin guard

2a551c6240480d3923531a02935bec2d9fcdb674
Security: validate Electron multiplayer IPC caller origin
```

Audit findings:

- Electron already used `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`;
- navigation/new-window/permission boundaries were already restrictive;
- the app renderer is served from `http://127.0.0.1:<actual-port>`;
- the preload exposed only the narrow desktop multiplayer API (`host`, `join`, `stop`, `status`);
- the four `ipcMain.handle(...)` multiplayer handlers were globally callable without an explicit sender/frame/origin check.

Certified caller policy now requires all of the following before a multiplayer IPC handler reaches the runtime:

- sender `WebContents` is exactly the active World Drive `mainWindow.webContents`;
- caller frame is the sender's main frame, not an iframe/subframe;
- frame URL origin exactly matches the current loopback `appOrigin`, including the actual port;
- sender/frame remain alive and not destroyed.

Untrusted/synthetic callers are rejected before host/join/stop/status runtime behavior executes. The preload API itself was **not broadened or changed**. Multiplayer gameplay/protocol, relay semantics, renderer UX and return/error contracts were preserved.

Permanent Block 5B QA:

```text
electron/ipc-origin-guard.cjs
qa/qa-post-refactor-electron-ipc-origin-r1.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-post-refactor-electron-ipc-origin-r1.yml
```

Focused/full candidate run:

```text
33974991861 — PASS
head 7858826f89c6f869cab187316b392799ce78ba79
```

That run passed Block 5B caller-origin QA, R2 multiplayer, Block 5A regression, M3 client/protocol, full Dev Integration audit, production build/code split and Electron package smoke.

Human Windows/LAN checkpoint: **PASS (2026-09-05)** — host, join, disconnect/reconnect and re-host behavior accepted by the user.

Post-integration exact-head Dev Integration:

```text
33975423632 — PASS
head 7858826f89c6f869cab187316b392799ce78ba79
```

## Exact next action

Start **Block 6 — Overpass proxy/configuration consistency**, **read-only audit first**.

Audit:

```text
vite.config.js
src/services/desktop-overpass-transport.js
electron/main.cjs
src/services/overpass.js
```

Map before changing anything:

- browser/Vite proxy target allowlist;
- Electron proxy target allowlist;
- request methods, body-size ceilings, timeout and redirect behavior;
- browser vs desktop transport URL construction;
- fallback/mirror selection and retry behavior in `src/services/overpass.js`;
- intentional versus accidental environment divergence;
- existing permanent Overpass/local-hydro QA that constrains changes.

Rules:

- do not restore Overpass as a mandatory or primary hydro source;
- preserve local-first Quebec hydro behavior;
- preserve graceful failure/fallback semantics;
- align mirror allowlists/body limits only where evidence supports parity;
- document deliberate divergence and lock it with QA when environments genuinely differ;
- do not mix Block 6 with the 16.8 GB local-data build-copy optimization;
- do not mix Block 6 with issues #9/#10/#11/#12;
- do not mix dependency/npm vulnerability work or Actions upgrades.

---

# 2. Audit findings ledger

| Priority | Finding | Primary files | Current status |
|---|---|---|---|
| P1 | Unsafe dynamic HTML insertion in UI | `src/ui/route-planner-ui.js`, `src/ui/startup-ui.js` | **DONE/CERTIFIED — Block 1 — HUMAN PASS** |
| P1 | Async route creation could overlap/stale-commit | `src/routing/route-lifecycle.js` | **DONE/CERTIFIED — Block 2 — HUMAN PASS** |
| P2 | Retired `road-terrain-transition` still consumed CPU/allocation/commit work | terrain/local-world/world-scene | **DONE/CERTIFIED — Block 3 — HUMAN PASS** |
| P2 | `visualJobs` measured Promise creation instead of async settlement | `src/streaming-coordinator.js` | **DONE/CERTIFIED — Block 4** |
| P2 | LAN relay lacked explicit bounded handshake/client/rate policy | `server/multiplayer-server.mjs`, `electron/multiplayer-runtime.cjs` | **DONE/CERTIFIED — Block 5A — HUMAN LAN PASS** |
| P2 | Electron multiplayer IPC lacked explicit caller-origin validation | `electron/main.cjs`, `electron/ipc-origin-guard.cjs`, `electron/preload.cjs` | **DONE/CERTIFIED — Block 5B — HUMAN LAN PASS** |
| P3 | Local `public/world-data` (~16.8 GB / 38,018 files) is copied into `dist` during local production build | Vite/public-data/desktop packaging path | **DISCOVERED — separate follow-up; do not mix into Block 6** |
| P3 | Overpass allowlists/proxy limits differ across environments | Vite/browser/Electron Overpass paths | **ACTIVE — Block 6 — AUDIT FIRST** |
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

Focused candidate run `33869854637`: PASS.  
Post-integration exact-head Dev Integration `33871178836`: PASS.  
Human checkpoint: PASS.

Protected result: remote geocoding names, route labels and vehicle names/descriptions render as text while controlled static World Drive markup remains allowed.

---

## Block 2 — Route lifecycle stale-generation guard

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-route-generation-r7
d00acf06128dbd4eb3f75831d04c96d1a81d41cf
```

QA-only post-integration compatibility update:

```text
da42ab9ad43b89d10df0055985ac1d9a9672ba5c
QA: allow explicit forest terrain matrix reprojection
```

Final exact-head Dev Integration before docs: `33892857490` — PASS.  
Human checkpoint: PASS.

Protected result: stale route work cannot regain route/UI/world authority; rapid A→B→A forest readiness remains preserved without retuning accepted forest policy.

---

## Block 3 — Retire hidden road-terrain transition workload

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-road-transition-r1
1731cd476984ba736c61527e05bd00a5f36202d8
```

Mandatory QA-only baseline `c31d8425a1f0f939873617c81632e77f950f7b0b`, run `33902426615`: PASS.  
Focused final run `33903521697`: PASS.  
Post-integration Dev Integration `33913262016`: PASS.  
Human Photo ON/OFF + steep-terrain checkpoint: PASS.

Protected result: hidden retired transition mesh allocations/preparations/commits are zero while road-bed/refined terrain authority remains unchanged.

Issue #9 is separate and explicitly predates this block.

---

## Block 4 — Accurate asynchronous visual-job diagnostics

**DONE/CERTIFIED — AUTOMATED (2026-09-04).**

Final candidate:

```text
candidate/post-refactor-visual-job-diagnostics-r1
fd248af831c3626f62c86329d093633509982004
```

Focused final run `33915664612`: PASS.  
Post-integration runtime exact-head Dev Integration `33915756142`: PASS.  
QA-only C6 compatibility correction `b4785c8d76271bb139c4fa5e1506264b99a71fef`.  
Exact-head Dev Integration `33916468306`: PASS.

Protected result: synchronous CPU/invocation timing remains distinct from full Promise settlement wall timing and async outcome/in-flight diagnostics.

---

## Block 5A — LAN WebSocket relay hardening

**DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05).**

See the Block 5A certified checkpoint above. Do not broaden/reopen without new evidence.

---

## Block 5B — Electron IPC caller-origin validation

**DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05).**

See the Block 5B certified checkpoint above. Do not broaden/reopen without new evidence.

---

# 4. Active and future roadmap

## Block 6 — Overpass proxy/configuration consistency

### Status

**ACTIVE — READ-ONLY AUDIT FIRST.**

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

## Separate follow-up — local-data production build copy

**DISCOVERED / DEFERRED / SEPARATE FROM BLOCK 6.**

Local Windows evidence from 2026-09-05:

```text
public/world-data
38,018 files
~16.8 GB
```

Vite's production build copies this local dataset into `dist`, making desktop startup/build take many minutes on the user's checkout. Any permanent optimization must preserve local-first Quebec hydro semantics and must be audited as a packaging/data-location change rather than hidden inside another block.

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

## Issue #10 — steep-slope tire grip and steering instability

**OPEN / USER-REPORTED / DEFERRED.**

Reported behavior on very steep grades:

- uphill, small steering corrections can suddenly trigger a spin/loss of directional stability;
- downhill, the vehicle can continue almost straight despite steering input, as if lateral grip/steering authority collapses.

Future diagnosis must reproduce first and inspect large-pitch wheel support, normal-load/grade effects, longitudinal-vs-lateral tire-force coupling, yaw authority and braking/engine-load interaction. Do not retune accepted flat/normal-grade handling speculatively.

## Issue #11 — one civil-traffic vehicle rotated ~90° from route heading

**OPEN / USER-REPORTED / DEFERRED.**

One specific civil-traffic model travels along the correct path but its body is visually rotated roughly 90° sideways. All other observed traffic variants align correctly.

Future fix should identify the exact authored variant and correct only its model-forward/yaw presentation contract while preserving traffic routing, speed, lane placement and all correctly aligned variants.

## Issue #12 — forest streaming falls behind after ~5 km

**OPEN / USER-REPORTED / DEFERRED.**

After roughly 5 km of continuous driving, forward forest readiness can fall behind the vehicle: terrain ahead is visibly under-populated, trees appear progressively in view, and in worse cases forest generation completes after the vehicle reaches/passes the area.

This is a streaming/readiness timing defect, not a density/style request. Future diagnosis should capture long-drive queue/prefetch/commit/frame-budget diagnostics before changing policy and preserve accepted startup forest density/quality.

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

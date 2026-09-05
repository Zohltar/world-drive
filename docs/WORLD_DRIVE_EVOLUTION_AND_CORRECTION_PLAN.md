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
**Block 6 — Overpass proxy/configuration consistency:** **DONE/CERTIFIED — AUTOMATED (2026-09-05)**  
**Block 6B — local-data production build-copy optimization:** **ACTIVE — READ-ONLY AUDIT FIRST**  
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

Human-smoke environment note, **out of Block 5A scope**: the local Windows checkout contains `public/world-data` with 38,018 files / ~16.8 GB. A production Vite build copies that local public dataset into `dist`, making local desktop startup/build take many minutes. The smoke used a temporary local move/build/restore workaround. Any permanent packaging/build optimization must preserve local-first Quebec hydro semantics.

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

Certified caller policy requires:

- sender `WebContents` exactly equals active `mainWindow.webContents`;
- caller frame is the sender's main frame;
- frame URL origin exactly matches current loopback `appOrigin`, including actual port;
- sender/frame remain alive and not destroyed.

Permanent Block 5B QA:

```text
electron/ipc-origin-guard.cjs
qa/qa-post-refactor-electron-ipc-origin-r1.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-post-refactor-electron-ipc-origin-r1.yml
```

Candidate run `33974991861`: PASS.  
Human Windows/LAN checkpoint: PASS.  
Post-integration exact-head Dev Integration `33975423632`: PASS.

## Block 6 certified checkpoint

Final candidate:

```text
candidate/post-refactor-overpass-parity-r1
abcc2a0e8ddca70600502499cc0ecf574339dfa5
```

Runtime/network commits:

```text
6a767e0d48703e1c7d30670e27c8bcbc3571f02e
Network: align Vite Overpass proxy policy

8ef5e52c3b26b16c0355e8338d039b82c36b142d
Network: align desktop Overpass mirror allowlist
```

Audit findings and certified policy:

- maintained Overpass client defaults are exactly `overpass-api.de`, `overpass.kumi.systems`, `overpass.nchc.org.tw`;
- stale `overpass.private.coffee` allowance was removed from Vite and desktop transport owners;
- Vite and Electron now both accept only GET/POST and enforce a 1 MiB request-body ceiling;
- Vite keeps its deliberate HTTP-200 soft-failure envelope (`__worldDriveOverpassFailure`) so expected public-mirror failover does not generate browser network errors;
- Electron deliberately keeps real upstream/proxy HTTP statuses (including 502/504) for desktop diagnostics;
- `src/services/overpass.js` mirror health, retry/failover and request cadence were not retuned;
- Quebec hydro remains local-first; Overpass remains fallback-only when local hydro is unavailable.

Permanent Block 6 QA:

```text
qa/qa-post-refactor-overpass-parity-r1.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-post-refactor-overpass-parity-r1.yml
```

QA-only historical ownership correction:

```text
81cd61a32b8edaa7680716522846527a7d6b89dd
QA: follow maintained Overpass service ownership
```

The first focused run `33975834180` failed only because historical V21.26 QA still inspected compatibility re-export facades instead of maintained `src/services/...` owners; runtime behavior was not implicated.  
Focused corrected run `33975926141`: PASS.  
Final candidate exact-head run `33975980569`: PASS, including Block 6 parity, Overpass resilience, historical abort/failover, Quebec local hydro, water hydro, full Dev Integration audit, production build and code split.  
Post-integration exact-head Dev Integration:

```text
33976041635 — PASS
head abcc2a0e8ddca70600502499cc0ecf574339dfa5
```

Human checkpoint: **not required** — no user-facing mirror behavior, hydro authority, retry cadence or gameplay behavior was changed.

## Exact next action

Start **Block 6B — local-data production build-copy optimization**, **read-only audit first**.

Audit:

```text
vite.config.js
forge.config.cjs
electron/main.cjs
src/water-offline-hydro-source.js
src/water-data.js
.gitignore
tools/geofabrik/README.md
tools/geofabrik/build-world-tiles.mjs
README_PACKAGING.md
```

Map before changing anything:

- why Vite copies generated `public/world-data` into `dist` during production builds;
- browser-development URL ownership for `/world-data/...`;
- Electron static-server ownership for `dist` and whether it can safely serve local data from a separate root;
- Forge package inclusion/exclusion of `public/world-data` and whether current packaging duplicates the dataset;
- whether generated Quebec data is intentionally untracked/local and how tooling expects it to be laid out;
- required behavior when the local dataset is absent;
- browser production, Electron development and packaged Electron differences;
- permanent QA needed to prove local-first Quebec hydro still works after any packaging/path change.

Rules:

- do not change hydro source priority or data format;
- do not delete/move the user's generated dataset;
- do not make Overpass primary again;
- do not silently exclude required packaged resources without proving the expected deployment model;
- prefer a build-time exclusion plus explicit desktop serving path only if audit evidence proves it preserves all environments;
- do not mix issues #9/#10/#11/#12, dependency/npm work or Actions upgrades.

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
| P3 | Overpass allowlists/proxy limits differed across environments | Vite/browser/Electron Overpass paths | **DONE/CERTIFIED — Block 6** |
| P3 | Local `public/world-data` (~16.8 GB / 38,018 files) is copied into `dist` during local production build | Vite/public-data/desktop packaging path | **ACTIVE — Block 6B — AUDIT FIRST** |
| P3 | `src/main.js` remains large composition root | `src/main.js` | **DEFERRED — no refactor without concrete benefit** |

---

# 3. Certified completed blocks

## Block 1 — Safe DOM rendering

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Candidate `candidate/post-refactor-dom-safety-r1` @ `28ffbee1cc63f4a250e59d6d136d007854fcddc4`.  
Focused run `33869854637`: PASS. Post-integration Dev Integration `33871178836`: PASS. Human checkpoint: PASS.

## Block 2 — Route lifecycle stale-generation guard

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate `candidate/post-refactor-route-generation-r7` @ `d00acf06128dbd4eb3f75831d04c96d1a81d41cf`.  
QA-only compatibility update `da42ab9ad43b89d10df0055985ac1d9a9672ba5c`.  
Exact-head Dev Integration `33892857490`: PASS. Human checkpoint: PASS.

## Block 3 — Retire hidden road-terrain transition workload

**DONE/CERTIFIED — HUMAN PASS (2026-09-04).**

Final candidate `candidate/post-refactor-road-transition-r1` @ `1731cd476984ba736c61527e05bd00a5f36202d8`.  
Baseline run `33902426615`: PASS. Focused final run `33903521697`: PASS. Post-integration Dev Integration `33913262016`: PASS. Human checkpoint: PASS.

Issue #9 is separate and explicitly predates this block.

## Block 4 — Accurate asynchronous visual-job diagnostics

**DONE/CERTIFIED — AUTOMATED (2026-09-04).**

Final candidate `candidate/post-refactor-visual-job-diagnostics-r1` @ `fd248af831c3626f62c86329d093633509982004`.  
Focused run `33915664612`: PASS. Post-integration Dev Integration `33915756142`: PASS. QA-only compatibility correction `b4785c8d76271bb139c4fa5e1506264b99a71fef`. Exact-head Dev Integration `33916468306`: PASS.

## Block 5A — LAN WebSocket relay hardening

**DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05).** See checkpoint above.

## Block 5B — Electron IPC caller-origin validation

**DONE/CERTIFIED — HUMAN LAN PASS (2026-09-05).** See checkpoint above.

## Block 6 — Overpass proxy/configuration consistency

**DONE/CERTIFIED — AUTOMATED (2026-09-05).** See checkpoint above.

---

# 4. Active and future roadmap

## Block 6B — local-data production build-copy optimization

### Status

**ACTIVE — READ-ONLY AUDIT FIRST.**

Local Windows evidence from 2026-09-05:

```text
public/world-data
38,018 files
~16.8 GB
```

Vite's production build currently copies this generated local dataset into `dist`, making desktop startup/build take many minutes on the user's checkout. The target is to eliminate unnecessary per-build copying while preserving the exact local-first Quebec hydro behavior and expected browser/Electron/package deployment model.

Human checkpoint is required if desktop local-hydro loading or packaging behavior changes.

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

Do not tune terrain/imagery/streaming just to see if it helps. A correction requires reproducible evidence.

## Issue #9 — terrain occasionally intrudes over the road surface

**OPEN / PRE-EXISTING / REPRODUCED ON YUNGAS.**

Future diagnosis: reproduce/measure first; inspect terrain/road intersection authority and coarse terrain triangles near steep cuts/switchbacks; preserve road geometry, wheel-ground physics and accepted issue #4 visuals; do not restore retired `road-terrain-transition` as a workaround.

## Issue #10 — steep-slope tire grip and steering instability

**OPEN / USER-REPORTED / DEFERRED.**

On very steep grades, uphill small steering corrections can trigger a spin/loss of directional stability; downhill the vehicle can continue almost straight despite steering input. Reproduce first and inspect large-pitch wheel support, normal-load/grade effects, tire-force coupling, yaw authority and braking/engine-load interaction. Do not retune accepted flat/normal-grade handling speculatively.

## Issue #11 — one civil-traffic vehicle rotated ~90° from route heading

**OPEN / USER-REPORTED / DEFERRED.**

One specific civil-traffic model follows the correct path but its body is visually rotated roughly 90° sideways. Correct only the affected authored/model-forward yaw contract while preserving traffic routing, speed, lane placement and all correctly aligned variants.

## Issue #12 — forest streaming falls behind after ~5 km

**OPEN / USER-REPORTED / DEFERRED.**

After roughly 5 km of continuous driving, forward forest readiness can fall behind the vehicle. This is a streaming/readiness timing defect, not a density/style request. Capture long-drive queue/prefetch/commit/frame-budget diagnostics before changing policy and preserve accepted startup forest density/quality.

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

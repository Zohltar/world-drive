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
**Block 6B — local-data production build-copy optimization:** **DONE/CERTIFIED — HUMAN PASS (2026-09-05)**  
**Issue #2:** **OPEN / watch-only / not reproduced**  
**Issue #9:** **DONE/CERTIFIED — HUMAN YUNGAS VISUAL/PERFORMANCE PASS (2026-09-05)**  
**Issue #10:** **OPEN / steep-slope tire grip and steering instability / deferred**  
**Issue #11:** **OPEN / one civil-traffic model rotated ~90° / deferred**  
**Issue #12:** **OPEN / PARKED — forest streaming falls behind after sustained driving; resume investigation inside Block 8 biome work**  
**Block 8 — Biome-aware natural scenery:** **PLANNED / DEFERRED — includes the parked Issue #12 forest-readiness work when activated**  
**Block 9 — AI-assisted 3D asset authoring and selective GLB modernization:** **PLANNED / DEFERRED — pilot-first, no wholesale asset replacement**  
**Active correction block:** **NONE — await explicit user priority; do not auto-start deferred issues**  
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

Historical human-smoke environment note: the local Windows checkout contains `public/world-data` with 38,018 files / ~16.8 GB. Block 6B now prevents desktop builds from duplicating that generated dataset into `dist` while preserving local hydro access.

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

## Block 6B certified checkpoint

Final human-tested candidate:

```text
candidate/post-refactor-local-data-build-r1
65f3f6c963fcc992d1e9dd4a426125b9897cbbca
```

Key implementation commits:

```text
5ad70dfbf56af6dd8e7052e5b80145d8e43c792c
Desktop: add local world-data static routing helper

d4087528ff355349490c0f75cedafe68916b5cf8
Desktop: serve local world-data outside dist

8cba1e56a155f2da4ade82e95a34a08bca31dc83
Build: exclude generated world-data from desktop dist

093c7c247fa80ef6497cf71f3e31b7429b00038a
Packaging: exclude local world-data roots

9d4eda8eb70910c4edcaab159ddbc030c0d1fea0
Build: use optimized desktop build path
```

Audit evidence and certified behavior:

- the user's generated `public/world-data` contained **38,018 files / ~16.8 GB**;
- Vite's ordinary public-directory copy was the cause of the multi-minute desktop build, not Node/Vite computation or Block 5 multiplayer runtime;
- generated `world-data/` and `public/world-data/` are intentionally untracked/local data;
- local hydro's maintained runtime URL remains `/world-data/osm-v2/quebec/hydro`;
- Electron now serves `/world-data/...` directly from the local `public` tree instead of requiring a duplicated copy under `dist`;
- desktop/package/make use the optimized desktop build path that excludes generated world-data from `dist` while retaining ordinary public assets;
- Electron Forge excludes both local world-data roots so the generated dataset cannot silently bloat the packaged application;
- normal browser production build behavior remains unchanged;
- absence of local hydro still preserves the existing cache/Overpass fallback behavior; local-first source priority and hydro data format were not changed.

Permanent Block 6B QA:

```text
electron/static-resource-routing.cjs
qa/qa-post-refactor-local-data-build-r1.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-post-refactor-local-data-build-r1.yml
```

Focused final candidate run:

```text
33984045538 — PASS
head 65f3f6c963fcc992d1e9dd4a426125b9897cbbca
```

That run passed the local-data build policy QA, a real desktop build exclusion check, Electron package smoke, Quebec local-hydro regression, water hydro regression, Block 6 Overpass parity, full Dev Integration audit, normal browser production build and production code-split QA.

Human Windows checkpoint: **PASS (2026-09-05)** — optimized desktop build/startup accepted and local-first Quebec hydro remained operational.

Post-integration exact-head Dev Integration:

```text
33984338699 — PASS
head 65f3f6c963fcc992d1e9dd4a426125b9897cbbca
```

## Issue #9 certified checkpoint — terrain intrusion over road

Final human-tested candidate:

```text
candidate/issue-9-road-terrain-intrusion-r1
bbee7dc9c17d4b045dcc19699d2fb0652117fef5
```

Diagnosis and certified correction:

- the reproduced defect was caused by coarse fixed-grid satellite imagery triangle interpolation crossing the asphalt on steep cuts/switchbacks;
- at the Yungas latitude, ordinary imagery geometry spacing was ~18.341 m while the near terrain grid was 12.5 m;
- the analytic refined road-earthwork sampler remained below the asphalt, isolating the defect to imagery geometry rather than authoritative road geometry;
- localized road-aware imagery tessellation/refinement reduces geometry spacing to ~3.057 m only around the existing road visual corridor;
- permanent angle/grid-phase matrix coverage retains positive asphalt clearance in the synthetic stress case;
- ordinary satellite resolution is not globally increased;
- terrain is not globally flattened;
- road geometry, vehicle physics, bridge behavior, issue #8 wheel support, Photo ON/OFF behavior and normal terrain shape remain protected;
- retired `road-terrain-transition` remains retired and was not restored as a workaround.

Permanent Issue #9 QA:

```text
qa/qa-issue9-road-terrain-intrusion-r1.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-issue9-road-terrain-intrusion-r1.yml
```

Focused correction candidate run:

```text
33989915911 — PASS
head bbee7dc9c17d4b045dcc19699d2fb0652117fef5
```

Human Yungas visual/performance checkpoint: **PASS (2026-09-05)**.

Post-integration exact-head Dev Integration:

```text
33990413241 — PASS
head bbee7dc9c17d4b045dcc19699d2fb0652117fef5
```

GitHub Issue #9: **CLOSED / COMPLETED (2026-09-05)**.

## Exact next action

**No active correction block. Await explicit user priority.**

Current unresolved work is intentionally not auto-started:

- Issue #2 remains **watch-only / not reproduced**; collect diagnostics only if it reappears;
- Issue #10 remains **deferred**; if prioritized, reproduce steep-slope grip/steering behavior before any physics tuning;
- Issue #11 remains **deferred**; if prioritized, identify the single affected civil-traffic model and audit its authored forward-axis/yaw contract before editing;
- Issue #12 is **PARKED**; do not resume it as a standalone correction. Carry the existing diagnostics and failed-candidate evidence into Block 8 when biome-aware natural scenery work begins;
- Block 7 composition-root reduction remains **deferred / evidence-driven only**;
- Block 8 biome-aware natural scenery remains **planned/deferred**; when activated, begin by reopening and stabilizing forest readiness/streaming as its first runtime workstream, then add biome classification and palette selection;
- Block 9 AI-assisted 3D asset authoring remains **planned/deferred**; begin with one controlled pilot asset and do not replace accepted GLBs wholesale without measured visual/runtime benefit.

Do not modify `main` without explicit user approval. Do not begin a deferred block merely because Issue #9 is complete.

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
| P3 | Local generated `public/world-data` was copied into `dist` on desktop builds | Vite/public-data/desktop packaging path | **DONE/CERTIFIED — Block 6B — HUMAN PASS** |
| P2 | Coarse satellite imagery triangles could cross asphalt on steep road cuts | imagery road-aware geometry refinement | **DONE/CERTIFIED — Issue #9 — HUMAN YUNGAS PASS** |
| P3 | Natural scenery is currently biome-agnostic, allowing ecologically wrong vegetation (for example conifers in tropical regions) | future biome classifier + forest/scenery asset selection | **PLANNED — Block 8** |
| P3 | Current authored GLBs come from heterogeneous sources with inconsistent topology, axes, materials and movable-part/light ownership; newer AI-assisted 3D authoring may enable cleaner World Drive-specific assets | future AI/CAD/Blender authoring pipeline + vehicle/scenery asset QA | **PLANNED — Block 9** |
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

Issue #9 is separate, explicitly predates this block, and is now independently **DONE/CERTIFIED**.

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

## Block 6B — local-data production build-copy optimization

**DONE/CERTIFIED — HUMAN PASS (2026-09-05).** See checkpoint above.

## Issue #9 — terrain intrusion over road

**DONE/CERTIFIED — HUMAN YUNGAS VISUAL/PERFORMANCE PASS (2026-09-05).** See checkpoint above.

---

# 4. Active and future roadmap

## Current active correction block

**NONE — await explicit user priority.**

Do not automatically promote deferred issues into active work. Preserve the certified Issue #9 correction and all prior certified behavior while waiting for a new priority.

---

## Block 7 — Composition root reduction

**DEFERRED — evidence-driven only.**

`src/main.js` may be extracted further only if a concrete feature/bug/testability/performance need proves a coherent ownership boundary. Do not refactor for line count or organization alone.

---

## Block 8 — Biome-aware natural scenery generation

**PLANNED / DEFERRED — when activated, reopen Issue #12 as its first runtime/readiness workstream instead of requiring Issue #12 to be certified beforehand.**

Issue #12 is intentionally parked until this block. The previous human-FAIL candidates and runtime snapshots remain diagnostic evidence, but none of those candidate runtime changes are accepted as a solution. When Block 8 begins, forest readiness must be re-established deliberately before biome-specific content increases scenery complexity.

Goal: generate natural scenery that matches the biome/ecoregion of the driven route instead of using one globally uniform vegetation set. The primary acceptance example is explicit: a tropical route must not spawn boreal-style fir/conifer forest simply because the generic forest generator is active.

Planned behavior and ownership:

- determine a biome/ecoregion classification from route/world coordinates using a deterministic data source or classifier suitable for global driving;
- keep biome classification separate from rendering/streaming ownership: the classifier answers **what natural palette belongs here**, while the existing scenery/forest streamer remains responsible for **when and where chunks are built**;
- select biome-appropriate natural asset pools, including trees, shrubs, ground cover and other lightweight natural props rather than treating all natural scenery as one forest type;
- support at minimum broad families such as boreal/coniferous, temperate mixed/deciduous, tropical, dry scrub/grassland, desert/semi-arid, alpine/tundra and wetland/riparian where reliable input data supports them;
- respect authoritative local masks and exclusions already used by scenery: roads, buildings/landuse, hydro/water, bare rock/scree/sand/beach and other existing blocker semantics remain authoritative;
- allow biome-specific density envelopes without making density a fixed visual-style override; for example desert/tundra should naturally yield sparse or zero tree cover while tropical/temperate forest regions may support dense tree cover;
- use deterministic chunk/coordinate-based selection so revisiting the same route produces stable scenery instead of random species changes;
- blend transitions between biome regions over a bounded corridor/chunk range so route crossings do not create a hard vegetation wall;
- account for elevation where relevant to prevent obviously wrong vegetation above local tree-line/alpine zones, but do not couple this to vehicle physics or terrain authority;
- if biome data is unavailable or uncertain, use a conservative generic/non-specific natural palette rather than injecting a strongly biome-specific species that can be visibly wrong;
- prefer cached/offline/global data where practical; do not make every scenery chunk depend on a fragile live web request;
- preserve current road geometry, terrain/DEM shape, hydro ownership, Photo ON/OFF behavior, multiplayer semantics and deterministic route/cache behavior.

Implementation order when Block 8 is activated:

1. **Issue #12 restart / forest-readiness diagnosis** — reproduce sustained high-speed/long-drive behavior from the current certified `dev`; carry forward the prior human-FAIL snapshots; instrument actual job/builder lifetime, abandonment/restart reasons and prefetch completion; certify a stable readiness baseline before adding biome palette complexity.
2. **Data-source audit / prototype** — compare practical global biome/ecoregion sources or deterministic classifiers for coordinate lookup, licensing, resolution, offline size and runtime cost.
3. **Biome service contract** — expose a small coordinate/route query returning biome id + confidence/transition information, with caching and a conservative fallback.
4. **Palette registry** — map biome ids to authored natural asset pools and density rules without changing forest streaming scheduling.
5. **Chunk integration** — forest/scenery generation chooses deterministic biome-appropriate assets for each chunk while preserving existing blockers and route cache ownership.
6. **Transition blending** — validate smooth biome boundaries and elevation-sensitive variants where applicable.
7. **Performance/readiness QA** — prove biome lookup and multi-palette selection do not regress the newly certified forest readiness, frame budgets, cache limits or long-drive behavior.
8. **Human visual matrix** — test representative routes in materially different environments before certification.

Minimum automated acceptance matrix should include representative coordinates/routes for at least:

```text
boreal / northern coniferous
humid temperate / mixed forest
tropical
arid desert / semi-arid
alpine or tundra
```

Required assertions include:

- tropical classification cannot select a boreal-only fir/conifer pool;
- desert/semi-arid classification cannot silently fall back to dense generic forest;
- identical coordinates + biome data yield deterministic asset selection;
- biome transition logic remains bounded and deterministic;
- blocker/hydro/road exclusions remain authoritative;
- forest readiness/performance regression suite remains green after biome integration.

Human certification should compare at least one clearly tropical route, one northern/boreal route and one arid/high-altitude route. Visual plausibility, absence of obviously wrong dominant vegetation, smooth transitions and sustained-driving performance are acceptance criteria.

Do not start Block 8 by simply swapping tree models globally. Re-establish forest readiness first, then establish the biome classifier/data contract so asset selection has an explicit geographic owner.

---

## Block 9 — AI-assisted 3D asset authoring and selective GLB modernization

**PLANNED / DEFERRED — pilot-first. GLB remains the runtime interchange format unless a separate future decision explicitly changes that contract.**

Goal: evaluate whether modern AI-assisted 3D/CAD/Blender workflows can produce World Drive-specific assets that are visually superior and structurally cleaner than the heterogeneous third-party GLBs currently in use, while preserving or improving runtime performance. This is an **authoring-pipeline evolution**, not a plan to replace GLB loading/rendering itself.

Primary opportunities:

- create vehicle assets from curated multi-view references, dimensions and known geometry instead of accepting whatever topology/orientation/material layout exists in a downloaded model;
- author moving/interactive parts intentionally: wheels, steering wheel, suspension-visible pieces where relevant, brake calipers, doors if ever needed, and other parts with explicit pivots/axes;
- author lighting surfaces intentionally: low beam/high beam, tail/running lights, brake lights, reverse lights and turn signals as clean named regions/materials rather than reverse-engineering emissive surfaces after import;
- create predictable windshield/window materials and interior geometry suitable for first-person camera use;
- produce biome/scenery families for Block 8 with consistent style, scale, topology and LOD policy rather than mixing unrelated asset sources;
- reduce recurring integration defects such as wrong forward axis, wheels rotating on the wrong axis, rotating calipers, hidden duplicate geometry, unusable material names or lighting regions that cannot be isolated cleanly.

Authoring contract to target:

```text
reference images / dimensional data / authored requirements
→ AI-assisted reconstruction or CAD/Blender generation
→ human/automated geometry review
→ topology cleanup + UV/PBR material pass
→ explicit object naming/pivots/light ownership
→ LOD + collision/proxy generation where required
→ optimization/compression
→ GLB export
→ World Drive asset QA + runtime benchmark
```

The pipeline may use advanced multimodal/3D-capable models and tools (including Astra-class workflows when useful), but the canonical contract must remain **tool-agnostic**: generated assets are accepted based on measurable asset quality and runtime behavior, not because they were produced by a specific model/vendor.

### Pilot before any fleet replacement

Start with exactly one vehicle whose current behavior and visuals are well understood — preferred candidates are the ID.4 or WRX. The incumbent GLB remains the baseline and rollback asset.

The pilot must preserve or improve:

- exterior proportions and recognizable vehicle identity;
- interior quality where the first-person camera can see it;
- wheel position, radius, track and wheelbase alignment;
- correct vehicle-forward axis and consistent local axes;
- wheel/tire/mag rotation ownership;
- fixed caliper/non-rotating brake component ownership;
- steering-wheel pivot/column axis;
- windshield/window transparency and night behavior;
- headlights, running lights, brake lights, reverse lights and indicators;
- existing vehicle physics contract — replacement art must not silently retune handling or collider/support behavior.

### Runtime/asset acceptance gate

Do not accept a generated replacement based on screenshots alone. Compare the pilot against the incumbent GLB using the same route/camera/settings and record at minimum:

```text
triangle / vertex count
material count
draw-call impact
GLB size on disk
decoded/estimated GPU memory
load/decode time
first-use hitch behavior
steady-state FPS / frame time
LOD behavior if present
visual quality exterior
visual quality first-person/interior
night-light correctness
animation/pivot correctness
```

A visually superior asset may still be rejected if its topology, memory, draw calls or frame-time cost are materially worse without enough visual benefit.

### Topology/material quality requirements

- avoid gratuitous hidden/interior geometry that never contributes to gameplay visuals;
- avoid uncontrolled ultra-high-poly reconstruction;
- use clean normals/tangents and no obvious shading seams on primary body panels;
- keep material count intentionally bounded;
- prefer PBR materials compatible with the existing rendering path;
- ensure transparent materials do not recreate known white-window/reverse-light ordering artifacts;
- keep authored mesh/object names stable enough for registry/controller binding and permanent QA;
- where source reconstruction is imperfect, human cleanup in Blender/CAD is expected rather than accepting malformed generated geometry.

### Provenance and licensing

For every generated or reference-derived asset, record enough provenance to know:

- which reference images/data were used;
- whether those references are permitted for this use;
- which generation/editing tools contributed;
- whether any third-party geometry/textures were incorporated;
- the final asset's intended project license/usage status.

Do not treat AI generation as bypassing copyright, trademark, model-source or texture licensing concerns.

### Integration strategy

1. **Pilot specification** — define one known vehicle's dimensions, visual references, moving-part/light contract and incumbent benchmark.
2. **Asset generation** — produce one candidate through the AI-assisted authoring pipeline.
3. **Cleanup/optimization** — fix topology, pivots, materials, lights, UVs and LODs before runtime integration.
4. **Side-by-side runtime integration** — add as a candidate asset without deleting/replacing the incumbent GLB.
5. **Automated asset QA** — validate object contracts, finite transforms, axis/pivot ownership, material/light region presence, asset-size bounds and build/code-split behavior.
6. **Performance benchmark** — compare load/hitch/FPS/frame-time/memory/draw-call impact against the incumbent.
7. **Human visual checkpoint** — exterior, first-person, day/night, braking/reverse/indicator behavior.
8. **Selective adoption only** — replace the incumbent only after explicit human PASS; otherwise retain the current GLB and use findings to improve the pipeline.

If the pilot succeeds, expand selectively to other vehicles and then to Block 8 natural assets. Do not mass-regenerate the vehicle fleet in one change. Each replacement remains individually reviewable and rollback-safe.

Protected rule: **Block 9 must not alter vehicle physics, wheel-ground support, multiplayer vehicle semantics, code-split/lazy-loading behavior or the GLB registry contract merely to accommodate a generated asset.** The asset should conform to World Drive's runtime contract; the runtime should not be weakened to fit a poor asset.

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

## Issue #10 — steep-slope tire grip and steering instability

**OPEN / USER-REPORTED / DEFERRED.**

On very steep grades, uphill small steering corrections can trigger a spin/loss of directional stability; downhill the vehicle can continue almost straight despite steering input. Reproduce first and inspect large-pitch wheel support, normal-load/grade effects, tire-force coupling, yaw authority and braking/engine-load interaction. Do not retune accepted flat/normal-grade handling speculatively.

## Issue #11 — one civil-traffic vehicle rotated ~90° from route heading

**OPEN / USER-REPORTED / DEFERRED.**

One specific civil-traffic model follows the correct path but its body is visually rotated roughly 90° sideways. Correct only the affected authored/model-forward yaw contract while preserving traffic routing, speed, lane placement and all correctly aligned variants.

## Issue #12 — forest streaming falls behind after sustained driving

**OPEN / USER-REPORTED / PARKED — resume as part of Block 8 biome-aware natural scenery work.**

After sustained continuous driving, especially at very high vehicle speed, forward forest readiness can fall behind the vehicle. This is a streaming/readiness timing defect, not a density/style request.

Standalone correction work is intentionally paused. Multiple experimental candidates were human FAIL and were not integrated into `dev`. The accumulated runtime evidence remains useful: failure can occur while overall FPS stays high, with forest queues/backlog growing and forward prefetch remaining unready. Do not restart old candidate-cap, timeout, recenter-reset or observer-center theories as accepted fixes merely because they passed automation.

When Block 8 is activated, reopen Issue #12 first and use a diagnostic-first approach: trace actual forest job/builder lifetime, completion, abandonment/restart reasons, wanted-set churn and prefetch readiness under sustained driving. Certify a stable forest-readiness baseline before biome-specific asset selection is layered on top. Until then, do not spend additional standalone correction cycles on Issue #12.

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

## Issue #9 — terrain intrusion over road

**CLOSED / DONE/CERTIFIED — HUMAN YUNGAS PASS (2026-09-05).**

Protected correction is localized road-aware imagery geometry refinement around the existing road visual corridor. It prevents coarse imagery triangle interpolation from crossing asphalt on steep cuts/switchbacks without globally increasing satellite resolution or flattening terrain.

Preserve:

- the localized refinement scope;
- authoritative road geometry and refined road-earthwork sampler;
- bridge behavior and issue #8 wheel support;
- Photo ON/OFF behavior and normal terrain shape;
- retired `road-terrain-transition` remaining retired.

Do not replace this with broad terrain flattening, global imagery tessellation increases, or physics retuning without new causal evidence and dedicated QA.

---

# 8. Protected behavior / prohibitions

Preserve unless a future block has direct causal evidence and dedicated QA:

- accepted vehicle handling, suspension and tire behavior;
- road/bridge geometry;
- wheel-ground support including issue #8;
- terrain authority and DEM shape;
- certified localized Issue #9 road-aware imagery refinement;
- Photo ON visual quality;
- forest density/readiness/streaming policy;
- local-first Quebec hydro behavior;
- water/scenery/sign semantics;
- routing/settings UX;
- multiplayer gameplay/protocol semantics;
- cache persistence;
- diagnostic aliases used by permanent QA;
- production code-split/lazy GLB behavior;
- GLB remains the accepted runtime asset contract unless a separate explicitly approved architecture decision changes it; AI-assisted authoring alone is not permission to redesign the runtime asset pipeline.

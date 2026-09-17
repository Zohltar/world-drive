# World Drive — Canonical Development & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Current stable `main`: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` — World Drive V21.33 stable — tag `v21.33`
Previous rollback/reference: `b74e7377eaaf2b128eb893c547f4c2da3d14bbea` — World Drive V21.32 stable — tag `v21.32`
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
**Release V21.33:** **PUBLISHED/STABLE (2026-09-16) — tag `v21.33` @ `ad893a9d078df4a3d24d81b929bb2905a8bc57e1`; Windows release run `35122084068` PASS; installer + portable ZIP published**
**Historical post-release `dev` reopening baseline:** `e07c3c2db3a03821c077ea6bd5aa31f6ca8671ac` — `Dev: reopen V21.33 development channel`; package/channel `21.33.0 dev`; Dev Integration `35122659744` PASS
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
**Issue #10:** **DONE/CERTIFIED — HUMAN PASS (2026-09-12) — steep planar road-contact correction**  
**Issue #11:** **DONE/CERTIFIED — HUMAN PASS (2026-09-16); integrated `dev` checkpoint `4ad64194d53849c0c344872b59ffab2c1b3ba2a2`, exact-head Dev Integration `35104245846` PASS**
**Issue #12:** **DONE/CERTIFIED — HUMAN PASS (2026-09-17) — R4 progressive first-layer forest-readiness correction; runtime/reference `ca1fbb4b7b3448a2f18ae655545046464acba4e3`, post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f`, exact-head Dev Integration `35229697126` PASS**
**Issue #13:** **DONE/CERTIFIED — HUMAN PASS (2026-09-12) — bounded road-articulation contact correction**  
**Block 8 — Biome-aware natural scenery:** **ACTIVE on existing PR #14; forest readiness remains certified on `dev`. Biome work is NOT integrated or visually activated. Current candidate milestone, exact-head QA and next action are in `WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md`.**
**Block 9 — AI-assisted 3D asset authoring and selective GLB modernization:** **PLANNED / DEFERRED — pilot-first, no wholesale asset replacement**  
**Block 10 — Mobile browser driving controls:** **ABANDONED / NOT PLANNED (2026-09-13) — experiment stopped by user; no mobile-control candidate runtime was integrated**  
**Block 11 — Circuit presets / closed-loop authored track routes:** **DONE/CERTIFIED — Laguna Seca HUMAN PASS (2026-09-14); Nordschleife performance HUMAN PASS (2026-09-15); no-ABS runtime and continuous guard rails HUMAN PASS (2026-09-16); integrated `dev` checkpoint `568f557a051832559fa1f3166350cc338a399ee1`, exact-head Dev Integration `35054930198` PASS**
**Active correction block:** **NONE — Issue #12 R4 is certified; Block 8 continues as feature work with biome/ecoregion classification and palette selection**
**Stable `main`:** `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` — tag `v21.33`; must remain untouched without explicit user approval.
**Previous rollback/reference:** `b74e7377eaaf2b128eb893c547f4c2da3d14bbea` — tag `v21.32`.

## Block 8 active-candidate restart checkpoint

**Current candidate ledger:** [WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md](WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md).
Read it together with the live PR #14 and its exact-head QA before any Block 8 change.
The ledger is part of this canonical plan and distinguishes candidate evidence from integrated runtime.

- Existing work branch: `candidate/block8-biome-classifier-r1`, PR #14. Do NOT create a second initial biome prototype.
- Last verified R3 milestone: `5b0fc2c65aa6db9b46a7dce11524c45330091eee`, run `35251431662` PASS. Later work is tracked in the ledger and live PR, not inferred from this historical milestone.
- Integrated runtime baseline before this documentation synchronization: `dev` at `45ab6bc770097239add81eeaca9c4d32de9968a2`, canonical Dev Integration `35230199150` PASS.
- Documentation-only advances on `dev` do NOT integrate PR #14 or activate biome code. Verify the actual current docs HEAD and its own Dev Integration result live.
- Forest R4 scheduler/budgets/full density, road/terrain/hydro/physics and stable `main` remain protected.
- Candidate data-contract/representation PASS is NOT current tree-cover accuracy, global fine coverage, human visual PASS or browser frame-pacing certification.

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

## Issue #10 certified checkpoint — steep-slope tire grip and steering instability

Final human-tested candidate:

```text
candidate/issue-10-steep-slope-grip-r1
e263198ff13fccd068a0571dadf9e4fd70be393c
```

Diagnosis and certified correction:

- on a uniform steep planar grade, the legacy suspension/contact path could consume road pitch as suspension travel;
- uphill, the downhill/rear axle could be marked out of contact; downhill, the front/steering axle could be marked out of contact;
- those false contact flags removed per-wheel normal force and could collapse steering/yaw authority;
- `src/physics/steep-slope-contact.js` restores contact only while road support owns the chassis, the vehicle is not airborne, and the wheel-ground samples agree on one steep planar support surface;
- no tire friction, steering curve, suspension constant, engine/brake tuning, terrain authority, Issue #8 wheel-ground ownership or airborne/crest solver was retuned.

Permanent Issue #10 QA:

```text
qa/qa-issue10-steep-slope-contact-r2.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
```

Focused correction run `34707273234`: PASS.  
Human steep-grade checkpoint: **PASS (2026-09-12)**.  
Integrated to `dev` with merge commit `c918fbaf3c99815b200d0a30eb01c22cc7fca50f`.  
Post-integration exact-head Dev Integration `34711772544`: **PASS**.  
GitHub Issue #10: **CLOSED / COMPLETED (2026-09-12)**.

## Issue #13 certified checkpoint — low-speed four-wheel lateral slide on sloped corner exits

Final human-tested candidate/runtime head:

```text
candidate/issue-13-low-speed-lateral-slide-r1
814035fd8dc88ef44191a45b8ec4a8d1d33e106b
```

Diagnosis and certified correction:

- a sloped corner exit with changing road bank/superelevation can make the four wheel-ground samples form a shallow saddle rather than a perfect plane;
- the legacy vertical-gap contact test could interpret bounded suspension articulation as separation and falsely drop two diagonal contacts;
- dynamic low-speed stress reproduced 14 pathological cases before correction; the worst reproduced BMW i3 case reached ~11.13° sideslip at 10.8 km/h versus ~0.28° on flat support;
- the correction adds a separate bounded road-articulation restoration path that restores only false contacts whose best-plane residual fits inside a bounded fraction of real suspension travel;
- large one-corner discontinuities remain true contact losses and airborne/crest ownership remains unchanged;
- no global tire-grip increase, steering-curve retune, stability assist or generic friction multiplier was introduced.

Permanent Issue #13 QA:

```text
qa/qa-issue13-low-speed-lateral-slide-repro-r1.mjs
qa/qa-issue13-low-speed-lateral-runtime-r2.mjs
qa/DEV_INTEGRATION_AUDIT.mjs
.github/workflows/qa-issue13-low-speed-lateral-slide-r1.yml
```

Final candidate exact-head run `34712739118`: **PASS**; pathological very-low-speed trajectory cases reduced **14 → 0**, while Issue #10, airborne/crest, road re-entry, wheel-ground ownership, driving simulation, build and code-split regressions stayed green.  
Human checkpoint: **PASS (2026-09-12)** — the reported slide is gone in the tested scenario and the user also reports generally more stable chassis support.  
Integrated to `dev` by fast-forward to `814035fd8dc88ef44191a45b8ec4a8d1d33e106b`.  
Post-integration exact-head Dev Integration `34713263380`: **PASS**.  
GitHub Issue #13: **CLOSED / COMPLETED (2026-09-12)**.

## Exact next action

**Resume the EXISTING Block 8 candidate / PR #14 at the exact next action in `docs/WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md`, checked against live exact-head QA. R1 source audit, R2 local refinement and R3 service/palette contracts are historical completed candidate milestones, not a request to restart them. The ledger tracks subsequent loading/distribution and visual gates. Preserve the certified forest R4 scheduler and keep candidate work separate from integrated runtime.**

Current unresolved work is intentionally not auto-started:

- Issue #2 remains **watch-only / not reproduced**; collect diagnostics only if it reappears;
- Issue #11 is **DONE/CERTIFIED**: the measured-axis R2 correction received HUMAN PASS and is included in V21.33;
- Issue #12 is **DONE/CERTIFIED inside Block 8**; R4 received HUMAN PASS on 2026-09-17 with no visible forest cutoff ahead at high speed. Candidate focused run `35180462666` PASS; post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f` passed exact-head Dev Integration `35229697126`;
- Block 7 composition-root reduction remains **deferred / evidence-driven only**;
- Block 8 biome-aware natural scenery is **ACTIVE on existing PR #14**; consult the active-candidate ledger for the latest unmerged milestone and exact next action. Biome code has not been visually activated; preserve the forest R4 scheduler/budgets;
- Block 9 AI-assisted 3D asset authoring remains **planned/deferred**; begin with one controlled pilot asset and do not replace accepted GLBs wholesale without measured visual/runtime benefit;
- Block 10 mobile browser driving controls is **ABANDONED / NOT PLANNED** by user decision; do not integrate the retired candidate branch.
- Block 11 is **DONE/CERTIFIED**: Laguna Seca has HUMAN PASS. Nordschleife R4 checkpoint `36a1adecfdcbbaa59e3994423d8ff62cefd9e067` passed exact-head run `34918367074`, and the user confirmed normal performance on 2026-09-15. Physics Trail-Braking R2 then passed exact-head run `35022259552` but received HUMAN FAIL because the WRX remained very understeered. R3 implementation checkpoint `c5f2c60ec44bb8628b3e68c331fdc3b788332c14` passed run `35026732737`; final docs checkpoint `bb23e201645b61e2cb4c18bdfc7906fea0a4c30c` passed run `35026882948`. Physics ABS Toggle R1 implementation checkpoint `6ab85c244af4e65eafb0e2356b6a100e7b01f384` passed exact-head run `35030137277`, and final checkpoint `8eacda43baab8c4341fcb00da887c789bc60f969` passed run `35030318769`. The human comparison confirmed correct trail braking with ABS OFF; the subsequent R4 correction was still rejected as problematic. By user decision ABS was removed from gameplay. The final candidate also corrected the reported repeated Nordschleife guard-rail gaps with 5 m pitched, overlapping spans while preserving single-batch instancing. Human PASS was recorded on 2026-09-16, final candidate checkpoint `e5d14b2351ed3958a0171add4f3bca3862675d26` passed run `35054421284`, and integrated `dev` checkpoint `568f557a051832559fa1f3166350cc338a399ee1` passed exact-head Dev Integration `35054930198`.

Do not modify `main` without explicit user approval. Do not begin a deferred block merely because the latest certified corrections are complete.

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
| P2 | Steep planar road pitch could be consumed as suspension travel and drop an axle contact | `src/physics/steep-slope-contact.js`, vehicle presentation/contact path | **DONE/CERTIFIED — Issue #10 — HUMAN PASS** |
| P2 | Bounded pitch/bank articulation could drop diagonal wheel contacts and trigger a low-speed lateral slide | `src/physics/steep-slope-contact.js`, `src/vehicles/vehicle-presentation.js` | **DONE/CERTIFIED — Issue #13 — HUMAN PASS** |
| P3 | Natural scenery is currently biome-agnostic, allowing ecologically wrong vegetation (for example conifers in tropical regions) | `src/scenery/biomes/` on candidate PR #14; future visual asset integration | **ACTIVE — latest candidate milestone/QA in active-candidate ledger; not integrated/activated** |
| P3 | Current authored GLBs come from heterogeneous sources with inconsistent topology, axes, materials and movable-part/light ownership; newer AI-assisted 3D authoring may enable cleaner World Drive-specific assets | future AI/CAD/Blender authoring pipeline + vehicle/scenery asset QA | **PLANNED — Block 9** |
| P3 | Browser build runs on phones but lacks a purpose-built mobile driving input scheme | retired Block 10 experiment | **NOT PLANNED — user decision 2026-09-13** |
| P2 | Preset system has no first-class closed-loop circuit route support | route presets + route lifecycle/routing input boundary | **DONE/CERTIFIED — Block 11 — Laguna Seca + Nordschleife HUMAN PASS** |
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

## Issue #10 — steep-slope tire grip and steering instability

**DONE/CERTIFIED — HUMAN PASS (2026-09-12).** See checkpoint above.

## Issue #13 — low-speed four-wheel lateral slide on sloped corner exits

**DONE/CERTIFIED — HUMAN PASS (2026-09-12).** See checkpoint above.

## Issue #12 — sustained-driving forest readiness

**DONE/CERTIFIED — HUMAN PASS (2026-09-17).**

Final human-tested candidate:

```text
candidate/block8-forest-readiness-r4
ca1fbb4b7b3448a2f18ae655545046464acba4e3
```

Certified R4 behavior:

- first visible layer uses 64 of the existing 109 candidates per cell across all 16 cells: 1,024 evaluations before first display versus 1,744 for a fully densified chunk;
- after the first layer, remaining densification is demoted behind every still-empty coverage job;
- R3 coverage-before-replacement priority remains preserved;
- exact bounded route/hydro proximity indexes remain preserved;
- normal scheduler budget remains `.95 ms / 12 candidates` and catch-up remains `1.55 ms / 20 candidates`;
- full 109-candidate density remains unchanged after densification;
- deterministic route/cache, blocker, hydro, road-clearance and terrain-refresh semantics remain protected.

Focused R4 candidate run `35180462666`: **PASS**.  
Human checkpoint: **PASS (2026-09-17)** — no visible forest cutoff ahead at high speed.  
Runtime/reference integrated from `ca1fbb4b7b3448a2f18ae655545046464acba4e3`.  
Post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f`; exact-head Dev Integration `35229697126`: **PASS**.  
GitHub Issue #12: **CLOSED / COMPLETED (2026-09-17)**.

---

# 4. Active and future roadmap

## Current active correction block

**NONE — Issue #12 R4 is integrated and certified; Block 8 continues as planned feature work rather than an active correction.**

The forest-readiness baseline is now protected. Block 8 may proceed with biome/ecoregion classification and natural-palette selection, but the certified R4 scheduling budgets, coverage-first priority, bounded route/hydro queries and deterministic first-layer behavior must not be retuned incidentally.

---

## Block 7 — Composition root reduction

**DEFERRED — evidence-driven only.**

`src/main.js` may be extracted further only if a concrete feature/bug/testability/performance need proves a coherent ownership boundary. Do not refactor for line count or organization alone.

---

## Block 8 — Biome-aware natural scenery generation

**ACTIVE — Issue #12 forest readiness is DONE/CERTIFIED. Biome R1/R2/R3 are validated candidate milestones; current unmerged work and next action are recorded in `WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md`.**

Issue #12 is now **DONE/CERTIFIED**. R1 added job/builder lifecycle evidence and received HUMAN FAIL near 2.4 km. R2 replaced the unbounded route/hydro predicates with exact bounded spatial indexes and improved browser throughput, but still received HUMAN FAIL at 3.5 km. R3 preserved the certified budgets and geographic indexes while making missing visible coverage authoritative over replacements and limiting terrain-refresh builder resets to the affected radius; the human retest improved both reach and appearance speed but remained insufficient. R4 kept those gains and added a deterministic 64/109-candidate first layer across all 16 cells: **1,024 evaluations before first display instead of 1,744**, followed by background densification at lower priority than any still-empty coverage. Candidate `candidate/block8-forest-readiness-r4` focused run `35180462666` passed the progressive-layer, spatial parity, lifecycle, frame-budget, prefetch, stress, hydro, integration-audit and production-build matrix. The user gave **HUMAN PASS on 2026-09-17**, reporting no visible forest cutoff ahead at high speed. Runtime/reference head `ca1fbb4b7b3448a2f18ae655545046464acba4e3` was integrated to `dev`; post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f` passed exact-head Dev Integration `35229697126`. GitHub Issue #12 is CLOSED / COMPLETED.

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

1. **Issue #12 restart / forest-readiness diagnosis — DONE/CERTIFIED (2026-09-17)** — R4 progressive first-layer scheduling received HUMAN PASS and is now the protected readiness baseline.
2. **Data-source audit / prototype — R1/R2 candidate QA PASS** — pinned RESOLVE source, two real regional atlases and bounded source-polygon local refinement. See candidate evidence; this is not global fine-coverage or ecological field certification.
3. **Biome service contract — R3 candidate QA PASS** — maintained owner, verified preparation, fixed source identity, stale-route tokens and conservative fallback; no game entrypoint activation.
4. **Palette registry contract — R3 candidate QA PASS; real assets still pending** — deterministic compatible selection and explicit placement permission; the actual registry remains empty. No density or scheduler retune.
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

## Block 10 — Mobile browser driving controls

**ABANDONED / NOT PLANNED (2026-09-13) — user decision. No candidate runtime from this experiment is accepted or integrated.**

Observed feasibility: the current browser build already runs well enough on a phone in Chrome to justify a dedicated mobile-control workstream rather than a separate mobile game/runtime.

Goal: make World Drive comfortably drivable from a phone or tablet using a minimal driving interface: **touch accelerator + touch brake + device tilt as steering**. The phone should behave like a small steering wheel: tilting left/right produces the same normalized steering intent already consumed by the existing driving input path.

Planned interaction contract:

- recommend/optimize for **landscape orientation** while driving;
- provide two large, thumb-friendly press-and-hold touch pedals: accelerator and brake;
- expose pedal state through the same normalized throttle/brake input contract used by existing controls; the first implementation may use full-pressure hold, but the input boundary should permit future analog touch pressure/drag without physics changes;
- use device orientation / motion sensors for steering by left/right phone tilt;
- establish a neutral steering angle through an explicit calibration step when mobile driving begins;
- provide a one-tap **recenter/calibrate steering** action while driving;
- include configurable steering sensitivity and dead zone so small hand tremors do not cause constant steering corrections;
- filter sensor noise with bounded smoothing while keeping response fast enough for corrective steering;
- clamp tilt-to-steering mapping to the existing normalized steering range rather than adding mobile-only steering authority;
- correctly remap sensor axes when the screen is in landscape orientation;
- request motion/orientation permission only from an explicit user gesture on browsers/platforms that require it;
- if orientation sensors are unavailable, denied or unreliable, provide a fallback on-screen steering control rather than making the game undrivable;
- support simultaneous multi-touch so accelerator/brake interaction does not block menu/camera/recenter controls;
- prevent browser scroll/zoom/text-selection gestures inside the active driving-control zones;
- respect mobile safe-area insets/notches and avoid covering critical HUD/minimap information;
- keep sensor data local to the client; steering sensor samples are input state and do not need to be transmitted beyond the normal gameplay/multiplayer state already owned by the runtime.

Ownership / architecture:

```text
mobile browser detection / capability check
→ mobile control UI
→ touch pedal state + tilt steering state
→ normalized World Drive input contract
→ existing driving runtime / physics
```

Do **not** create a second vehicle-physics implementation for mobile. Mobile steering, throttle and brake must enter above the existing driving runtime just like keyboard/gamepad input. Accepted physics, traction, suspension, transmission and multiplayer behavior remain shared.

Suggested implementation order when Block 10 is activated:

1. **Capability audit** — verify current Android Chrome behavior and enumerate device-orientation permission/API behavior needed for Android/iOS browsers.
2. **Input owner** — add a small mobile controller module that outputs normalized steering/throttle/brake state without DOM/physics coupling.
3. **Tilt calibration** — neutral angle, landscape axis mapping, dead zone, sensitivity, smoothing and recenter behavior.
4. **Touch pedals** — large accelerator/brake controls with robust pointer/touch lifecycle handling, including lost/cancelled touches.
5. **Fallback steering** — on-screen steering slider/pad/buttons when motion/orientation input is unavailable or denied.
6. **Responsive driving HUD** — safe-area-aware layout that keeps route/minimap/speed information readable and prevents browser gestures from stealing control input.
7. **Automated input QA** — synthetic tilt/touch sequences, orientation changes, permission failure and touch-cancel cases; prove desktop keyboard/gamepad mappings are unchanged.
8. **Human device matrix** — Android Chrome first, then at least one iOS browser/Safari-compatible path if available; validate steering feel, latency, accidental input, readability, thermals/frame pacing and battery impact.

Minimum automated acceptance should verify:

- neutral calibrated phone angle yields zero steering command;
- equal left/right tilt produces symmetric bounded steering values;
- dead-zone input stays centered;
- landscape axis remapping does not reverse or rotate steering unexpectedly;
- releasing/cancelling a touch always returns throttle/brake to zero;
- simultaneous steering + throttle and steering + brake are supported;
- denied/unavailable orientation sensors activate a usable fallback steering path;
- desktop keyboard/gamepad inputs produce identical normalized control values before and after Block 10;
- mobile controls do not alter vehicle physics parameters or multiplayer protocol semantics.

Human certification should include sustained driving, tight turns, gentle highway corrections, braking while steering, browser tab/app interruption and return, and at least one route with non-trivial terrain. The desired feel is direct but not twitchy: the driver can rest the phone at a comfortable neutral angle, steer naturally by tilting it and keep both thumbs primarily on acceleration/braking.

Do not start Block 10 by rewriting the HUD or physics globally. First isolate the mobile input owner and prove that it can feed the existing normalized controls cleanly.


---

## Block 11 — Circuit presets / closed-loop authored track routes

**DONE/CERTIFIED — Laguna Seca HUMAN PASS (2026-09-14); Nürburgring Nordschleife performance HUMAN PASS (2026-09-15); fixed-bias no-ABS behavior and continuous guard rails HUMAN PASS (2026-09-16); integrated exact-head Dev Integration `35054930198` PASS.**

Goal: add famous closed-loop race circuits to the existing preset-route experience while keeping ordinary road routing unchanged. Circuit presets should be deterministic, offline-friendly after code delivery, and suitable as repeatable vehicle/terrain stress routes.

### Block 11A — Laguna Seca

**HUMAN PASS (2026-09-14).** The first-class closed-loop route, authored width and circuit traffic policy are accepted as the foundation for Block 11B.

Deliver the current Grand Prix layout of WeatherTech Raceway Laguna Seca as the first circuit preset. Use verified/authored track geometry rather than depending on a live road router accepting `highway=raceway` at runtime. The route must form one continuous closed loop, preserve the circuit's real-world shape and elevation context, and start at a sensible point on the main straight.

Acceptance:

- preset appears alongside existing routes under an unambiguous circuit label;
- closed-loop geometry is deterministic and does not require OSRM/Overpass at play time;
- total loop length is consistent with the ~3.602 km current layout within an explicitly tested tolerance;
- no large coordinate/segment discontinuity or accidental shortcut exists;
- ordinary Manic-2/Manic-5, Route 169, Route 132 and Yungas presets keep their existing routing behavior;
- no vehicle-physics, tire, suspension, wheel-ground, terrain/DEM, imagery, multiplayer or desktop-input tuning is introduced;
- permanent QA covers circuit geometry/closure, preset wiring, existing preset regression, production build and code split;
- human checkpoint drives the full lap and specifically inspects the Corkscrew, route continuity, road/terrain ownership and spawn orientation.

### Block 11B — Nürburgring Nordschleife

**DONE/CERTIFIED — R1 exact-head automation passed; the first human performance checkpoint failed at ~10 FPS (2026-09-15); R3 checkpoint `6304d67` passed exact-head run `34915719869` but its diagnostic retest remained at 8.195 FPS; R4 checkpoint `36a1ade` passed exact-head run `34918367074` and subsequently received HUMAN PERFORMANCE PASS. ABS was removed by user decision. The fixed-bias driving behavior and relief-following continuous guard rails received HUMAN PASS on 2026-09-16, then integrated `dev` checkpoint `568f557a051832559fa1f3166350cc338a399ee1` passed Dev Integration run `35054930198`.** The accepted closed-loop preset infrastructure now provides the Nordschleife as the longer/high-load circuit and streaming stress route.

R1 contract:

- deterministic clockwise full-lap snapshot from OpenStreetMap relation `38566`, rotated to T13;
- 1,068 committed coordinates across 52 continuously joined source ways;
- 20,746.13 m measured source centreline, checked against the official 20,832 m full-lap definition;
- 9 m nominal asphalt and exactly matching physical wheel-support core; no circuit centre line and no civil traffic;
- long circuits retain a bounded 5.4 km local road profile that wraps through start/finish rather than building 20.8 km on every world refresh;
- adaptive road sections are checked across seven points around the lap and may not exceed 1.501 m;
- directional terrain/data preloading wraps through T13 instead of clamping to the route endpoint;
- static OSM guard rails, distant building boxes and dam sections are instanced by homogeneous material instead of creating one draw call per section;
- forest exclusion polygons use a local spatial index, and small backwards corrections on the closed loop do not retrigger a full-lap directional prefetch;
- bridge features crossing T13 use their minimum circular span rather than a linear almost-full-lap span, and enhanced bridge parts are emitted through at most eight static instance batches;
- `WorldDriveFramePacing().rendering` exposes draw calls, triangle/object/instance counts and scenery batch statistics for the human performance checkpoint;
- permanent QA covers source closure/direction/length, UI/lifecycle forwarding, seven local road windows, finite mesh bounds, T13 contact continuity, physical width, streaming wrap, Laguna regression, full driving matrix, integration and production build.

Human acceptance covered the WRX driving behavior, performance and the reported guard-rail visual defect. The accepted result provides predictable fixed-bias trail braking without the problematic ABS intervention, while keeping the previously accepted Nordschleife performance. R1 uses real-world centreline and elevation context, but does not claim survey-grade surface detail or an exact authored concrete-bowl model for the Karussell; that special surface must not be approximated silently without a defensible geometry source.

Implementation order:

1. audit the current preset/routing lifecycle and source verified Laguna Seca raceway geometry;
2. add the smallest authored closed-loop route contract needed by circuit presets, without changing generic road routing;
3. wire Laguna Seca into the preset UI;
4. add focused permanent QA and exact-head candidate integration QA;
5. human Laguna Seca lap test;
6. integrate to `dev`, run exact-head Dev Integration, update this plan;
7. only then open Nordschleife work — **DONE (Laguna HUMAN PASS 2026-09-14)**;
8. validate and publish the isolated Nordschleife R1 candidate;
9. perform the human full-lap checkpoint before any integration to `dev`.

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

**CLOSED / DONE/CERTIFIED — HUMAN PASS (2026-09-12).**

The defect was reproduced as false axle contact loss on steep but planar road support: road pitch was being consumed as suspension travel. The accepted correction restores contact only when the road already owns support, the vehicle is not airborne and wheel-ground samples agree on one steep planar surface. Preserve this narrow ownership contract; do not replace it with global grip, steering or suspension retuning.

## Issue #11 — one civil-traffic vehicle rotated ~90° from route heading

**DONE/CERTIFIED — HUMAN PASS (2026-09-16).**

The blue generic-pack `coupe` followed the correct path but its body was visually rotated roughly 90° sideways. The supplied asset confirmed why: this is the only pack body with its longitudinal geometry authored near X rather than Y. Candidate `5ffff22d39fd1b3aced3111b3bf9189872a8b10b` applied an initial `-90°` correction and passed exact-head workflow `35100053764`, but received HUMAN FAIL because a smaller diagonal yaw remained. Direct principal-axis measurement of all 4,671 authored body/glass/optics vertices found an additional `17.66783°` source rotation; R2 candidate `7328f1401de8d5309a1b0f0a8a62f37eeeb014d7` therefore uses the complete `-107.66783°` correction before length normalization and passed exact-head workflow `35100860270`. The forced-spawn retest received HUMAN PASS on 2026-09-16. The accepted candidate was integrated to `dev` at `4ad64194d53849c0c344872b59ffab2c1b3ba2a2`; Dev Integration run `35104245846` passed, with traffic routing, speed, lane placement and all correctly aligned variants preserved.

## Issue #12 — forest streaming falls behind after sustained driving

**ACTIVE / USER-REPORTED — Block 8 R2 HUMAN FAIL; R3 correction in progress.**

After sustained continuous driving, especially at very high vehicle speed, forward forest readiness can fall behind the vehicle. This is a streaming/readiness timing defect, not a density/style request.

Multiple experimental candidates were HUMAN FAIL and were not integrated into `dev`. R1 `7b51e34e464f37681cfd613646a7dd23fc922982` fell behind by roughly 2.3 km despite about 142 FPS. R2 `295f4f33c2e9f5acf86780f063b168517e618230` showed no human improvement after raising the 12/20 candidate caps to 96/192 and shortening the backlogged idle timeout. R3 `7c73ae092aa9bd32210d128d0366b5245e19c48a` was only slightly better after interleaving prefetch with far-visible work; the human snapshot still showed 24 wanted / 0 ready / 0 hit after 11,011 slices. R4 `76484b1d202420efe863664086c44c3b6003b1b9` was also HUMAN FAIL after preserving distant builders across local terrain refresh: 24 wanted / 0 ready / 0 hit, 83 queued chunks and 17,935 slices. Do not reintroduce those cap, timeout, prefetch-band or local-reset theories as accepted fixes merely because their automation passed.

Block 8 R1 added the missing evidence without altering scheduler behavior and passed exact-head workflow `35132956826`, but received HUMAN FAIL near 2.4 km on Manic-2 → Manic-5. The first browser snapshot showed 27 active / 64 cached / 77 queued chunks, 71 completed jobs versus only 11 abandoned builders, 52,450 slices and `lastCandidates: 1`. A later snapshot degraded to 16 active / 73 cached / 83 queued chunks, 87 completed jobs versus 19 abandoned builders, 69,659 slices and still `lastCandidates: 1`. Forest work was attributed to 0 hitches and chunk commits remained only 0.2–0.7 ms. Therefore the deterministic low-headroom harness overstated fragmentation: the browser proves the primary limiter is candidate throughput, where one candidate exhausts a 0.95–1.55 ms slice. R2 must not repeat cap, timeout, prefetch-band or recenter-reset changes.

Block 8 R2 `de8226b8c3fabb2e21c4d9e7ef22412ab8b6615e` passed exact-head workflow `35137654092`, including exact route/hydro parity, lifecycle, frame-budget, stress, integration-audit and production-build checks. Human testing still failed at 3.5 km on Manic-2 → Manic-5. The browser snapshot showed 21 active / 45 cached / 70 queued chunks, 81 completed builds including 36 replacements, 205 abandoned jobs but only 18 abandoned builders, and four candidates per 2.1 ms slice. Spatial diagnostics showed route 5,415 queries / 0 fallbacks / 1 rebuild and water 34,527 queries / 0 fallbacks / 3 rebuilds. R2 therefore fixed the identified lookup cost but exposed the next dominant throughput loss: terrain replacements for chunks that remained visibly covered were prioritized while missing chunks waited.

Current exact next action: validate `candidate/block8-forest-readiness-r3`. R3 must keep the 0.95/1.55 ms budgets and 12/20 caps unchanged, prioritize every missing visible chunk before already-covered terrain replacements, and restart partial builders only inside the terrain-refresh radius. Repeat Manic-2 → Manic-5 beyond 3.5 km and compare `queueMix`, coverage/replacement completions, active chunks and visible continuity before biome-specific asset selection.

## Issue #13 — low-speed four-wheel lateral slide on sloped corner exits

**CLOSED / DONE/CERTIFIED — HUMAN PASS (2026-09-12).**

The certified cause was bounded road articulation being misclassified as diagonal wheel separation on sloped corner exits. Preserve the accepted bounded-articulation contact restoration in `src/physics/steep-slope-contact.js` and its vehicle-presentation integration. It must remain road-only, non-airborne and bounded by real suspension travel; large discontinuities must still lose contact. Do not turn this correction into a generic low-speed stability assist or global tire-grip increase.

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

## Issue #10 — steep planar road-contact ownership

**CLOSED / DONE/CERTIFIED — HUMAN PASS (2026-09-12).**

Protected correction in `src/physics/steep-slope-contact.js` restores false wheel contacts only for supported, non-airborne, steep planar road surfaces whose wheel samples agree with one plane. Preserve normal-load and steering/yaw authority without fabricating off-road, airborne or genuinely non-planar contact.

## Issue #13 — bounded road-articulation contact ownership

**CLOSED / DONE/CERTIFIED — HUMAN PASS (2026-09-12).**

Protected correction extends the same contact owner with a separate bounded-articulation path for changing pitch/bank road support. It may restore only false contacts whose best-plane residual fits inside the configured fraction of actual suspension travel. Preserve real discontinuities, airborne/crest behavior and accepted tire/steering calibration.

---

# 8. Protected behavior / prohibitions

Preserve unless a future block has direct causal evidence and dedicated QA:

- accepted vehicle handling, suspension and tire behavior;
- road/bridge geometry;
- wheel-ground support including issues #8, #10 and #13;
- terrain authority and DEM shape;
- certified localized Issue #9 road-aware imagery refinement;
- Photo ON visual quality;
- forest density/readiness/streaming policy;
- local-first Quebec hydro behavior;
- water/scenery/sign semantics;
- routing/settings UX;
- existing keyboard/gamepad input semantics; mobile controls must feed the same normalized driving inputs rather than fork vehicle physics;
- multiplayer gameplay/protocol semantics;
- cache persistence;
- diagnostic aliases used by permanent QA;
- production code-split/lazy GLB behavior;
- GLB remains the accepted runtime asset contract unless a separate explicitly approved architecture decision changes it; AI-assisted authoring alone is not permission to redesign the runtime asset pipeline.

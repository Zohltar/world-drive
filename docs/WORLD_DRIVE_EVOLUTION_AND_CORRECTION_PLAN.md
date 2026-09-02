# World Drive — Evolution & Correction Plan

Canonical work branch: `dev`  
Stable branch: `main`  
Stable fallback: `111df5d84bf7fd700590abbd9c129b303ac92fad` — `Release V21.31 post-C6 stable`  
Status: **ACTIVE — canonical restart source of truth**

GitHub state + this file override chat memory when they disagree.

---

# 0. Mandatory restart protocol

At the start of every World Drive coding/architecture/QA conversation:

1. Read this file from current `dev`.
2. Read live HEADs of `dev` and `main`.
3. Read **CURRENT CHECKPOINT** below.
4. Inspect latest `Dev Integration QA` for the exact current `dev` HEAD.
5. If a checkpoint names a candidate/audit branch, inspect it before editing.
6. Resume the exact **Next action** unless the user changes priority.
7. Structural work uses: read-only audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint when behavior/visual/performance can change.
8. **Never move `main` without explicit user approval.**
9. Phase R is structural only: no physics/visual/terrain/forest tuning mixed in.
10. Do not mix dependency/security or GitHub Actions runtime maintenance into structural work.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** R — Source tree organization, temporarily blocked by correction issue #3  
**Active item:** **Overpass resilience / hydrography + real-scenery loading**  
**State:** **CORRECTION INTEGRATED + AUTOMATION PASS — HUMAN RETEST NEXT**  
**Current validated runtime/CI dev HEAD before this documentation commit:** `37258cad5acfde1fd58207cae77169726db29c84`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Exact-head Dev Integration:** run `33629706535` — **PASS, 97/97**  
**Overpass Resilience QA:** run `33629706504` — **PASS**  
**Water Hydro Runtime QA:** run `33629706510` — **PASS**  
**Focused candidate:** `candidate/overpass-resilience-r1`, run `33629469103` — **PASS**

## Issue #3 — confirmed diagnosis

The R6.4 water source-tree move initially looked responsible because hydrography, rivers and bridges were missing. The move was fully rolled back to the old root water layout, but the exact same human-visible failure reproduced. Therefore **R6.4 was not the root cause**.

Observed together:
- `Hydrographie: Indisponible`;
- `Décor réel: Indisponible`;
- missing rivers / hydro-sourced bridges;
- console: `OSM Overpass temporarily unavailable; cached data and driving continue`.

Historical investigation traced the regression risk to V21.31 Overpass hardening on 2026-08-25:

- `97c3bc821dbb84e0ee828d07f2346a3dfe679e43` — endpoint cooldown;
- `498a2b1055bbd2a4ec13448e0321961504370632` — all-mirror/global cooldown;
- `d387ea79da931af7b25503ca22c49e886f1dbf41` — one shared serialized lane for hydro/scenery/roadmeta/signs;
- `3a90e02fc03efa9d87250f8e9e812c2546b4a046` — 900 ms pacing between outbound attempts.

Startup launches hydro first. A heavy hydro query could time out on every mirror, mark all mirrors unhealthy globally, then impose a 30-second blackout on scenery/road metadata/sign requests that followed. This matches the user-visible simultaneous failure.

GitHub issue: **#3 — `Overpass shared pipeline can make hydrography and scenery unavailable together`**.

## Integrated correction

Runtime correction commit: `1ea06dfe7a9870ea641b599786446986f5451cc6`.

`src/overpass.js` now:
- removes the cross-service global blackout;
- keeps per-endpoint hard cooldown for genuine endpoint failures;
- treats query timeout / AbortError / 408 / 504 as **query-specific soft failures**, so a heavy hydro timeout does not blacklist a mirror for scenery/sign/metadata;
- keeps HTTP 429 and 500–503 as hard endpoint-health failures;
- uses **two logical Overpass lanes** so one slow service cannot monopolize all OSM loading;
- still globally spaces outbound starts by **900 ms**, preserving polite public-server pacing;
- round-robins the starting mirror between logical requests;
- preserves cache-first behavior and same-cell in-flight dedupe;
- exposes `WorldDriveOverpass()` diagnostics in DevTools.

`WorldDriveOverpass()` reports:
- queued + active logical requests;
- active service labels;
- pending cache requests;
- lane count and pacing;
- per-mirror availability, cooldown, hard failures, soft failures, successes and last issue.

Permanent regression QA:
- `qa/qa-overpass-resilience-r1.mjs`;
- `.github/workflows/qa-overpass-resilience-r1.yml`;
- existing `.github/workflows/qa-water-hydro-runtime.yml` now includes the resilience regression.

QA explicitly proves:
1. a hydro timeout does **not** poison a following scenery request;
2. a genuine 503 still cools the failed mirror and fails over;
3. a slow service no longer blocks a second world-service request;
4. hydro river + bridge ingestion remains valid;
5. runtime graph, scenery streaming, signs, frame pacing, stress, live route and build remain green.

## Exact next action

**Human retest on current `dev`. Do not begin R7 yet.**

Use the same Manic route that reproduced the failure. Verify:
- hydrography loads or at least retries independently;
- rivers/lakes and hydro-sourced bridges appear;
- real scenery loads independently instead of failing together with hydro;
- no new frame hitch/stall;
- route reload / second route if practical.

If loading is still slow or unavailable, immediately run in DevTools:

```js
WorldDriveOverpass()
```

and capture the returned object plus any console lines beginning with `OSM Overpass mirror issue`.

Disposition after human test:
- **PASS:** close issue #3, mark water **KEEP ROOT**, close R6, begin R7 with read-only audit only.
- **Partial improvement:** if scenery survives but hydro remains too heavy, open a separate query-weight/fallback correction; do not undo this resilience fix.
- **Still both unavailable:** inspect per-mirror diagnostics and endpoint list/transport before any R7 work.

---

# 2. Deferred observed defect

## Issue #2 — intermittent delayed terrain adjustment after route startup

During R6.3a, one Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were already visible. It converged on its own and could not be reproduced after relaunch.

Observed telemetry:
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count increased from 5 to 9;
- `maxFrameMs:194.4`.

Current hypothesis only: deferred terrain↔road transition preparation. **Do not tune during R6/R7.** Revisit in **R8 terrain/imagery/local-world/streaming** with full `WorldDriveFramePacing()` diagnostics if reproducible.

---

# 3. CLOSED / CERTIFIED STRUCTURAL WORK

- **R2 Multiplayer:** DONE automation + human PASS. Root lazy facades retained; implementation under `src/multiplayer/`.
- **R3 Civil traffic:** DONE automation + human PASS. Implementation under `src/traffic/`.
- **R4 Vehicles/presentation/models/truck:** DONE automation + human PASS. Implementation under `src/vehicles/`.
- **R4.5 Audio:** DONE automation + human PASS. Implementation under `src/audio/`.
- **QA root-layout cleanup:** DONE automation + human PASS. Canonical QA location `qa/`.
- **R5a Core vehicle dynamics:** DONE under `src/physics/`; no physics tuning.
- **R5b.1 Wheel-ground support:** DONE automation + human PASS; root facade + `src/physics/wheel-ground-support.js`.
- **R5b.2 Transmission network/runtime state:** DONE automation + human PASS; root facades + physics implementations; `R=-1`, `N=0`, forward `1..N` preserved.
- **R5 closure:** KEEP ROOT `driving-runtime.js`, `driving-runtime-base.js` (defer O6), `transmission-controller.js`, `skidmarks.js`.
- **R6.1 Road furniture/signs:** DONE automation + human PASS. Root facade; implementations under `src/road/`.
- **R6.2 Road geometry + bridge interactions:** DONE automation + human PASS. Root facade + `src/road/road-geometry.js`; `bridges.js` intentionally root.
- **R6.3a Scenery renderer:** DONE automation + accepted human PASS. Root facade + P9/P933 implementations under `src/scenery/`.
- **R6.3b Forest runtime:** CLOSED — KEEP ROOT. Performance-sensitive streamer/core/policy/sampler/assets remain root.

## R6.4 water disposition

The attempted nested water move **failed human smoke** and was rolled back. Current intentional layout:

```text
src/water-data.js
src/water-renderer.js
src/forest-water-assets.js
```

Nested `src/water/` implementations are absent. The failed R6.4 source-tree gate was removed. Water remains **KEEP ROOT** unless a future independent architecture audit proves otherwise.

Permanent hydro coverage:
- `qa/qa-water-hydro-runtime.mjs`;
- `.github/workflows/qa-water-hydro-runtime.yml`.

---

# 4. Operating principles / prohibitions

1. **One intent per commit.**
2. **Phase R must not tune behavior.**
3. **Move first, rename later.** Historical names belong to Phase O.
4. **Audit before editing.**
5. **Candidate before dev** for material structural/correction work.
6. **Exact final `dev` HEAD must pass Dev Integration.**
7. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
8. **Human FAIL overrides green automation.**
9. **No silent debt discoveries.** Log material defects/issues.
10. **Never touch `main` without explicit user approval.**

Do not mix into structural Phase R:
- physics/handling tuning;
- road/terrain/visual tuning;
- forest density/priority/budget/prefetch/cache tuning;
- transmission/clutch/brake semantic changes;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup.

---

# 5. Protected behavior contracts

## Driving / physics
Preserve per-wheel tire forces, braking/ABS, handbrake/J-turn, load transfer, high-speed stability, airborne/landing, terrain→road support re-entry and skid/contact alignment.

## Road / bridges
Preserve robust road mesh, smoothing, banking/superelevation, terrain authority, bridge deck interpolation, bridge approaches and route/profile ownership.

## Scenery / forest
Preserve scenery visibility, P9/P933 composition, forest asset timing, startup coverage, priority/prefetch/cache lifecycle, frame budget, hitch attribution and floating-origin behavior.

## Water / hydrography / Overpass
Preserve:
- hydro/coastline/bridge OSM query scope;
- 30-day hydro cache TTL;
- water/bridge/coastline ingest + dedup + reset semantics;
- river/polygon/coastline rendering behavior;
- shared authored forest/water style;
- road-over-water stencil priority;
- bridge-over-water orchestration;
- cache-first and same-cell request dedupe;
- polite Overpass request pacing while avoiding cross-service starvation.

## Terrain / streaming / performance
Preserve cache reuse/preload, imagery/procedural transitions, near/medium/far continuity, photo ON/OFF quality, forest frame pacing and low-hitch long-route behavior.

---

# 6. PHASE R roadmap

- **R1:** DONE.
- **R2 multiplayer:** DONE automation + human PASS.
- **R3 traffic:** DONE automation + human PASS.
- **R4 vehicles/presentation/models/truck:** DONE automation + human PASS.
- **R4.5 audio:** DONE automation + human PASS.
- **QA root-layout:** DONE automation + human PASS.
- **R5:** CLOSED.
- **R6.1 road furniture/signs:** DONE automation + human PASS.
- **R6.2 road geometry/bridges:** DONE automation + human PASS.
- **R6.3 scenery/forest:** CLOSED; scenery moved, forest KEEP ROOT.
- **R6.4 water:** failed move, rolled back, **KEEP ROOT**; issue #3 human correction retest pending.
- **R7 app/input/ui/routing/services:** **BLOCKED on issue #3 human retest**; then read-only audit first.
- **R8 terrain/imagery/local-world/streaming:** LAST / performance-sensitive; revisit issue #2 here.
- **R9 permanent root-cleanliness gate:** after migrations stabilize.

---

# 7. PHASE O — responsibility naming / historical cleanup

Only after relevant Phase R folders are stable:
- O1 Multiplayer historical names;
- O2 Road-furniture P930/P937;
- O3 Vehicle-presentation historical version name;
- O4 Scenery P9/P933;
- O5 Audio base naming if useful;
- O6 Driving runtime base/public runtime architecture;
- O7 Terrain/imagery/local-world/streaming names after R8.

---

# 8. Maintenance debt — keep separate

## C-M1 — Dependency/security audit
Known discovery: `npm ci` reports **25 vulnerabilities: 3 low, 21 high, 1 critical**. Inspect dependency tree first; distinguish runtime vs dev/build-only risk; **no `npm audit fix --force`**.

## C-M2 — GitHub Actions runtime hygiene
Node action-runtime deprecation / Node 24 warnings remain separate from Phase R.

---

# 9. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Road geometry | C3 + smoothing/banking/superelevation + terrain authority |
| Road furniture/signs | R6 road-furniture + sign runtime/minimap/geographic signs |
| Scenery/forest | R6 scenery + P9.25 + P9.29/P9.35–P9.42 |
| Water/hydrography | `qa/qa-water-hydro-runtime.mjs` + human visible hydro/bridge smoke |
| Overpass shared loading | `qa/qa-overpass-resilience-r1.mjs` + `WorldDriveOverpass()` human diagnostics if needed |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human visible validation.

---

# 10. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:
1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

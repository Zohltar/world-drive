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
7. Use certified blocks: audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint where behavior/visual/performance can change.
8. **Never move `main` without explicit user approval.**
9. Do not mix dependency/security or GitHub Actions runtime maintenance into structural/correction work.
10. Human-visible FAIL overrides green automation.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R8 terrain/imagery/local-world/streaming — READ-ONLY AUDIT FIRST**  
**Just closed:** **R7 app/input/UI/routing/services**  
**State:** **R7 DONE — focused automation PASS + human Electron PASS**  
**Pre-R7-final integration `dev` HEAD:** `75569b2422756fc819aa4fe4ef162a46cafcf8df` — `QA: add R7 UI to Dev Integration`  
**Pre-R7-final Dev Integration:** run `33675929426` — **PASS** on `75569b2422756fc819aa4fe4ef162a46cafcf8df`  
**Final R7 app/services candidate before this documentation commit:** `candidate/r7-app-services-r1` @ `90fa1ab1eafbaae32c4299c8250b8e3db3adfd49`  
**Latest focused R7 app/services QA:** run `33676904559` — **PASS** on `90fa1ab1eafbaae32c4299c8250b8e3db3adfd49`  
**Human checkpoint:** Electron smoke covering settings persistence, Manic local hydro, Yungas network/fallback path, cache/relaunch — **PASS**  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Main rule:** `main` remains untouched without explicit user approval.

## Exact next action

Begin **R8 with a read-only audit only** after exact-head `dev` certification of this R7 checkpoint.

Audit terrain / imagery / local-world / streaming ownership and runtime flow before changing production behavior. The first R8 pass must identify:

- current owners, facades and nested boundaries;
- world-build and refresh orchestration;
- terrain near/medium/far responsibilities;
- imagery/procedural transition ownership;
- preload/cache/reuse behavior;
- frame-pacing / hitch attribution hooks;
- QA/workflow/path contracts;
- whether deferred issue #2 is reproducible and where its ownership belongs;
- smallest safe first R8 candidate, if any.

Do **not** tune terrain visuals, road visuals, forest visuals, physics or performance during the initial audit. Do not combine R8 with dependency/security work, Actions runtime upgrades, historical naming cleanup, scenery/sign offline migration or regional-data packaging.

---

# 2. R7 app/input/UI/routing/services — CLOSED

R7 reorganized the remaining application-facing source-root ownership without changing intended runtime behavior.

## 2.1 Input — DONE

Permanent boundary QA:

```text
qa/qa-source-tree-r7-input.mjs
```

Input ownership is certified and covered by Dev Integration.

## 2.2 Routing — DONE

Permanent boundary QA:

```text
qa/qa-source-tree-r7-routing.mjs
```

Routing ownership is certified and covered by Dev Integration.

## 2.3 UI — DONE

Permanent boundary QA:

```text
qa/qa-source-tree-r7-ui.mjs
```

UI ownership is certified and covered by Dev Integration. Human UI validation passed before integration.

## 2.4 App + services — DONE

Public root import paths were intentionally retained as compatibility facades while implementations moved beneath explicit ownership folders.

Application implementations:

```text
src/app/application-settings.js
src/app/loaded-settings-application.js
src/app/diagnostics.js
src/app/version.js
```

Service implementations:

```text
src/services/cache.js
src/services/overpass.js
src/services/desktop-overpass-transport.js
```

Stable root facades retained:

```text
src/application-settings.js
src/loaded-settings-application.js
src/diagnostics.js
src/version.js
src/cache.js
src/overpass.js
src/desktop-overpass-transport.js
```

Important invariants preserved:

- settings object/root identity and nested control references;
- 120 ms settings-save debounce;
- loaded-settings application ordering and imagery/display behavior;
- package-driven `V21.31 dev` branding;
- stable `WorldDriveDiagnostics` identity and live compatibility aliases;
- cache namespace/key/persistence semantics;
- Overpass endpoint/failover/cooldown/request-pacing behavior;
- desktop Overpass transport behavior;
- existing root import contracts for runtime and historical QA.

Permanent R7 app/services QA:

```text
qa/qa-source-tree-r7-app-services.mjs
.github/workflows/qa-source-tree-r7-app-services.yml
```

`qa/DEV_INTEGRATION_AUDIT.mjs` is now the aggregate entrypoint:

```text
R7 app/services boundary
  -> historical DEV_INTEGRATION_AUDIT_BASE.mjs
```

This makes the new boundary permanent without removing the historical import/source-tree audit.

Focused evidence:

- run `33676904559` — **PASS** on `90fa1ab1eafbaae32c4299c8250b8e3db3adfd49`;
- app/services boundary PASS;
- stable settings PASS;
- loaded settings PASS;
- version/build branding PASS;
- diagnostics root PASS;
- runtime import/debt audit PASS;
- production build PASS;
- production code-split PASS;
- human Electron smoke — **PASS**.

---

# 3. OSM / Geofabrik reliability — CLOSED FOR QUEBEC HYDRO

GitHub issue #3 — `Overpass shared pipeline can make hydrography and scenery unavailable together` — **CLOSED / completed on 2026-09-02**.

Public Overpass remains useful as fallback, but it is no longer the deterministic primary source for covered Quebec hydro tiles.

Implemented direction:

```text
Geofabrik regional .osm.pbf
  -> offline filtering/preprocessing
  -> World Drive 16 km spatial tiles
  -> hydro-only gzip v2 runtime tiles
  -> local-first hydro reader
  -> existing water-data ingest semantics
  -> existing water renderer / bridge orchestration unchanged
  -> Overpass only as fallback where local coverage is unavailable
```

Generated/source data remain intentionally ignored by Git:

```text
world-data/
public/world-data/
```

Packaging/distribution of the regional data itself is **not decided yet**. Do not commit or silently bundle the multi-gigabyte Quebec dataset until that strategy is explicitly approved.

## 3.1 Real Quebec v1 build — COMPLETE

Source:

```text
world-data/source/quebec-latest.osm.pbf
MD5: 87b761c42ff06eec0156e26b25e9673b
osmium-tool: 1.19.1
libosmium: 2.23.1
```

Final coastline-corrected v1:

```text
inputFeatures:    12,347,944
emittedFeatures:   7,660,197
oversizeFeatures:         20
tileRecords:       7,966,008
tileCount:            19,255
tileSizeMeters:        16,000
```

Category counts:

```text
water:      3,040,174
waterway:   2,178,612
bridge:        24,490
dam:            4,108
building:   1,529,708
landuse:      397,367
power:        484,241
barrier:          623
sign:             906
```

The coastline correction was narrowly scoped: non-water category counts stayed unchanged and `oversizeFeatures` remained 20.

## 3.2 Hydro gzip v2 — ACCEPTED

Final real-Quebec hydro gzip v2 after coastline parity:

```text
format:                    world-drive-osm-hydro-jsonl-gzip-v2
source tile size:          16,000 m
hydro tileCount:           18,757
hydro records:             5,503,776
parseErrors:               0
uncompressedBytes:         10,951,155,349
uncompressedSize:          10.20 GB
compressedBytes:           3,139,223,695
compressedSize:            2.92 GB
compressionRatio:          0.2867
reductionPercent:          71.33%
average compressed tile:   163.4 KB
max compressed tile:       1.9 MB
max uncompressed tile:     6.7 MB
oversize hydro records:    6
```

Decision: **gzip v2 passes the storage/runtime gate.** No MVT/PMTiles conversion or geometry simplification is justified at this stage.

Runtime rules:

- local Quebec hydro is primary when the central 16 km tile exists;
- neighboring tiles complete the normal 7 km hydro radius;
- duplicate OSM records are deduplicated across cells;
- oversize hydro records are supported;
- LineString / MultiLineString / Polygon / MultiPolygon are adapted to existing ingest semantics;
- water/bridge/coastline behavior is preserved;
- static local hydro is not redundantly copied into IDB;
- cache/Overpass remain fallback for uncovered regions/tiles;
- corrupt expected local data fails visibly rather than being silently masked;
- HUD/service diagnostics distinguish `Local`, `Cache` and `OSM` paths.

Evidence:

- focused Geofabrik runtime run `33646344696` — PASS;
- known Manic human smoke — PASS;
- post-integration Dev Integration run `33658760396` — PASS 97/97;
- issue #3 — CLOSED.

---

# 4. Deferred issue #2 — terrain startup adjustment

One Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were visible. It converged and could not be reproduced after relaunch.

Observed telemetry:

- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count 5 → 9;
- `maxFrameMs:194.4`.

Revisit only in **R8 terrain/imagery/local-world/streaming**, with `WorldDriveFramePacing()` and current streaming diagnostics if reproducible. Do not assume a fix is needed unless the symptom can be reproduced.

---

# 5. CLOSED / CERTIFIED STRUCTURAL WORK

- **R1 source-root audit:** DONE.
- **R2 Multiplayer:** DONE automation + human PASS.
- **R3 Civil traffic:** DONE automation + human PASS.
- **R4 Vehicles/presentation/models/truck:** DONE automation + human PASS.
- **R4.5 Audio:** DONE automation + human PASS.
- **QA root-layout cleanup:** DONE automation + human PASS.
- **R5a Core vehicle dynamics:** DONE; no physics tuning.
- **R5b wheel-ground + transmission state:** DONE automation + human PASS; root facades retained.
- **R5 closure:** KEEP ROOT `driving-runtime.js`, `driving-runtime-base.js` (defer O6), `transmission-controller.js`, `skidmarks.js`.
- **R6.1 Road furniture/signs:** DONE automation + human PASS.
- **R6.2 Road geometry + bridge interactions:** DONE automation + human PASS.
- **R6.3a Scenery renderer:** DONE automation + accepted human PASS.
- **R6.3b Forest runtime:** CLOSED — KEEP ROOT.
- **R6.4 Water structural move:** FAILED human smoke, rolled back — KEEP ROOT.
- **OSM hydro reliability / issue #3:** CLOSED — Quebec local-first gzip v2 runtime + human Manic PASS.
- **R7 app/input/UI/routing/services:** DONE automation + human PASS.

## R6.4 water disposition

Intentional production layout remains root-owned:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

Water remains **KEEP ROOT** for Phase R.

---

# 6. Operating principles / prohibitions

1. **One intent per commit.**
2. **Audit before editing.**
3. **Candidate before dev** for material runtime/correction work.
4. **Exact final `dev` HEAD must pass Dev Integration.**
5. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
6. **Human FAIL overrides green automation.**
7. **No silent debt discoveries.**
8. **Never touch `main` without explicit user approval.**
9. Keep generated Geofabrik source/tiles out of Git until packaging/distribution is explicitly decided.
10. Migrate data consumers incrementally; do not opportunistically combine unrelated layers.
11. A green tool/format QA does not authorize a production runtime change without its own candidate and human smoke.

Do not mix into current R8 audit/work:

- physics/handling tuning;
- road/forest visual tuning;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup;
- scenery/sign offline migration;
- generated regional-data packaging decisions unless explicitly made active.

---

# 7. Protected behavior contracts

## Driving / physics

Preserve tire forces, braking/ABS, handbrake/J-turn, load transfer, high-speed stability, airborne/landing, terrain→road support and skid/contact alignment.

## Road / bridges

Preserve robust road mesh, smoothing, banking/superelevation, terrain authority, bridge deck interpolation, bridge approaches and route/profile ownership.

## Scenery / forest

Preserve scenery visibility, P9/P933 composition, forest asset timing, startup coverage, priority/prefetch/cache lifecycle, frame budget and hitch attribution.

## Water / hydrography / OSM

Preserve:

- water/bridge/coastline ingest semantics;
- river/polygon/coastline rendering behavior;
- bridge-over-water orchestration;
- authored forest/water style sharing;
- local-first Quebec hydro behavior for covered tiles;
- cache/Overpass fallback for uncovered local regions/tiles;
- visible failure for corrupt expected local hydro data;
- OSM attribution / ODbL obligations;
- full source geometry unless a later simplification experiment is explicitly approved/certified.

## App / input / UI / routing / services

Preserve:

- stable public root import paths introduced/retained by R7;
- settings identity and persistence semantics;
- input behavior and bindings;
- routing lifecycle and preset behavior;
- UI startup/menu/HUD/minimap/compass behavior;
- package-derived build branding;
- canonical diagnostics root and compatibility aliases;
- cache key/persistence behavior;
- Overpass failover/pacing/cooldown/fallback behavior;
- Electron desktop Overpass transport.

## Terrain / streaming / performance

Preserve cache reuse/preload, imagery/procedural transitions, near/medium/far continuity, photo ON/OFF quality, forest frame pacing and low-hitch long-route behavior.

---

# 8. PHASE R roadmap

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
- **R6.4 water:** structural move rolled back, KEEP ROOT; offline hydro reader retained at root water boundary.
- **OSM data-source reliability:** DONE for Quebec hydro; issue #3 CLOSED.
- **R7 app/input/UI/routing/services:** **DONE automation + human PASS.**
- **R8 terrain/imagery/local-world/streaming:** **ACTIVE — READ-ONLY AUDIT FIRST; performance-sensitive; revisit issue #2 here.**
- **R9 permanent root-cleanliness gate:** after R8 stabilizes.

---

# 9. PHASE O — historical naming cleanup

Only after relevant Phase R folders are stable:

- O1 Multiplayer names;
- O2 Road-furniture P930/P937;
- O3 Vehicle-presentation version name;
- O4 Scenery P9/P933;
- O5 Audio base naming if useful;
- O6 Driving runtime base/public architecture;
- O7 Terrain/imagery/local-world/streaming names after R8.

---

# 10. Maintenance debt — keep separate

## C-M1 — Dependency/security

Latest R7 focused `npm ci` audit output on 2026-09-02 reported **27 vulnerabilities: 3 low, 1 moderate, 22 high, 1 critical**. Inspect the dependency tree separately; distinguish runtime from dev/build-only risk. **Never run `npm audit fix --force` as part of structural work.**

## C-M2 — GitHub Actions runtime hygiene

Node action-runtime deprecation / forced Node 24 warnings remain separate from Phase R work. Do not upgrade Actions opportunistically inside R8.

---

# 11. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| R7 input | `qa/qa-source-tree-r7-input.mjs` |
| R7 routing | `qa/qa-source-tree-r7-routing.mjs` |
| R7 UI | `qa/qa-source-tree-r7-ui.mjs` + human UI smoke |
| R7 app/services | `qa/qa-source-tree-r7-app-services.mjs` + settings/version/diagnostics regressions + human Electron smoke |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Water/hydrography | `qa/qa-water-hydro-runtime.mjs` + human hydro/bridge smoke |
| Overpass fallback | `qa/qa-overpass-resilience-r1.mjs` + `WorldDriveOverpass()` when needed |
| Geofabrik preprocessing | `qa/qa-geofabrik-tiles-r1.mjs` |
| Hydro gzip format | `qa/qa-geofabrik-hydro-gzip-r1.mjs` + real Quebec measurements |
| Offline hydro runtime | `qa/qa-geofabrik-hydro-runtime-r1.mjs` + known Manic human smoke |
| C6 global diagnostics | `qa/qa-diagnostics-c6-final-inventory.mjs` |
| R8 terrain/streaming | focused ownership QA + build + performance diagnostics + human visual/perf smoke before integration |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 12. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:

1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

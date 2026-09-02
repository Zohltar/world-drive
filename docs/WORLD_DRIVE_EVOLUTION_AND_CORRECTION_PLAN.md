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
7. Use small certified blocks: audit → candidate → focused QA → permanent coverage → exact-head Dev Integration → human checkpoint where behavior/visual/performance can change.
8. **Never move `main` without explicit user approval.**
9. Do not mix dependency/security or GitHub Actions runtime maintenance into structural/correction work.
10. Human-visible FAIL overrides green automation.

---

# 1. CURRENT CHECKPOINT

**Plan phase:** **R7 app/input/ui/routing/services — READ-ONLY AUDIT FIRST**  
**Just closed:** Geofabrik offline OSM hydro runtime / issue #3 reliability correction  
**State:** **QUEBEC HYDRO GZIP V2 ACCEPTED; LOCAL-FIRST RUNTIME INTEGRATED; HUMAN MANIC PASS; ISSUE #3 CLOSED**  
**Current validated dev HEAD before this documentation commit:** `4b0e4d61ea55de10277c2dc5323732a3dd89236a`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Exact-head Dev Integration:** run `33658760396` — **PASS, 97/97**  
**Latest focused Geofabrik hydro-runtime QA:** run `33646344696` — **PASS** on `b25fe7a394a7abdaff1cccda699f7c4b55613825`  
**Human checkpoint:** known Manic route — **PASS**; hydrography present (`26 éléments` visible in HUD) and runtime remained healthy at ~144 FPS  
**Resolved issue:** GitHub #3 — **CLOSED / completed**  
**Runtime candidate used:** `candidate/geofabrik-hydro-runtime-r1` @ `b25fe7a394a7abdaff1cccda699f7c4b55613825` before fast-forward integration.

## Closed reliability pivot

Issue #3 persisted after the R6.4 water source-tree rollback and after the Overpass resilience correction. Human testing had shown:

- `Hydrographie: Indisponible`;
- `Décor réel: Indisponible` or very slow;
- rivers / hydro-sourced bridges missing;
- public Overpass availability remaining a runtime dependency.

Conclusion: public Overpass remains useful as a fallback, but it must **not be the critical source for deterministic Quebec hydro loading**.

Implemented direction:

```text
Geofabrik regional .osm.pbf
  -> offline filtering/preprocessing
  -> World Drive 16 km spatial tiles
  -> hydro-only gzip v2 runtime tiles
  -> local-first hydro reader
  -> existing water-data ingest semantics
  -> existing water renderer / bridge orchestration unchanged
  -> Overpass only as fallback when local coverage is unavailable
```

Use **PBF rather than free shapefiles as the master source** because PBF preserves the native OSM tagging model needed by World Drive, including feature families that free shapefile catalogues may omit.

## Exact next action

Begin **R7 with a read-only audit only**.

Audit app/input/UI/routing/services ownership and current root/nested structure before proposing any move. Do not edit production files during the first R7 audit pass. Identify:

- current owners and public facades;
- fan-in/fan-out and runtime entrypoint dependencies;
- QA/workflow/path contracts that would move with a module;
- historical/versioned names that belong to later Phase O rather than R7;
- high-risk boundaries that should stay root or be deferred;
- the smallest first candidate, if any, after the audit.

Do **not** combine the R7 audit with scenery/sign offline migration, terrain work, dependency/security work, Actions runtime upgrades, physics tuning or historical naming cleanup.

---

## 1.1 Integrated Geofabrik tooling and runtime

Integrated tooling:

```text
tools/geofabrik/build-world-tiles.mjs
tools/geofabrik/offline-tile-source.mjs
tools/geofabrik/profile-world-tiles.mjs
tools/geofabrik/pack-hydro-gzip-v2.mjs
tools/geofabrik/world-drive-tags-filter.txt
tools/geofabrik/download-quebec.ps1
tools/geofabrik/README.md
qa/qa-geofabrik-tiles-r1.mjs
qa/qa-geofabrik-profile-r1.mjs
qa/qa-geofabrik-hydro-gzip-r1.mjs
qa/qa-geofabrik-hydro-runtime-r1.mjs
.github/workflows/qa-geofabrik-pbf-r1.yml
.github/workflows/qa-geofabrik-hydro-runtime-r1.yml
```

Production hydro runtime now includes:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

Generated/source data remain intentionally ignored by Git:

```text
world-data/
public/world-data/
```

Packaging/distribution of the regional data itself is **not decided yet**. Do not commit the generated Quebec dataset or silently bundle multi-gigabyte data until that strategy is explicitly approved.

### Pipeline v1 — proven with the real Quebec PBF

```text
Geofabrik .osm.pbf
  -> osmium tags-filter
  -> osmium export geojsonseq
  -> World Drive builder
  -> public/world-data/osm/<region>/
```

Default tile size: **16 km**.

v1 output:

```text
manifest.json
tiles-index.jsonl
oversize.jsonl              # only when needed
tiles/<x>/<y>.jsonl
```

Compact v1 record:

```json
{
  "v": 1,
  "id": "way/123",
  "k": ["waterway", "bridge"],
  "g": {"type":"LineString","coordinates":[...]},
  "t": {"waterway":"river","bridge":"yes","name":"..."}
}
```

Supported categories:

- water, including `natural=coastline` parity required by the existing water ingest contract;
- waterway;
- bridge;
- building;
- landuse / forest-like areas;
- power;
- dam;
- guard rail / barrier;
- traffic sign.

Geometry remains WGS84 lon/lat. EPSG:3857 is used only for fixed-size tile indexing.

---

## 1.2 Real Quebec build — COMPLETE

Local source:

```text
world-data/source/quebec-latest.osm.pbf
```

Download/verification completed successfully on 2026-09-02:

```text
MD5: 87b761c42ff06eec0156e26b25e9673b
osmium-tool: 1.19.1
libosmium: 2.23.1
```

Final Quebec v1 manifest after coastline parity correction:

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

The coastline correction was targeted: non-water category counts remained unchanged, `oversizeFeatures` stayed at 20, and the 16 km grid remained appropriate.

---

## 1.3 Real Quebec storage profile — COMPLETE

The original mixed-v1 profile established that plain provincial JSONL is **too large to be the runtime/package transport**. The conclusion remains valid after coastline parity.

Original mixed profile:

```text
raw size:          12.70 GB
raw records:       7,939,240
parse errors:      0
```

The important architectural conclusions are unchanged:

1. **16 km spatial partitioning is acceptable**;
2. **plain GeoJSON/JSONL provincial storage is the main problem**;
3. **layers must be physically separated** so hydro does not load buildings/scenery and vice versa;
4. urban scenery has large outlier cells and must not be bundled into hydro fetches;
5. signs are tiny and can remain a separate lightweight layer if/when a later migration is approved.

Scenery/sign profiling remains useful evidence, but neither layer was migrated during the hydro correction.

---

## 1.4 Hydro gzip v2 + local-first runtime — ACCEPTED / INTEGRATED

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
max tile coordinate:       x=-504, y=459
oversize hydro records:    6
```

Decision: **gzip v2 passes the storage/runtime gate.** No MVT/PMTiles conversion is justified at this stage, and no geometry simplification was required.

Runtime behavior:

```text
compressed local hydro tile
  -> src/water-offline-hydro-source.js
  -> existing src/water-data.js ingest semantics
  -> existing src/water-renderer.js / bridge orchestration unchanged
```

Rules now implemented:

- local Quebec hydro is primary when the central 16 km tile exists;
- neighboring tiles complete the normal 7 km hydro radius;
- duplicate OSM records across tiles are deduplicated;
- oversize hydro records are supported;
- LineString / MultiLineString / Polygon / MultiPolygon data are adapted to the existing ingest contract;
- water/bridge/coastline semantics are preserved;
- local static hydro is not redundantly copied into IDB;
- cache/Overpass remain fallback when the local central tile/region is unavailable;
- an expected local file that is corrupt or fails unexpectedly is surfaced visibly rather than silently hidden by an Overpass fallback;
- HUD/service diagnostics distinguish `Local`, `Cache` and `OSM` paths.

Evidence:

- focused candidate workflow `33646344696` — **PASS** on `b25fe7a394a7abdaff1cccda699f7c4b55613825`;
- human known-Manic smoke — **PASS**;
- post-integration exact-head Dev Integration `33658760396` — **PASS 97/97** on `4b0e4d61ea55de10277c2dc5323732a3dd89236a`;
- C6 Final Global Boundary exact-head run `33658760473` — **PASS** after certifying the already-retained `WorldDriveOverpass` diagnostic alias in the frozen QA inventory.

The C6 inventory adjustment was QA-only; it did not change production behavior.

---

# 2. Issue #3 — Overpass / hydro / scenery reliability — CLOSED

GitHub issue: **#3 — `Overpass shared pipeline can make hydrography and scenery unavailable together`** — **CLOSED / completed on 2026-09-02**.

The earlier Overpass resilience correction remains valid as fallback protection:

- query timeout / AbortError / 408 / 504 are query-specific soft failures;
- genuine 429 / 500–503 / network failures retain endpoint cooldown;
- two logical Overpass lanes avoid one service monopolizing all loading;
- outbound starts remain globally paced at 900 ms;
- cache-first behavior and same-cell request dedupe remain;
- `WorldDriveOverpass()` diagnostics remain available.

Earlier resilience evidence on `37258cad5acfde1fd58207cae77169726db29c84`:

- Overpass Resilience `33629706504` — PASS;
- Water Hydro Runtime `33629706510` — PASS;
- Dev Integration `33629706535` — PASS 97/97.

Closure evidence is the deterministic local-first hydro path, full coastline parity, focused candidate automation, final real-Quebec gzip measurements and the human Manic PASS. Public Overpass is no longer the deterministic primary hydro dependency for covered local Quebec tiles.

Do not interpret issue #3 closure as permission to migrate scenery/signs in the next unrelated structural block.

---

# 3. Deferred issue #2 — terrain startup adjustment

One Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were visible. It converged and could not be reproduced after relaunch.

Observed telemetry:
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count 5 → 9;
- `maxFrameMs:194.4`.

Do not tune during R7. Revisit in **R8 terrain/imagery/local-world/streaming** with full `WorldDriveFramePacing()` diagnostics if reproducible.

---

# 4. CLOSED / CERTIFIED STRUCTURAL WORK

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
- **OSM hydro reliability / issue #3:** CLOSED — Quebec local-first gzip v2 runtime integrated + human Manic PASS.

## R6.4 water disposition

The attempted nested water move failed human smoke and was rolled back. Current intentional production layout remains root-owned:

```text
src/water-data.js
src/water-offline-hydro-source.js
src/water-renderer.js
src/forest-water-assets.js
```

Water is **KEEP ROOT** for Phase R. Permanent hydro regression coverage includes:

```text
qa/qa-water-hydro-runtime.mjs
qa/qa-geofabrik-hydro-runtime-r1.mjs
.github/workflows/qa-water-hydro-runtime.yml
.github/workflows/qa-geofabrik-hydro-runtime-r1.yml
```

---

# 5. Operating principles / prohibitions

1. **One intent per commit.**
2. **Audit before editing.**
3. **Candidate before dev** for material runtime/correction work.
4. **Exact final `dev` HEAD must pass Dev Integration.**
5. **Human checkpoints are mandatory** where visuals/runtime/performance can regress.
6. **Human FAIL overrides green automation.**
7. **No silent debt discoveries.**
8. **Never touch `main` without explicit user approval.**
9. Keep generated Geofabrik source/tiles out of Git until packaging/distribution strategy is explicitly decided.
10. Migrate data consumers incrementally; do not opportunistically combine unrelated data layers.
11. Do not treat a green tool/format QA as permission to change production runtime without its own candidate and human smoke.

Do not mix into current R7 audit/work:
- physics/handling tuning;
- terrain/road/forest visual tuning;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup;
- scenery/sign offline migration;
- generated regional-data packaging decisions unless explicitly made the active item.

---

# 6. Protected behavior contracts

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
- visible failure for corrupt expected local hydro data rather than silent fallback masking;
- OSM attribution / ODbL obligations for generated local data;
- full source geometry unless a later explicit simplification experiment is separately approved/certified.

## Terrain / streaming / performance
Preserve cache reuse/preload, imagery/procedural transitions, near/medium/far continuity, photo ON/OFF quality, forest frame pacing and low-hitch long-route behavior.

---

# 7. PHASE R roadmap

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
- **R6.4 water:** failed structural move, rolled back, KEEP ROOT; offline hydro reader added at the root water boundary.
- **OSM data-source reliability:** **DONE for Quebec hydro — gzip v2 local-first runtime + human Manic PASS; issue #3 CLOSED.**
- **R7 app/input/ui/routing/services:** **ACTIVE — READ-ONLY AUDIT FIRST.**
- **R8 terrain/imagery/local-world/streaming:** LAST / performance-sensitive; revisit issue #2 here.
- **R9 permanent root-cleanliness gate:** after migrations stabilize.

---

# 8. PHASE O — historical naming cleanup

Only after relevant Phase R folders are stable:
- O1 Multiplayer names;
- O2 Road-furniture P930/P937;
- O3 Vehicle-presentation version name;
- O4 Scenery P9/P933;
- O5 Audio base naming if useful;
- O6 Driving runtime base/public architecture;
- O7 Terrain/imagery/local-world/streaming names after R8.

---

# 9. Maintenance debt — keep separate

## C-M1 — Dependency/security
Known: `npm ci` reports **25 vulnerabilities: 3 low, 21 high, 1 critical**. Inspect tree first; distinguish runtime vs dev/build-only risk; **no `npm audit fix --force`**.

## C-M2 — GitHub Actions runtime hygiene
Node action-runtime deprecation / forced Node 24 warnings remain separate from this work.

---

# 10. Validation matrix

| Risk area | Required validation |
|---|---|
| Runtime graph / paths | `qa/DEV_INTEGRATION_AUDIT.mjs` + relevant boundary QA |
| Driving physics | `npm run qa:stress` + driving matrix + grip gates |
| Water/hydrography | `qa/qa-water-hydro-runtime.mjs` + human hydro/bridge smoke |
| Overpass fallback | `qa/qa-overpass-resilience-r1.mjs` + `WorldDriveOverpass()` when needed |
| Geofabrik preprocessing | `qa/qa-geofabrik-tiles-r1.mjs` + Geofabrik Offline OSM QA |
| Geofabrik profiling | `qa/qa-geofabrik-profile-r1.mjs` + real regional profile |
| Hydro gzip format | `qa/qa-geofabrik-hydro-gzip-r1.mjs` + real Quebec compression measurements |
| Offline hydro runtime | `qa/qa-geofabrik-hydro-runtime-r1.mjs` + fallback coverage + known Manic human smoke |
| C6 global diagnostics | `qa/qa-diagnostics-c6-final-inventory.mjs` |
| Build | `npm run build` |
| Code splitting | `qa/BUILD_V21_31_CODE_SPLIT_QA.mjs` |
| Final integration | Dev Integration on exact final `dev` HEAD |

Automation cannot replace human-visible validation.

---

# 11. Main promotion rule

`main @ 111df5d84bf7fd700590abbd9c129b303ac92fad` remains the stable rollback/reference baseline.

Promotion requires:
1. exact final `dev` HEAD green;
2. required human validation PASS;
3. explicit user approval.

Until then, **do not move `main`**.

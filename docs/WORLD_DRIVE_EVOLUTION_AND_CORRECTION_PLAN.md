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

**Plan phase:** correction/data-source reliability, temporarily ahead of normal R7 structural work  
**Active item:** **Geofabrik offline OSM — Quebec hydro storage/runtime format evaluation**  
**State:** **REAL QUEBEC BUILD + PROFILE COMPLETE; HYDRO GZIP V2 INTEGRATED; LOCAL COMPRESSION RUNNING**  
**Current validated dev HEAD before this documentation commit:** `5ec95b9007508331a3cf0febecae52ce93b05c0c`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Exact-head Dev Integration:** run `33640879323` — **PASS, 97/97**  
**Latest focused Geofabrik hydro-gzip QA:** run `33640807592` — **PASS**  
**Hydro-gzip candidate:** `candidate/geofabrik-hydro-gzip-r1` @ `5ec95b9007508331a3cf0febecae52ce93b05c0c` before fast-forward integration.

## Why this pivot happened

Issue #3 persisted after the R6.4 water source-tree rollback and after the Overpass resilience correction. Human testing still showed:

- `Hydrographie: Indisponible`;
- `Décor réel: Indisponible` or very slow;
- rivers / hydro-sourced bridges missing;
- public Overpass availability remaining a runtime dependency.

Conclusion: public Overpass is useful as a fallback, but it should **not remain the critical source for deterministic route-world loading**.

Selected direction:

```text
Geofabrik regional .osm.pbf
  -> offline filtering/preprocessing
  -> World Drive spatial tiles
  -> layer-specific compact/compressed runtime tiles
  -> local/runtime loading
  -> Overpass only as fallback / uncovered-region source
```

Use **PBF rather than free shapefiles as the master source** because PBF preserves the native OSM tagging model needed by World Drive, including feature families that free shapefile catalogues may omit.

---

## 1.1 Integrated Geofabrik tooling

No production game runtime has been switched yet. Tooling stays outside `src/` until the real-data format is accepted.

Integrated tooling now includes:

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
.github/workflows/qa-geofabrik-pbf-r1.yml
```

Generated/source data remain intentionally ignored by Git:

```text
world-data/
public/world-data/
```

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

- water;
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

Real Quebec v1 manifest:

```text
inputFeatures:    12,313,002
emittedFeatures:   7,636,522
oversizeFeatures:         20
tileRecords:       7,939,240
tileCount:            18,940
tileSizeMeters:        16,000
```

Category counts:

```text
water:      3,016,491
waterway:   2,178,612
bridge:        24,490
dam:            4,108
building:   1,529,708
landuse:      397,367
power:        484,241
barrier:          623
sign:             906
```

Spatial conclusion:

- only **20 oversize features** across the entire Quebec extract;
- **18,940 cells** is a reasonable regional partition;
- **16 km tile size is retained for now**;
- no evidence yet that spatial cell size is the primary problem.

---

## 1.3 Real Quebec storage profile — COMPLETE

The uncompressed mixed v1 dataset is **too large to become the runtime/package format**:

```text
raw size:          12.70 GB
raw records:       7,939,240
parse errors:      0
```

### Hydro group

Definition:

```text
water + waterway + bridge + dam
```

Measured:

```text
size:                    10.15 GB
share of raw:            79.96%
records:                 5,477,000
tiles with hydro:        18,428
average hydro/tile:      577.6 KB uncompressed
largest hydro tile:      6.7 MB uncompressed
largest tile coordinate: x=-504, y=459
```

### Scenery group

Definition:

```text
building + landuse + power + barrier
```

Measured:

```text
size:                      2.54 GB
share of raw:              20.03%
records:                   2,461,353
tiles with scenery:        7,231
average scenery/tile:      368.8 KB uncompressed
largest scenery tile:      36.1 MB uncompressed
largest tile coordinate:   x=-513, y=356
```

### Signs

```text
size:                    128.1 KB
records:                 906
tiles with signs:        137
average signed tile:     957.7 B
largest signed tile:     11.5 KB
```

### Interpretation

**Do not wire mixed v1 JSONL tiles directly into the game.**

The profile shows:

1. **16 km spatial partitioning is acceptable** — normal per-tile payloads are moderate;
2. **plain GeoJSON/JSONL provincial storage is the main problem** — geometry text dominates total size;
3. **layers must be physically separated** so hydro does not load buildings/scenery and vice versa;
4. urban scenery has outlier cells up to 36.1 MB, making mixed-layer runtime fetches particularly undesirable;
5. signs are tiny and should remain a separate lightweight layer later.

---

## 1.4 Hydro gzip v2 — INTEGRATED, LOCAL REAL-DATA TEST RUNNING

A non-runtime packer is integrated:

```text
tools/geofabrik/pack-hydro-gzip-v2.mjs
qa/qa-geofabrik-hydro-gzip-r1.mjs
```

It reads the already-generated Quebec v1 cells and emits **hydro-only per-cell gzip payloads**:

```text
public/world-data/osm-v2/quebec/hydro/
  manifest.json
  tiles-index.jsonl
  tiles/<x>/<y>.jsonl.gz
```

Included categories only:

```text
water
waterway
bridge
dam
```

It does **not**:

- touch `src/water-data.js`;
- touch `src/water-renderer.js`;
- change water/bridge geometry semantics;
- change the 16 km cell grid;
- reprocess the 1+ GB PBF;
- migrate scenery/signs;
- change gameplay/runtime behavior.

Focused QA run `33640807592` is PASS and verifies:

- hydro-only filtering;
- building exclusion;
- gzip encode/decode;
- per-cell file generation;
- spatial duplication semantics across cell boundaries;
- unique hydro feature preservation;
- runtime import audit/build/code split remain green.

The local real-Quebec pack command currently being run by the user is:

```powershell
node tools/geofabrik/pack-hydro-gzip-v2.mjs `
  --in public/world-data/osm/quebec `
  --out public/world-data/osm-v2/quebec/hydro `
  --overwrite
```

## Exact next action

**Wait for the user's final JSON from the real Quebec hydro gzip pack. Do not begin runtime wiring before reviewing it.**

Capture at minimum:

```text
compressedSize / compressedBytes
uncompressedSize / uncompressedBytes
reductionPercent
tileCount
averageTileCompressedSize
maxTileCompressedSize
```

Decision gate after that result:

### If gzip reduction is strong and per-tile compressed sizes are comfortable

Proceed to a new **hydro-only runtime candidate**:

```text
compressed local hydro tile
  -> offline hydro reader
  -> existing water-data ingest semantics
  -> existing water renderer / bridge orchestration unchanged
  -> Overpass fallback only when local region/tile unavailable
```

Required human smoke first on the known Manic route that reproduced issue #3.

### If gzip remains too large / inefficient

Do **not** sacrifice hydro precision immediately. Evaluate a more compact vector transport/package such as MVT/PMTiles or another indexed binary representation before runtime integration.

### Important

Do not migrate scenery, signs, terrain or R7 structure in the same first runtime candidate.

---

# 2. Issue #3 — Overpass / hydro / scenery reliability

GitHub issue: **#3 — `Overpass shared pipeline can make hydrography and scenery unavailable together`**.

The earlier Overpass resilience correction remains valid and stays in `dev`:

- query timeout / AbortError / 408 / 504 are query-specific soft failures;
- genuine 429 / 500–503 / network failures retain endpoint cooldown;
- two logical Overpass lanes avoid one service monopolizing all loading;
- outbound starts remain globally paced at 900 ms;
- cache-first behavior and same-cell request dedupe remain;
- `WorldDriveOverpass()` diagnostics remain available.

Evidence on `37258cad5acfde1fd58207cae77169726db29c84`:

- Overpass Resilience `33629706504` — PASS;
- Water Hydro Runtime `33629706510` — PASS;
- Dev Integration `33629706535` — PASS 97/97.

**Issue #3 remains OPEN.** The correction reduced cross-service poisoning but public Overpass is still not reliable enough to remain World Drive's deterministic primary world-data source. Close only after the offline hydro source is proven in runtime/human smoke.

---

# 3. Deferred issue #2 — terrain startup adjustment

One Manic-5 startup briefly showed a large near-terrain area dark/unadjusted while road + forest were visible. It converged and could not be reproduced after relaunch.

Observed telemetry:
- ~143–144 FPS;
- `pendingWorldRefresh:false`;
- hitch count 5 → 9;
- `maxFrameMs:194.4`.

Do not tune during current OSM data-source work. Revisit in **R8 terrain/imagery/local-world/streaming** with full `WorldDriveFramePacing()` diagnostics if reproducible.

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

## R6.4 water disposition

The attempted nested water move failed human smoke and was rolled back. Current intentional production layout:

```text
src/water-data.js
src/water-renderer.js
src/forest-water-assets.js
```

Water is **KEEP ROOT** for Phase R. Permanent hydro regression coverage:

```text
qa/qa-water-hydro-runtime.mjs
.github/workflows/qa-water-hydro-runtime.yml
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
10. Migrate data consumers incrementally: hydro first; scenery/signs later.
11. Do not treat a green tool/format QA as permission to change production runtime without its own candidate and human smoke.

Do not mix into current work:
- physics/handling tuning;
- terrain/road/forest visual tuning;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup;
- scenery/sign migration while hydro source is still being proven.

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
- current Overpass fallback until offline parity is proven;
- OSM attribution / ODbL obligations for generated local data;
- full source geometry during current gzip evaluation unless a later explicit simplification experiment is separately approved/certified.

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
- **R6.4 water:** failed structural move, rolled back, KEEP ROOT.
- **OSM data-source reliability:** **ACTIVE — Quebec hydro gzip v2 real-data evaluation in progress.**
- **R7 app/input/ui/routing/services:** PAUSED until offline OSM hydro path is proven far enough to resolve issue #3; then read-only audit first.
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
| First offline runtime integration | hydro-only candidate + Overpass fallback + same known Manic route human smoke |
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

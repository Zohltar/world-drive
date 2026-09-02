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
**Active item:** **Geofabrik offline OSM prototype — real Quebec dataset generation**  
**State:** **PROTOTYPE INTEGRATED + AUTOMATION PASS — REAL DATASET NEXT**  
**Current validated dev HEAD before this documentation commit:** `5152633e6c13e208df3d780441c4493b1aa8838d`  
**Stable fallback:** `main` @ `111df5d84bf7fd700590abbd9c129b303ac92fad`  
**Exact-head Dev Integration:** run `33631514949` — **PASS, 97/97**  
**Geofabrik Offline OSM QA:** run `33631514954` — **PASS**  
**Focused prototype candidate:** `candidate/geofabrik-pbf-r1`, run `33631388208` — **PASS**

## Why this pivot happened

Issue #3 persisted after the R6.4 water source-tree rollback and after the Overpass resilience correction. Human testing still showed:

- `Hydrographie: Indisponible`;
- `Décor réel: Indisponible` or very slow;
- rivers / hydro-sourced bridges missing;
- public Overpass availability remaining a runtime dependency.

Conclusion: public Overpass is useful as a fallback, but it should **not remain the critical source for deterministic route-world loading**.

The selected direction is now:

```text
Geofabrik regional .osm.pbf
  -> offline filtering/preprocessing
  -> compact World Drive fixed-size tiles
  -> local/runtime tile loading
  -> Overpass only as fallback / uncovered-region source
```

Use **PBF rather than free shapefiles as the master source** because PBF preserves the native OSM tagging model needed by World Drive, including feature families that free shapefile catalogues may omit.

## Integrated Geofabrik prototype

No production game runtime has been switched yet. The prototype is deliberately outside `src/` until a real Quebec dataset is built and measured.

Integrated files:

```text
tools/geofabrik/build-world-tiles.mjs
tools/geofabrik/offline-tile-source.mjs
tools/geofabrik/world-drive-tags-filter.txt
tools/geofabrik/download-quebec.ps1
tools/geofabrik/README.md
qa/qa-geofabrik-tiles-r1.mjs
.github/workflows/qa-geofabrik-pbf-r1.yml
```

`package.json` adds:

```text
npm run qa:geofabrik
npm run geofabrik:tiles
```

Generated/source data are ignored by Git:

```text
world-data/
public/world-data/
```

### Pipeline v1

```text
Geofabrik .osm.pbf
  -> osmium tags-filter
  -> osmium export geojsonseq
  -> World Drive builder
  -> public/world-data/osm/<region>/
```

Default tile size: **16 km**.

Output:

```text
manifest.json
tiles-index.jsonl
oversize.jsonl              # only when needed
tiles/<x>/<y>.jsonl
```

Compact tile record:

```json
{
  "v": 1,
  "id": "way/123",
  "k": ["waterway", "bridge"],
  "g": {"type":"LineString","coordinates":[...]},
  "t": {"waterway":"river","bridge":"yes","name":"..."}
}
```

Supported v1 feature categories:

- water;
- waterway;
- bridge;
- building;
- landuse / forest-like areas;
- power;
- dam;
- guard rail / barrier;
- traffic sign.

Geometry remains WGS84 lon/lat. EPSG:3857 is used only to assign stable fixed-size tile indices.

A feature spanning more than the configurable tile cap (default **256**) is written to `oversize.jsonl` instead of being duplicated pathologically.

### Prototype QA already proven

Synthetic end-to-end QA builds tiles from GeoJSONSeq and verifies:

- water polygon;
- river;
- bridge;
- building;
- forest/landuse;
- power line;
- dam;
- guard rail;
- traffic sign;
- irrelevant-feature exclusion;
- compact tag whitelist;
- matching builder/reader tile math;
- multi-tile dedupe;
- local tile cache reuse;
- normal production build/code split unaffected.

Observed focused QA output:

```text
Geofabrik tile pipeline QA PASS {"tileCount":6,"tileRecords":19,"loadedRecords":9}
```

## Exact next action — generate the real Quebec dataset locally

Do **not** wire hydro/scenery to offline tiles yet.

On the local World Drive checkout after pulling current `dev`:

1. Verify `osmium-tool` is installed and callable:

```powershell
osmium --version
```

2. Download and MD5-verify the current Quebec Geofabrik PBF:

```powershell
powershell -ExecutionPolicy Bypass -File tools/geofabrik/download-quebec.ps1
```

Default source location:

```text
world-data/source/quebec-latest.osm.pbf
```

3. Build World Drive tiles:

```powershell
node tools/geofabrik/build-world-tiles.mjs `
  --pbf world-data/source/quebec-latest.osm.pbf `
  --region quebec `
  --out public/world-data/osm/quebec `
  --overwrite
```

4. Capture the final printed `manifest` JSON and report at least:

- `tileCount`;
- `tileRecords`;
- `emittedFeatures`;
- `oversizeFeatures`;
- `categoryCounts`;
- generated directory size on disk.

5. Only after real Quebec counts/sizes are reviewed, create a new candidate to wire **hydro first** to local tiles with Overpass fallback. Do not migrate scenery and signs in the same first runtime lot.

If `osmium --version` is not available, install/configure `osmium-tool` locally first. WSL is acceptable; if using WSL, run the preprocessing against the mounted repo from WSL.

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

**Issue #3 remains OPEN.** The correction reduced cross-service poisoning but did not make public Overpass reliable enough to be World Drive's deterministic primary world-data source. Close only after the offline source path is proven in runtime.

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

Do not mix into current work:
- physics/handling tuning;
- terrain/road/forest visual tuning;
- dependency/security fixes;
- GitHub Actions runtime upgrades;
- historical production-name cleanup.

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
- OSM attribution / ODbL obligations for generated local data.

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
- **OSM data-source reliability prototype:** **ACTIVE — real Quebec Geofabrik build next.**
- **R7 app/input/ui/routing/services:** PAUSED until offline OSM path is proven far enough to resolve issue #3; then read-only audit first.
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
| Geofabrik preprocessing | `qa/qa-geofabrik-tiles-r1.mjs` + `Geofabrik Offline OSM QA` |
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

# Block 8 R1 — Real-source measurements and precision gate

Date: 2026-09-17. Candidate: `candidate/block8-biome-classifier-r1`; PR #14.

**Disconnected prototype. NOT integrated into dev, NOT visually activated, and
NOT a completed Block 8 feature.** This continues the source audit in
`WORLD_DRIVE_BLOCK8_BIOME_R1_AUDIT.md` and supersedes the earlier local-only
publication report. The GitHub candidate preserves uint16 ecoregion record slots;
do not apply the earlier downloaded 8-bit local prototype patch over it.

Protected `dev`: `45ab6bc770097239add81eeaca9c4d32de9968a2`, exact-head Dev
Integration `35230199150` PASS. Protected `main`: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1`.
No production imports, R4 budget changes, new assets, density changes or road,
terrain, hydro, physics, multiplayer or packaging changes occur in this work.

## Recovered checkpoint, not a restarted prototype

Candidate `ea227e0e9bc42cdb5f9b72043c6de5028cec2eb3` already existed. Its run
`35233344829` passed the canonical integration command matrix and R4 regressions,
but FAILED the real atlas check at Baffin. The official 0.1-degree atlas had in
fact already been built. Run `35235619615` on evidence-only checkpoint
`e9d1400fe0e3e050dcfdf0ee350a8dd9d6912ccf` then built BOTH resolutions and retained
an independent polygon diagnosis. That checkpoint intentionally still failed
the old coastal expectation; it must not be described as green.

## Pinned source and provenance

- Official download: https://storage.googleapis.com/teow2016/Ecoregions2017.zip
- Producer download and license: https://ecoregions.appspot.com/
- Schema/license: https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017
- Attribution: Dinerstein et al. (2017), doi:10.1093/biosci/bix014; CC-BY-4.0.
- ZIP bytes: **149,248,653**.
- Source SHA-256: `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
- Observed records: **847** (IDs 0..846): 846 ecoregions plus `Rock and Ice`.
- Source text: DBF LDID 0x57, no CPG; strict Latin-1 decoding, no discarded accents.

The checksum was observed from the official HTTPS source, not supplied as a
producer-signed digest. CI now pins it; later reproductions reject a changed ZIP.
Attribution accompanies every generated atlas. No raw source or atlas is added
to the game's public assets.

## Two real global atlas builds

Measured in the evidence-only CI run above, using numpy 2.2.6, rasterio 1.4.3,
pyshp 2.3.1 on Python 3.12. These are build artifacts, not estimates.

| Metric | 0.1 degree | 0.05 degree |
| --- | ---: | ---: |
| Grid | 3,600 x 1,800 | 7,200 x 3,600 |
| Decoded cell bytes | 12,960,000 | 51,840,000 |
| Cell gzip bytes | 193,844 | 486,810 |
| Manifest bytes (uncompressed) | 105,555 | 105,556 |
| Assigned cells | 2,133,224 | 8,532,404 |
| Build seconds (single CI run) | 38.67 | 40.93 |

Decoded bytes count only the uint16 grid. The classifier defensively copies it;
JSON, decompression and transient buffers add to startup/peak memory. Its
construction and query timings are saved in `geographic-qa.json`, not equated to
browser FPS. Runtime loading must remain outside driving/frame work.

## Baffin: a real resolution limitation, NOT missing land in the source

The original test point **67.5 N, 64 W** lies in source ECO_ID 415, `Davis
Highlands tundra`, BIOME_NUM 11. However, the 0.1-degree cell centre at
**67.45 N, 63.95 W** is outside the source's terrestrial polygons. Both coarse
atlases return no-data at the original query. Increasing the entire world to
0.05 degree does NOT resolve this particular point.

The broad-family smoke now uses the independently verified interior point
**70 N, 75 W**. The original coastal point has NOT been discarded: the independent
source oracle asserts its source context and the real-atlas QA records and
reproduces its conservative no-data result as an **UNRESOLVED precision case**.
This separates regional interior correctness from coastal precision. Do not
fill ocean cells, search for nearest land, or claim production readiness just
to make this test green.

## Independent source-polygon versus raster validation

`qa/qa-block8-biome-source-parity-r1.py` uses GEOS/Shapely 2.1.2 point-in-polygon,
independent from rasterio scan conversion. It reads the same pinned source and
validates atlas lengths, record catalogs and hashes. Source multipolygons are
split into **61,905 parts** for spatial indexing, without changing coordinates.
**69 source features report invalid topology**; these are disclosed, not silently
repaired. Source overlaps follow the current documented highest-ECO_ID policy.

Per resolution, the fixed deterministic experiment has 12,201 sample positions:
6,000 uniform-latitude/longitude global samples, 2,000 in each of three regional
boxes, and 201 points on a straight Yungas diagnostic transect. Sampled owning
cell centres produce **0 mismatches in 24,402 comparisons across both grids**.
Centres can repeat; these are comparisons, not 24,402 unique geographic locations.

Off-centre biome differences against the SOURCE POLYGONS:

| Sample set | Count | 0.1 degree differences | 0.05 degree differences |
| --- | ---: | ---: | ---: |
| Uniform lat/lon global | 6,000 | 49 | 20 |
| Baffin coastal box | 2,000 | 112 | 59 |
| Jamaica coastal box | 2,000 | 165 | 93 |
| Yungas regional box | 2,000 | 68 | 46 |
| Yungas diagnostic transect | 201 | 10 | 10 |

These rates are NOT global ecological accuracy: sampling is not area weighted,
boxes are sensitivity probes, and the transect is not an actual driven route
polyline. They include no-data/land differences. Raw evidence separately records
lost source-land samples, false land assignments, ecoregion differences and overlaps.
Source agreement is not current land cover, local treeline or field validation.

## Rock/ice source semantics fixed without rewriting provenance

The real source stores `ECO_ID=0`, `ECO_NAME='Rock and Ice'`, `BIOME_NUM=11`.
The earlier prototype's local profile 98 was therefore never selected by this
real record. The classifier now recognizes this exact RESOLVE record and returns
local context `rock-ice` / 98, including transition weights. The ecoregion record
still reports the original source biome 11. Ordinary tundra and other sources
are not reclassified. Three targeted regressions protect this distinction.

## Evidence gates and next action

Local checks after the changes: existing 14 classifier groups + 3 rock/ice groups,
source-oracle self-tests, 7 real regional controls at each resolution, and the
24,402 centre comparisons passed. CI must re-run at the new exact candidate HEAD;
the earlier failed run or the baseline PASS cannot certify these changes.
The focused workflow also executes EVERY maintained Dev Integration `run` command,
reports tolerated failures separately, and runs the explicit certified R4 suites.

**Decision for the next prototype:** keep 0.1 degree as a small regional context
baseline; design bounded route/local refinement for coasts, small islands and
montane transitions rather than paying four times the world-grid RAM for 0.05
degree without resolving the diagnosed Baffin and Yungas cases. No production
palette decision is authorized by a coarse raster alone in uncertain cells.

Next: implement and test that bounded fine representation, then the maintained
biome service/palette registry. Keep the Baffin point and Yungas transect as
precision gates. Do not activate assets or change R4 scheduling yet. No human
driving retest is requested for this disconnected prototype, and no dev/main
merge is performed without the user's checkpoint.

# Block 8 — Biome source audit and isolated classifier R1

Date: 2026-09-17. Candidate: `candidate/block8-biome-classifier-r1`.
Base: `dev` at `45ab6bc770097239add81eeaca9c4d32de9968a2`, exact-head Dev Integration `35230199150` PASS.
Stable `main`: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / `v21.33`, untouched.
R4 reference: `ca1fbb4b7b3448a2f18ae655545046464acba4e3`, focused run `35180462666` PASS; HUMAN PASS recorded in the canonical plan.

## Scope and decision

This is the canonical plan's data-source audit + classifier prototype, not the completed Block 8 feature. Everything new lives under `tools/biomes`, QA and documentation. No game import, new tree model, density change, route/network change, renderer change or R4 scheduler retune. Do not integrate this candidate to `dev` without the user's checkpoint. No driving retest is needed for an isolated prototype.

Use RESOLVE 2017 as the primary regional ecological context. Preserve its ecoregion ID, name and realm as well as biome class. Prototype two offline raster resolutions, measure their real archive/memory/query costs, and retain explicit boundary/no-data uncertainty. Do not substitute latitude bands or invented rectangles for actual geographic data.

## Source comparison (retrieved 2026-09-17)

| Source | Evidence and suitability | Decision |
|---|---|---|
| RESOLVE Ecoregions 2017 | Producer describes 846 terrestrial ecoregions. Official Earth Engine catalog provides ECO_ID, ECO_NAME, BIOME_NUM, REALM and CC-BY-4.0, grouped into 14 biomes/8 realms. Vector boundaries describe regional ecosystem context, not present tree cover; some polygons exceed a million vertices. | Primary source, preprocessed outside the game. Do not ship or scan the full shapefile in the frame loop. Rock/ice is handled separately when present in the source. |
| Beck et al. 2023 Köppen-Geiger V2 | Producer supplies 1-km historical and projected climate maps under CC-BY-4.0. Climate temperature/moisture/seasonality is useful context but does not directly identify the regional species pool. | Possible later supplement. Do not use future scenarios as present vegetation. Not required by R1. |
| ESA WorldCover 2021 | Official product supplies global 10-m land-cover classes and CC-BY-4.0 terms. Tree cover, shrubland and other cover categories answer a different question from biome identity. | Optional later cover refinement, not a replacement for current road/building/hydro/blocker authority; do not add global high-resolution data or live per-chunk calls here. |

Primary sources:
- RESOLVE producer: https://www.resolve.ngo/projects/ecoregions-world
- RESOLVE official catalog/schema/license: https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017
- RESOLVE source archive: https://storage.googleapis.com/teow2016/Ecoregions2017.zip
- Scientific attribution: Dinerstein et al. (2017), https://doi.org/10.1093/biosci/bix014
- Beck producer, data and license: https://www.gloh2o.org/koppen/
- Beck scientific attribution: https://doi.org/10.1038/s41597-023-02549-6
- ESA product and attribution terms: https://esa-worldcover.org/en/data-access

The downloaded source feature LICENSE field is checked. The source ZIP SHA-256 and decoded atlas SHA-256 are recorded. The initial audit discovers the source checksum; subsequent reproduction should pass that observed checksum using `--expected-sha256`. Source attribution, license link and rasterization modifications accompany every generated atlas. An observed checksum is not a producer-signed integrity guarantee.

## Prototype contract

`createBiomeClassifier(atlas, options).query(latitude, longitude)` returns primary biome/family/palette-family context, ecoregion metadata, source identity, resolution and qualitative confidence (`regional`, `boundary`, `unavailable`). Confidence is an implementation label, not a calibrated probability of ecological correctness.

The atlas is a north-to-south WGS84 cell-center raster, 0..360-degree span from -180, no duplicate dateline column, uint16 little-endian record slots, with slot zero reserved for no data. Constructor validates and defensively copies input. Cache is per immutable dataset instance and bounded (default 256 entries). Query performs at most four cell reads, no I/O/timer/random draw. No-data does not search for nearby land or assume dense generic forest.

Fourteen biome codes remain distinct, including tropical conifer versus boreal conifer and mangrove versus flooded grassland. `canopy` is only a regional descriptor, not a final density parameter. Tropical primary profiles cannot select the boreal palette-family identifier. Desert, tundra, rock/ice and unknown cannot silently return generic closed forest.

Transition metadata uses bounded smooth weights around raster cell edges (default half-width 500 m, configurable 0..2000 m). It is NOT proof that the real ecological boundary is at that cell edge. The primary palette stays tied to the primary cell. Future asset blending must apply compatibility/exclusion rules; it must not blindly sample a boreal asset from a tropical cell's neighboring mix. No production asset selector exists in R1.

Every result explicitly has `placementAuthority: false` and `elevationApplied: false`. Existing blocker/hydro/road/building semantics remain authoritative. There is no invented universal altitude cutoff: local treeline/climate evidence and montane distinctions require a later, separately tested step.

## Size and precision experiment

Global raw uint16 grids are 12,960,000 bytes at 0.1 degrees and 51,840,000 bytes at 0.05 degrees (arithmetic from grid dimensions). These are about 11.1 km and 5.6 km north-south, not fine road-corridor resolution. Longitude distances shrink with latitude. Actual gzip bytes, record count, construction and query timings are generated by QA; do not present estimates as measured results.

The constructor's defensive copy temporarily requires a second grid; loading/decompression must happen outside driving work before any production adoption. Finer global grids would require a tile/route-cache design, not an unbounded full-world buffer. Small islands, coastlines, narrow ecological strips and mountainous corridors need polygon-vs-raster accuracy evaluation. A six-location smoke does not certify all roads or local treeline behavior.

## Validation and evidence

- Synthetic classifier QA: 14 test groups, 100k queries, all biome mappings, invalid coordinates, poles/dateline, no-data, mutation safety, malformed atlases, bounded LRU, continuous normalized transition weights.
- Synthetic converter QA: polygons/holes, no-data, explicit endian encoding, deterministic bytes, SHA checks and ignored ZIP traversal names.
- Real source QA: six broad regional expectations (Manic-5, Montreal, Borneo, Sahara, Baffin, Tibet), real source checksum/record validation, ocean no-data, 100k queries and a diagnostic-only Yungas coordinate transect.
- Candidate CI executes EVERY `run` step from the unchanged `.github/workflows/qa-dev-integration.yml`, with the same Node version and bash fail behavior. Checkout/Node setup are supplied by the candidate job. Unexpected workflow semantics fail closed. Tolerated failures are reported separately rather than called green.
- Additional explicit R4 progressive-layer, geographic-index and lifecycle regressions execute at the candidate head.
- `git diff --exit-code` protects existing runtime paths against the certified base. Workflow token has contents:read only. No commit, branch update or release is performed by CI.

Evidence artifacts are named by the exact candidate SHA: `biome-r1-integration-SHA` and `biome-r1-atlases-SHA`. Initial publication does not claim a pending CI run has passed. Read latest candidate checks and artifacts before proceeding. Local synthetic passes do not count as real-geography or visual certification.

## Exact next action after prototype QA

Inspect both real-data atlas measurements, source hash and geographic results. Select a bounded resolution/packaging strategy after evaluating mountainous/coastal precision. Then implement the maintained biome service and palette registry/asset selection on a candidate, without touching R4 priorities, budgets or full density. Before visual activation, add permanent tests to the canonical integration inventory, preserve all existing exclusions, prove smooth compatible transitions and measure actual forest readiness/frame pacing. Only then request the tropical/boreal/arid-or-alpine human visual matrix.

Restart note: `dev`'s canonical plan remains authoritative and unchanged until integration; consult this candidate and its PR before starting another biome prototype. The live issue list also showed #11 still administratively open while the canonical plan marks its correction certified; this unrelated ledger discrepancy was not modified during R1.

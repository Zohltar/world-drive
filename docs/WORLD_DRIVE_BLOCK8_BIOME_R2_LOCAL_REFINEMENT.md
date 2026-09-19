# Block 8 R2 — Bounded local source-polygon refinement

Date: 2026-09-17. Continues PR #14, `candidate/block8-biome-classifier-r1`.
Base candidate: `b657bac9637f4cd9d87fe463bfc22e294fc5a26d`; R1 exact-head
run `35237516375` PASS. Protected dev: `45ab6bc770097239add81eeaca9c4d32de9968a2`;
Dev Integration `35230199150` PASS. Protected main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1`.

**Isolated tooling/prototype only. No game imports, production assets, R4
scheduler changes, density changes, elevation rules or dev/main movement.**
This continues (does not replace) the R1 regional atlas and real-data audit.
The new exact-head CI must pass; the previous R1 PASS cannot certify R2.

## Representation and boundaries

Keep the global 0.1-degree R1 grid as regional context. Prepare selected local
0.1-degree tiles from the ORIGINAL pinned RESOLVE source polygons. Each tile has
16 x 16 indexing cells. A cell wholly covered by one source polygon stores a
uniform record slot; empty source cells store zero. Other cells retain clipped
polygon rings including holes in double precision, NOT a finer cell-centre
raster approximation. The indexing cells do not quantize the source boundary.

`build-local-refinement.py` intersects valid source polygon parts with closed
tile/cell boxes using Shapely/GEOS. There is no `make_valid`, buffer repair,
coordinate snapping, simplification, ocean filling or nearest-land search.
Clipping creates artificial cell edges; the query's boundary flag can refer to
those edges and is NOT a distance-to-ecological-boundary or blending signal.
A 1e-11 degree arithmetic tolerance is used for edge membership. Exact source
agreement remains a numerical test, not a mathematical exact-arithmetic claim.

Original parts are selected by bounding-box overlap with the bounded authoring
footprint. All source record metadata/licenses are checked against the R1
catalog; selected geometries are indexed once, without loading a global grid at
query time. Source record slots stay in ascending ECO_ID order; the existing
highest-ECO_ID policy applies to overlaps. Raw source biome metadata is retained;
this layer returns records, not asset choices. R1's rock/ice distinction remains
covered separately and must be used by the future maintained service.

If an invalid source part actually touches a tile, or its disjointness cannot
be established, the affected tile area is explicitly unresolved. Invalid parts
whose geometry is disjoint do not invalidate an unrelated route merely because
their huge bounding box overlaps it. Clipping failures, degenerate edge/corner
contacts and excessive complexity also remain unresolved, never source no-data.
The selected-source invalid counts are LOCAL scan counts, not a new worldwide
topology audit. R1 separately documented worldwide source-invalid features.

## Explicit resource contract

- Authoring batch: at most 128 tiles from 1..100,000 explicit sample positions;
  optional one-tile padding. These are authoring samples, not an implemented
  continuous-polyline prefetch planner. Split long routes into bounded batches.
- Tile indexing: 256 cells; at most 32,768 points per tile.
- Query: one addressed cell; at most 512 polygon edges. A complex cell is refused
  during authoring or validation rather than exceeding that bound.
- JSON decode: at most 2 MiB before parsing; gzip output and SHA-256 checked by
  the external test loader. Cryptographic integrity belongs to the future loader,
  not the synchronous geometry query.
- Resident cache: by default 8 tiles AND 8 MiB of typed-array payload. This does
  not claim an 8 MiB total process/JS heap ceiling: catalog/Map/object overhead,
  parsing, decompression and transient defensive copies are separate.
- Tile installation is explicit and validates before eviction. Query never
  reads files, fetches, decompresses, starts timers or changes scenery scheduling.
  It can return `tile-not-loaded`; the harness explicitly loads outside query.
- The source SHA and catalog SHA must match. Resident arrays and records are
  defensively copied/private; different datasets require separate instances.

Every result has `placementAuthority:false` and `elevationApplied:false`.
Road, building, landuse, hydro, rock/ice and other existing placement masks remain
independent and authoritative. Missing/uncertain refinement must not silently
promote coarse context into a confident palette decision.

## Source and implementation references

Pinned archive SHA-256 remains
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Attribution travels with each generated tile batch. No raw source/atlas/tile is
added to `public` or packaged into the game in this step.

- Source: https://storage.googleapis.com/teow2016/Ecoregions2017.zip
- Catalog/license: https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017
- Dinerstein et al. (2017): https://doi.org/10.1093/biosci/bix014 ; CC-BY-4.0.
- Double-precision clipping: https://shapely.readthedocs.io/en/stable/reference/shapely.intersection.html
- Spatial predicates: https://shapely.readthedocs.io/en/2.1.2/strtree.html

## Tests and measured local results

The R2 JavaScript suite contains 16 groups: uniform/no-data cells, holes and hole
edges, ring orientation, overlapping records, invalid/complex cells, poles and
antimeridian, adjacent tile ownership, malformed inputs, mutation isolation,
count/byte LRU eviction, atomic rejection, decode/edge bounds and 100k queries.
Python tests exercise actual cross-language encoding, tiny islands, source holes,
seams, overlap, determinism, invalid source topology and the complexity ceiling.
Existing R1 14 classifier groups and 3 rock/ice groups also pass locally.

A separate deterministic sensitivity experiment (seed 20260918) uses 2,000
points in each of three LOCAL footprints, the unchanged R1 201-point Yungas
transect, the original Baffin point and 125 cell-seam probes: **6,327 positions**.
The oracle queries unmodified source polygons via GEOS; JavaScript queries the
clipped representation with its own bounded point-in-polygon implementation.
This checks representation/query agreement, not independent ecological truth.

| Same sampled positions | Count | 0.1-degree biome differences | R2 source-record differences | R2 unresolved |
| --- | ---: | ---: | ---: | ---: |
| Baffin local footprint | 2,000 | 679 | 0 | 0 |
| Jamaica local footprint | 2,000 | 670 | 0 | 0 |
| Yungas local footprint | 2,000 | 163 | 0 | 0 |
| Original Yungas diagnostic transect | 201 | 10 | 0 | 0 |
| Original Baffin control | 1 | 1 | 0 | 0 |
| Baffin cell-seam probes | 125 | 78 | 0 | 0 |

The original Baffin coordinate (67.5 N, 64 W) now resolves to ECO_ID 415,
Davis Highlands tundra, instead of coarse-raster no-data. All 201 ORIGINAL Yungas
transect positions agree; no point was removed or moved to achieve this result.
R1's coarse raster remains unchanged and still has its documented limitations.

Measured local artifacts: **25 tiles; 19,640 bytes gzip total**, 132,459 bytes of
decoded tile JSON, plus a 74,775-byte manifest (including the source catalog).
Peak resident typed-array payload in this harness: **34,292 bytes across at most
8 tiles**; maximum tested edges for one real query: **14**, below the 512 ceiling.
These are for these footprints only, not a global size/complexity forecast.
The local environment used numpy 2.3.5/rasterio 1.5.0/pyshp 2.3.1/Shapely 2.1.2;
CI rebuilds with the existing pinned numpy 2.2.6/rasterio 1.4.3 environment.

Initial local source scan was unnecessarily global; it was replaced with bounded
footprint selection. An initial geometry-validity gate also rejected all Yungas
cells because disjoint invalid part ECO_ID 505 had a large overlapping bounding
box. The corrected gate establishes disjointness before declaring the tile
uncertain. Actual intersecting invalid geometry remains refused and tested.

## CI and exact next action

The candidate workflow runs all maintained canonical Dev Integration `run`
commands and explicit R4 regressions unchanged, the R1 global experiment and the
R2 synthetic/real refinements. The exact-head R2 evidence artifact is
`biome-r2-refinement-SHA`; the integration and source-code artifacts remain
`biome-r1-integration-SHA` / `biome-r1-code-SHA` for this continuing PR.
Do not equate candidate integration commands to a new canonical dev-head run.

Next: introduce the maintained biome-service contract and compatible palette
registry, then a versioned bounded loader/preparation path and continuous-route
coverage strategy. A production loader must validate hashes before install,
prepare outside frame work, handle stale route generations and no-data, and keep
transient memory bounded. Smooth compatible biome transitions and local elevation
policy still require separate work. No visual activation or human driving test
is requested for this isolated representation step. No dev/main merge is implied.

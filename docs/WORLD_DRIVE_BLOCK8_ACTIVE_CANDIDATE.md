# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.
This ledger is the CURRENT candidate restart point; R1/R2/R3 reports are historical.

## Current state

Existing branch: `candidate/block8-biome-classifier-r1`. PR #14 remains draft and unmerged.
Latest verified implementation milestone: **biome R4 loading** at
`2ca1d6b82bb0585204f2eb5c962bd59827cbf039`.
Exact-head candidate run **`35260248703`: PASS**, both integration and real-data jobs.
The current branch can have a later documentation checkpoint: read its live HEAD and
its own exact-head QA. The implementation milestone's PASS is not automatically a
PASS for any later commit. Do NOT create a second initial biome prototype.

Integrated runtime remains the forest-R4-certified baseline from `dev`
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration `35230199150` PASS).
Documentation synchronization `75767a7bbac6e4532068864ab86bddfdd44714ec` passed
canonical Dev Integration `35258708553`. Subsequent documentation-only commits
update this ledger/plan but DO NOT integrate PR #14. Read the current dev HEAD and
its exact Dev Integration result live; do not reuse a historical run for a new SHA.
Stable main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33; no movement authorized.

## Verified implementation milestones (historical, immutable)

| Milestone | Candidate SHA | Exact-head candidate run | Result |
| --- | --- | --- | --- |
| R1 real-source audit | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 bounded local refinement | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 maintained service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |
| R4 bounded transport/continuous preparation | 2ca1d6b82bb0585204f2eb5c962bd59827cbf039 | 35260248703 | PASS |

R4 candidate executed **97 canonical integration run commands**, all zero exit,
requiredFailures=0 and toleratedFailures=0. This is the CANDIDATE command matrix,
not a canonical dev-head run. Explicit forest R4 regressions remain green.
The 25 new loading groups cover native gzip, bounded sizes/concurrency, corrupted or
stalled streams, abort/disposal, stale routes/windows, missing coverage, continuous
segments, seams/dateline/poles, cache eviction/return and query purity. R1/R2/R3
regressions remain green. No real asset was registered or displayed.

## Real route evidence for R4

The actual stored circuit polylines were not moved or replaced with straight lines.
`qa/qa-block8-biome-route-real-r4.py` prepares the selected source-polygon tiles;
JavaScript loads them through REAL loopback HTTP, Fetch and native gzip decoding,
then verifies the source record at each polyline vertex and route-window readiness.

| Existing polyline | Vertices / windows | Computed length | Source-record mismatches | Unavailable |
| --- | ---: | ---: | ---: | ---: |
| Laguna Seca | 206 | 3,600.86 m | 0 | 0 |
| Nordschleife | 1,068 | 20,746.16 m | 0 | 0 |

Measured in exact-head artifact `biome-r4-routes-2ca1d6b82bb0585204f2eb5c962bd59827cbf039`:
3 prepared tiles / 3 HTTP requests, 1,947 gzip payload bytes, 14,145 decoded tile JSON
bytes. Maximum window residency 2 tiles, peak resident typed-array payload 6,348 bytes.
These two compact circuit footprints are NOT a global size or performance forecast.
They do not exhaust the cache or exercise complex boundary edges; those remain
covered separately by R2 source parity and synthetic eviction/complexity tests.
The 1,274 positions were all resolved source records; no hidden no-data substitution.
This is source agreement and Node HTTP correctness, NOT browser/GPU frame-pacing,
high-speed visual streaming, current tree cover or ecological field certification.

The original 6,327 R2/R3 points remain covered independently, including 4,846
resolved records and 1,481 retained source-no-data results. Original Baffin control
and the unchanged 201-point Yungas transect remain precision gates.
Source SHA-256: `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.

Read these files ON THE CANDIDATE until integration:
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R4_ROUTE_LOADING.md` (current architecture/API/limits)
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R3_SERVICE_PALETTES.md` (historical R3 contract)
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R2_LOCAL_REFINEMENT.md`
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R1_REAL_DATA.md`
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R1_AUDIT.md`

## Exact next action

**Continue broader route/batch distribution and browser off-frame preparation.**
The HTTP/gzip adapter and moving continuous-polyline coordinator already exist;
do not restart their implementation. The next gap is handling successive bounded
manifest batches along long routes, keeping a fixed source/catalog identity,
measuring missing coverage and memory, and validating native browser preparation
outside gameplay frame work. The current service still accepts one <=128-tile
manifest batch; neither worldwide fine-data distribution nor automatic batch
handoff/persistent route caching is implemented. No game lifecycle binding or
worker/frame-budget admission has been activated.

After those gates, review/register actual compatible models, establish bounded
smooth ecological transitions and local elevation rules, then enable a separate
visual candidate with readiness/frame-pacing QA before the human
boreal/tropical/arid-or-alpine matrix. Keep every existing road/hydro/building/
landuse/blocker exclusion authoritative. The actual asset registry remains empty.
No human driving test is requested for this disconnected loading milestone.

## Protected distinctions

- Forest R4 (Issue #12) is integrated and HUMAN PASS; biome R4 is separate candidate work.
- Biome R1–R4 are not integrated or certified as completed visual scenery.
- A docs-only dev advance is NOT a merge of biome runtime; main remains untouched.
- The canonical plan now points here instead of incorrectly requesting a fresh prototype.
- Earlier downloadable local 8-bit prototype is obsolete; do not overwrite the live uint16 code.
- Async preparation is explicit; synchronous biome queries never initiate transport or planning.
- Claimed memory limits are bounded retained payloads, not all native/JS process allocations.
- Do not merge PR #14 or advance main merely because automation is green.

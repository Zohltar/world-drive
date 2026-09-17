# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.
This is the current restart ledger; R1-R6 detailed reports are historical.

## Current state

Existing branch: `candidate/block8-biome-classifier-r1`, draft/unmerged PR #14.
Latest verified implementation: **R7 actual forest candidate adapter**,
`45787f9afc1fb36c96fcb591ba220670bf163bfc`, exact-head run **35275728861 PASS**.
Both contract/integration and real-data/native-browser jobs completed successfully.
Later docs/ancestry commits require their OWN exact-head QA. Read live candidate
HEAD and PR before work; never transfer an earlier run's PASS to a later SHA.
Do not restart the importer, classifier, transport, batches, Worker, R6 bridge or R7 adapter.

Integrated gameplay remains the forest-R4-certified baseline from
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration 35230199150 PASS).
Before this R7 ledger-only synchronization, dev was
`3aef6d5694c60294bfa2084920f86b2d1d1f7457`, Dev Integration **35268749403 PASS**.
Earlier dev maintenance includes documentation and two QA files only: strict C6
inventory now recognizes the already-certified forest/spatial diagnostic aliases
with exact owners, while unknown globals/moved owners/direct writes still fail.
Historical supplemental failure 35264487841 remains a failed record.
This ledger-only advance does NOT integrate any biome runtime or R7 QA imports.
Read the current dev HEAD and its canonical exact-head Dev Integration live.
Stable main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.

## Verified milestones (immutable historical evidence)

| Milestone | Candidate SHA | Exact-head run | Result |
| --- | --- | --- | --- |
| R1 real source | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 local source polygons | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |
| R4 HTTP/gzip route preparation | 2ca1d6b82bb0585204f2eb5c962bd59827cbf039 | 35260248703 | PASS |
| R4 final docs | 672824cf0afaec7562c3f1aa4d181c269285917f | 35260824227 | PASS |
| R5 batches/native Worker | a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3 | 35263745441 | PASS |
| R5 final ancestry | e563e49c2224437148796b6422031bc572eda4c6 | 35265768818 | PASS |
| R6 exact-point snapshots | 03eed818f42be4dc5e80d9b8d10149bdaebe0fcb | 35268092976 | PASS |
| R6 final docs/ancestry | ab22531111239770208e44eac2657c048395b239 | 35268837896 | PASS |
| R7 forest coordinate adapter | 45787f9afc1fb36c96fcb591ba220670bf163bfc | 35275728861 | PASS |

## R7 behavior and evidence

The adapter imports the existing unchanged forest hash/policy. Natural slot is
cellIndex*109+candidateIndex. It preserves all 1,744 raw candidates, the 1,024-slot
first layer, signed absolute chunks and exact main.js projection arithmetic.
Render-origin offsets never enter deterministic sampling. Immutable projection
identity includes both origin coordinates' exact bits plus explicit route identity.
Pole singularity/domain overflow fail explicitly; no silent wrapping or ecological fill.

New `forest-chunk` preparation sends bounded metadata, not a main-thread-generated
point array. A real Worker generates coordinates and captures R6 contexts. Main
receipt retains R6 private-copy/identity/epoch/buffer validation and atomic publication.
Exact synchronous reads do not start Worker work or I/O. `prepared` means a valid
snapshot, NOT that every point has known geography: inspect resolved/noData/unavailable
counts and explicitly refresh when coverage changes. No placement authority is granted.

Exact implementation run: **97 maintained integration commands, all exit zero**,
requiredFailures=0, toleratedFailures=0. This is the CANDIDATE command matrix, not a
dev-head run. Twenty-two new R7 Node groups pass, as do R1-R6, Python packaging and
explicit certified forest R4 regressions. Runtime-diff/no-game-activation guards pass.

The independent parity test executes the ACTUAL four original forest-builder bodies
and main.js projection functions. **36 chunks / 62,784 raw candidate comparisons**:
zero coordinate/order mismatches, first-layer boundary exactly 1,024. Three intentional
salt/axis mutations are rejected. Original runtime files were downloaded from the
exact-head code artifact, checked against their original Git blob hashes, and this
parity test was repeated locally with the same results.

Native Chromium **143.0.7499.4**, two actual module Workers, no page errors. The
main page traps hash sampling DURING preparation and also tile/page fetch, gzip and
digest. Expected real coordinates come from the original generator, not the adapter;
expected ecoregions come from the original unclipped source polygons.

| Native R7 experiment | Chunks / candidate reads | Result |
| --- | ---: | --- |
| Selected chunks around original Laguna Seca vertices | 6 / 10,464 | all resolved; zero mismatches/unavailable |
| Selected chunks around original Nordschleife vertices | 7 / 12,208 | all resolved; zero mismatches/unavailable |
| 300 forward/reverse windows over 150 MOCK tiles | 1,744 per chunk / 523,200 | exact expected records |
| Repeated prepared reads | 100,000 | stable object; no new capture |

Both real and synthetic stores peaked at four chunks / **141,952 accounted bytes**
under the 160,000-byte test cap. Synthetic store: 296 publications, four reuses,
292 evictions. Stale route/window, held-handle invalidation and recovery pass.
These are selected raw candidates, NOT accepted roots, complete long-road coverage,
current vegetation, visual streaming or GPU/game frame-time certification.

Default bridge limits remain 32 chunks / 4 MiB accounted resident payload, two
pending chunks / 1 MiB reserved. Procedural worst-case reservation: 293,536 bytes.
R5's separate service/transport/cache and four-RPC admission limits remain unchanged.
Payload limits exclude total native/JS heap, message overhead and caller-held handles.

Implementation artifact ZIP digests (integration, forest, code) were checked.
All eleven published R7 files match the locally tested SHA-256 inventory exactly.
Evidence: `biome-r7-forest-45787f9afc1fb36c96fcb591ba220670bf163bfc`, including
`forest-parity-r7.json`, `forest-plan.json`, original source expectations and
`forest-browser-r7-qa.json`. Browser evidence is from Actions, not an emulated client.

## Protected foundations

Pinned RESOLVE source SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Earlier independent 6,327-point matrix retains 4,846 records and 1,481 source-no-data
cases, including original Baffin and unchanged 201-point Yungas controls. R5/R6 native
original circuit-vertex tests and mock long progression remain permanent regressions.
Source agreement is not field ecology. Actual asset registry remains EMPTY.

## Exact next action

**Bind actual gameplay route/Worker/snapshot admission in DIAGNOSTIC-ONLY mode.**
First audit route-ready/reset/teleport/disposal and current generation/origin ownership.
Choose an off-frame bounded admission point, preserve forest R4, and use R7 absolute
keys with R6 prepared synchronous reads. Do not generate a whole chunk, await per-tree
RPC, or perform network/decoding in the forest frame loop. Measure current/forward
coverage, missing data, staging, snapshot receipt and frame pacing on actual routes
before visual activation. Existing placement exclusions remain authoritative.

Worldwide fine distribution, persistent caching, trusted-root retrieval, long real-road
readiness, reviewed compatible models and ecological transitions/elevation remain open.
The current directory is trusted application input with partial coverage; missing fine
data stays uncertainty. No human driving test is requested for this disconnected stage.

Read ON THE CANDIDATE `WORLD_DRIVE_BLOCK8_BIOME_R7_FOREST_ADAPTER.md`, then the R6,
R5, R4, R3, R2 and R1 detailed documents as historical/API references. This ledger is
part of the canonical plan and is synchronized on dev/candidate. No biome merge or
main movement is authorized merely by green automation. Forest R4 / Issue #12 stays
integrated/HUMAN PASS; biome R1-R7 are NOT integrated or visually certified. No real
asset, density, treeline or visual transition was activated. Earlier 8-bit local
prototype remains obsolete; never overwrite the maintained uint16 implementation.

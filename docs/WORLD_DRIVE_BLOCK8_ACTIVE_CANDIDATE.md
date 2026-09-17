# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.
This is the current candidate restart ledger; R1-R4 reports are historical.

## Current state

Existing branch: `candidate/block8-biome-classifier-r1`. PR #14 remains draft and unmerged.
Latest verified R5 implementation/test milestone:
`a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3`, exact-head run **35263745441 PASS**.
Both integration and real-data/native-browser jobs completed successfully.
The implementation commit `ad8aa1d0cd5e2523e96c0d9fb09adc97c6b9af0c` also passed
run 35263466518; the later milestone isolates the browser harness from the game page.
Later documentation checkpoints require their OWN exact-head QA; the milestone
PASS is not transferable. Re-read the live PR and candidate HEAD before any work.
Do NOT create another initial importer, classifier or HTTP loader.

Integrated runtime is still forest-R4-certified baseline
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration 35230199150 PASS).
Docs-only dev checkpoints `75767a7bbac6e4532068864ab86bddfdd44714ec` and
`40d5e478805a928729ae9d2e5b03b8813fd17185` passed canonical Dev Integration
35258708553 and 35260790374 respectively. Further ledger-only updates do NOT
integrate biome runtime. Verify the current dev SHA and its exact QA live.
Stable main is `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.

## Verified candidate milestones (historical)

| Milestone | Candidate SHA | Exact-head candidate run | Result |
| --- | --- | --- | --- |
| R1 real-source audit | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 bounded local refinement | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 maintained service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |
| R4 bounded transport/route preparation | 2ca1d6b82bb0585204f2eb5c962bd59827cbf039 | 35260248703 | PASS |
| R4 final docs checkpoint | 672824cf0afaec7562c3f1aa4d181c269285917f | 35260824227 | PASS |
| R5 successive batches/native Worker | a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3 | 35263745441 | PASS |

R5 executes the 97 maintained canonical integration run commands: all exit zero,
requiredFailures=0, toleratedFailures=0. This is the CANDIDATE command matrix,
not a new canonical dev-head run. Explicit forest R4 regressions remain green.
New R5 tests: 17 Node groups, standard-library Python packaging/rejection tests,
and actual native Chromium module-worker tests; all R1-R4 suites retained.
The new Node regression is also in the permanent integration inventory.

## R5 behavior and measured evidence

A fixed-source directory references hash-verified one-degree manifest pages.
Python packages existing source-polygon tiles without modifying their geometry or
gzip bytes. The source caches two pages by default and selects only a bounded
window. One active service is retained while at most one staging service prepares
the next window. Promotion is atomic after readiness. There is only one executing
update and one replaceable latest pending update; stale routes/windows are discarded.
There is no persistent cache and no worldwide fine-data publication yet.

The browser uses a real dedicated module Worker for Fetch, gzip, SHA validation,
geometry preparation and route planning. The main page traps those heavy APIs
and tile/page fetches; accidental main-thread fallback would fail the test.
Worker/client admission is four pending RPCs; sample requests are at most 256 points.
Samples are async snapshots for preparation/testing, NOT per-tree render RPCs.

Downloaded milestone artifacts (integration, route/browser, code) were SHA-256
verified. All 13 R5 changed/new files matched the tested local files byte-for-byte.
Browser artifact: `biome-r4-routes-a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3`,
file `browser-r5-qa.json`, Chromium 143.0.7499.4; two real Worker events observed.

| Native browser experiment | Positions/windows | Outcome |
| --- | ---: | --- |
| Original Laguna Seca polyline | 206 | all ready; zero source-record mismatches |
| Original Nordschleife polyline | 1,068 | all ready; zero source-record mismatches |
| Artificial 1,656.806 km path, forward/reverse | 300 | 150 distinct tiles, 15 pages; all ready |

Synthetic progression performed 299 handoffs, with at most two services and two
cached pages; peak observed resident typed-array payload 3,608 bytes. It uses
uniform MOCK geometry, not a real long road or continuous high-speed driving test.
Native-browser stale-route, stale-sample, admission, oversize-sample and worker
termination checks pass. UI heartbeat progresses, but that is NOT an FPS metric.

Real circuit experiment: three declared source tiles, three page fetches, four
tile transfers (one shared tile reload during handoff), 2,258 gzip payload bytes,
16,598 decoded tile-JSON bytes. Peak observed resident typed arrays 6,348 bytes;
transport peak reservation 10,566 bytes, at most two transfers. These are two
compact geographic footprints, NOT world-wide complexity or total heap estimates.
R5 has not proved GPU frame pacing or absence of visual forest cuts in gameplay.

Default retained limits: each service 8 tiles / 8 MiB typed arrays (at most two
services), source two 64 KiB manifest pages, shared transport two transfers /
8 MiB reserved payload, and separate R3 verification budgets. Native decoder,
JSON/crypto/catalog/caller copies and worker message overhead are additional.

R1-R4 source gates remain: 6,327 real positions, 4,846 resolved source records and
1,481 explicit source-no-data results; original Baffin point and all 201 unchanged
Yungas transect points retained. Source agreement is not field ecological truth.
Pinned source SHA-256: `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.

## Exact next action

**Implement the bounded synchronous chunk-context snapshot bridge**, then validate
actual game route/worker admission in diagnostic-only mode before visual activation.
R5 Worker preparation and successive batches already exist; do not rewrite them.
The renderer must consume a bounded immutable ready snapshot, not await a Worker
per tree or start network/decoding work in the forest frame loop. Preserve source
identity, absolute deterministic keys and stale-route/window rejection.

Global fine-data distribution, persistent caching, root-manifest retrieval/trust,
long real-road readiness, ecological transition/elevation policy and actual reviewed
compatible models remain open. The current root is trusted application input and
partial coverage; absent fine data stays explicit uncertainty. The actual asset
registry remains EMPTY. No human driving test is requested at this isolated stage.

Read ON THE CANDIDATE: `WORLD_DRIVE_BLOCK8_BIOME_R5_BATCH_WORKER.md` first, then the
R4 loading, R3 service/palettes, R2 refinement and R1 audit/real-data documents.
The canonical plan and this ledger are synchronized on dev/candidate; detailed
implementation reports live on the candidate until explicit integration.

## Protected distinctions

- Forest R4 / Issue #12 is integrated and HUMAN PASS; biome R5 is separate work.
- Biome R1-R5 are not integrated, visually activated or certified as completed scenery.
- Docs-only dev advances are not biome merges. No main movement is authorized.
- Existing forest budgets/full density, route/terrain/hydro/physics/exclusions win.
- No real asset, density policy, visual transition or local treeline has been activated.
- Earlier local 8-bit prototype is obsolete; never overwrite the maintained uint16 code.
- Local system Chromium refused loopback navigation; restrictions were not bypassed.
  Native browser evidence above comes from the independent GitHub Actions runner.
- Do not merge PR #14 or advance main merely because automation is green.

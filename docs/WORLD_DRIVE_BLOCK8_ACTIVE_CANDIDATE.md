# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.
This is the current candidate restart ledger; R1-R5 reports are historical.

## Current state

Existing branch: `candidate/block8-biome-classifier-r1`. PR #14 remains draft and unmerged.
Latest verified implementation milestone: **R6 exact-point chunk snapshot bridge**,
`03eed818f42be4dc5e80d9b8d10149bdaebe0fcb`, exact-head run **35268092976 PASS**.
Both contract/integration and real-data/native-browser jobs completed successfully.
Later documentation/ancestry checkpoints require their OWN exact-head QA; this
milestone PASS is not transferable. Read the live PR and candidate HEAD first.
Do NOT restart the importer, classifier, transport, batching, Worker or snapshot bridge.

Integrated runtime is still the forest-R4-certified baseline from
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration 35230199150 PASS).
Before this R6 ledger synchronization, dev was `e8ea6655e0dffa449f11bc706d010c2351830502`,
canonical Dev Integration **35265318780 PASS**. Compared with the runtime baseline,
that dev checkpoint only changed the canonical docs and two QA files. The strict
C6 inventory now includes the two already-certified forest/spatial diagnostic aliases
with their exact owners; unknown names, moved owners and direct-write substitutions
remain forbidden. This is NOT biome runtime integration. Historical failed supplemental
run 35264487841 is not relabeled green.

This ledger-only dev advance also does NOT integrate PR #14. Verify the current dev
HEAD and its own canonical Dev Integration result live. Stable main remains
`ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33; no movement authorized.

## Verified candidate milestones (historical)

| Milestone | Candidate SHA | Exact-head candidate run | Result |
| --- | --- | --- | --- |
| R1 real-source audit | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 bounded local refinement | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 maintained service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |
| R4 bounded transport/route preparation | 2ca1d6b82bb0585204f2eb5c962bd59827cbf039 | 35260248703 | PASS |
| R4 final docs checkpoint | 672824cf0afaec7562c3f1aa4d181c269285917f | 35260824227 | PASS |
| R5 successive batches/native Worker | a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3 | 35263745441 | PASS |
| R5 final ancestry/QA checkpoint | e563e49c2224437148796b6422031bc572eda4c6 | 35265768818 | PASS |
| R6 exact-point chunk snapshots | 03eed818f42be4dc5e80d9b8d10149bdaebe0fcb | 35268092976 | PASS |

## R6 behavior and evidence

The Worker prepares up to 2,048 exact geographic candidate positions per chunk in
one bounded operation. It deduplicates at most 64 context records with Uint16 indices.
Main-thread installation copies private arrays and reconstructs frozen facades/records.
Reads require the exact candidate index and lon/lat pair: no nearest sample,
interpolation or chunk-center biome extrapolation. Source-no-data and unavailable
remain distinct; nothing gains placement, elevation or transition authority.

The bridge owns its initialized Worker client, validates fixed source/catalog/revision,
absolute projection/layout/chunk keys, request ids and route/window epochs, then
publishes atomically. Invalid refreshes retain valid data. New routes/disposal
invalidate even externally retained snapshot lookup handles. Previously published
same-route exact geography can survive a newer preparation window. Late older-window
packets cannot publish. Reads never initiate network, Worker RPC or preparation.

Default snapshot budgets: 32 chunks / 4 MiB accounted resident payload; at most two
pending chunks / 1 MiB reserved payload. A context dictionary record is charged
4,096 bytes plus actual coordinate/index array lengths. Shared buffers and oversized
backing views are rejected. These are bridge-owned retained/accounted payload limits,
NOT total JS heap, native/structured-clone allocations or caller-retained handles.
R5's separate service/transport/cache limits still apply. No forest loop was changed.

The exact R6 implementation run executes **97 maintained canonical integration
commands**, all exit zero; requiredFailures=0 and toleratedFailures=0. This is the
CANDIDATE command matrix, not a canonical dev-head run. Thirty R6 Node groups pass,
including 200,000 synchronous reads and lifecycle/corruption/authority/budget tests.
R1-R5, Python packaging, original source-parity controls and explicit certified
forest R4 suites remain green. The no-game-activation/runtime-diff guards also pass.

Native evidence: `biome-r4-routes-03eed818f42be4dc5e80d9b8d10149bdaebe0fcb`,
`chunk-browser-r6-qa.json`, Chromium **143.0.7499.4**, two actual module Workers.
The isolated main page traps gzip construction, SHA digest and tile/page fetching.

| Native R6 experiment | Positions / reads | Outcome |
| --- | ---: | --- |
| Original Laguna Seca vertices | 206 | zero source-record mismatches |
| Original Nordschleife vertices | 1,068 | zero source-record mismatches |
| 300 synthetic forward/reverse windows, 150 tiles | 1,744 points/chunk; 523,200 reads | all exact expected records |
| Repeated prepared-snapshot reads | 100,000 | same context object; no new capture call |

Synthetic store: 296 publications, four cache reuses, 292 evictions; peak four chunks
and **141,952 accounted bytes** under the test's four-chunk / 160,000-byte limits.
This uses uniform MOCK polygons, not real forest candidate coordinates or a real
long road. Real circuit store: 1,274 publications, peak four snapshots / 16,456
accounted bytes. Stale route/window, retained handle invalidation, disposal and new
route recovery pass. UI heartbeat is progress evidence, NOT gameplay FPS compliance.

Integration, browser/route and code ZIP digests were verified; all 50 available
local files in the implementation code artifact matched byte-for-byte. Local Node
HTTP reproduction also matched all 1,274 source records with an EMULATED Worker;
only the independent GitHub Actions run is claimed as native-browser evidence.

## Protected geography and earlier foundations

Pinned RESOLVE source SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
The independent R2/R3 matrix retains 6,327 original real positions: 4,846 source
records and 1,481 explicit no-data cases. Original Baffin and 201-point Yungas controls
remain protected. Source agreement is NOT present-day vegetation or field ecology.
R5 already implements successive bounded pages/services and native Worker preparation;
its 300-window / 150-tile stress used mock geography, not field validation.

## Exact next action

**Implement the actual forest candidate-coordinate adapter**, then bind gameplay
route/Worker admission in **DIAGNOSTIC-ONLY** mode. R6 accepts exact supplied points
but has not yet reproduced the forest's deterministic candidate sampler/projection.
Verify 16 x 109 indexing, the 64/109 first-layer order, negative absolute chunks,
floating-origin shifts, route changes and coordinate parity without changing R4.
The game must consume prepared immutable snapshots; no per-tree await/Worker request,
network, decoding or full-chunk preparation in the forest frame loop.

Worldwide fine-data distribution, persistent caching, trusted-root retrieval,
long real-road readiness, reviewed compatible models and ecological transition /
local elevation policy remain open. The current root is trusted application input
with partial coverage. Missing fine data stays explicit uncertainty. The actual
asset registry is EMPTY. No human driving test is requested at this isolated stage.

Read ON THE CANDIDATE: `WORLD_DRIVE_BLOCK8_BIOME_R6_CHUNK_CONTEXT.md` first, then
R5 batch/Worker, R4 loading, R3 service/palettes, R2 refinement and R1 audit/real-data
documents. The canonical plan delegates the current restart state to this ledger.
Detailed implementation reports remain candidate-only until explicit integration.

## Protected distinctions

- Forest R4 / Issue #12 is integrated and HUMAN PASS; biome R6 is separate work.
- Biome R1-R6 are not integrated, visually activated or certified as completed scenery.
- Docs/QA-only dev advances are not biome merges. No main movement is authorized.
- Existing forest budgets/full density, roads/terrain/hydro/physics/exclusions win.
- No actual tree asset, density policy, visual transition or local treeline was activated.
- Earlier local 8-bit prototype is obsolete; never overwrite maintained uint16 code.
- No local browser restriction was bypassed; native evidence comes from Actions.
- Do not merge PR #14 or advance main merely because automation is green.

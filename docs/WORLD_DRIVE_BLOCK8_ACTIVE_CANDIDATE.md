# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.
Current restart ledger; R1–R7 detailed reports remain historical/API references.

## Current state

Existing branch `candidate/block8-biome-classifier-r1`, draft/unmerged PR #14.
Latest verified implementation: **R8 opt-in route-lifecycle diagnostics**,
`b075cfe16bd2c3f552ddfbd35c72301db1ebef2f`, exact-head run **35286510364 PASS**.
Both integration and real-data/native/production-browser jobs completed successfully.
Later docs/ancestry commits require their OWN exact-head QA. Read the live candidate
HEAD and PR before work; never transfer an earlier PASS to a later SHA.
Do not restart the importer, classifier, transport, batching, Worker, snapshots,
forest candidate adapter or the new diagnostic lifecycle observer.

Integrated gameplay remains the forest-R4-certified runtime from
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration 35230199150 PASS).
Before this ledger update, dev was `eb47faf25c10ac019f15792125f85b65d40b22e0`,
canonical Dev Integration **35276481129 PASS**. This ledger-only update DOES NOT
integrate R8 runtime or tests into dev. Existing dev differences from the certified
runtime remain documentation and the earlier strict C6 inventory QA correction.
Read the current dev SHA and its own canonical Dev Integration result live.
Stable main remains `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33; no movement authorized.

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
| R7 final docs/ancestry | 2eccd01df3630ad47a34ad1284dff76fb7f4ea6d | 35276559316 | PASS |
| R8 opt-in lifecycle diagnostics | b075cfe16bd2c3f552ddfbd35c72301db1ebef2f | 35286510364 | PASS |

## R8 application boundary

The stable public route facade delegates to the unchanged maintained routing
implementation, with a small application-only observer wrapper. main.js, actual
routing logic, forest R4, terrain/hydro/roads/physics and dependencies are unchanged.
The wrapper installs `WorldDriveDiagnostics.forest.biomes` in the EXISTING diagnostic
registry, not a new global alias. It lazy-loads the observer only on explicit start.

Disabled by default: no diagnostic timer, Worker, biome data request or route scan.
Explicit startup takes a trusted partial directory plus base URL. Successful route
completion is observed without altering or awaiting its original promise. Route
requests/reset/generation changes invalidate observation immediately; older results
cannot resume a newer route. Pagehide cancels startup even during the lazy import,
terminates active work and does not silently restart on BFCache restoration.

One delayed idle task admits at most four diagnostic chunks: current, then up to
three route-forward chunks. This is NOT full visible/forward forest coverage.
Spherical route progress comes from the canonical route planner, not plane metres.
Direction/reverse, negative chunks, stale origin/generation and >960 m teleports are
handled. Teleports are detected at an observation/response boundary, not through a
new immediate physics hook. Stationary missing windows are not retried endlessly;
explicit refresh or changed progress permits another attempt. Fatal worker startup
failures stop admission instead of causing a repeated initialization loop.

Full candidate generation, HTTP, gzip, digest and source geometry remain in the
existing Worker. Synchronous diagnostic sample reads use one bounded R7 point lookup
and prepared R6 context; no per-tree async renderer integration exists. Valid packets
and known geography are distinct: resolved/noData/unavailable counts stay visible,
and no placement, elevation or transition authority is granted.

Observer: one active poll, no pending poll queue, at most four sequential chunk
captures; bridge 16 chunks / 4 MiB accounted retained payload. Existing R5/R6 transport,
service, pending-byte and RPC limits remain. Reported receipt cost covers validation
and copying, not every native/message allocation; round-trip time includes waiting.
Idle admission (2 ms headroom) is NOT a hard frame-time budget. Route preparation has
bounded but potentially whole-route work up to 20,000 points outside the frame loop.
No total-heap or FPS guarantee follows from these limits.

## Verified R8 evidence

- **26 R8 Node groups PASS**, with emulated clients explicitly distinguished from
  native browser tests: defaults, idle admission, stationary requests, missing data,
  partial packets, errors, route/origin invalidation, teleport, stale in-flight
  captures, copied configuration, pagehide during import, superseded import failure,
  original routing-promise identity and 100,000 synchronous reads without new work.
- **97 maintained canonical integration commands exit zero**;
  requiredFailures=0, toleratedFailures=0. This is the CANDIDATE command matrix,
  not the separate canonical dev-head workflow. Certified forest R4 and all prior
  R1–R7 source, synthetic, Python and native regressions remain green.
- Native Chromium runs the actual PUBLIC route factory and maintained lifecycle
  on the two original repository circuit polylines. Other game services are STUBS.
  This is not the complete Three.js game, continuous driving or GPU/frame-pacing QA.
- The same harness runs as native ESM AND through a real Vite production build,
  including its lazy import and generated dedicated Worker. Both have no page errors.
  Main-page traps reject accidental preparation hash work, tile/page I/O, gzip and digest.
- Each browser mode verifies 6 Laguna Seca chunks / 10,464 raw candidates and
  7 Nordschleife chunks / 12,208 raw candidates against unchanged original source
  expectations: zero mismatches/unavailable at the selected current chunks.
  Missing pilot geography stays explicit; stationary failure is not endlessly
  retried; pagehide terminates every observer-owned Worker.

Exact-head evidence artifact: `biome-r8-gameplay-b075cfe16bd2c3f552ddfbd35c72301db1ebef2f`,
`gameplay-browser-r8-qa.json`, plus its finite `pilot/` pages and source tiles.
Integration and code artifacts carry their own exact SHA. Source/ZIP hashes and
reports are checked before claiming parity. Locally executed unit tests use emulated
clients; native browser evidence is from GitHub Actions. No local restriction bypass.

Initial R8 run 35286259708 remains a FAILED integration record: the existing regex
inventory mistook a typeof equality check on cancelIdleCallback for a global write.
The callback is now read into a local reference. No C6 exception/new global or
weakened audit was introduced. Its separate browser job passed; that does not make
the whole historical run green. Pagehide race was separately corrected and retested.

## Protected foundations and next action

Pinned source SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Earlier 6,327 original controls (4,846 source records / 1,481 explicit no-data),
Baffin and unchanged 201-point Yungas transect remain protected. R7's 62,784 raw
coordinate/traversal comparisons and 1,024-slot first-layer boundary remain intact.
Source agreement is not contemporary tree cover or ecological field truth.

**Next: package a finite trusted diagnostic pilot, then run the FULL GAME with
observer OFF/ON and measure readiness/receipt cost together with existing frame
pacing.** The observer already exists and is connected through the public route
factory; do not rewrite it. Preserve disabled-by-default behavior and forest R4.
Broaden fine-data coverage to a REAL long road before claiming sustained high-speed
biome readiness. No renderer, density, placement or palette activation yet.

Worldwide fine-data publication, persistent caching, authenticated root retrieval,
real compatible models and ecological transition/local elevation policy remain open.
The current root is trusted application input, not signed or automatically fetched.
The actual asset registry is EMPTY. No human driving test is requested until a
straightforward pilot and the necessary automatic full-game checks are ready.

Read on the candidate `WORLD_DRIVE_BLOCK8_BIOME_R8_GAMEPLAY_DIAGNOSTICS.md`, then R7
and previous detailed reports. This ledger is synchronized on dev/candidate. Forest
R4 / Issue #12 remains integrated/HUMAN PASS. Biome R1–R8 remains CANDIDATE work,
not integrated or visually certified. Never merge PR #14 or advance main merely
because automated QA is green. The earlier 8-bit prototype is obsolete.

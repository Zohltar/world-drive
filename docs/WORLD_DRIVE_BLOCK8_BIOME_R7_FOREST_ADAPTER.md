# Block 8 biome R7 — exact forest candidate adapter

Candidate-only continuation of R6. Existing branch/PR #14; NOT visual activation.
Read the canonical plan and active-candidate ledger on dev first. R6 bridge and
R5 Worker/batching remain the maintained owners. Never restart those prototypes.

## Scope

`forest-candidate-adapter.js` reproduces the certified forest sampler using the
existing, unchanged `forestHash` export. Layout is explicitly versioned:
`forest-r4-120m-4x4-109-64-v1`. A drift in the four defining policy values fails
closed and requires an explicit adapter/version review. No density, slope,
road/water/building exclusion, tree height, matrix ordering or render code changed.
The one external domain import is the exact existing forest-policy module; the
ownership QA still forbids every other out-of-domain dependency and game activation.

The natural candidate slot is `cellIndex * 109 + candidateIndex`. Cell X is
`cx*4 + floor(cellIndex/4)` and cell Z is `cz*4 + cellIndex%4`; salts and arithmetic
match `processBuilderCandidate` exactly. R4 visits 64 candidates in each of 16
cells, then the remaining 45 per cell. Explicit inverse traversal mappings preserve
this ordering without confusing it with accepted-tree or density-bucket indices.
All 1,744 RAW candidates are represented, including those later rejected by the
existing placement tests. This is NOT a replacement accepted-root list.

## Projection and identity

The adapter captures immutable route origin latitude/longitude and an explicit
routeId (1..48 safe label characters). Its projection key contains the IEEE-754
bits of both origin coordinates, not rounded text or a weak hash. The bridge's
existing generation/route invalidation remains mandatory even when IDs repeat.
The application must supply its current route identity, not an arbitrary reusable
name. This step does not yet bind that application lifecycle.

`project` preserves the exact main.js `xzToLL` operation order and EARTH=6378137,
including negative-Z latitude. Absolute chunk/cell indices own sampling. Floating
render offsets are not input to the hash or projection. Locate chunks from the
canonical absolute position with floor, not truncation or quantized render space.
Round-tripping a large floating render offset can itself lose precision; do not
reconstruct candidate seeds from that round-trip.

Pole-singular origins and geographic-domain overflow are explicit failures.
The original game projection is not dateline-unwrapped; R7 deliberately does not
silently wrap/clamp it or invent an ecological fallback. Future dateline gameplay
support requires a separately reviewed projection contract, not an adapter shortcut.

## Worker-to-snapshot path

The Worker/client add `forest-chunk` / `captureForestChunk`. The request contains
only copied projection, layout, absolute chunk and existing epoch/request metadata,
not a main-thread-built point array. The Worker rejects stale/unready epochs BEFORE
generation, builds the bounded 1,744-position Float64 buffer and calls the existing
R6 `captureChunkContext` owner. It returns that buffer with the ordinary R6 packet.

The R6 bridge adds explicit `prepareForestChunk({cx,cz,origin,routeId,refresh})`.
Construct the bridge with `layoutId:FOREST_LAYOUT_ID`, and call `setRoute` with the
adapter's projectionId. R7 layout cannot accept the generic external-point method;
wrong origin/layout/route or a client lacking the new operation rejects before RPC.
Generic R6 layouts and their original tests retain the original behavior.

Receipt performs bounded R6 identity/epoch/profile/buffer validation and private
copies. It does not regenerate, hash or project a whole chunk on the UI thread.
The dedicated Worker is the trusted sampler; exact lookup coordinates are still
required, so a displaced coordinate cannot answer the real candidate's lookup.
The existing atomic publication, stale-window rejection, invalidated held handles,
count/byte eviction, pending admission and no-I/O synchronous reads remain active.
Corrupt refreshes do not replace valid snapshots. Unavailable and source-no-data
remain different states, and placementAuthority stays false.

Use `adapter.project(x,z,scratch)` on an existing absolute candidate if its lon/lat
is needed, and `snapshot.lookup(slot, scratch.lon, scratch.lat)` synchronously.
`buildPoints`/`buildForestChunkRequest` are explicit preparation operations for the
Worker/tests, NEVER the forest per-frame loop. No network/decode/generation fallback
on the main thread has been introduced. Budgeted main-thread snapshot receipt is
still work; this is not a measured gameplay frame-time guarantee.

## Budgets

Full point buffer: 27,904 bytes; Uint16 slot buffer: 3,488 bytes. The R6 conservative
64-record reservation is 293,536 bytes/chunk. Defaults remain 32 chunks / 4 MiB
accounted resident payload, two pending chunks / 1 MiB reserved, and four client
RPCs. R5 service/transport budgets are separate. These are retained/accounted payload
limits, not a total heap, native crypto, structured-clone or caller-held-handle limit.

## Verification gates

- 22 new local unit groups passed before publication, including exact indexing,
  signed cells/seams, origin mutation/identity, explicit out-of-domain refusal,
  procedural operation admission, stale epochs, cache/byte limits, corrupt/shared/
  oversized buffers, authority/no-data preservation and 100,000 synchronous reads.
  The local unit client is EMULATED, not native-browser evidence.
- Existing R1-R6 Node suites and standard-library Python packaging pass locally.
- `qa-block8-biome-forest-parity-r7.mjs` executes the ACTUAL original four builder
  bodies read from `src/forest-chunk-streamer-core.js` and actual `llToXZ/xzToLL`
  bodies from `src/main.js`. Observation at terrainSlope rejects placement only in
  the harness AFTER recording each raw candidate. It asserts coordinates and full
  traversal against the adapter, not a retyped sampler. Three intentional mutations
  verify the oracle detects salt/axis divergence. Full live-file execution is a
  mandatory CI gate, not inferred from local adapter-only tests.
- `qa-block8-biome-forest-browser-r7.py` builds source-polygon expectations at those
  ORIGINAL raw forest positions near the two stored circuit polylines, then tests
  native Worker -> R6 bridge -> exact lookup in Chromium. Neither routes nor source
  controls are moved. The main page traps hash sampling DURING preparation as well
  as tile/page fetch, gzip and digest. Synthetic long progression remains explicitly
  mock geography; numerical/hash work for assertion reads is not gameplay rendering.
- Candidate CI runs all 97 maintained integration commands and explicit certified
  forest R4 regressions. Runtime-diff and no-game-activation guards stay mandatory.
- Exact-head CI/native measurements must be read from the run/artifacts before
  calling this candidate verified; local PASS is not transferred to any remote SHA.

## Next action after verification

Bind actual gameplay route/generation/projection and bounded Worker/snapshot
admission in DIAGNOSTIC-ONLY mode. First audit route-ready/reset/teleport/disposal
ownership and choose an off-frame admission point. Preserve the forest-R4 scheduler
and exclusions; never generate the full chunk or await a Worker in the candidate
loop. Confirm real-route readiness and browser frame pacing before visual palettes.

Worldwide fine distribution, persistent caching, trusted-root retrieval, long real
road coverage, reviewed compatible assets and ecological transition/elevation rules
remain open. The actual asset registry is empty. No human driving test is requested
for this disconnected adapter. No PR merge or main movement is authorized by QA.

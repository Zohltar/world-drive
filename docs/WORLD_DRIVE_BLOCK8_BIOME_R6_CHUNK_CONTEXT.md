# Block 8 biome R6 — Exact-point synchronous chunk-context bridge

2026-09-17. Existing PR #14, `candidate/block8-biome-classifier-r1`.
Verified implementation: `03eed818f42be4dc5e80d9b8d10149bdaebe0fcb`, exact-head
Block 8 run **35268092976 PASS**, both contract/integration and native-browser jobs.
Restart baseline was candidate `e563e49c2224437148796b6422031bc572eda4c6`, run
35265768818 PASS. Before this documentation synchronization dev was
`e8ea6655e0dffa449f11bc706d010c2351830502`, canonical Dev Integration 35265318780 PASS.
Main remains `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, no movement authorized.
Later documentation/ancestry commits need their own exact-head QA. Consult the live
PR and active-candidate ledger; this immutable implementation PASS is not transferable.

**Candidate-only. No game entrypoint, forest scheduler, geometry, density, actual
asset, exclusion, road, hydro, terrain, physics or package change.** R6 implements
and validates the snapshot bridge, not the later actual-game admission step.

## Exact points, not interpolated cells

A rendering loop must not wait for a Worker per tree. One explicit chunk preparation
request supplies exact `[longitude, latitude]` candidate positions in deterministic
index order, up to 2,048 points (capacity for 16 x 109 = 1,744 forest candidates).
R6 does NOT yet generate the actual forest candidate coordinates. The future adapter
must reproduce and test that sampler/projection; synthetic 1,744-point chunks do not
certify actual forest coordinate parity or placement exclusions.

`lookup(index, lon, lat)` returns a prepared context only for an exact index/coordinate
match. There is no nearest sample, interpolation, geographic rounding or chunk-center
biome extrapolation. Unknown positions return one shared unavailable context, never
a forest fallback. Source-no-data and unavailable remain distinct. Rock and Ice uses
its reviewed profile without rewriting the upstream tundra record. Regional hints
are not promoted to source-polygon precision.

## Worker and atomic publication

`chunk-context-snapshot.js` defines the bounded wire contract, Worker capture and
receipt validation. The existing R5 Worker adds an explicit `chunk` operation that
checks ready state, route generation and window serial, then queries exact source
polygons. Up to 64 distinct contexts are deduplicated with Uint16 indices. Higher
diversity is rejected atomically, never truncated or partially published. R1-R5
service, transport, batch and route-planner implementations are reused unchanged.

The client retains four-RPC admission/deadlines and route-epoch stale reply rejection.
`captureChunk` copies only declared fields and bounded coordinates; unrelated caller
fields cannot inflate the message. No UI-thread Fetch/gzip/hash fallback is added.
`chunk-context-bridge.js` exclusively owns the initialized client and route/window
acknowledgements. It validates fixed source id/license/SHA, catalog SHA, distribution
revision, projection/layout/absolute chunk key, request id, generation, serial, record /
index bounds and profile consistency. Placement/elevation/transition authority stays
false. All validation completes before replacement; invalid refreshes retain good data.
A prepared packet may contain source-no-data or unavailable samples: `prepared` does
not assert every point has a resolved terrestrial biome.

## Immutability, deterministic addresses and lifecycle

Keys include explicit projection id, layout revision and signed absolute integer
chunk coordinates. Floating-origin scene coordinates are not keys. Reusing a key with
changed positions is rejected while resident or pending in the current route/window.
The future adapter owns correct projection/layout identifiers. An absent or evicted
entry never schedules work; preparation is always explicit.

Copied arrays stay in private closures. Public facades, contexts, source records and
counts are frozen; no writable backing buffer escapes. SharedArrayBuffer and small
views backed by oversized buffers are rejected. Reads reuse context objects and do
not invoke geometry, I/O, promises or preparation. `bridge.lookup` also constructs a
bounded string key; no zero-total-allocation or measured game-frame-time claim.

New routes/disposal invalidate even externally retained snapshot lookup handles.
Already returned immutable context objects remain historical values, not live leases.
Published same-route exact geography can survive newer preparation windows under the
fixed identity, but late old-window packets cannot publish. No new preparation occurs
without matching ready-window acknowledgement. Canceled requests remain accounted
until settlement. Disposal terminates the owned client. There is no retry storm or
unbounded queue; callers must release old handles the bridge cannot reclaim for them.

## Default retained payload limits

| Boundary | Default | Hard configurable maximum |
| --- | --- | --- |
| Resident snapshots | 32 chunks / 4 MiB accounted | 128 chunks / 16 MiB |
| Pending snapshots | 2 requests / 1 MiB reserved | 2 requests / 2 MiB |
| One packet | 2,048 positions / 64 contexts | fixed |

Each dictionary record is conservatively charged 4,096 bytes plus exact coordinate
and index array bytes. Pending reservations include the worst-case dictionary. Pure
render reads do not update LRU; preparation use does. One pending window and one route
change fit alongside two captures within the four-RPC client. Busy is explicit.
These are bridge-owned retained/accounted payload limits, NOT total JS/native heap.
Structured clones, serialization, native resources, temporary parsing/crypto objects,
object headers and caller-held old snapshots are additional. R5's independent service,
source-cache, transport and preparation budgets still apply.

## Preparation API

```js
const client = createBiomeWorkerClient();
await client.initialize({directory, baseUrl});
const bridge = createBiomeChunkContextBridge({client, identity:directory,
  layoutId:'reviewed-candidate-layout-v1'});
await bridge.setRoute(coordinates, {projectionId:'reviewed-route-projection-v1'});
await bridge.update(distanceAlongRoute);
const result = await bridge.prepareChunk({cx, cz, points:exactCandidateLonLat});
// Render-side reads only; never await or prepare in the per-tree loop.
const snapshot = bridge.get(cx, cz);
const context = snapshot?.lookup(candidateIndex, longitude, latitude);
bridge.dispose();
```

Do not issue independent route/window changes through the raw client after bridge
ownership. The root identity remains trusted application input, not newly signed or
automatically authenticated global distribution. Worker messaging basis:
https://html.spec.whatwg.org/multipage/workers.html (retrieved 2026-09-17).
Freeze/immutability is reconstructed after structured messaging, not assumed preserved.

## Verified evidence at implementation SHA 03eed818f42b

- **30 R6 Node groups PASS**, including 200,000 synchronous reads, 2,048-point capacity,
  mixed-boundary contexts, no-data/authority/mutation rejection, copied RPC fields,
  backing-buffer bounds, count/byte eviction, coalescing, admission, stale route/window,
  retained-handle invalidation, disposal and recovery. Included in permanent candidate QA.
- **97 maintained canonical integration commands all exit zero** in run 35268092976;
  requiredFailures=0, toleratedFailures=0. Candidate matrix, not a canonical dev-head run.
- Existing R1-R5, Python packaging, original source parity and explicit certified forest
  R4 tests PASS. Protected-runtime diff and absent-game-activation checks PASS.
- Native Chromium **143.0.7499.4**, two actual module Workers, isolated main page with
  gzip/digest/tile-fetch traps. No page errors. Original 206 Laguna Seca and 1,068
  Nordschleife vertices pass via the new bridge with zero source-record mismatches.
- 300 synthetic forward/reverse windows across 150 mock tiles, 1,744 points per chunk:
  **523,200 exact lookups**. Another **100,000 prepared reads** return the same context
  object without increasing capture calls. 296 publications, four cache reuses and
  292 evictions; peak four chunks / **141,952 accounted bytes**, below the test's
  four-chunk / 160,000-byte limits. Real point snapshots peak at 16,456 accounted bytes.
- Native stale-route/window, held-snapshot invalidation, disposal and recovery gates
  pass. The UI heartbeat is progress evidence only, not gameplay FPS or GPU pacing.

Exact artifact: `biome-r4-routes-03eed818f42be4dc5e80d9b8d10149bdaebe0fcb`, file
`chunk-browser-r6-qa.json`. Integration, browser and code artifact ZIP SHA-256 digests
were checked. All 50 locally available files in the implementation artifact matched
byte-for-byte. A separate local HTTP smoke test also matched all 1,274 original source
records but used an EMULATED Worker; native browser evidence is from GitHub Actions.

Synthetic chunks use uniform MOCK geography, not actual forest candidate coordinates
or a real long road. Neither these circuits nor the heartbeat certify continuous
high-speed gameplay. Original R2/R3 source tests (6,327 points, including 1,481 no-data),
Baffin and unchanged 201-point Yungas controls remain separate gates. Source agreement
is not contemporary land cover or ecological field truth.

## Exact next action

Implement the actual forest deterministic candidate-coordinate adapter, including
negative absolute chunks, floating-origin invariance, projection/route identity,
1,744-point indexing and 64/109 first-layer traversal parity. Then bind gameplay
route/Worker admission in **DIAGNOSTIC-ONLY** mode. Keep forest R4 unchanged until
separately reviewed readiness/frame-pacing and human visual gates.
Worldwide fine-data distribution, persistent caching, trusted-root retrieval, long
real-road readiness, reviewed models and ecological transition/elevation policy are
still open. The actual asset registry remains empty. Do not merge PR #14 or move main
merely because automation is green. No human driving test is requested for R6.

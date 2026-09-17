# Block 8 biome R6 — Exact-point synchronous chunk-context bridge

2026-09-17. Existing PR #14, `candidate/block8-biome-classifier-r1`.
Restart baseline: candidate `e563e49c2224437148796b6422031bc572eda4c6`, exact-head
Block 8 run `35265768818` PASS. Dev `e8ea6655e0dffa449f11bc706d010c2351830502`,
canonical Dev Integration `35265318780` PASS. Main remains
`ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, no movement authorized.

**Candidate-only. No game entrypoint, forest scheduler, geometry, density, actual
asset, exclusion, road, hydro, terrain, physics or package change.** This completes
the snapshot-bridge implementation step, not the later gameplay admission step.
Read the active-candidate ledger and live exact-head QA for the verified checkpoint.

## Why snapshots are point-addressed, not interpolated cells

The Worker is asynchronous; a rendering loop must not wait for a Worker per tree.
A chunk request contains its exact preselected geographic positions in deterministic
candidate-index order. One request handles up to 2,048 points (enough for the current
16 x 109 = 1,744 forest candidates). R6 does NOT yet generate the actual forest's
candidate coordinates; the future adapter must reproduce that mapping and be
separately tested. Synthetic 1,744-point chunks are not that certification.

A point near a boundary must not borrow the ecoregion of the chunk center. This
bridge does not interpolate, round geographic positions, pick nearest samples or
extend a resolved point's authority to its neighbours. `lookup(index, lon, lat)`
returns a context ONLY when index and coordinates exactly match the prepared request.
An unknown position returns a shared unavailable context, never a forest fallback.
The original source-no-data / unresolved / Rock and Ice distinctions are preserved.
Regional hints are not promoted to source-polygon precision.

## Worker and publication boundary

`chunk-context-snapshot.js` defines the bounded wire contract, Worker-side capture,
and receipt validation. `biome-preparation-worker.js` adds one explicit `chunk`
operation using the existing R5 session. It checks ready state, route generation
and window serial before querying exact source polygons. It deduplicates up to
64 distinct contexts and emits a Uint16 context-index buffer, not 1,744 duplicate
record objects. Higher diversity is explicitly rejected; no partial packet is
published. The R1-R5 service/planner/transport implementations are unchanged.

The R5 client retains its four-RPC admission and deadline. The new chunk call
copies only declared fields and bounded coordinate data; arbitrary extra caller
fields do not cross the message channel. Route epochs also reject stale chunk
replies. No main-thread Fetch, gzip or hashing fallback is added.

`chunk-context-bridge.js` exclusively owns a previously initialized Worker client.
It manages route/window acknowledgements and snapshot publication. It checks fixed
source id/license/SHA, catalog SHA, distribution revision, absolute chunk key,
request id, route generation, window serial, dictionary/index bounds, profile
consistency and absence of placement/elevation/transition authority. Failed refreshes
retain the previously valid snapshot. Publication occurs only after the entire
packet passes validation. A prepared snapshot can contain exact source-no-data or
unavailable samples; `prepared` does NOT mean all points have a terrestrial biome.

## Immutability, address and lifecycle

Keys include explicit projection id, candidate-layout revision, and signed absolute
integer chunk coordinates. Never use the floating-origin scene coordinates as keys.
A repeated key with changed candidate positions is rejected while resident or pending.
The future game adapter must make projection/layout identifiers describe its real
projection and sampler version. A missing/evicted entry does not schedule anything.

Typed arrays remain in private closures and are copied on installation. Public
facades, contexts, source records and counts are frozen; no mutable buffer escapes.
Reads reuse existing context objects. `snapshot.lookup()` has no I/O, promise, timer,
geometry query or preparation side effects. `bridge.lookup()` also computes a bounded
string key; no claim of zero total engine allocations or measured game frame time.

A new route immediately clears the store and invalidates even lookup functions
held by an external caller. Late route/window completions are discarded. A newer
window may continue using already-published same-route exact geography, which is
valid under the fixed source/catalog identity. New preparation waits for a matching
ready window. Disposal invalidates retained views and terminates the owned client.
Canceled work stays accounted until its promise settles. No retry loop or unbounded
queue is introduced. Unsupported/dead Workers cannot publish replacement data.

## Default retained payload limits

- Snapshot store: at most 32 chunks and 4 MiB accounted payload; configurable hard
  ceilings 128 chunks / 16 MiB. Oldest preparation-use entries are evicted. Pure
  render reads do not mutate LRU order.
- In flight: at most two chunk requests / 1 MiB reserved payload, no internal queue.
  Each reserves coordinates, indices and the worst-case 64-record dictionary.
- One window update and one route change can be pending alongside the two chunks,
  within the existing client's maximum of four RPCs. Busy is explicit.
- Packet: <=2,048 positions; <=64 context records. Each dictionary record is charged
  a conservative 4,096 bytes in addition to exact coordinate/index array lengths.
  SharedArrayBuffer or oversized backing-buffer views are rejected.

These are bounded bridge-owned retained/accounted payloads, NOT total browser/JS
heap guarantees. Worker-side temporary objects/serialization, structured-clone
copies, native resources, object headers and caller-held old snapshots are additional.
R5's separate services, caches and transport limits still apply. A caller must release
its old handles; the bridge cannot reclaim references retained by another owner.

## API (preparation, not a rendering-loop call sequence)

```js
const client = createBiomeWorkerClient();
await client.initialize({directory, baseUrl});
const bridge = createBiomeChunkContextBridge({client, identity:directory,
  layoutId:'reviewed-candidate-layout-v1'});
await bridge.setRoute(coordinates, {projectionId:'reviewed-route-projection-v1'});
await bridge.update(distanceAlongRoute);
const result = await bridge.prepareChunk({cx, cz, points:exactCandidateLonLat});
// During rendering, acquire a handle and perform synchronous reads only:
const snapshot = bridge.get(cx, cz);
const context = snapshot?.lookup(candidateIndex, longitude, latitude);
// Placement exclusions and reviewed model compatibility remain separate owners.
bridge.dispose();
```

The client is exclusively owned by the bridge after initialization. Do not issue
independent route/window changes through the raw client behind its back. Identity
is trusted application configuration, not a newly authenticated global directory.
Worker structured messaging basis: https://html.spec.whatwg.org/multipage/workers.html
(retrieved 2026-09-17). Immutability is reconstructed on receipt, not assumed to
survive serialization as property descriptors.

## Validation and next action

Local R6: 30 synthetic Node test groups PASS, including 200,000 synchronous reads,
maximum chunk size, actual 1,744-count capacity, mixed contexts, authority/mutation
rejection, byte/count eviction, stale route/window, held-handle invalidation,
coalescing/admission, exact addresses and recovery. Existing R1 14, Rock/Ice 3,
R2 16, R3 35, R4 25 and R5 17 groups pass locally, as does Python R5 packaging.
No local native-browser PASS is claimed; use the new exact-head CI evidence.

`qa/qa-block8-biome-chunk-browser-r6.py` adds isolated native Chromium/Worker
validation using the existing real circuit geometry/source expectations, plus
300 synthetic forward/reverse windows, 1,744 exact positions per chunk and repeated
synchronous reads. Main-page preparation traps remain enabled. No game entrypoint
is loaded, and the synthetic chunks are NOT real forest placement coordinates.
The permanent candidate regression inventory and focused workflow include R6.
A pending run is not a PASS and no historical run certifies a new commit.

Next: implement the actual forest candidate-coordinate adapter and bind game route /
Worker admission in DIAGNOSTIC-ONLY mode. Keep visual forest R4 unchanged until
separately reviewed readiness/frame-pacing and human visual gates. Partial fine-data
distribution, persistent caching, trusted-root loading, real long roads, reviewed
models and ecological transition/elevation policy remain open. Do not merge PR #14
or move main merely because automation is green.

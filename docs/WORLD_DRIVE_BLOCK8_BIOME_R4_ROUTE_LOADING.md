# Block 8 — Biome R4 bounded route loading

2026-09-17. Continues PR #14 / `candidate/block8-biome-classifier-r1`.
This is **biome R4**, not a change to the already certified **forest R4** scheduler.
Not imported by the game; no visual activation, new real asset or density change.
Read the canonical plan and its `WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md` ledger on
`dev` for the current verified candidate SHA/run. Earlier R1/R2/R3 reports are
historical milestones, not descriptions of the current transport capability.

## Documentation synchronization

The canonical plan formerly still requested a fresh initial biome prototype.
That stale instruction is replaced with the existing PR/branch, historical
milestone evidence, and a linked active-candidate ledger. A docs-only `dev`
checkpoint is NOT an integration of biome code. Main remains protected.

## Owners and API

- `tile-transport.js`: explicit asynchronous HTTP/gzip transport with bounded
  retained input/output, abort and deadline. It does not install geographic data.
- `route-tile-plan.js`: immutable GeoJSON polyline preprocessing and bounded
  continuous segment/corridor intersection. No I/O or scheduling.
- `route-preparer.js`: a replaceable moving window, deduplication, bounded
  concurrency, verified installation and explicit readiness/missing diagnostics.
- `biome-service.js`: retains SHA-256, UTF-8, identity/schema and atomic installation
  ownership. Adds cache residency inspection and optional AbortSignal to prevent
  a superseded window from installing during asynchronous digest verification.
- `local-refinement.js`: only adds a non-mutating residency predicate; geographic
  queries, source rings/holes and the 512-edge ceiling remain unchanged.

Create the service outside frame work, create an explicit transport with a
versioned directory URL, then create one route preparer owning that service.
`setRoute(coordinates)` takes actual `[longitude,latitude]` polyline vertices,
validates/copies them, invalidates old route work and clears previous residency.
`update(distanceMeters, options)` replaces the desired route window and starts
bounded preparation. `drain()` is an explicit startup/test barrier, not a timer.
`query()` remains synchronous and performs no loading/preparation/network call.
Do not call route planning or preparation from a per-tree or forest-frame query.
No actual game route-lifecycle binding or frame-budget admission is added here.

## Transport contract

Only a declared `<x>-<y>.json.gz` descriptor is accepted. Base URL must be an
explicit HTTPS directory, or HTTP on loopback for the desktop/test host.
Credentials/query/fragment in the base URL are rejected. Fetch omits credentials,
refuses redirects, accepts status 200 only and checks the final URL when exposed.
The service must serve gzip files as binary WITHOUT HTTP `Content-Encoding`;
otherwise Fetch could decode them first. Non-identity Content-Encoding is refused
rather than guessed. Actual compressed length and decoded length must match the
manifest. SHA-256 of decoded bytes is checked by the maintained service.

Defaults: 2 concurrent transports, 8 MiB total reservation (declared gzip plus
JSON lengths), 10-second operation deadline. Each JSON payload is <=2 MiB.
Input is counted while streaming and output goes into an exact-sized buffer.
Overflow, truncated/invalid gzip, non-200, redirects and stalled/aborted operations
fail explicitly. The deadline does not trigger an automatic retry.
These bounds describe retained/accounted JavaScript buffers, NOT all native
Fetch/DecompressionStream queues, decompressor scratch space or total process RAM.
Returned buffers become caller-owned; the coordinator retains concurrency slots
through verification, and the service independently accounts its own snapshots.

API specifications: https://compression.spec.whatwg.org/ and
https://streams.spec.whatwg.org/ (retrieved 2026-09-17). No package dependency added.
Native browser decompression implementation and frame pacing still require tests
before visual activation; passing Node's native API tests is not browser proof.

## Continuous coverage and limitations

Up to 20,000 copied points. Along-route distances use a spherical metric.
Segments are interpolated in longitude/latitude on the shortest longitude path;
ambiguous 180-degree segments are rejected. The coordinator's default window is
3,000 m ahead / 300 m behind / 1,200 m corridor padding. These are prototype
preparation parameters, NOT changes to any certified forest R4 setting.

Whole clipped segments intersect tile rectangles; endpoint-only sampling is not
used. Closed seams/corners are included conservatively. Padding is a conservative
angular box, not exact geodesic buffering. The current-position tile is prioritized.
Default planner bound is 4,096 segment/cell tests per explicit update. Extreme
polar, dense or oversized windows disclose planning/capacity limits and cannot
claim ready. The selected queue is limited by the service's actual resident tile
count (8 default). Missing manifest coverage is reported, never fetched from a
fabricated filename or filled by coarse forest. A prepared invalid/no-data cell
can still be geographically unavailable; tile readiness is not palette eligibility.

Replacing a window cancels obsolete requests. Route tokens AND per-job signals
prevent late installs. Old jobs remain counted until they settle. Failed keys are
remembered only in the bounded current window; repeated updates do not create a
retry storm. `retryFailed()` is explicit. Evicted tiles can be prepared on return.
The same service must not be driven concurrently by a second lifecycle owner.

This is still one fixed <=128-tile manifest batch. Global distribution, batch
handoff, route-cache persistence and an off-frame browser/worker admission policy
are NOT implemented here. A full-world network service is not implied.

## Validation

`qa-block8-biome-loading-r4.mjs`: 25 synthetic groups pass locally, including
real native gzip, bad input/lengths, expansion overflow, stalled body/response,
abort/disposal, concurrency, immutable descriptors, continuous cells, dateline,
seams/poles, capacity reporting, repeated windows, stale same-key route reuse,
cache eviction/return and 100,000 synchronous queries without transport calls.
Existing 14 R1 + 3 rock/ice + 16 R2 + 35 R3 groups remain green locally.
The permanent integration inventory includes R4. The boundary guard permits
transport only in its adapter while preserving core query purity and no activation.

`qa-block8-biome-route-real-r4.py` builds bounded source-polygon tiles selected by
the planner over the ACTUAL stored Laguna Seca and Nordschleife circuit polylines.
A separate source-polygon query provides each vertex's expected record.
`qa-block8-biome-route-real-r4.mjs` serves those gzip tiles over a real loopback
HTTP server and exercises rolling preparation/query via native Fetch and
DecompressionStream. Reports record polyline hashes, vertex counts, missing/ready
state, actual requests/bytes and source agreement. No synthetic straight transect
is described as a real circuit. The original Baffin/Yungas/R1/R2/R3 suites remain.
Read the exact-head CI artifacts for measured results; local-only passes are not
proof that a newly published candidate has passed GitHub CI.

## Exact next action

Validate broader continuous-route/batch distribution and browser off-frame
preparation before attaching this coordinator to the game. Then review/register
actual compatible models and establish bounded smooth transition/elevation policy.
Keep the actual asset registry empty until assets are reviewed. Preserve R4 forest
budgets, geographic exclusions and human-accepted visuals. No driving test is
requested for this disconnected data-loading checkpoint. Do not merge PR #14 or
advance main without the user's corresponding integration/release checkpoint.

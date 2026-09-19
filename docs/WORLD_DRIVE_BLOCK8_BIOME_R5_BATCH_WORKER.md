# Block 8 biome R5 — Successive batches and native worker preparation

2026-09-17. Continuation of PR #14 on `candidate/block8-biome-classifier-r1`.
Base candidate `672824cf0afaec7562c3f1aa4d181c269285917f`, exact-head run
`35260824227` PASS. Canonical dev documentation checkpoint
`40d5e478805a928729ae9d2e5b03b8813fd17185`, Dev Integration `35260790374` PASS.
Stable main `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33 is untouched.

**Candidate-only, not game activation, not a completed visual feature.**
This implements the next action from the canonical active-candidate ledger.
R1-R4 classifiers, source geometry, service, transport, route planning and the
certified forest R4 scheduler are reused without changing their implementations.

## Versioned page packaging

`tools/biomes/partition-refinement-batches.py` is an offline standard-library
packager, not another geographic importer. It consumes up to 256 existing bounded
refinement packs, checks source/catalog identity, decoded hashes/lengths and tile
addresses, and copies their gzip bytes without recompression or polygon edits.
Different manifests cannot assign conflicting content to the same tile key.

A one-degree page holds at most 100 original 0.1-degree tile descriptors. Page
bytes are SHA-256 pinned by a `world-drive-biome-directory-v1` root containing
one shared catalog and an explicit revision. Pages are limited to 64 KiB; a root
to 4096 pages and 2 MiB of UTF-8 bytes in the packager. The browser client
caps serialized initialization at 2,097,152 characters; that is not a UTF-8 byte limit. This is a
bounded PARTIAL distribution index, not a published worldwide fine atlas.
The root itself remains a trusted application input, not a signed publisher root.

`batch-source.js` verifies page bytes before fatal UTF-8/JSON interpretation,
checks revision/source/catalog/address and every descriptor, caches two pages by
default, and assembles only the requested window (at most 32 tile descriptors).
Page absence and tile absence remain explicit missing coverage. No nearest-land
substitution, coarse forest override, automatic retries or hidden request queue.
Native Fetch obeys abort/deadline; a custom injected fetch must honor AbortSignal.
Only explicit HTTPS or loopback directories, omitted credentials and no redirects.

## Atomic successive windows

`batch-route-session.js` owns one active R3 service/R4 preparer and at most one
staging pair. The active local data remains usable while a different window is
prepared. A staging pair is promoted only after its complete bounded window is
resident. Failed manifests or tile validation cannot replace the active pair.
Identical/subset windows reuse the active service. A new window that needs new
descriptors prepares a new bounded service, without cloning the global atlas.
This R5 owner intentionally has no regional atlas; missing detail is unavailable.

There is one executing update and at most one pending latest update. New updates
supersede/cancel old requests. New routes invalidate both their data and stale
completions. Source/catalog and the directory revision are fixed for the lifetime
of a session; changes require a new session. Disposal closes all owned resources.
When a reused active preparer is canceled, availability may temporarily fall back
to unavailable; the owner never presents a disposed service as ready.

Bounds are retained/accounted PAYLOADS, not JS/browser/native total heap:
- up to 2 services, each default 8 tiles / 8 MiB typed-array payload;
- one manifest resolution in progress; up to 2 cached pages of at most 64 KiB;
- shared R4 transport still at most 2 tile transfers / 8 MiB reservations;
- each R3 preparation budget still applies separately; JSON/catalog/crypto copies,
  response chunks and native decoder memory are additional;
- old canceled operations stay on the serial pipeline until they settle; updates
  do not spawn a growing chain of services.

No persistent disk cache yet. A return outside the two-page cache refetches the
pinned page. Atomic window handoff may reload shared tiles rather than transferring
geometry between services; readiness/cost must be measured before game admission.

## Native browser owner

`biome-preparation-worker.js` is a dedicated MODULE Worker entrypoint. It creates
the directory source, R4 transport and successive-window session inside the worker.
Fetch/gzip, digest verification, geometry validation and route planning execute
there. `biome-worker-client.js` exposes explicit initialize/setRoute/update/sample/
diagnostics/dispose calls. It starts no recurring timer or gameplay integration.

Client/worker admission is at most four in-flight RPCs. Samples hold at most 256
positions; routes at most 20,000 vertices. Response IDs and route epochs prevent
old sample replies from becoming a new route's snapshot. Initialization is single
use; errors/deadlines terminate the worker and reject pending calls, with NO
fallback to doing decompression on the UI thread.

This asynchronous sample API is for explicit preparation/validation. It is NOT a
per-tree RPC design. A production synchronous chunk-context snapshot/worker bridge,
actual gameplay route lifecycle binding and visual admission remain later work.

API basis (retrieved 2026-09-17):
- https://html.spec.whatwg.org/multipage/workers.html (module workers/messaging)
- https://compression.spec.whatwg.org/ (native DecompressionStream)
- https://playwright.dev/python/docs/api/class-worker (native browser validation)

## Reproducible validation and current status

Local Node: 17 R5 groups PASS, including 150 synthetic tiles through 15 one-degree
pages over a 1,656.806 km ARTIFICIAL route, 300 forward/reverse windows, atomic
failure, missing data, corruption, timeout, mutation, coalescing, stale routes,
disposal, capacity and 100,000 synchronous queries without new transport.
Observed maximum 2 services, 2 cached pages, 3,608 resident typed-array bytes in
this deliberately uniform synthetic fixture. Not an estimate for real polygons.
Python packaging checks reproducibility, byte-preserving copies, 150-tile split
and ten invalid-input cases. Existing local R3 35 groups and R4 25 groups PASS.

Local system Chromium refused loopback navigation with ERR_BLOCKED_BY_ADMINISTRATOR.
No policy was changed to bypass it; local browser validation is NOT claimed.
CI installs test-only Playwright 1.57.0/native Chromium and executes
`qa/qa-block8-biome-browser-r5.py` after rebuilding the R4 real route fixtures.
The browser test covers all 206+1,068 existing circuit vertices against their
unchanged source expectations, plus the 300 synthetic long-route windows.
The main page traps gzip construction, SHA digest and tile/page fetching: any
accidental UI-thread preparation fails the test. Real module worker events and
UI heartbeat are recorded. Heartbeat is NOT a game frame-time/FPS benchmark.

New tests remain in the candidate's focused workflow and permanent integration
inventory. The workflow executes all existing canonical Dev Integration commands,
explicit forest R4 regressions and R1-R4 real-geography checks. A pending run must
not be reported as PASS; consult the current exact-head run and browser artifact.

## Verified native-browser milestone

Milestone `a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3`, run **35263745441 PASS**,
including both jobs and native Chromium 143.0.7499.4. Earlier implementation
`ad8aa1d0cd5e2523e96c0d9fb09adc97c6b9af0c` also passed run 35263466518; the
milestone adds an isolated minimal HTML harness and checks for page errors.
No game entrypoint is loaded by the browser harness.

Verified `browser-r5-qa.json`: 206 Laguna Seca + 1,068 Nordschleife original
positions all ready and matching source records; 300 forward/reverse windows
across 150 synthetic tiles / 15 pages also all ready. Two native Worker URLs
were observed; main-thread preparation traps remained armed. Stale routes,
stale sample epochs, admission, oversize samples and worker termination passed.
The integration artifact records all 97 commands exit-zero and zero required or
tolerated failures. All three downloaded ZIP digests and 13 code files match.

Synthetic run: 299 handoffs, 2 peak services, 2 cached pages, 3,608-byte peak
resident arrays. Real circuits: 3 page fetches, 4 tile transfers, 2,258 gzip bytes,
16,598 decoded JSON bytes, 6,348-byte peak resident arrays, 10,566-byte peak
transport reservations. The fourth transfer reloads an overlapping tile during
atomic handoff; this is not claimed optimal caching. Memory is payload accounting,
not total heap. The UI heartbeat ran 130 frames in this one measurement; it proves
progress, not a frame-time or gameplay-performance budget.

The fixed test pack covers compact circuits, while the long path is synthetic.
Neither establishes global geographic distribution, high-speed game readiness,
visual continuity, ecological accuracy or GPU frame pacing. Later documentation
commits require their own exact-head QA; the milestone is not a self-certifying
reference to a future commit.

## Exact next action

Prepare a bounded synchronous chunk-context snapshot bridge and validate
actual gameplay route/worker admission (diagnostic-only first), while addressing
continuous long-route geographic distribution and persistent cache separately.
The root is not fetched/authenticated automatically by R5. No worldwide fine-data
publication, approved real tree assets, compatible visual transitions, local
elevation policy, game-renderer/frame-pacing QA or human visual PASS is implied.
Keep the canonical active-candidate ledger and PR synchronized with verified
milestones. Do not merge PR #14 or move main merely because automation is green.

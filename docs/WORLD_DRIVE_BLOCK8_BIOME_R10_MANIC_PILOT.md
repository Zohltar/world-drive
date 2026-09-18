# Block 8 R10 — finite real Manic-2 to Manic-5 biome pilot

Date: 2026-09-18. Candidate-only, PR #14 remains draft/unmerged.
Read the canonical plan on dev and WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md first.
This stage follows the scoped R9 loaded hardware HUMAN PASS in PR comment 5729735550.
Do not request that same circuit hardware test again. Forest R4 remains protected.

## Accepted hardware checkpoint — 2026-09-18

**Scoped HUMAN PASS: « tres fluide aucune saccade ».** PR comments 5731654953
(technical evidence) and 5731692833 (explicit feel verdict) supersede the original
request below. Do not repeat or extend the accepted Manic diagnostic passage.

Complete JSON: progress 10,680.923 m, 32 publications, 16 snapshot evictions,
16 resident snapshots /567,808 accounted bytes, no pending snapshots; current plus
three forward chunks prepared (6,976 resolved candidates, noData/unavailable zero).
Three successful tile loads, no transport/observer/bridge rejection. Separate later
console capture: 10,802.930 m. Earlier approximate 220 km/h was reported only for the
initial passage. This is actual loading plus bounded snapshot turnover and user feel,
not a paired performance benchmark or literal zero in the cumulative hitch counters.
Additional tile/page turnover, whole-forest readiness, full 191 km drive and real
multi-biome transitions are not established. No new planting or merge approval.

The R10 final candidate 82a5d492fd61fb3345aa397dfbe4f75345ed7d7c passed BOTH
35347906519 (Manic) and 35347906708 (complete inherited matrix, 97 integration commands).
Later authoring/documentation heads must pass their own checks. R11 continues in
isolated tools with style prototypes and policy tests; the accepted R10 runtime is unchanged.

## Scope

Extend fine source data to a real long road without changing any runtime module,
forest scheduling/density/exclusions, route provider, vehicle/terrain/hydro or palette.
The resulting public/local-data/biomes/pilot-r10 is an opt-in diagnostic data package.
It does not replace R9, choose a gameplay route, or grant placement authority.

## Reviewed real route provenance

Captured by the repository's OSRM Project URL using the original Manic preset endpoints:
start longitude -68.3467 /latitude 49.3213, end -68.7271214 /50.6451065.
Capture time: 2026-09-18T12:33:00.206818Z; run 35345189578 at
6214c87f13ceac1774d7a264833db60f19639df1, artifact 10545883468.
Artifact ZIP SHA-256: 30c30760056f98a4f1a0f37b1af11ef102dc37ff441385c01595bee973158e11.

The unchanged response is retained in qa/fixtures/biomes/manic-r10/response.json.gz
with a separately pinned receipt. No straight or synthetic polyline substitutes it.
Response: 34,710 decoded bytes /11,251 gzip bytes, 1,497 route vertices.
Raw response SHA-256: 0d3378137bf9bc3a96ffd6185bb5aaf1a6f47261e31b28038969c03425ed8e0c.
Receipt SHA-256: 882039b3980d123daec53d452811c7973a37ad24aac1a6a4d26ae58d70a30724.
Independent spherical length: 191,203.340 m; provider distance: 191,414.1 m.
These are distinct metrics, not a claim that their values are identical.
Source data_version is absent; do not invent an OSM dataset date. This is a routed
snapshot, not a GPS driving trace, access guarantee or immutable future live route.

Route data attribution: OpenStreetMap contributors, ODbL-1.0, preserved separately
from the RESOLVE CC-BY-4.0 biome attribution. The source route included in the ZIP
is for provenance only and is NOT installed as the authoritative gameplay route.

## Authoring and source oracle

Reuse R2 exact source-coordinate tile refinement and R5 one-degree manifest pages.
The fixed source archive SHA remains
be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60.
Continuous route windows cover 900 m corridors, 2,400 m ahead and 700 m behind,
reversed on the return traversal. Existing max-eight-tiles runtime windows remain.
The finite authoring ceilings are 512 tiles, 2,048 chunks, 128 tiles per source batch.
No local geographic preprocessing is required on the user's PC.

Crucially, the forest grid uses the selected preset's origin, not the router's first
snapped point (-68.346516,49.318738). That distinction changes chunk addresses.
The maintained observer and authoring planner agree on progress and current/forward
chunk selection at 799 moving observations; the single stationary turnaround is
explicitly excluded from the reverse-motion assertion. Geometry itself is unchanged.

The source oracle evaluates the original GEOS polygons, not the generated tile
representation. Preparing polygon indexes accelerates covers checks without editing
coordinates or WKB. The reversed predicate agrees with the older covered_by oracle
on holes, boundaries, overlaps, empty inputs and points distributed across every
real chunk. Highest-record-slot overlap semantics remain unchanged. No repair,
nearest-land substitution or precision rounding is applied.

Local authoring/contract evidence before publication:
- 26 fine tiles, two manifest pages, 383 unique chunks, 800 windows (400 each way).
- 667,952 exact candidate positions inside the provisioned tile inventory.
- No source-invalid selected geometry or unresolved refinement cell.
- 8 plan-contract groups and 7 source/package groups PASS.
- 8,061 bytes of gzip tile payload; full ZIP about 55.5 kB includes metadata,
  launcher and separately attributed source route. Read the build report for exact
  ZIP size/hash; gzip metadata can vary across Python versions.
- All sampled source positions identify Eastern Canadian forests (ecoregion 373).
  This route tests loading and cache turnover, NOT diverse biome transitions.

## Required independent exact-head QA

Both workflows must be green for the SAME candidate HEAD:
1. Existing Block 8 Biome Classifier R1 QA, including all 97 maintained integration
   commands, prior real-data/Worker/full-game tests and the Vite correction.
2. Block 8 Real Manic Long Road R10 QA, including pinned fixture/negative inputs,
   unchanged-runtime guard, independent source expectations, duplicate-build ZIP
   comparison and native Chromium module Worker replay.

The new browser gate awaits each of the 800 windows, prepares at most four
current/forward chunks, and checks every candidate against source-oracle slots.
It traps main-page gzip, digest, tile I/O and candidate generation during preparation;
checks 16-chunk /4 MiB snapshot budgets, page/service bounds, eviction, synchronous
reads, explicit missing coverage, stale held views after route change and termination.
Only actual Actions results establish native-browser PASS. The attempted local
Chromium run was blocked by administrator policy before page load; no local native
PASS is claimed. Native CI reports, code subset and installable ZIP are preserved
in biome-r10-manic-<exact SHA>. Do not transfer older green checks to a later commit.

Even a successful awaited replay is NOT proof of continuous high-speed readiness,
full visible-forest coverage, hardware frame pacing or a full-game Manic run. R9's
separate full-game circuit gate remains useful but does not remove these limitations.
Source agreement is not present-day vegetation or a visual-biome HUMAN PASS.

## Original human test procedure — already accepted, retained for reference

Keep R9 installed. Copy ONLY public/local-data/biomes/pilot-r10 into the candidate
checkout, restart Vite after pulling, and select Manic-2 -> Manic-5 normally.
Activate explicitly:

```js
await (await import('/local-data/biomes/pilot-r10/start.mjs')).start()
WorldDriveDiagnostics.forest.biomes.snapshot()
```

Confirm observed/freshCurrentChunk/loaded/published before driving. Compare normal
OFF and ON driving with unchanged settings and DevTools closed. Capture biome and
frame diagnostics BEFORE stop, with elapsed driven distance and speed when known:

```js
copy(JSON.stringify({
  biomes:WorldDriveDiagnostics.forest.biomes.snapshot(),
  framePacing:WorldDriveFramePacing()
},null,2))
WorldDriveDiagnostics.forest.biomes.stop()
```

No new trees should appear. Off-corridor live routes/detours remain explicitly
unavailable instead of receiving a default biome. A useful first high-speed passage
is 10-15 km, not a demand for a full 191 km human run. This initial test request is now satisfied for the
reported passage; broader coverage claims still need separate evidence. Global distribution, persistent caching,
trusted-root retrieval, reviewed compatible assets and ecological transition/elevation
policy are later work. No merge, runtime activation or main movement is authorized.

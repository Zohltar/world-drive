# Block 8 R3 — Maintained biome service and compatible palette registry

Date: 2026-09-17. Continues PR #14 on `candidate/block8-biome-classifier-r1`.
Starting candidate: `cf78f356f744b5a0722e4b123075f125cb3b54f4`; exact-head
R1/R2 workflow run `35241080423` PASS. Protected dev:
`45ab6bc770097239add81eeaca9c4d32de9968a2`, canonical Dev Integration
`35230199150` PASS. Protected main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1`.

**Maintained library, not visual activation or completed Block 8.** No game
entrypoint imports it. No models were registered/replaced, no density or R4
scheduler changes, and neither dev nor main is advanced by this work.
The candidate's new exact-head CI must pass; earlier R2 success is not R3 success.

## Ownership

The tested regional classifier and source-polygon query now live under
`src/scenery/biomes/`, beside the service and palette registry. The R1/R2 tooling
paths are two-line compatibility facades: no second implementation or src-to-tools
dependency. Local polygon-query bytes are unchanged from R2. Regional profiles,
including the exact RESOLVE Rock and Ice distinction, have a shared owner;
existing regional-query behavior and all prior tests are preserved.

New maintained modules:

- `biome-profiles.js`: distinct source-biome rendering contexts;
- `regional-classifier.js`: bounded R1 regional hint;
- `local-refinement.js`: bounded R2 source-coordinate decision;
- `biome-service.js`: source agreement, verified preparation and lifecycle;
- `palette-registry.js`: immutable explicit asset eligibility and stable selection.

`qa/DEV_INTEGRATION_AUDIT.mjs` permanently imports the new service/registry suite
and domain-boundary suite. The candidate workflow still executes every maintained
Dev Integration run command, plus original R1/R2/R4 regressions and real-data QA.
The protected-runtime diff check permits ONLY the new biome directory; all old
src/server/electron/public/package paths and the canonical workflow stay unchanged.
The boundary suite additionally rejects unexpected game imports and domain
network/timer/renderer dependencies. Activation needs a separate reviewed change.

## Service contract

`await prepareBiomeService({regionalAtlas, refinementManifest, ...limits})`
constructs a fixed-dataset instance outside frame work. It validates/copies data
before asynchronous verification, checks matching source identity and catalog,
verifies the regional uint16 cell digest and canonical local-catalog SHA-256,
and snapshots at most 128 declared tile descriptors.

`query(latitude, longitude)` returns `world-drive-biome-context-v1`:

- a loaded local source record is authoritative for geographic classification;
- source no-data overrides any coarse forest label;
- absent detail, invalid/over-complex geometry or a cache miss is unavailable;
- the regional result may be exposed as `regionalHint`, NEVER implicitly promoted
  into a confident palette selection;
- resolved context preserves source metadata and the local Rock and Ice profile;
- every result has `placementAuthority:false`, `elevationApplied:false` and
  `transitionReady:false`; clipped-cell edges are diagnostic, not ecological blends.

A query does at most one R2 cell lookup (512-edge maximum), and only on missing
local detail, at most four R1 cell reads. No fetch, decoding, hashing, preparation,
random draw or scheduling occurs in query. Results and source records are immutable.
`confidence:source-agreement` means representation agreement, not field ecology.

## Verified preparation and route lifecycle

`requestFor(lat, lon)` returns a frozen declared descriptor or null, without I/O.
`prepareTile(key, decompressedUtf8Bytes, routeToken)` checks length before copying,
privately snapshots the bytes, verifies their SHA-256 BEFORE fatal UTF-8 decoding
and JSON parsing, validates identity/address/geometry, then atomically installs.
No failed verification can evict good resident data. Unknown files/keys are refused.
The host still owns transport and BOUNDED decompression; this API is not a complete
HTTP/gzip loader. The trusted versioned manifest is the integrity root, not a
cryptographic signature or a claim of producer-signed provenance.

`beginRoute()` returns a new identity token and clears local residency. Work from
an older token is discarded after asynchronous hashing; numeric token lookalikes
are refused. Pending old-route buffers remain accounted until their finally block
releases them. `dispose()` drops residency and prevents subsequent installs/queries.
This is a standalone lifecycle contract, not yet wired to the game's route owner.

Default preparation bounds: 2 in-flight tiles, 4 MiB owned input snapshots, no
internal pending queue. Overflow returns busy for the future bounded coordinator.
Each decoded tile remains limited to 2 MiB; R2 residency remains 8 tiles AND
8 MiB typed-array payload. These ceilings do NOT describe total process memory:
caller buffers, crypto copies, JSON objects, transient parsing, catalogs and the
regional grid/copy consume additional memory. Factory preparation also creates a
canonical little-endian buffer for regional digest verification.

API foundations: https://www.w3.org/TR/WebCryptoAPI/ (SHA-256 digest) and
https://encoding.spec.whatwg.org/ (fatal UTF-8 decoding). No new dependency is
added to the game's package. Environments without Web Crypto fail preparation
rather than silently bypassing integrity checks.

## Palette registry contract

`createPaletteRegistry(reviewedAssets, {revision})` snapshots a bounded explicit
catalog: at most 256 descriptors, 128 per palette/kind, reviewed metadata and
provenance IDs required. NO actual asset is supplied by R3; default is an empty
registry. Test IDs prefixed MOCK are artificial fixtures, not approved GLBs.

Selection requires resolved local context, matching source/profile metadata,
a stable absolute candidate key and `placementAllowed:true` supplied AFTER the
existing road/hydro/building/landuse/blocker tests. Missing permission skips.
The registry never positions objects, changes density or overrides those masks.

Only assets explicitly listed for the primary palette, and matching any realm
or ecoregion restrictions, can be selected. Tropical and boreal conifers are
separate. Missing assets return no-compatible-asset, not another biome's tree.
Coarse neighboring mixes and artificial local-cell boundary flags are ignored.

Selection is weighted and deterministic using length-delimited identifiers,
fixed UTF-16 arithmetic and sorted asset IDs. It does not depend on cache order,
wall time, Math.random, locale ordering or shifted local-world coordinates.
Registry/source revisions intentionally identify authored changes.

Conservative initial tree policies: regional forest for forest families,
sparse for savanna/Mediterranean palettes, none for desert, tundra/montane
grassland, flooded/temperate grassland, unknown and rock/ice. This is an authoring
safety contract, not a claim that all those landscapes are literally treeless.
Later local exceptions need explicit evidence. No numeric densityScale is chosen.
Rock/ice permits only rock descriptors. Shrubs/ground cover have separate kinds.

## Local validation before publication

- Existing R1 14 groups, rock/ice 3 groups and R2 16 groups PASS through facades.
- New R3 suite: 35 groups PASS, including corruption, source/catalog mismatch,
  malformed geometry, UTF-8 failure, byte mutation races, stale routes/disposal,
  identity tokens, concurrency/byte ceilings, cache churn, deterministic weighted
  choice, realm restrictions, forbidden defaults and 100,000 query+selection calls.
- Domain ownership/absent-activation check PASS.
- Same 6,327 R2 real positions: zero changed source records; 4,846 resolved records
  and 1,481 retained source-no-data results. Original Baffin record 415 and all
  201 original Yungas positions are retained. Both old source oracles still run.
- Mock tree selection: 3,120 compatible selections, 1,726 no-tree policy skips;
  the empty real-asset registry selected nothing at every point.
- This random-access harness caused 740 tile preparations. Maximum geometric
  edges tested remained 14; peak R2 resident arrays were 41,500 bytes over at
  most 8 tiles. Peak owned preparation snapshot was 15,430 bytes, one in flight.
  Those are footprint/harness measurements, not global coverage, optimal route
  prefetch behavior, total heap estimates or browser/GPU frame-pacing evidence.

CI rebuilds the pinned source and repeats all real-data checks at the new exact
candidate head. Its reports include `service-palette-r3-qa.json` in the refinement
artifact and the exact-head integration command report. Pending CI is not PASS.

## Exact next action

Implement bounded transport/decompression and a continuous-route tile preparation
coordinator, using these verified preparation/route-token APIs. Keep source and
manifest versions fixed, route-generation ownership explicit and all work outside
query/frame loops. Establish coverage over real driven polylines, not just points.
Then review/register actual compatible assets, supply compatible transition and
local elevation policies, and enable a candidate visual path with R4 readiness/
frame-pacing tests before the tropical/boreal/arid-or-alpine human checkpoint.
Do not equate the empty registry or this library QA with biome visuals being done.
No dev/main merge or user driving test is implied by the present stage.

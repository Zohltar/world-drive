# Block 8 R15 — Yungas tropical rendered pilot

2026-09-18 (Toronto). Existing candidate/block8-biome-classifier-r1, PR #14.
Read the canonical dev plan and active ledger; final exact-head runs are in live PR.
R15 implementation begins at a595789448a9ffc01eb544b7e7230912dd4feea1; publication
is not a PASS. Every following documentation/ancestry HEAD needs its own full QA.

## Accepted predecessor and new intent

R14 Laguna HUMAN PASS **5737712460** at **95b463c26d056a821bb626736cc5ed6f3169ea7e**.
R12/R13 and R9/R10/R11/R11W accepted tests must not be repeated. General modeling
variety is deferred. R15 uses the already approved **preview-tropical** silhouette
(60 triangles), not a new species. No tropical winter counterpart exists: winter
requests reject before disturbing a valid summer presentation. No terrain snow.

## Captured real road, not a constructed surrogate

Existing Chuspipata → Yolosa preset through its historic-road midpoint:
`[-67.81891,-16.29911] → [-67.7861,-16.2577] → [-67.73975,-16.23312]`.
The explicit authoring capture at b9854257a28f4e3da1a5bf1e34957484fbd1dd7d passed in
run **35410409395**. Artifact **10574735816** was downloaded and checked (80,756,787
bytes, SHA-256 `e77084fa129279eeb697d07577f32b97843f19a07088f1dc64d54869204389eb`).
Its original routed response has **1,754 vertices**, two legs and **28,153.429947659195 m**
computed haversine length; OSRM reports 28,098.1 m. Largest segment is 87.6143 m.
Captured at 2026-09-19T00:45:14.502538+00:00. Source data_version was null, not a
known map date. The original URL, response identity and OSM/ODbL attribution remain
in qa/fixtures/biomes/yungas-r15/receipt.json and ATTRIBUTION.txt.

Original response: 42,635 bytes; SHA-256
`511da11b27aa74d91237f45f13c84170a57fb0653107a7d7ffc6374e2c871ddb`.
Canonical coordinate SHA-256:
`66b8c80b3f66e88daa040ad6c508b5c92bf2c75d28b0ce02f76ef7cb9eaba95f`.
Receipt SHA-256:
`bb1863c7a1bb245bc4cdf43ff8826e3b872796c8faaa1730bb722e70b229debd`.
Compressed response Git blob: f6906e121768503a1ae0a61e7e405b3cc507c8e4 (11,273 bytes).
Receipt Git blob: d42288e196391a100a6fd6a146d64c1332a61987 (1,003 bytes).
The one-off exact-object workflow 35410802060 created these blobs without moving
refs; its write-permission workflow was removed after committing the fixtures.

Capture/QA fixtures do not alter the game's live router or the authored preset.
The projection uses the preset origin **[-67.81891,-16.29911]**, not the slightly
snapped first route point. Import performs no network access; failures never produce
synthetic route geometry. Capture validation checks both endpoints, the midpoint,
regional envelope, full polyline size, length, finite numbers and continuity.

## Geographic contract and finite data

Fourth profile **r15-yungas-tropical**, revision **resolve2017-r15-yungas-rendered**,
uses palette **tropical-moist-broadleaf**, model **preview-tropical**, region **444 /
Bolivian Yungas /biome 1 /Neotropic**. Source/catalog/revision/projection/layout must
match, and ALL **1,744 exact original R4 candidate coordinates per chunk** qualify
before replacement. There is no centre-point classification shortcut.

Runtime route admission permits normal router resampling within preset endpoint
neighborhoods, the historic waypoint, 10–45 km length and a finite regional envelope.
This is NOT an exact road hash or a claim that every possible route in the envelope
fits the finite package. Independent fine source proof still controls each mesh;
missing, mixed or other-region chunks retain original visible trees.

The separate Python builder pins original response and receipt bytes, uses unchanged
source-index/refinement/partition builders and creates **15 fine tiles /one manifest
page** under public/local-data/biomes/pilot-r15/. Existing pilot directories and
packages are unchanged. Source-window options remain 3,600 m ahead /2,600 m behind
/2,800 m corridor, max eight tiles in a window; this is NOT the R4 drawing radius.
All **3,508** route-vertex windows (both directions) fit the package in local QA.

Independent original-polygon oracle: **265 chunks /462,160 exact candidate positions**,
all region 444; no mismatch in the local real-byte source/session comparison. The
native Worker must separately verify these counts, every exact coordinate and proof.
Local reproducible package: 40,627 bytes, SHA-256
`84d0b6fd9dc677e4bc2ebdfb36d60a8814192bb600d154fbd299a6222710d776`.
The delivered package MUST come from, and agree with, the final inspected native
Actions artifact. Do not silently transfer local compression bytes to another build.

Pinned RESOLVE 2017 archive SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Catalog: `e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7`.
This identifies a regional art family, NOT actual local species, present-day forest
cover or altitude zonation. No altitude threshold is invented; regional elevation/
vertical-datum and boundary evidence remains required for optional R11 policies.

## Protected implementation

Geometry-only reversible replacement on existing active-route InstancedMeshes.
No changes to positions, matrices/counts, materials, bounds, transforms, exclusions,
R4 full density, first-layer order, prefetch, scheduler, source/Worker domain or idle
budgets. No new src seam, model-buffer edit, extra per-chunk draw pass or dependency
update. The strict R12 boundary guard remains intact. Prior Nord/Manic/Laguna profiles
and packages stay unchanged. OFF is inert; pagehide/route change stops Worker/pending
work and restores only owned geometry. Hidden cached route owners stay protected.

Limits: 128 proofs/modified meshes, two owner listeners, 16 snapshots/4 MiB accounted
payload, 120 ms polling/two requests, finite 1,744-read ceiling and **0.8 ms cooperative
per-read deadline**, with genuine idle admission. An indivisible operation can overrun;
this is not a hard deadline, whole-browser/GPU-memory ceiling or FPS promise.
No terrain snow, weather/grip/physics, automatic seasons, mixed models inside a mesh,
shrubs, rocks, global activation or new general-model-variety work.

## Permanent gates and evidence levels

Local tests: **18 pure contract groups, 16 captured-input groups, 17 HTTP-matcher
groups, six reproducible/negative packaging groups**, plus source/session coverage.
Existing R12/R13/R14 and route-owner pure regressions pass locally. These are not
native full-game or user hardware evidence.

The R15 workflow runs the actual Vite/Three game, native Worker, source oracle and
production build. Initial boot uses the accepted Manic response; the normal Yungas
UI button then loads the captured two-leg route. Other upstream geographic services
are controlled 503 responses; pale fallback terrain/relief is not satellite data or
snow. The game, forest and Worker are not runtime stubs.

Keep **1100x700 CSS /DPR1 /four rendered chunks /120 seconds**. Check actual tropical
model IDs, triangle counts, instance matrices/counts and unchanged state across 20
rejected winter requests. UI jumps at 25%/75% require at least two new controller
polls, newly completed proofs and four modified chunks. This is not proof that every
visible chunk has converged or that the entire route was continuously driven. Verify
OFF and actual route-reset Worker termination/restoration, and inspect screenshots,
not just green job statuses. Preserve failed evidence and fix the original case.

Require ALL SEVEN exact-head candidate workflows (R1–R9/integration, R10, R11/W,
R12, R13, R14, R15), every one of the 97 canonical integration commands exit zero,
and exact Dev Integration for the documentation-only dev head. Final SHA/run IDs,
actual counts/timings, native/source file hashes and screenshots belong in live PR #14.
No older commit's or human gate's PASS may be transferred. No merge is authorized.

## NEW human test after all automated gates

Stop Vite, fetch/switch/pull the existing candidate with --ff-only. Copy ONLY
public/local-data/biomes/pilot-r15/ from the final small ZIP into the repository;
keep R9/R10/R12/R13/R14. Restart npm run dev, use its actual port, hard-refresh the
GAME and choose **Chuspipata → Yolosa /Route de la Mort /Yungas** normally.
No Python installation is required.

```js
await (await import('/local-data/biomes/pilot-r15/start.mjs')).start()
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Expect pilot: r15-yungas-tropical, error:null and positive modifiedChunks,
modifiedInstances and proofsCompleted. Phase may alternate preparing/ready. Approved
broad tropical crowns replace only proved chunks; pending/unqualified chunks retain
conifers. Close DevTools and drive a few kilometers, checking silhouettes, late model
changes and fluidity. No winter test and no repeat of accepted Manic/Nord/Laguna/gallery.
Capture BEFORE stopping:

```js
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

OFF restores the original conifers. Ask for the JSON and user's rendered/performance
verdict. Software rasterization does not certify the user's GPU or paired OFF/ON
performance. Main remains protected; Block 8 is ACTIVE candidate work, not integrated,
globally activated, DONE/CERTIFIED or authorized for release.

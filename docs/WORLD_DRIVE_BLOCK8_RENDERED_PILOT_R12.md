# Block 8 R12 — first opt-in rendered biome pilot

2026-09-18. Existing candidate `candidate/block8-biome-classifier-r1`, draft PR #14.
Summer style accepted (5732527872); winter style accepted (5734183717).
Implementation **e975aa7cfb98ad5d74155980377919e272dd791d** has all four exact-head
workflows PASS. This Markdown follow-up requires its own exact-head checks; consult
the live PR checkpoint for the final delivered SHA/runs. No inherited PASS.
The NEW rendered driving HUMAN checkpoint remains OPEN.

## User-visible scope

Nordschleife only. Explicit activation changes existing forest geometry to the
approved **temperate broadleaf**, after exact regional proof. Summer uses the
approved leafy shape; winter uses approved bare AND snowy branches. Switching is
manual and local to the pilot. Ground, road, water, sky, weather, lighting, grip and
vehicles remain unchanged. No automatic date, hemisphere or temperature rule.
Other accepted shapes remain in the gallery, not planted by R12.

One homogeneous model is used per eligible chunk. A regional broadleaf class is not
proof of each actual species or current forest cover. Mixed conifers/broadleaf within
chunks, transition bands, altitude eligibility, shrubs/rocks and global fine coverage
are subsequent stages. General model variety is deferred; do not reopen style gates.

## Geometry-only and regional eligibility

R4 owns positions, slope/road/water/building exclusions, heights, rotations, density
counts, first-layer order, prefetch and cache lifetime. R12 changes ONLY
`InstancedMesh.geometry`, preserving material, count, instance buffer, manual bounds,
transform and parent membership. No extra per-chunk mesh or material pass. Full-game
draw calls still vary with world streaming; no constant total or GPU delta is claimed.

All **1,744 exact candidate coordinates** in a chunk independently resolve to the
reviewed context before its whole existing mesh is eligible. Even candidates rejected
by placement are checked. No centre-point shortcut. Required identity:

- RESOLVE-ECOREGIONS-2017 / CC-BY-4.0;
- source SHA-256 `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`;
- catalog SHA-256 `e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7`;
- **686 / Western European broadleaf forests / biome 4 / Palearctic**.

A private scoped registry selects the generic shape, not an identified species.
Production registry/default forest stay unchanged. Missing, corrupt, mixed or
out-of-scope points refuse the whole substitution and retain the original visible
forest. Conifers may appear first and change once proof is ready: assess this pop-in
in the human test. R12 does not block the R4 first layer waiting for data. Reused proof
applies the selected geometry to later first-layer/full replacements.

Stop and route invalidation restore originals before disposing pilot assets. Foreign
geometry is never overwritten. Since e975, a chunk also must belong to a registered,
attached, visible route-cache owner. A hidden old route with the same numeric chunk
address cannot receive the current route's model. Dedicated regression protects this.

## Ownership, operation and limits

`src/app/forest-visual-pilot.js` is the inert scene/route port with explicit lazy start.
Two exact additive seams register capabilities in `src/app/biome-diagnostics.js` and
`src/scenery/scenery-renderer-p933.js`; remaining original bytes are preserved.
`tools/biomes/rendered-pilot-policy-r12.mjs` owns incremental proof;
`tools/biomes/rendered-pilot-r12.mjs` owns the reversible controller;
`tools/biomes/build-rendered-pilot-r12.py` uses existing clipping/partition builders.

No Worker/transport/domain-cache rewrite, R4 scheduler/core/budget or dependency change.
OFF starts no R12 timer, Worker, request or model construction. Starting R12 stops the
old diagnostic-only observer to avoid duplicate Workers. Route change/pagehide cancels
work and restores geometry. Restart explicitly after choosing Nordschleife.

Limits are 128 proofs, 128 modified meshes, two route-owner listeners; bridge 16
snapshots /4 MiB accounted payload with the original two pending reservations;
existing eight-tile Worker service limit. These are not total browser/GPU memory.
Polling stays 120 ms, with at most two chunk requests per poll.

The CURRENT operation ceiling is **1,744 reads**, not historical 64/256 ceilings.
The unchanged **0.8 ms deadline is checked BEFORE EACH read**. One indivisible read
can cross it and is measured; this is not a hard real-time bound. At least 1 ms real
idle headroom is required; timeout never bypasses admission. Bounded reuse of deeply
frozen R6 dictionary contexts avoids repeating the same registry/hash decision, while
EVERY exact coordinate remains checked. Mutable records and accessors are not memoized.

All six summer/four winter geometry buffers remain byte-identical to accepted c7bb.
The kit is built once per start, not per switch. The used model has **60 triangles
summer /114 winter**, versus the original 68-triangle conifer. No new texture or
transparent snow pass. Actual boundary distances and datum-qualified regional altitude
inputs remain prerequisites for optional R11 policies; synthetic tests are not defaults.

## Preserved failure history and recovery

Initial implementation **93b7fb0c1150e1b9645b566c2379edf0ec66efc1** and timeout capture
**ec6bec9cdf3cda7a380d27af513ec45f32d6258a** rendered substitutions but failed the
four-chunk /120-second native gate. ec6 recorded two substituted chunks, 83 idle
deferrals, no page/engine errors and 170,912 correct source reads. Software samples
were about 1.59 FPS OFF and 1.17 FPS at stalled ON. That is not GPU evidence or a
complete native PASS. Do not restart this already-published implementation.

QA-only **077e66b38241bba7118dcb587fedc54ced18015e** tried DPR 0.5 and FAILED in
**35387973969**: one chunk, 90 deferrals, about 1.18 FPS. Lower raster density was not
a fix or the delivered setup. **454256e41698c132b91241105c9c24a3494f97e0** tried a
256-read cap, preserving the time deadline and R4 scheduler. Subsequent immutable
context reuse, finite full-chunk ceiling and active-route ownership are in e975.
The ORIGINAL **1100x700 CSS / DPR 1 / four chunks /120 seconds** gate is retained.
The harness first waits for baseline forest meshes, distinguishing baseline readiness
from biome preparation. Pure/local success never substitutes for native completion.
Earlier failure reports remain available in the ledger/report at 5a7a8f3.

## Verified e975 evidence

| Exact-head workflow | Run | Result |
|---|---:|---|
| R12 rendered pilot | 35390641099 | PASS |
| R1–R9 and canonical integration | 35390641238 | PASS |
| R10 real Manic long-road regression | 35390641096 | PASS |
| R11/R11W authoring | 35390641199 | PASS |

Downloaded integration artifact: **97 commands, every exitCode=0**, zero required or
tolerated failures. R12 contains **22 pure contract groups plus one route-owner group**,
retaining original contracts and deadline/idle-timeout/cancellation/address checks.

Native Chromium **143.0.7499.4**, actual Vite/Three game/Worker, original DPR 1:

- Polygon oracle: **98 chunks /170,912 exact candidates**, no mismatch; all region
  686, not a multi-biome transition, species or current land-cover experiment.
- First summer capture: **4 changed chunks /2,862 instances**. Immediate season
  comparison: **8 chunks /5,320 instances**, unchanged counts/matrix hashes through
  winter and **20 additional summer/winter round trips**.
- No page/engine errors; no source-transport rejection in checked summer/winter
  captures. OFF stops new requests and terminates the Worker; route reset restores
  all owned substitutions.
- UI teleport checks new geographic proofs, NOT complete visible-forest convergence.
  At the early afterJump capture new proof progress exists but modifiedChunks is zero;
  do not claim a rendered post-teleport convergence assertion.

Observed e975 maxima: proof slice **1.2 ms**, scene scan **0.9 ms**, individual swap
**0.1 ms**. They are measured maxima, not hard guarantees. Software FPS is slow even
OFF and original world streaming continues. No user GPU/FPS or continuous high-speed
PASS is claimed. Geographic upstream responses are controlled fixtures; the game,
Three, forest and Worker are not runtime stubs. Summer/winter screenshots were
actually downloaded and visually inspected.

R12 artifact **10565277777**, 1,288,886 bytes, SHA-256
`da008961224e6e3970cc9e4da353a28ab5f56d47e1621107f9a46a31c11fe950`, has tested-commit
 e975. Integration artifact **10565876954** was also downloaded and inspected.
These are evidence/source subsets, not full checkouts. Documentation HEADs require
new exact-head checks; the live PR contains their final outcomes.

## Data and permanent QA

Separate R12 package: **12 fine tiles /two pages /34,004-byte deterministic ZIP**,
SHA-256 `62354936dadd3a6340061665ab4c62e1f77f1e23e427c8940bcc66be18b74451`.
R9/R10 packages and source polygons are unchanged. A fixed trusted root is embedded
in the explicit launcher; no worldwide distribution, signed-root retrieval or
persistent caching is claimed. The polygon oracle uses deduplicated 5x5 chunk
neighborhoods around four authored route vertices.

Permanent QA files:
`qa-block8-rendered-pilot-r12.mjs`, `qa-block8-rendered-route-owner-r12.mjs`,
`qa-block8-rendered-pilot-boundary-r12.mjs`, `qa-block8-rendered-pilot-browser-r12.py`,
and `.github/workflows/qa-block8-rendered-pilot-r12.yml`.
All three older candidate workflows remain mandatory. The strip-and-compare guard
admits only the two exact insertions and single new port; other protected runtime
and approved assets stay unchanged. No broad exclusions or integration step removal.
Full project production build is also required.

## NEW human test after final exact-head automation

Pull the same candidate; install ONLY `public/local-data/biomes/pilot-r12/` from the
supplied pack, retaining R9/R10. Run `npm run dev`, hard-refresh the game, select
Nordschleife normally. No Python is required. Activate in the browser console:

```js
await (await import('/local-data/biomes/pilot-r12/start.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Confirm visible broadleaf trees, positive `modifiedChunks`, `proofsCompleted` and
`modifiedInstances`, with `error: null`. Phase can alternate `preparing`/`ready`
while more chunks are processed. Close DevTools for a few kilometers of driving.
Observe appearance, sudden geometry changes and fluidity. This is NOT another
10 km diagnostic-only Manic test or an accepted-gallery retest.

While stationary, switch to winter:

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
```

Proved trees become bare AND snowy; ground, road, weather and grip do not change.
After a short winter passage, capture before stopping:

```js
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
```

Return to summer or stop to restore original conifers:

```js
WorldDriveDiagnostics.forest.visualPilot.season('summer')
WorldDriveDiagnostics.forest.visualPilot.stop()
```

Request JSON and visual/performance verdict before integration. A circuit change
stops the pilot; restart explicitly on Nordschleife. No Manic/other-route activation.
Main stays protected, PR #14 draft/unmerged, Block 8 ACTIVE.

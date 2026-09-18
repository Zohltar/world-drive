# Block 8 R12 — first opt-in rendered biome pilot

2026-09-18. Existing candidate `candidate/block8-biome-classifier-r1`, draft PR #14.
Summer style accepted (5732527872); winter style accepted (5734183717).
This document defines implementation and validation gates; use live exact-head
workflow results in PR #14 for tested SHA/outcomes. No inherited automatic PASS.
The new rendered driving HUMAN checkpoint is still open.

## User-visible scope

Nordschleife only. Explicit activation changes the geometry of existing forest
instances to the accepted **temperate broadleaf**, after exact regional proof.
Summer: original approved leafy shape. Winter: approved bare AND snowy branches.
Season switching is manual and local to this pilot; ground, road, water, sky,
weather, lighting, grip and vehicle behavior remain unchanged. No automatic date,
hemisphere or temperature rule. No extra modeling or general variety phase.
The other accepted shapes remain in the gallery but are not planted by R12.

This first renderer experiment is intentionally one homogeneous model per eligible
chunk. A broadleaf regional class is not proof of every individual real-world species
or current forest cover. Mixing conifers/broadleaf within one chunk, transition bands,
altitude eligibility and global fine coverage remain subsequent stages.

## Why geometry-only

R4 already controls every accepted position, slope/road/water/building exclusion,
height, rotation, density bucket, first layer, prefetch and cache lifetime. Rebuilding
those matrices would couple a model change to streaming. R12 changes ONLY the
existing `InstancedMesh.geometry`, keeping its material, count, instance buffer,
manual bounds, transform and scene-parent membership. It creates no extra per-chunk
mesh or material pass. Full-game draw calls still vary with unrelated world streaming;
report observed samples rather than claiming an unmeasured constant total.

All 1,744 candidate positions in a chunk must individually resolve to the reviewed
scope before its whole mesh is eligible. This checks even rejected candidates and
is stricter than classifying only rendered instances. No centre-point shortcut.
Required source: RESOLVE-ECOREGIONS-2017 / CC-BY-4.0 / archive SHA
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`;
catalog SHA `e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7`;
region **686, Western European broadleaf forests, biome 4, Palearctic**.
The scoped private R3 registry selects the generic approved temperate shape,
not an identified species. The production registry/default forest are unchanged.

Missing/corrupt/mixed/unavailable points refuse the entire substitution; the existing
forest stays visible. Proved chunks can therefore appear with original conifers first
and change once ready: the human gate must evaluate how noticeable that is. R12 does
not sacrifice first-layer readiness to block on biome data. Proof reuse makes later
R4 first-layer/full replacements immediately use the selected geometry. Stop or route
invalidation restores original geometry before disposing pilot assets. A foreign
geometry owned by another subsystem is never overwritten on stop/reapply.

## Ownership and limits

- `src/app/forest-visual-pilot.js`: inert scene/route capability port and lazy start.
- Two additive insertions in `src/app/biome-diagnostics.js` and
  `src/scenery/scenery-renderer-p933.js`; original code otherwise byte-identical.
- `tools/biomes/rendered-pilot-policy-r12.mjs`: scoped source and incremental proof.
- `tools/biomes/rendered-pilot-r12.mjs`: explicit reversible controller.
- Offline `build-rendered-pilot-r12.py`, using existing clipping/partition builders.

No source-domain Worker/transport/cache implementation, R4 core or budget changes.
OFF has no R12 timers, Worker, fetch or model construction. Start stops the old
observer to avoid duplicate diagnostic Workers. A route change/pagehide cancels
pending work and restores owned geometry; restart explicitly after selecting Nord.
The controller retains at most 128 proofs, 128 modified meshes and two route-cache
listeners; snapshot bridge max 16 chunks /4 MiB accounted payload, existing max two
pending snapshot reservations. The Worker retains its eight-tile service limit.

Each proof continuation checks at most **256 positions within the unchanged 0.8 ms
cooperative budget**; the deadline is checked BEFORE EACH position. One indivisible
check can cross that deadline and is measured. This is not a hard real-time bound.
The original 64-read ceiling wasted available idle time and is superseded by 256.
There is still NO timeout bypass of idle admission: at least 1 ms actual idle headroom
is required. Polling remains delayed by 120 ms and admits at most two chunk requests.
Counters report proof reads, scene scan, swaps, models and memory budgets. Accounted
payload bytes are not whole-browser/GPU memory.

All six summer/four winter buffers remain byte-identical to accepted c7bb. The kit is
built once per pilot start; switching does not rebuild it. For the rendered model,
summer is 60 triangles and winter 114 versus the 68-triangle baseline conifer.
No new texture or transparent snow pass. The original geometry is kept for restoration.

## Native timeout recovery (not a reason to discard the existing implementation)

Initial runtime **93b7fb0c1150e1b9645b566c2379edf0ec66efc1** and diagnostic capture
**ec6bec9cdf3cda7a380d27af513ec45f32d6258a** reached actual substitutions but failed
the four-chunk /120-second full-game gate. The ec6 artifact recorded two substituted
chunks, 83 idle deferrals, no page/engine errors and correct 170,912 source reads.
Its software frame samples were roughly 1.59 FPS OFF and 1.17 FPS at the stalled ON
capture. That evidence is NOT GPU performance certification or a complete native PASS.

QA-only experiment **077e66b38241bba7118dcb587fedc54ced18015e** reduced device pixel
ratio to 0.5 without altering camera/layout or runtime. It FAILED the same gate in
run **35387973969**: one completed chunk, 90 idle deferrals, about 1.18 FPS. Lower
raster resolution did not remove the bottleneck and is NOT the delivered test setup.

Correction **454256e41698c132b91241105c9c24a3494f97e0** uses more of each genuine idle
slot, increasing only R12's operation cap to 256, not its time budget or R4 scheduler.
The browser gate retains its original **1100x700 / DPR 1 / four chunks /120 seconds**.
It also waits for four baseline forest meshes before activation, so lack of baseline
forest cannot be mistaken for a biome failure. Two added pure regression groups
exercise a clock-limited proof, denied idle during proof, the real timer/idle adapter
with zero headroom on timeout, and cancellation before/after idle registration.
All original 18 pure groups remain; local 20-group success is not native completion.
Use the final exact-head Actions/artifact results in PR #14, never these failed runs
or a result from another SHA, to decide whether a user test may be delivered.

## Data, oracle and permanent validation

The separate finite R12 pack contains **12 fine tiles / two pages**, expanding the
Nordschleife footprint without changing the R9/R10 packages. Its deterministic ZIP is
34,004 bytes / SHA-256 `62354936dadd3a6340061665ab4c62e1f77f1e23e427c8940bcc66be18b74451`.
A trusted fixed root is embedded in the explicit launcher. No automatic download,
signed-root distribution, worldwide coverage or changed source polygons is claimed.

An independent original-polygon oracle covers 5x5 chunk neighborhoods at four authored
route vertices, deduplicated to **98 chunks /170,912 candidate positions**. Every
original polygon membership is compared with native Worker results; homogeneous
eligibility must agree. These sampled points all have source region 686, not multiple
biome transitions or current land-cover validation.

Permanent QA: `qa-block8-rendered-pilot-r12.mjs`,
`qa-block8-rendered-pilot-boundary-r12.mjs`,
`qa-block8-rendered-pilot-browser-r12.py`, and
`.github/workflows/qa-block8-rendered-pilot-r12.yml`. The older three candidate
workflows remain mandatory. Their scoped strip-and-compare guard admits only the
two reviewed owner insertions and one new inert port; no broad renderer exclusions
or reduction of canonical integration commands.

Native checks require real source payload loading, proved rendered summer models,
114-triangle winter geometry, identical counts/matrix hashes across immediate season
switches, cancellation/OFF and actual circuit UI lifecycle. The full project must
also build. Upstream imagery/DEM/OSM use controlled failure fixtures, not runtime
stubs. Chromium uses software rendering; observed frame samples are diagnostic only,
not a GPU/FPS/high-speed driving PASS. Inspect actual screenshots before delivery.

## Human test after final exact-head automation

Pull the existing candidate and install ONLY `public/local-data/biomes/pilot-r12/`
from the supplied pack. Retain R9/R10; run `npm run dev`. No Python required.
Choose Nordschleife normally and activate in the console:

```js
await (await import('/local-data/biomes/pilot-r12/start.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Wait for visible broadleaf trees, `modifiedChunks > 0`, `proofsCompleted > 0` and
`error: null`. `phase` may alternate between `preparing` and `ready` while more
chunks are processed. Close DevTools for the driving test. Observe leafy silhouettes,
noticeable geometry swaps/pop-in and fluidity. A few kilometers suffice for first
feedback; this is not another 10 km diagnostic-only Manic test.

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
WorldDriveDiagnostics.forest.visualPilot.season('summer')
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

Winter affects only proved tree models, not the ground, road, weather or grip.
Return the JSON and visual/performance verdict before candidate integration.
Main remains protected; PR #14 remains draft/unmerged; Block 8 remains ACTIVE.

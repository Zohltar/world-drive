# Block 8 R12 — first opt-in rendered biome pilot

2026-09-18. Existing candidate `candidate/block8-biome-classifier-r1`, draft PR #14.
Summer style accepted (5732527872); winter style accepted (5734183717).
This document defines implementation and validation gates; use live exact-head
workflow results in PR #14 for tested SHA/outcomes. No inherited automatic PASS.

## User-visible scope

Nordschleife only. Explicit activation changes the geometry of existing forest
instances to the accepted **temperate broadleaf**, after exact regional proof.
Summer: original approved leafy shape. Winter: approved bare AND snowy branches.
Season switching is manual and local to this pilot; ground, road, water, sky,
weather, lighting, grip and vehicle behavior remain unchanged. No automatic date,
hemisphere or temperature rule. No extra modeling or general variety phase.
The other accepted shapes remain available in the gallery but are not planted by R12.

This first renderer experiment is intentionally one homogeneous model per eligible
chunk. A broadleaf regional class is not proof of every individual real-world species
or current forest cover. Mixing conifers/broadleaf within one chunk, transition bands,
altitude eligibility and global fine coverage remain separate subsequent stages.

## Why geometry-only

R4 already controls every accepted position, slope/road/water/building exclusion,
height, rotation, density bucket, first layer, prefetch and cache lifetime. Rebuilding
those matrices for the first visual pilot would couple a model change to streaming.
R12 instead changes ONLY `InstancedMesh.geometry` on the sole canonical shared forest
mesh, keeping its material, count, instance buffer, manual bounds, transform and
scene-parent membership. It creates no extra per-chunk meshes, no material pass and
no draw call for each changed chunk. Total full-game draw calls still vary with
unrelated world streaming and must be reported as observed, not fabricated constant.

All 1,744 candidate positions in a chunk must individually resolve to the same
reviewed scope before the whole mesh is eligible. This proves even rejected candidates
and is stricter than classifying only rendered instances. There is no centre-point
shortcut. Required source: RESOLVE-ECOREGIONS-2017 / CC-BY-4.0 / archive SHA
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`;
catalog SHA `e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7`;
region **686, Western European broadleaf forests, biome 4, Palearctic**.
The scoped private R3 palette registry selects the generic approved temperate shape,
not a newly identified species. Original production registry/default forest are unchanged.

Missing/corrupt/mixed/unavailable points refuse the entire substitution; the existing
forest stays visible. Proved chunks can therefore appear with original conifers first
and change once ready: the human gate must evaluate how noticeable that is. R12 does
not sacrifice first-layer readiness to block on biome data. Only proof reuse makes
subsequent R4 first-layer/full replacements immediately use the selected geometry.
Stop or route invalidation restores the original geometry before disposing pilot assets.
Foreign geometry owned by another subsystem is never overwritten on stop/reapply.

## Ownership and limits

- `src/app/forest-visual-pilot.js`: inert scene/route capability port and explicit lazy start.
- Two additive insertions in `src/app/biome-diagnostics.js` and
  `src/scenery/scenery-renderer-p933.js`; original code otherwise byte-identical.
- `tools/biomes/rendered-pilot-policy-r12.mjs`: scoped source and incremental proof.
- `tools/biomes/rendered-pilot-r12.mjs`: explicit reversible controller.
- Offline `build-rendered-pilot-r12.py`, using existing clipping/partition builders.

No source-domain Worker/transport/cache implementation, R4 core or budget changes.
OFF has no R12 timers, Worker, fetch or model construction. Start stops the old
diagnostic-only observer to avoid duplicate Workers. A route change/pagehide cancels
pending work and restores owned geometry; restart explicitly after selecting Nord.
The controller retains at most 128 proofs, 128 modified meshes and two route-cache
listeners; snapshot bridge max 16 chunks /4 MiB accounted payload, existing max two
pending snapshot reservations. The Worker retains its existing eight-tile service
limit. Each proof continuation tests at most 64 positions within a 0.8 ms cooperative
budget; one indivisible check may cross the deadline and is measured. No timeout
bypass of idle admission. Polling is delayed by 120 ms and admits two chunk requests.
Counters measure source checks, scene scan, swaps, model counts and memory budgets.
These are not whole-browser/GPU memory or hard real-time guarantees.

Approved six summer/four winter buffers remain byte-identical to c7bb. The seasonal
kit is built once per pilot start; switching does not rebuild it. For the rendered
mesh, summer is 60 triangles and winter 114 versus 68 baseline. No new texture or
transparent snow pass. The unused original model remains available for exact restore.
All relevant validation remains required before a full-game performance claim.

## Data, oracle and permanent validation

The separate finite R12 pack expands the existing Nordschleife source footprint with
one adjacent source tile around the authored route. R9/R10 packages are never edited.
The pack embeds a trusted fixed root in an explicit launcher; no automatic download
or signed-root distribution is claimed. Source/payload hashes, finite tile limits,
reproducible ZIP bytes and separate QA source expectations are retained.
An independent original-polygon oracle covers 5x5 chunk neighborhoods at four authored
route vertices, with duplicates removed. All natural candidate coordinates are tested;
original polygon membership is compared to native Worker results, and homogeneous
model eligibility must agree. This is not current land-cover validation.

Permanent QA: `qa-block8-rendered-pilot-r12.mjs` (pure scene/scheduler doubles),
`qa-block8-rendered-pilot-boundary-r12.mjs` (strict exact runtime seams),
`qa-block8-rendered-pilot-browser-r12.py` (actual Vite/Three/Worker full game), and
`.github/workflows/qa-block8-rendered-pilot-r12.yml`. The older three candidate
workflows remain mandatory. Their blanket runtime guard is replaced with an exact
strip-and-compare guard that admits only reviewed R12 insertions and one new port.
No broad renderer/domain exclusions or reduced canonical integration steps.

Native checks require real source payload loading, proved rendered summer models,
114-triangle winter geometry, identical counts/matrix hashes across immediate season
switches, no additional chunk mesh, cancellation/OFF, and actual circuit UI lifecycle.
The full project must also build. Upstream imagery/DEM/OSM are controlled failure
fixtures, NOT runtime stubs. Chromium uses software rendering; observed frame samples
are diagnostic only, not a GPU/FPS/high-speed driving PASS. Inspect actual screenshots.

## Human test after final exact-head automation

Pull the existing candidate, install ONLY `public/local-data/biomes/pilot-r12/` from
the supplied pack, retain R9/R10, and run `npm run dev`. No Python required.
Choose Nordschleife normally, then in the console:

```js
await (await import('/local-data/biomes/pilot-r12/start.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Wait for `modifiedChunks > 0`, `proofsCompleted > 0`, `phase: ready`, `error: null`.
Close DevTools during the new rendered driving test. Observe leafy silhouettes,
any noticeable geometry swap/pop and fluidity. A few kilometers are enough for a
first feedback checkpoint; this is not another 10 km diagnostic-only Manic test.

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
WorldDriveDiagnostics.forest.visualPilot.season('summer')
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

Winter only affects those proved tree models. A full snowy world is not included.
Return the JSON and visual/performance verdict before any candidate integration.
Main is protected; PR #14 remains draft/unmerged; Block 8 remains ACTIVE.

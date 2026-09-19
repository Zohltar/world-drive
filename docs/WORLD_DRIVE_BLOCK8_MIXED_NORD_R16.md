# Block 8 R16 — first mixed temperate forest presentation

Candidate-only continuation after **R15 HUMAN PASS 5738296675** at 7a002906529a.
Canonical plan and active ledger remain authoritative. Final exact-head outcomes
and measured counts/costs are recorded in live PR #14, not inferred from local tests.

## Purpose and source authority

The four approved tree families have passed their homogeneous driving pilots.
This milestone tests multiple approved families INSIDE a chunk rather than another
single-family route. Use only the approved generic temperate and conifer shapes,
with their existing summer/winter variants. No new species/model is authored.

The default pilot and all R12–R15 launches remain unchanged. R16 is selected only
with **presentation: mixed-r16** on **r12-nord-rendered**. Its public diagnostics
identify **r16-nord-mixed** and retain sourceProfile: r12-nord-rendered. No other
profile admits this presentation. All 1,744 original candidate coordinates must
pass the existing exact source proof for **686 / Western European broadleaf forests
/ biome 4 / Palearctic**. The new mixture is a regional art-family experiment,
NOT a measured stand inventory, species identification or boundary transition.

A fixed 3:1 broadleaf/conifer art weight is sampled from chunk indices and the
existing matrix's horizontal position quantized to millimetres. Selection ignores
height, source ordinal, visible prefix and season. Reordering an equivalent input,
terrain-height refresh, first-layer/full replacement and revisits retain family
identity for each unchanged horizontal placement. The ratio is statistical, not
an exact fraction in every small chunk. No mixed-ecoregion source proof is accepted.

## Renderer ownership and additional cost

Only fully proved chunks receive presentation. The original R4 mesh remains in
its original group; only its visibility is masked while R16 owns two child meshes.
Its geometry, material, instanceMatrix, instance count, bounding sphere and local
transform are not overwritten. The new meshes share the original material, matrix
and conservative bounds. They use the approved seasonal geometry without editing
asset buffers or making new textures/materials.

Each source instance belongs to exactly one compact family buffer. Prefix tables
map ANY R4 visible count (including zero and full capacity) to the same subset of
instances, with no added, dropped or moved tree. R4 road/water/building/blocker
exclusions, density bands, first-layer order, prefetch and scheduling stay authoritative.
R4 height changes are copied only when its instance attribute version advances.
The per-mesh world-matrix traversal hook synchronizes BEFORE WebGL object attribute
uploads, not just onBeforeRender. Stable frames do not recopy/reupload matrices.

Maximum additional rendered pass: one per changed chunk (two instead of one when
both families are nonempty). The hidden original is not an extra visible pass.
At most 128 changed chunks /256 presentation meshes /1,744 original instances per
chunk; packed matrix/index/prefix bytes below 16 MiB overall. This excludes engine
objects and retained original buffers and is not a total GPU/browser ceiling.
Measure construction and refresh costs; do not treat lower triangle counts alone
as proof of better performance. The 3:1 summer combination uses the existing
60/68-triangle shapes, winter the existing 114/180-triangle shapes.

OFF and route invalidation remove/dispose owned presentation meshes and release
the visibility mask before disposing pilot assets. Cache detach/full replacement
uses the existing owner events. Unknown geometry, changed source ownership or an
invalid live prefix falls back to the original forest rather than writing stale
state. No source geometry/material replacement is undone if another owner changed it.
R12–R15 retain their original geometry-only behavior. The strict existing runtime
boundary guard is kept intact; no new src seam or core-streamer edit is authorized.

## Data and launch

No new data ZIP is required. Keep the previously installed R12 directory. Its exact
root is bound by SHA-256 **7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8**.
The launcher bounds the root read to 128 KiB, verifies the digest before API.start,
and cancels pending root reads on stop/pagehide. Missing or changed files do not
interrupt an already working presentation. No worldwide trust/distribution mechanism
is added; all existing Worker, source-page and transport integrity checks remain.

After the published candidate passes all eight exact-head workflows, stop Vite,
fetch/switch/pull candidate/block8-biome-classifier-r1 with --ff-only, restart
npm run dev, hard-refresh the GAME and select Nordschleife. Then:

```js
await (await import('/tools/biomes/mixed-pilot-launcher-r16.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Expect pilot: r16-nord-mixed, error: null, positive modifiedChunks/modifiedInstances
and both preview-temperate and preview-conifer counts in models. The pilot is OFF
unless explicitly started. Source data not yet ready leaves original conifers.

Close the console for a short driven passage, including a fast section. At rest:

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
```

Both tree families should change to their approved winter forms, without planting
new trees or altering the ground/road/grip/weather. Temperate winter remains bare
AND snowy. Inspect mixture, late swaps and fluidity; no new gallery approval needed.
Before stopping:

```js
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

## Required evidence and limits of acceptance

Require deterministic partition and lifecycle tests, actual Three object/attribute
checks, source-polygon/native-Worker agreement and the full Vite game. Keep original
1100x700 CSS/DPR1/four changed chunks/120-second native gate; inspect summer/winter
images, count/matrix identity, repeated seasons, OFF cleanup, route invalidation,
height refresh, first-layer replacement, wrong profiles and bad root inputs.
The native UI jump must retain at least four changed chunks after new controller
polls, not merely a larger cumulative proof count. Parked/jump checks do not certify
a continuous high-speed drive or the user's GPU.

The new human gate concerns mixed presentation and its extra rendering cost only.
Do not reopen the four accepted single-family pilots. Prior PASS, software FPS,
synthetic timing and isolated object tests are not an R16 GPU-performance PASS.
No global activation, biome-dependent thinning, current land-cover mapping, real
altitude/boundary blend, shrubs/rocks, automatic seasons or terrain snow is included.
Main must remain untouched; the PR is not merge-authorized by this milestone.

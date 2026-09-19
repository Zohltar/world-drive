# Block 8 R17 — requested in-game mixed-forest appearance rework

## User request and acceptance

The user supplied a Nordschleife photograph, then clarified: **« je veux que tu
ajuste le look de la foret mixte dans le jeu »**. The preceding generated image
was a concept, NOT a game change or test screenshot. R16 has **no HUMAN PASS**;
its visual checkpoint is superseded by this requested rework, not recorded as accepted.
The request and narrow scope are recorded in PR #14 comment **5739387791**.

The reference guides irregular overlapping broadleaf crowns, less geometric
conifers, natural greens and lower side foliage. It does not provide measured
species composition, tree coordinates or a license to redistribute its image.
No photo pixels are copied into the project. This is a first game-rendered attempt,
not a promise of photographic fidelity. Rain, overcast lighting, terrain and road
materials are NOT silently modified to make the comparison look more convincing.

## Implementation and protected boundary

Explicit launcher **tools/biomes/natural-pilot-launcher-r17.mjs** selects existing
**presentation: mixed-r16** plus **appearance: natural-r17**, on the pinned R12 Nord
source profile only. Diagnostics identify **r17-nord-natural**. R12–R16 reference
launchers are unchanged. Wrong profiles/presentations/appearance names reject before
stopping a working pilot. The existing bounded and SHA-256-verified R12 root reader
is reused. No new data ZIP, remote texture request or dependency is needed.

The new original procedural assets use **250 triangles per broadleaf** and **380
per conifer**, branching trunks, asymmetrically layered foliage cards with softened
normals, and **one shared 256 x 256 RGBA alpha-tested atlas** (262,144 base bytes,
plus mip levels on GPU). Leaves and needles have distinct padded cutouts. Bark uses
an opaque atlas swatch. The material writes depth and is NOT alpha-blended, but
cutout overlap and texture sampling still cost GPU time. No full-photorealism or
zero-performance-loss claim follows from the low triangle count.

The tree family and 3:1 artistic weight remain R16's. Stable instance tint is based
on original horizontal placement, not frame time or season. R17 changes only owned
presentation geometry/material/colors: source instance matrices/counts/material,
geometry/bounds/transforms are untouched. The same two presentation meshes partition
exactly the R4 visible prefix; no extra tree, shrub, relocated trunk or thinned
population. Crown height remains the accepted normalized height and the geometry
fits the tested conservative footprint. Existing road/water/building exclusions,
first-layer order, prefetch, scheduler and CPU budgets remain authoritative.

All 1,744 original candidates must still satisfy the R12 source proof for region
686 / biome 4 / Palearctic. Unknown or incomplete data retains original visible
conifers. Hidden cached routes/foreign source ownership remain protected. No new
src seam or modifications to the approved R11/R11W buffers are required.

**Winter keeps the already approved R16 winter geometry**: bare AND snowy temperate
branches and snowy conifers. Summer foliage tint is replaced with white instance
color in winter, then restored exactly on return to summer. This milestone reauthors
summer appearance, not winter assets, automatic seasons or terrain snow.

Owned color buffers are allocated once per presentation and are not rewritten on
steady frames. Matrix heights synchronize through the original R16 version check.
With 128 chunks x 1,744 instances, accounted matrices/indices/prefix/color buffers
remain below **22 MiB** (not whole-browser or GPU memory). Two visible mesh passes
per qualified mixed chunk remain the limit. One atlas/material and two geometries
are shared across chunks. OFF/route invalidation restores original visibility,
releases presentation buffers, then disposes only the new style's assets separately
from the unchanged approved kit. No source or other owner's material is disposed.

## Evidence gates

Run the new asset/object tests, controller lifecycle tests, original R16 tests,
strict R12 runtime boundary and all maintained single-family regressions. Native
full-game checks retain **1100 x 700 / DPR 1 / four qualified chunks / 120 seconds**,
original source-polygon/Worker parity, winter round trips, UI teleport and cleanup.
Capture the old R16 mixture and new R17 summer at the same camera without changing
lights/weather. Also inspect winter and post-jump images and shader/page errors.

The authoring-runtime capture **35421794804** at a206e835 exports the existing
locked Three runtime and text source for offline unit inspection; it is NOT a new
runtime QA or human acceptance. Its read-only helper workflow is removed after use.
Local WebGL was unavailable; local object tests do not substitute for native game
screenshots. Final exact candidate SHA, all **nine** workflow outcomes, integration
exit codes, artifact hashes and observed costs belong in live PR #14. Do not transfer
a prior commit's PASS or present an image generated by AI as a game capture.

## Test delivery, after the exact-head gates pass

Keep installed **public/local-data/biomes/pilot-r12/** and all other pilot directories.
Fetch/switch/pull candidate/block8-biome-classifier-r1 with --ff-only, restart Vite,
hard-refresh the GAME and select Nordschleife. No Python or new data installation.

```js
await (await import('/tools/biomes/natural-pilot-launcher-r17.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Expect pilot: r17-nord-natural, appearance: natural-r17, error: null, positive
modifiedChunks/modifiedInstances/proofsCompleted and both tree families. After
preparation, close the console and drive a short passage. Evaluate the new foliage,
late changes, transparency/cutout artifacts and fluidity, especially at speed.
Optional brief winter switch checks retained snow forms, not another gallery gate:

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
WorldDriveDiagnostics.forest.visualPilot.season('summer')
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

OFF restores the original conifers. For the earlier mixed art comparison, explicitly
use mixed-pilot-launcher-r16.mjs. Human appearance and GPU fluidity remain OPEN until
the user responds. Do not repeat accepted R12–R15 tests. No PR merge, dev runtime
integration, global activation or main movement is authorized.

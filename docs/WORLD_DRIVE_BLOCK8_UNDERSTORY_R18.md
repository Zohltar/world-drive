# Block 8 R18 — roadside shrubs and ferns for the mixed Nord forest

## Request and acceptance

The user requested low shrubs/ferns along the forest edge to partially hide trunks,
then explicitly authorized execution. Final candidate
**c6fe5e563b9b67fc3bf4c292076f757fe4a73dbe** received **HUMAN PASS** with:
**« pass on garde ca comme ca, je ne vois pas de difference, mais on y reviendra »**.

Interpretation is intentionally narrow: keep R18 as-is and stop iterating now. The
user still does not perceive a meaningful visual difference from the fern-size
changes, so improved fern visibility/trunk screening is **not** claimed. That concern
is deferred for a later art pass. R16 and R17 still have no separate HUMAN PASS.
The four homogeneous R12–R15 tree-family verdicts remain accepted.

## Narrow first implementation

The explicit **understory-pilot-launcher-r18.mjs** selects **understory: edge-r18**
on the existing **mixed-r16 / natural-r17 / r12-nord-rendered** combination.
Diagnostics identify **r18-nord-understory**. Existing R12–R17 launchers are unchanged;
R17 remains available for an actual in-game comparison without the low vegetation.
Wrong modes or missing prerequisites reject before interrupting a valid pilot.

One additional instanced clump layer combines a branching shrub with four small
fern rosettes. Each clump is rooted at the EXACT horizontal position of an existing
accepted R4 tree. No new root candidate grid, offset root, terrain probe or source
seam is introduced. The existing source tree matrices/count/geometry/material,
height refresh, density, first-layer order, road/water/building root exclusions,
prefetch and streaming CPU budgets remain authoritative and unmodified.

The first edge policy is deliberately **road-facing**, not every forest/clearing
boundary: accepted tree anchors **36–76 m from the loaded Nord route polyline**
qualify with deterministic gaps and a sparser outer band. This distance is from the
road centre, not its asphalt edge. It respects the existing 32 m root-clearance
policy rather than planting in its road-terrain ribbon. Maximum clump footprint
radius is **3.1 m**, with small stable rotation/scale variation. The policy is an
artistic roadside band, not mapped ecological edge or measured local undergrowth.
Forest edges around unrelated clearings and actual present-day land cover remain
outside this first pass. Exclusion inheritance is at existing accepted root anchors;
it is not a new full-footprint polygon collision test for every leaf or frond.

Only chunks with the original **1,744-coordinate** full source proof for region
**686 / biome 4 / Palearctic** receive presentation. Missing, unqualified or pending
chunks keep the original forest. No source proof or geographic admission is relaxed.

## Seasonal assets and bounded cost

Summer uses original procedural shrub foliage and pinnate fern cutouts. Winter
uses dormant twigs, flattened brown fern litter and small snow deposits on upper
branches/fronds. The R17 tree appearance and approved R16 winter tree forms remain
unchanged: temperate winter is bare AND snowy; conifers retain snow/needles.
No terrain/road snow, weather, light, grip or physics changes are made.

The combined clump has **336 summer /576 winter triangles**, sharing one additional
256 x 256 RGBA atlas and one material across chunks/seasons. The atlas copies the
procedural R17 data into a new buffer and authors a fern tile in unused space;
R17's own atlas is never changed. No photograph pixels, remote textures or new
package dependencies. Cutouts write depth, alphaTest 0.34, no alpha blending.

A chunk with undergrowth uses at most **one additional visible mesh pass** relative
to R17: two tree-family passes plus one combined shrub/fern pass. There is a hard
1,744-source-instance ceiling per chunk and 128 changed chunks. Only qualifying
anchors allocate clump matrices. Worst-case accounted numeric tree+clump instance
representation is below **48 MiB**, excluding retained original buffers, engine
objects and GPU overhead. Extra texture/fragment/triangle work is not free.

A bounded route-segment spatial index is built only at explicit initialization:
20,000 input points, at most 8,192 cells/131,072 segment references, maximum 2 km
segment and 100 km regional projection extent. These reject rather than expand
without limit. The Nord route is already independently admitted before this work.
Queries happen only while constructing a newly proved chunk's presentation.
There is no new global per-frame loop. Visible-prefix updates are constant-time;
clump matrices copy source heights only when its attribute version advances.
The 0.28 m R4 trunk burial is removed for the clump's ground anchor, without DEM
resampling; small terrain irregularities across a clump's width are not resolved.

## Ownership and cleanup

The low layer is a child of an owned presentation mesh, not an extra R4 source
mesh. It follows the original chunk/group transform exactly. Every clump has one
source index and participates only while that index is in R4's visible prefix.
Equivalent source reorder or full-layer replacement preserves eligibility at an
unchanged horizontal coordinate. Season changes do not move or add roots.

Invalid source ownership/count/xz mutations suppress the low layer and release
the tree visibility mask through the existing mixed owner. Cache detach, OFF and
route invalidation remove/dispose the owned clump instance buffer before its shared
assets are released. They do not dispose source geometry/material or R17 assets.
No new timer, Worker, renderer owner seam or persistent cache is added.

## Verification and delivery gates

Final accepted SHA: **c6fe5e563b9b67fc3bf4c292076f757fe4a73dbe**.

All ten exact-head workflows are PASS:
R1–R9/integration **35474977891**, R10 **35474977921**, R11/W **35474977965**,
R12 **35474977923**, R13 **35474977964**, R14 **35474977960**,
R15 **35474977932**, R16 **35474977928** (retry), R17 **35474977941** and
R18 **35474977901** (retry). The R18 fern-scale regression also checks the actual
fern-tagged Three geometry while preserving the existing clump-footprint cap.

Human result is PASS with a visible-effect caveat: the user elected to keep the
current implementation despite not seeing a meaningful fern-size difference. Do not
reinterpret that as proof of stronger trunk screening. No additional R18 test is
required now.

No new data ZIP is required. Keep **public/local-data/biomes/pilot-r12/**, whose
root SHA-256 remains **7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8**.
The bounded root reader verifies it before touching the active presentation.
After exact-head QA: fetch/switch/pull candidate/block8-biome-classifier-r1,
restart Vite, hard-refresh the GAME, choose Nordschleife and explicitly launch:

```js
await (await import('/tools/biomes/understory-pilot-launcher-r18.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Expect pilot r18-nord-understory, error:null and positive understory.instances.
Drive briefly in summer, then switch at rest to winter. Assess partial trunk
screening, roadside gaps, floating/cutout artifacts and fluidity. Capture before OFF:

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

This human checkpoint is complete for R18. Preserve the accepted candidate and
defer further fern art work. R16/R17 remain without separate HUMAN PASS. No PR merge,
dev runtime integration, worldwide activation or main movement is authorized without
explicit user approval. Block 8 remains ACTIVE candidate work.

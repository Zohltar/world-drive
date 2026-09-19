# World Drive — Block 8 active candidate

Canonical-plan companion. Read the canonical plan from live dev, dev/main HEADs,
exact Dev Integration and live PR #14 before changes. Live verified evidence
supersedes historical reports; candidate QA is not integrated runtime.

## Current priority — R16 art rework requested; R17 in-game natural forest

Branch **candidate/block8-biome-classifier-r1**, PR #14 draft/open/unmerged.
The user supplied a Nordschleife photograph and clarified **« je veux que tu ajuste
le look de la foret mixte dans le jeu »**. This is a request to change game rendering,
not generate another image. PR comment **5739387791** records the revised priority.
**R16 has NOT received a HUMAN PASS.** Its earlier eight automated suites do not
close the visual gate. Do not proceed to another region instead of this rework.

R17 provides an explicit **natural-r17** appearance on the existing mixed Nord
presentation: irregular textured crowns/needle sprays, visible branching and more
natural greens, keeping the exact existing trees. It does not alter lighting,
weather, terrain or road materials to imitate the photo. It is a first visual
attempt, not photographic fidelity or botanical reconstruction.
Detailed scope, bounds, tests and delivery: **WORLD_DRIVE_BLOCK8_NATURAL_FOREST_R17.md**.
Final exact candidate SHA, nine workflow outcomes and measured screenshots/costs
are recorded in live PR #14 after verification, not inferred from publication.

## Accepted references

Four homogeneous tree-family scenarios remain HUMAN PASS:
R12 Nord **5736150662**, R13 Manic **5737262854**, R14 Laguna **5737712460**,
R15 Yungas **5738296675** (user « tout est beau, pass » at 7a002906529a).
No new numeric performance traces accompanied their final verdicts. Do not repeat
them or the accepted R9/R10 data pilots and R11/R11W galleries.
R9 **5729735550**, R10 **5731692833** (telemetry **5731654953**), R11 **5732527872**,
R11W **5734183717** remain accepted. General model variety outside the user's
requested mixed-forest art correction remains deferred.

R16 baseline **6cc498e0084a919dd00e154be9433a7736e99c03** has eight exact-head QA
PASS: R16 **35415382403**, R1–R9/integration **35415382384**, R12 **35415382376**,
R13 **35415382371**, R14 **35415382388**, R15 **35415382382**, R10 **35415382386**,
R11/W **35415382373**. All 97 integration commands exit zero. This is a historical
automated reference only, not an R17 result or R16 human acceptance.

## Narrow implementation boundary

R12–R16 launchers/reference geometry remain available unchanged. R17 requires the
R12 Nord source profile, presentation: mixed-r16 and appearance: natural-r17.
Every changed chunk retains the full 1,744-coordinate source proof for region
686 / biome 4 / Palearctic. No centre-point shortcut, guessed boundary class or
coverage expansion. Unknown/incomplete data preserves original visible conifers.

R4 owns all source positions/matrices/counts/material/geometry/bounds/transforms,
exclusions, first-layer order, density, prefetch, scheduling and CPU budgets.
R17 changes only owned presentation assets and colors. Two presentation meshes
partition the SAME visible prefix; no added/dropped/moved trees or shrub planting.
Stable family identity remains R16's 3:1 ARTISTIC broadleaf/conifer weight, not a
measured local inventory. Height/version updates, source-owner protection, cache
detach/full replacement, OFF and route invalidation retain their prior contracts.

The summer art uses 250/380-triangle broadleaf/conifer geometries and one shared
256 x 256 RGBA cutout atlas/material. Rendering is not free: alpha-tested foliage
adds fragment/texture and triangle work even though mesh passes remain two per
qualified mixed chunk. Additional accounted instance representation is below
22 MiB at the existing 128 x 1,744 cap; this excludes engine/original/GPU overhead.
Winter retains the approved bare-AND-snowy branches and snowy conifers, without
summer tint on the snow. Approved R11/W model buffers and all homogeneous modes
remain unchanged. Strict R12 source/runtime boundary remains enforced.

R17 reuses **public/local-data/biomes/pilot-r12/**, exact directory SHA-256
**7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8**.
No new data ZIP, revision, source/catalog, remote texture or dependency. The bounded
root reader and all existing Worker/transport proofs remain. Preserve old packages.
No calendar, terrain/road snow, weather/grip/physics change, altitude/boundary policy,
biome thinning, global distribution or persistent caching is introduced.

## Branch discipline and exact next action

Before this documentation checkpoint dev is **8dd3d6758f04656c33d9b6a4ca9d4708426f8bd9**,
exact Dev Integration **35414978892 PASS**. Only this ledger and the R17 report
advance on dev. No biome runtime is integrated there. Verify the new docs HEAD's
own exact Dev Integration. Main remains **ad893a9d078df4a3d24d81b929bb2905a8bc57e1**,
V21.33; no merge/release/main movement is authorized.

Finish the requested R17 game look and its targeted tests, then require ALL NINE
exact-head workflows: maintained R1–R9/integration, R10, R11/W, R12, R13, R14, R15,
R16 and new R17. Keep all existing assertions and the native four-chunk/DPR1/
1100x700/120-second gate. Inspect actual game A/B summer images, winter/teleport
images, source-prefix identities and cleanup; don't substitute a generated image.
Fix failures, never relax source proofs or R4 budgets to label a test green.

Once green, deliver only the NEW natural mixed Nord driving test through
**/tools/biomes/natural-pilot-launcher-r17.mjs**, with no additional data download.
Await the user's appearance/performance verdict. Software-rendered CI cannot certify
their GPU or high-speed fluidity. Block 8 stays ACTIVE candidate work, not integrated,
globally activated, DONE/CERTIFIED or merge-authorized.

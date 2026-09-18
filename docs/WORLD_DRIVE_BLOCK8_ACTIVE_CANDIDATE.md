# World Drive — Block 8 active candidate

Companion to the canonical plan. Updated 2026-09-18 (Toronto).
Read the canonical plan on dev, live dev/main HEADs, exact dev Integration and PR #14.

## Current state — R12 rendered pilot verified; NEW human driving gate open

Existing branch `candidate/block8-biome-classifier-r1`, PR #14 draft/unmerged.
R11 summer style/use is accepted (comment **5732527872**); R11W winter style is
accepted (comment **5734183717**, user verdict **« pass excellent! »**).
R9 loaded-circuit and R10 extended-Manic diagnostic hardware gates remain accepted.
Do not repeat the accepted gallery or diagnostic-only tests. General model variety
is deferred. The six summer and four winter shapes are the approved first-pass assets.

The latest request is an actual version to test in driving. R12 now renders the
approved temperate broadleaf on source-qualified **Nordschleife** forest chunks,
with manual summer/winter switching. It starts OFF. Winter means bare AND snowy
tree branches, not winterized terrain, road, weather or grip.
Detailed design, recovery and test procedure: **WORLD_DRIVE_BLOCK8_RENDERED_PILOT_R12.md**.

## Verified implementation reference and evidence

**e975aa7cfb98ad5d74155980377919e272dd791d** has all FOUR exact-head workflows PASS:

- **35390641099** — R12 rendered pilot, full Vite/Three game and native Worker;
- **35390641238** — R1–R9, protected forest R4 and **97/97 canonical integration commands**;
- **35390641096** — R10 real Manic long-road regression;
- **35390641199** — R11/R11W authoring, summer and winter gallery regressions.

The exact e975 integration artifact was downloaded: all 97 exit codes are zero,
requiredFailures=0, toleratedFailures=0. R12 artifact **10565277777**, SHA-256
`da008961224e6e3970cc9e4da353a28ab5f56d47e1621107f9a46a31c11fe950`, was downloaded;
its tested-commit.txt is e975. Actual summer and winter screenshots were inspected.
The report is PASS at the ORIGINAL **1100x700 / DPR 1 / four chunks /120 seconds**.
There are **22 pure contract groups plus one active-route-owner regression**.

The native source oracle resolves **170,912 positions in 98 chunks**, all matching
the original region 686 polygons. In the full game, the first checked summer capture
contains four substituted chunks /2,862 instances. The immediate season identity
comparison covers **eight chunks /5,320 instances**, unchanged counts and matrix
hashes through summer/winter and 20 additional round trips. No page/engine errors;
OFF and route reset stop the pilot and Worker and restore owned geometry.
The UI teleport checks new geographic proof preparation, not complete visible
forest convergence after the teleport. These are distinct assertions.

This is automation in software-rendered Chromium, NOT a human GPU/FPS/high-speed
PASS. Full-game draw calls change as the original forest streams; no constant scene
cost or paired OFF/ON performance certification is inferred. The NEW human gate is
visible tree geometry, seasonal switching, noticeable pop-in and driving fluidity.

## Protected implementation boundary

R12 changes ONLY geometry on existing R4 InstancedMeshes after every one of the
chunk's **1,744 exact candidate coordinates** resolves to the reviewed region:
**686 / Western European broadleaf forests / biome 4 / Palearctic**, with pinned
RESOLVE source/catalog identity. No centre-of-chunk shortcut or new tree placement.
The replacement is the approved generic temperate shape: **60 triangles summer,
114 winter**, versus the original 68-triangle conifer. This is not a claim that every
actual tree near the circuit is deciduous, a current tree-cover map or species identity.

Original instance matrices, density counts, material, manual bounds and exclusions
are unchanged. No extra per-chunk mesh/material pass. R4 first-layer order, prefetch,
budgets and scheduler remain protected. Missing/corrupt/mixed/out-of-scope chunks
retain the original visible forest; every owned substitution is reversible.
Hidden cached routes with the same numeric chunk addresses are NOT eligible:
e975 checks membership in the registered, attached, visible route owner before apply.

Two exact additive seams register the scene and route lifecycle; the single inert
`src/app/forest-visual-pilot.js` port lazily imports the explicit controller. The
source guard removes ONLY the two reviewed insertions and compares the remaining
runtime to c7bb byte-for-byte. No broad renderer exclusion, Worker/domain rewrite,
dependency update, road/terrain/hydro/physics change or global activation.

R12 retains at most 128 proofs, 128 modified meshes and two route-owner listeners;
bridge max 16 snapshots /4 MiB accounted payload, original pending/Worker limits.
Current proof policy allows up to **1,744 reads**, but checks the unchanged **0.8 ms
deadline BEFORE EACH read**. A single read can cross it and is measured. At least
1 ms genuine idle headroom is still required; timeout never bypasses admission.
The old 64/256 operation caps are historical. Identical deeply frozen R6 context
records share one bounded eligibility check; all exact coordinates are still checked.
Mutable records/accessors are not memoized. Polling stays 120 ms/two requests.
No automatic seasons, mixed models per chunk, shrub/rock planting or new modeling.
Real boundary distances and qualified altitude/datum inputs remain prerequisites
for their respective optional policies; synthetic thresholds are not defaults.

## Recovery history — do not restart or present failed references as PASS

R12 already existed at **93b7fb0c1150e1b9645b566c2379edf0ec66efc1**;
**ec6bec9cdf3cda7a380d27af513ec45f32d6258a** preserved the native timeout.
The four-chunk gate failed despite 170,912 correct source reads and two rendered
chunks. The older chat summary naming only c7bb omitted this published work.
**077e66b38241bba7118dcb587fedc54ced18015e**, QA-only DPR 0.5, also failed
(**35387973969**); lower raster density was not a fix and is not the delivered setup.
**454256e41698c132b91241105c9c24a3494f97e0** tried the 256-read cap with the
same deadline. Subsequent immutable-context reuse and finite full-chunk ceiling,
then active-route ownership protection, are included in verified e975.
Earlier failure details remain in the R12 report and ledger at 5a7a8f3.

## Branch discipline and documentation-only follow-up

Before this synchronization dev is **5a7a8f3f8bcfadcc3ce85566e4d52d6f40d50acd**,
canonical Dev Integration **35389265763 PASS**. This follow-up changes only this
ledger and the R12 report on dev/candidate. It does NOT integrate PR #14.
All subsequent documentation/ancestry HEADs need their OWN exact QA: canonical Dev
Integration for dev and all four candidate workflows. Their final SHA/run IDs are
recorded in the live PR checkpoint; never transfer e975's PASS to a newer SHA.
Main remains **ad893a9d078df4a3d24d81b929bb2905a8bc57e1 / v21.33**.
No PR merge, release or main movement is authorized. Block 8 remains ACTIVE, not DONE.

## Accepted hardware evidence and data provenance

R9 loaded circuit PASS: **5729735550**. R10 telemetry: **5731654953**;
R10 **« tres fluide aucune saccade »** verdict: **5731692833**.
Complete Manic JSON: 10,680.923 m, 32 publications, 16 snapshot evictions,
16 resident snapshots /567,808 accounted bytes, three successful tile loads,
no rejection; current plus three forward chunks /6,976 resolved candidates.
The later console at 10,802.930 m is a different capture. Approximate 220 km/h was
user-reported, not a full speed trace. Nonzero cumulative frame counters are not
erased. This does not certify paired OFF/ON delta or all visible forest. The
road-furniture profiling lead is separate, not a blocker or reported regression.

RESOLVE archive SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
R10 pack unchanged: 55,499 bytes /
`560c91b174f9d24b091c03a214fd9bd70fd58fce5702a59565d871f3d56d669b`.
R9 pack unchanged: 30,321 bytes /
`221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
R12 separate pack: **34,004 bytes /12 fine tiles /two pages**, SHA-256
`62354936dadd3a6340061665ab4c62e1f77f1e23e427c8940bcc66be18b74451`.
It never replaces the R9/R10 directories. Historical R1–R11W reports remain available.

## Exact next action

Verify final documentation/ancestry exact-head QA, then deliver the R12 pack and
pull instructions for the same candidate. Ask for the NEW Nordschleife rendered
human checkpoint only: a few kilometers with summer trees, manual winter switch,
visual/pop-in/fluidity feedback and visualPilot/framePacing JSON. No new Manic or
gallery retest. Keep OFF by default, opt-in and unmerged until the verdict.
Afterwards widen coverage/palettes without another general modeling phase.
Worldwide fine distribution, persistent caching and trusted-root retrieval remain later work.

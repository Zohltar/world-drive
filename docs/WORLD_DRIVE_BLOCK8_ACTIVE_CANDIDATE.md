# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-18 (Toronto).
Read the canonical plan on dev, live dev/main HEADs, exact dev Integration and PR #14.

## Current state — R11 summer style accepted; R11W winter gallery

Existing branch `candidate/block8-biome-classifier-r1`; PR #14 remains draft/unmerged.
R9 circuit and R10 Manic diagnostic hardware checkpoints are accepted. Do not repeat
their loading/eviction tests. R11 summer STYLE PASS and permission to use the first
models are recorded in PR comment **5732527872**:
« C'est bien comme premiere passe, tu peux les utiliser, on ajoutera de la variete plus tard ».
Additional variety is deferred. Production planting is still not activated.

**The user then changed the immediate priority to FOUR winter variants in the same
vegetation preview**, and asked to receive a result only when it can be shown:
- conifer: snowy, with its original silhouette;
- temperate broadleaf: explicitly **leafless AND snowy**, not a white leafy crown;
- shrub: dormant/bare, with light snow;
- rock: snow with a small icy/frosted accent.
No tropical or dry-woodland winter variant in this stage. No automatic climate,
calendar, hemisphere or in-game winter system is authorized or implied by the gallery.

R11W implementation remains under `tools/biomes/`. The unchanged summer factory and
its six buffers remain the reference; a seasonal wrapper builds the four additional
models once and switches the isolated preview between summer and winter. Production
registry/placement authority remain inactive. Winter STYLE review is still open;
summer style acceptance must not be requested again.
Detailed scope and commands: **WORLD_DRIVE_BLOCK8_VEGETATION_R11_WINTER.md**.
The R11 report remains the summer-policy/geometry reference, with its style outcome updated.

## Verified baseline and current QA rule

Accepted R11 source: `dbcaa6aa6fe85c85457a3bf37bee23b9e91fc2a5`.
Its exact-head workflows were independently re-read as successful:
- R11 authoring **35361228176**;
- R10 real Manic **35361228124**;
- full R1–R9, forest R4 and 97 maintained integration commands **35361228123**.
Before this docs-only synchronization, dev was
`a4a8bb2a1485f6126caec532f4f25d5a8cec1799`, canonical Dev Integration **35361162996 PASS**.

These are BASELINE results, not results for a new winter SHA. The live PR records
the latest exact candidate SHA and all three workflows. Verify their completion
before delivering winter preview instructions. The expanded R11 workflow retains
all existing guards/tests and adds winter geometry and native Vite/Chromium UI QA.
Every documentation/ancestry advance requires its own exact-head checks.
Dev synchronization at this stage is Markdown-only; it does not integrate PR #14.

## Accepted hardware evidence (do not reopen)

R9 loaded circuit PASS: comment **5729735550**. R10 telemetry: **5731654953**;
explicit R10 verdict **« tres fluide aucune saccade »**: **5731692833**.
Manic complete JSON: 10,680.923 m progress, 32 publications, 16 snapshot evictions,
16 resident snapshots /567,808 accounted bytes, three successful tile loads, no
rejections, fresh current plus three forward chunks /6,976 resolved candidates.
Later pasted console: 10,802.930 m; do not combine it with the earlier JSON as one
snapshot. Initial approximate 220 km/h was user-reported, not a constant speed trace.
The no-perceived-stutter verdict does not erase nonzero cumulative frame counters,
certify a paired OFF/ON delta, additional page/tile turnover or all visible forest.
The road-furniture profiling lead is separate, not a human-reported regression.

## Protected state and provenance

Main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.
No runtime, src, public, server, Electron, Vite, dependency, forest-R4 scheduler,
density, exclusion, route, terrain, hydro or physics change belongs to R11W.
No global model replacement, PR merge, release or in-game winter activation.
The original procedural conifer and summer silhouettes stay byte-identical.
The R3 production registry stays empty. Preserve all Worker/cache limits and the
R9/R10 opt-in diagnostic behavior; OFF starts no biome timer, Worker or tile I/O.

R10 source/data report: WORLD_DRIVE_BLOCK8_BIOME_R10_MANIC_PILOT.md.
Pinned Manic route: 1,497 vertices; 191,203.340 m spherical length, distinct from
OSRM 191,414.1 m. It is not an authoritative replacement for ordinary game routing.
26 fine tiles/two pages; 800 awaited native windows, 667,952 distinct candidates,
5,388,960 reads with no source mismatch/noData/unavailable. All sampled source
positions are ecoregion 373, not a multi-biome or ecological transition test.
RESOLVE source SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
R10 ZIP: 55,499 bytes / `560c91b174f9d24b091c03a214fd9bd70fd58fce5702a59565d871f3d56d669b`.
R9 ZIP: 30,321 bytes / `221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
Both packages remain unchanged. Earlier immutable milestones and evidence remain in
the R1–R11 reports and the ledger at dbcaa6; do not restart completed stages.

## Exact next action — show winter in vegetation preview

After all three current exact-head workflows are green, inspect the actual winter
screenshots, then deliver the same candidate and same preview page with
`?season=winter`. No Python, new biome package or driving retest is needed.
Validate winter style only; do not claim GPU driving performance from this gallery.
After winter review, resume the limited opt-in rendered pilot with the existing
approved shapes, not another general-variety pass. Regional memberships must be
qualified; real boundary distances and datum-qualified regional elevation bands are
still prerequisites to those optional policies. Synthetic R11 altitudes are not defaults.
Global fine distribution, persistent caching and trusted-root retrieval remain later.
Block 8 is active candidate work, NOT DONE/CERTIFIED or merge-authorized.

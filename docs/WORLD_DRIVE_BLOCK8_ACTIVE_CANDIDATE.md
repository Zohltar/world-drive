# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-18 (Toronto).
Read current dev/main HEADs, the exact dev Integration and live PR #14 first.

## Current state — R9/R10 hardware accepted; R11 vegetation authoring

Existing branch `candidate/block8-biome-classifier-r1`, PR #14 draft/unmerged.
**R9 circuit and R10 Manic diagnostic hardware checkpoints have scoped HUMAN PASS.**
R10 verdict: « tres fluide aucune saccade ». Do NOT repeat R9/R10 or extend the drive
merely to prove loading or snapshot eviction. No biome rendering or PR merge is approved.

Human evidence: PR comments 5729735550 (R9), 5731654953 (R10 telemetry),
5731692833 (explicit R10 feel PASS). The complete Manic JSON reports 10,680.923 m;
the separate later console observation reports 10,802.930 m. Earlier approximately
220 km/h is reported for the initial passage, not a constant speed history.
The later JSON demonstrates 32 publications, 16 evictions, 16 resident snapshots /
567,808 accounted bytes; current plus three forward chunks resolve 6,976 candidates,
noData/unavailable zero, no observer or bridge failures, three successful tile loads.
The earlier JSON had 14 publications and zero evictions; these are distinct captures.
User felt no saccade; nonzero cumulative frame counters remain valid, not erased.
No paired OFF/ON benchmark, whole-forest proof or full 191 km hardware drive is claimed.
Extra tile/page turnover was not demonstrated by this hardware extension.
The road-furniture profiling lead stays separate and is not a reported visible regression.

**Accepted R10 candidate:** `82a5d492fd61fb3345aa397dfbe4f75345ed7d7c`.
Exact-head **35347906519 PASS** (Manic) and **35347906708 PASS** (complete R1–R9,
97 integration commands without tolerated failures, protected forest R4).
Last dev before this docs-only checkpoint: `5b540def980888de94f53f32c4f96e63236e0324`,
**Dev Integration 35347852148 PASS**. Any subsequent head needs its OWN checks.
The live PR records current exact candidate checks; do not transfer old green results.

R11 is an **isolated authoring gallery and selection-policy implementation** under
`tools/biomes/vegetation-*`. It adds five original geometric silhouettes alongside
the unchanged 68-triangle conifer, plus bounded transition/elevation policy contracts.
Neither the gallery nor policy is imported by production src. The real production
asset registry stays EMPTY. Prototype productionApproved/placementAuthority are false.
See `WORLD_DRIVE_BLOCK8_VEGETATION_R11.md` on the candidate for API, provenance,
synthetic-test scope, review requirements and gallery instructions. Do not restart
initial classifiers, R4 streaming, the Vite correction or Manic data authoring.

Before offering this gallery for review, inspect all THREE exact-head workflows:
- Block 8 Biome Classifier R1 QA (all prior integration/native/Vite checks);
- Block 8 Real Manic Long Road R10 QA;
- Block 8 Vegetation Authoring R11 QA (policy, geometry, actual Three and browser).
The new R11 workflow protects EVERY runtime path against the accepted R10 SHA.
Authoring tests and gallery do not certify GPU driving performance, current tree
cover, real treeline parameters or biome-boundary distances.

## Protected state and data provenance

`main` stays `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33.
Dev advances for this stage are documentation-only, not PR #14 integration.
Keep forest R4 budgets, density, exclusions, placement authority, geometry, routes,
hydro, physics, Vite/dependencies, Worker/cache limits and R9/R10 packages unchanged.
OFF still starts no biome timer/Worker/I/O. Source agreement is not present tree cover.

The complete R10 authoring/provenance report is `WORLD_DRIVE_BLOCK8_BIOME_R10_MANIC_PILOT.md`.
Pinned real OSRM route: 1,497 vertices; 191,203.340 m spherical length, distinct from
provider 191,414.1 m. Route OSM/ODbL attribution stays separate from RESOLVE CC-BY.
26 fine tiles / two pages. Native awaited replay: 800 windows, 383 unique chunks /
667,952 positions, 5,388,960 exact reads, no source mismatch/noData/unavailable.
750 publications, 734 snapshot evictions, 42 service handoffs; not a timed drive.
All sampled source positions are ecoregion 373, NOT a multi-biome transition trial.

RESOLVE archive SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
R10 installable ZIP unchanged: 55,499 bytes, SHA-256
`560c91b174f9d24b091c03a214fd9bd70fd58fce5702a59565d871f3d56d669b`.
R9 ZIP unchanged: 30,321 bytes, SHA-256
`221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
R10 exact-head artifact 10547807326 and integration artifact 10547688668 were
inspected at delivery. Full earlier restart text remains in the immutable 82a5 ledger.
The historical zero-load R9 report is superseded ONLY for its loading gate by the
actual loaded hardware test; preserve the negative Vite regression and all budgets.

## Verified milestones (immutable historical evidence)

| Milestone | Candidate SHA | Exact-head run | Result |
| --- | --- | --- | --- |
| R1 real source | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 local source polygons | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |
| R4 HTTP/gzip route preparation | 2ca1d6b82bb0585204f2eb5c962bd59827cbf039 | 35260248703 | PASS |
| R4 final docs | 672824cf0afaec7562c3f1aa4d181c269285917f | 35260824227 | PASS |
| R5 batches/native Worker | a3ad99dce5aa1672c84f9f32a1f379b30bebc7c3 | 35263745441 | PASS |
| R5 final ancestry | e563e49c2224437148796b6422031bc572eda4c6 | 35265768818 | PASS |
| R6 exact-point snapshots | 03eed818f42be4dc5e80d9b8d10149bdaebe0fcb | 35268092976 | PASS |
| R6 final docs/ancestry | ab22531111239770208e44eac2657c048395b239 | 35268837896 | PASS |
| R7 forest coordinate adapter | 45787f9afc1fb36c96fcb591ba220670bf163bfc | 35275728861 | PASS |
| R7 final docs/ancestry | 2eccd01df3630ad47a34ad1284dff76fb7f4ea6d | 35276559316 | PASS |
| R8 opt-in lifecycle diagnostics | b075cfe16bd2c3f552ddfbd35c72301db1ebef2f | 35286510364 | PASS |
| R8 final docs/ancestry | c89e094e8120de30664d4211a41aae6b75fd7d31 | 35287102949 | PASS |
| R9 full-game pilot + diagnostic re-anchoring | b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764 | 35290003608 | PASS |
| R9 final documentation/ancestry | 5de485643e00cd5296f1ba36b51f614532b1aca3 | 35290980665 | PASS |
| R9 Vite raw-gzip compatibility | e6ee0e223a814ae250bc8da7ea36d73bdcef920e | 35306551976 | PASS |
| R10 real Manic finite pilot | 7a8e2d642804fffed9e4b2f19997e395c918a7b0 | 35346917930 + 35346917916 | PASS |

## Exact next action — review authoring gallery, then qualified integration

Complete current exact-head R11/native and inherited QA, inspect gallery screenshots,
then offer the isolated gallery for a visual-style verdict. No driving retest is needed
for authoring-only changes. Do not swap these models globally or call them identified
species. Production approval remains false until review and an explicit integration stage.

The policy implementation accepts only referenced regional elevation bands with a
matching vertical datum and reliable altitude. No real regional band is bundled yet.
Its bounded transition rule uses only assets approved for BOTH exact contexts; actual
source-derived boundary distance is not yet supplied by R10. Synthetic test values
are NOT geographic defaults. Missing configuration/evidence stays explicit.

After style review: qualify regional asset memberships and actual elevation/boundary
inputs, then prepare a small opt-in rendered pilot that preserves R4 readiness.
Multiple asset pools may increase draw calls even when every tree is <=68 triangles;
measure this in the full game before human visual/performance certification.
Global distribution, persistent caching and trusted-root retrieval remain later work.
Block 8 remains active candidate feature work, NOT DONE/CERTIFIED. No main movement.

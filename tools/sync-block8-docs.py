from pathlib import Path
import subprocess
p=Path('docs/WORLD_DRIVE_EVOLUTION_AND_CORRECTION_PLAN.md')
assert subprocess.check_output(['git','hash-object',str(p)],text=True).strip()=='14c5380399a0e711484b2a71582cd236256fd610'
s=p.read_text()
def replace(old,new):
    global s
    assert s.count(old)==1, (old,s.count(old))
    s=s.replace(old,new,1)
replace('**Post-release `dev` baseline before this docs checkpoint:**','**Historical post-release `dev` reopening baseline:**')
replace('**Block 8 — Biome-aware natural scenery:** **ACTIVE (2026-09-17) — forest readiness / Issue #12 DONE/CERTIFIED; next phase is biome/ecoregion data-source audit and classifier prototype**','**Block 8 — Biome-aware natural scenery:** **ACTIVE — forest readiness certified on `dev`; biome R1–R3 validated on PR #14, NOT integrated or visually activated. Resume the existing candidate; see the active-candidate checkpoint below.**')
replace('## Block 5A certified checkpoint', '''## Block 8 active-candidate restart checkpoint

**Current candidate ledger:** [WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md](WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md).
Read it together with the live PR #14 and its exact-head QA before any Block 8 change.
The ledger is part of this canonical plan and distinguishes candidate evidence from integrated runtime.

- Existing work branch: `candidate/block8-biome-classifier-r1`, PR #14. Do NOT create a second initial biome prototype.
- Last verified R3 milestone: `5b0fc2c65aa6db9b46a7dce11524c45330091eee`, run `35251431662` PASS. Later work is tracked in the ledger and live PR, not inferred from this historical milestone.
- Integrated runtime baseline before this documentation synchronization: `dev` at `45ab6bc770097239add81eeaca9c4d32de9968a2`, canonical Dev Integration `35230199150` PASS.
- Documentation-only advances on `dev` do NOT integrate PR #14 or activate biome code. Verify the actual current docs HEAD and its own Dev Integration result live.
- Forest R4 scheduler/budgets/full density, road/terrain/hydro/physics and stable `main` remain protected.
- Candidate data-contract/representation PASS is NOT current tree-cover accuracy, global fine coverage, human visual PASS or browser frame-pacing certification.

## Block 5A certified checkpoint''')
replace('**Block 8 remains active by explicit user decision. Preserve the certified Issue #12 R4 forest-readiness baseline and start the biome/ecoregion data-source audit + classifier prototype on a fresh candidate; do not incidentally retune the certified R4 streaming scheduler.**','**Resume the EXISTING Block 8 candidate / PR #14 using `docs/WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md` and live exact-head checks. R1 source audit, R2 bounded local refinement and R3 maintained service/palette contracts already exist; do not restart them. Continue bounded transport/decompression and continuous-route preparation, then the remaining data-distribution, asset, transition/elevation and visual gates. Preserve the certified forest R4 scheduler.**')
replace('- Block 8 biome-aware natural scenery is **ACTIVE**; forest readiness is certified, so proceed with biome/ecoregion classification and palette selection while preserving the R4 scheduler/budgets;','- Block 8 biome-aware natural scenery is **ACTIVE on existing PR #14**; consult the active-candidate ledger for the latest unmerged milestone and exact next action. Biome code has not been visually activated; preserve the forest R4 scheduler/budgets;')
replace('| future biome classifier + forest/scenery asset selection | **PLANNED — Block 8** |','| `src/scenery/biomes/` on candidate PR #14; future visual asset integration | **ACTIVE — candidate validated through R3; not integrated/activated; see active-candidate ledger** |')
replace('**ACTIVE (2026-09-17) — Issue #12 forest readiness is DONE/CERTIFIED; biome/ecoregion classification is now the current workstream.**','**ACTIVE — Issue #12 forest readiness is DONE/CERTIFIED. Biome R1/R2/R3 are validated candidate milestones; current unmerged work and next action are recorded in `WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md`.**')
replace('2. **Data-source audit / prototype — NEXT** — compare practical global biome/ecoregion sources or deterministic classifiers for coordinate lookup, licensing, resolution, offline size and runtime cost.','2. **Data-source audit / prototype — R1/R2 candidate QA PASS** — pinned RESOLVE source, two real regional atlases and bounded source-polygon local refinement. See candidate evidence; this is not global fine-coverage or ecological field certification.')
replace('3. **Biome service contract** — expose a small coordinate/route query returning biome id + confidence/transition information, with caching and a conservative fallback.','3. **Biome service contract — R3 candidate QA PASS** — maintained owner, verified preparation, fixed source identity, stale-route tokens and conservative fallback; no game entrypoint activation.')
replace('4. **Palette registry** — map biome ids to authored natural asset pools and density rules without changing forest streaming scheduling.','4. **Palette registry contract — R3 candidate QA PASS; real assets still pending** — deterministic compatible selection and explicit placement permission; the actual registry remains empty. No density or scheduler retune.')
p.write_text(s)
Path('docs/WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md').write_text('''# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17.

## Current state

Existing branch: `candidate/block8-biome-classifier-r1`. PR #14 is draft and unmerged.
Latest verified milestone: biome R3 `5b0fc2c65aa6db9b46a7dce11524c45330091eee`.
Exact-head run `35251431662`: PASS, both integration-command and real-data jobs.
This record does not claim a later candidate HEAD is green; re-read the live PR and exact-head run.

Protected integrated runtime: `dev` at `45ab6bc770097239add81eeaca9c4d32de9968a2`,
canonical Dev Integration `35230199150` PASS before documentation synchronization.
Documentation-only commits on dev are not a biome merge. Re-read current dev and its exact QA.
Stable main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33; no movement authorized.

## Verified milestones (historical, immutable)

| Milestone | Candidate SHA | Exact-head candidate run | Result |
| --- | --- | --- | --- |
| R1 real-source audit | b657bac9637f4cd9d87fe463bfc22e294fc5a26d | 35237516375 | PASS |
| R2 bounded local refinement | cf78f356f744b5a0722e4b123075f125cb3b54f4 | 35241080423 | PASS |
| R3 maintained service/palettes | 5b0fc2c65aa6db9b46a7dce11524c45330091eee | 35251431662 | PASS |

Candidate R3 executed 97 canonical integration run commands (all zero exit; no tolerated failure),
35 new R3 test groups plus R1/R2 and explicit forest R4 regressions. This is NOT a canonical
dev-head run. Same 6,327 real positions: 4,846 resolved source records and 1,481 retained
source-no-data results. No claim of 6,327 terrestrial or populated points.

Read these files ON THE CANDIDATE until integration:
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R1_AUDIT.md`
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R1_REAL_DATA.md`
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R2_LOCAL_REFINEMENT.md`
- `docs/WORLD_DRIVE_BLOCK8_BIOME_R3_SERVICE_PALETTES.md`

## Exact next action

Continue bounded transport/decompression and continuous-route tile preparation against the
existing verified service and route-token API. Use actual polylines, not a few endpoint samples;
handle missing data, old route completions and memory/concurrency limits explicitly. No I/O,
decoding or preparation in the synchronous biome query or forest R4 frame loop.
The existing 25 refinement tiles are local validation footprints, NOT worldwide distribution.

Then review/register actual assets, establish compatible transitions and local elevation rules,
and request human tropical/boreal/arid-or-alpine validation only after a separate visual candidate
passes targeted readiness/frame-pacing tests. No real asset is registered and no tree has changed.

## Protected distinctions

- Forest R4 (Issue #12) is integrated and HUMAN PASS; biome R4 would be a separate step.
- Biome R1–R3 are candidate-only. They are not certified as a completed visual feature.
- Earlier downloadable local 8-bit prototype is obsolete; do not overwrite the live uint16 code.
- Source agreement is not field ecology/current land cover; all existing placement exclusions win.
- Do not merge PR #14 or advance main merely because automation is green.
''')
assert set(subprocess.check_output(['git','diff','--name-only'],text=True).splitlines())=={str(p)}

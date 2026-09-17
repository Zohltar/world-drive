from pathlib import Path

path = Path('docs/WORLD_DRIVE_EVOLUTION_AND_CORRECTION_PLAN.md')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)

replace_once(
    '**Issue #12:** **ACTIVE — Block 8 R4 progressive first-layer correction after R3 HUMAN FAIL**',
    '**Issue #12:** **DONE/CERTIFIED — HUMAN PASS (2026-09-17) — R4 progressive first-layer forest-readiness correction; runtime/reference `ca1fbb4b7b3448a2f18ae655545046464acba4e3`, post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f`, exact-head Dev Integration `35229697126` PASS**',
    'current checkpoint issue 12'
)
replace_once(
    '**Block 8 — Biome-aware natural scenery:** **ACTIVE (2026-09-16) — R4 progressive first-layer forest-readiness correction before biome classification**',
    '**Block 8 — Biome-aware natural scenery:** **ACTIVE (2026-09-17) — forest readiness / Issue #12 DONE/CERTIFIED; next phase is biome/ecoregion data-source audit and classifier prototype**',
    'current checkpoint block 8'
)
replace_once(
    '**Active correction block:** **Block 8 / Issue #12 — `candidate/block8-forest-readiness-r4`; uniform 64/109 first-layer coverage commits before background densification, with scheduler budgets unchanged**',
    '**Active correction block:** **NONE — Issue #12 R4 is certified; Block 8 continues as feature work with biome/ecoregion classification and palette selection**',
    'current active correction block'
)
replace_once(
    '**Block 8 is active by explicit user decision. Preserve the certified V21.33 baseline and validate the Issue #12 R4 progressive first-layer correction on `candidate/block8-forest-readiness-r4` before adding biome classification or palettes.**',
    '**Block 8 remains active by explicit user decision. Preserve the certified Issue #12 R4 forest-readiness baseline and start the biome/ecoregion data-source audit + classifier prototype on a fresh candidate; do not incidentally retune the certified R4 streaming scheduler.**',
    'exact next action'
)
replace_once(
    '- Issue #12 is **ACTIVE inside Block 8**; R2 proved the bounded route/hydro indexes work but received HUMAN FAIL at 3.5 km because already-covered terrain replacements consumed 36 of 81 completed builds. R3 preserves the budgets and prioritizes missing coverage before replacements;',
    '- Issue #12 is **DONE/CERTIFIED inside Block 8**; R4 received HUMAN PASS on 2026-09-17 with no visible forest cutoff ahead at high speed. Candidate focused run `35180462666` PASS; post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f` passed exact-head Dev Integration `35229697126`;',
    'unresolved issue 12 bullet'
)
replace_once(
    '- Block 8 biome-aware natural scenery is **ACTIVE**; stabilize forest readiness/streaming first, then add biome classification and palette selection;',
    '- Block 8 biome-aware natural scenery is **ACTIVE**; forest readiness is certified, so proceed with biome/ecoregion classification and palette selection while preserving the R4 scheduler/budgets;',
    'unresolved block 8 bullet'
)
replace_once(
    '**NONE — V21.33 is published; Block 11 and Issue #11 are integrated and certified.**\n\nThe accepted Laguna Seca and Nordschleife circuit work, Nordschleife performance correction, fixed-bias no-ABS driving behavior and continuous relief-following guard rails are all present in the certified `dev` checkpoint. Do not begin a deferred roadmap block without a new explicit priority.',
    '**NONE — Issue #12 R4 is integrated and certified; Block 8 continues as planned feature work rather than an active correction.**\n\nThe forest-readiness baseline is now protected. Block 8 may proceed with biome/ecoregion classification and natural-palette selection, but the certified R4 scheduling budgets, coverage-first priority, bounded route/hydro queries and deterministic first-layer behavior must not be retuned incidentally.',
    'roadmap active correction block'
)
replace_once(
    '**ACTIVE (2026-09-16) — Issue #12 R4 progressive first-layer correction is the current runtime/readiness workstream.**',
    '**ACTIVE (2026-09-17) — Issue #12 forest readiness is DONE/CERTIFIED; biome/ecoregion classification is now the current workstream.**',
    'block 8 status'
)
old_paragraph = (
    'Issue #12 was reopened when the user explicitly activated this block. The previous human-FAIL candidates and runtime snapshots remain diagnostic evidence, but none of those candidate runtime changes are accepted as a solution. R1 added job/builder lifecycle evidence and received HUMAN FAIL near 2.4 km. R2 replaced the unbounded route/hydro predicates with exact bounded spatial indexes and improved browser throughput from one to four candidates per slice, but still received HUMAN FAIL at 3.5 km. Its spatial diagnostics showed zero fallbacks and stable indexes; lifecycle evidence instead showed that already-covered terrain replacements consumed 36 of 81 completed builds. R3 preserved the certified budgets and geographic indexes while making missing visible coverage authoritative over replacements and limiting terrain-refresh builder resets to the affected radius; the human retest improved both reach and appearance speed but remained insufficient. R4 keeps those gains and commits a deterministic 64/109-candidate layer across all 16 cells (1,024 evaluations instead of 1,744 before first display), then demotes that chunk so remaining empty coverage stays ahead of densification.'
)
new_paragraph = (
    'Issue #12 is now **DONE/CERTIFIED**. R1 added job/builder lifecycle evidence and received HUMAN FAIL near 2.4 km. R2 replaced the unbounded route/hydro predicates with exact bounded spatial indexes and improved browser throughput, but still received HUMAN FAIL at 3.5 km. R3 preserved the certified budgets and geographic indexes while making missing visible coverage authoritative over replacements and limiting terrain-refresh builder resets to the affected radius; the human retest improved both reach and appearance speed but remained insufficient. R4 kept those gains and added a deterministic 64/109-candidate first layer across all 16 cells: **1,024 evaluations before first display instead of 1,744**, followed by background densification at lower priority than any still-empty coverage. Candidate `candidate/block8-forest-readiness-r4` focused run `35180462666` passed the progressive-layer, spatial parity, lifecycle, frame-budget, prefetch, stress, hydro, integration-audit and production-build matrix. The user gave **HUMAN PASS on 2026-09-17**, reporting no visible forest cutoff ahead at high speed. Runtime/reference head `ca1fbb4b7b3448a2f18ae655545046464acba4e3` was integrated to `dev`; post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f` passed exact-head Dev Integration `35229697126`. GitHub Issue #12 is CLOSED / COMPLETED.'
)
replace_once(old_paragraph, new_paragraph, 'block 8 history paragraph')
replace_once(
    '1. **Issue #12 restart / forest-readiness diagnosis** — reproduce sustained high-speed/long-drive behavior from the current certified `dev`; carry forward the prior human-FAIL snapshots; instrument actual job/builder lifetime, abandonment/restart reasons and prefetch completion; certify a stable readiness baseline before adding biome palette complexity.\n2. **Data-source audit / prototype** — compare practical global biome/ecoregion sources or deterministic classifiers for coordinate lookup, licensing, resolution, offline size and runtime cost.',
    '1. **Issue #12 restart / forest-readiness diagnosis — DONE/CERTIFIED (2026-09-17)** — R4 progressive first-layer scheduling received HUMAN PASS and is now the protected readiness baseline.\n2. **Data-source audit / prototype — NEXT** — compare practical global biome/ecoregion sources or deterministic classifiers for coordinate lookup, licensing, resolution, offline size and runtime cost.',
    'block 8 implementation order'
)

insert_after = '**DONE/CERTIFIED — HUMAN PASS (2026-09-12).** See checkpoint above.\n\n---\n\n# 4. Active and future roadmap'
cert = '''**DONE/CERTIFIED — HUMAN PASS (2026-09-12).** See checkpoint above.

## Issue #12 — sustained-driving forest readiness

**DONE/CERTIFIED — HUMAN PASS (2026-09-17).**

Final human-tested candidate:

```text
candidate/block8-forest-readiness-r4
ca1fbb4b7b3448a2f18ae655545046464acba4e3
```

Certified R4 behavior:

- first visible layer uses 64 of the existing 109 candidates per cell across all 16 cells: 1,024 evaluations before first display versus 1,744 for a fully densified chunk;
- after the first layer, remaining densification is demoted behind every still-empty coverage job;
- R3 coverage-before-replacement priority remains preserved;
- exact bounded route/hydro proximity indexes remain preserved;
- normal scheduler budget remains `.95 ms / 12 candidates` and catch-up remains `1.55 ms / 20 candidates`;
- full 109-candidate density remains unchanged after densification;
- deterministic route/cache, blocker, hydro, road-clearance and terrain-refresh semantics remain protected.

Focused R4 candidate run `35180462666`: **PASS**.  
Human checkpoint: **PASS (2026-09-17)** — no visible forest cutoff ahead at high speed.  
Runtime/reference integrated from `ca1fbb4b7b3448a2f18ae655545046464acba4e3`.  
Post-integration checkpoint `f6e59985a945cc193a7a6eb1066a06dcb120602f`; exact-head Dev Integration `35229697126`: **PASS**.  
GitHub Issue #12: **CLOSED / COMPLETED (2026-09-17)**.

---

# 4. Active and future roadmap'''
replace_once(insert_after, cert, 'issue 12 certified checkpoint insertion')

path.write_text(text, encoding='utf-8')
print('Block 8 R4 certification patch applied')

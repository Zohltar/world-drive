# Block 8 / Issue #12 — Forest readiness R4 certification

Status: **DONE/CERTIFIED — HUMAN PASS (2026-09-17)**

- Candidate: `candidate/block8-forest-readiness-r4`
- Runtime/reference head: `ca1fbb4b7b3448a2f18ae655545046464acba4e3`
- Focused R4 QA: `35180462666` — PASS
- Post-integration checkpoint: `f6e59985a945cc193a7a6eb1066a06dcb120602f`
- Post-integration Dev Integration QA: `35229697126` — PASS
- Human acceptance: no visible forest cutoff ahead at high speed.
- GitHub Issue #12: CLOSED / COMPLETED.

Certified behavior:

- first display uses 64/109 candidates per cell across all 16 cells (1,024 evaluations rather than 1,744 for a fully densified chunk);
- remaining densification yields to still-empty coverage;
- coverage-before-replacement remains preserved;
- bounded route/hydro proximity queries remain preserved;
- normal scheduler remains `.95 ms / 12 candidates` and catch-up remains `1.55 ms / 20 candidates`;
- full forest density remains unchanged after densification.

The canonical next step is the Block 8 biome/ecoregion data-source audit and classifier prototype. Do not retune the certified R4 forest scheduler incidentally.

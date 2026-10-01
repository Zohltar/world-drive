# World Drive — Block 8 active candidate

Canonical-plan companion. Read this file with the live canonical plan on `dev`,
the live PR #14 state and exact-head QA. GitHub live state overrides older chat memory.

## Current status — R24 accepted, pending dev integration

Branch: `candidate/block8-biome-classifier-r1`  
PR: #14 (draft/open until integration)  
Stable main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / `v21.33` — **DO NOT MOVE** without explicit approval.

R24 automatic biome activation received **HUMAN PASS** in the normal game after the
runtime attachment defect was corrected. The accepted behavior is:

- Nordschleife -> R22 Eifel temperate + R18 roadside understory automatically;
- Manic-2 -> Manic-5 -> R21 boreal diversity automatically;
- Laguna Seca -> R19 dry / maritime chaparral automatically;
- Chuspipata -> Yolosa / Yungas -> R20 humid montane automatically, retaining
  R23 density at 150 candidates/cell on source-proved Yungas chunks;
- unknown/unreviewed routes -> unchanged generic R4 presentation.

No DevTools launcher is required for those four reviewed presets.

## Accepted runtime / architecture

R4 is **not replaced**. It remains authoritative for:

- candidate/root placement and deterministic positions;
- road/water/building exclusions;
- terrain anchoring;
- cache, preload and streaming;
- progressive first layer;
- normal slice/frame budgets.

R24 replaces only the generic visual presentation where a reviewed biome profile is
known. Forest scene rebuilds notify the R24 route owner so the accepted presentation
is rebound after world/scenery reconstruction instead of silently falling back to the
generic R4 look.

The stable routing root facade `src/route-lifecycle.js` remains the public boundary.
`src/main.js` explicitly installs the R24 diagnostic/presentation attachment through
that stable facade; the R7 routing architecture contract remains green.

## Bundled accepted data

The exact finite accepted packages are committed in the candidate:

- `public/local-data/biomes/pilot-r12/`
- `public/local-data/biomes/pilot-r13/`
- `public/local-data/biomes/pilot-r14/`
- `public/local-data/biomes/pilot-r15/`

Pinned directory SHA-256 values:

- R12: `7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8`
- R13: `a9cd32f9316c767a6554110c1e795fafef0195fe1ac54c8c84097c42fabe075d`
- R14: `23ece19d72201808d4edb3f904e2dc0ec6dea23f5cdf64f5be341a33ccf73c31`
- R15: `d40509469325de661a5f060d8e9509819fcc625950fe0d90677b8219977f0f6f`

## Evidence

Human-passed runtime checkpoint:
`83eb96563f941423e74c5a0eb6f4a51f938bf769`

Architecture-clean checkpoint:
`60530706196066183050375948c554d34c6665a0`

At `6053070...`:
- 15/15 Block 8 workflows PASS;
- 0 failed / 0 active / 0 queued;
- R1 classifier/integration PASS;
- R20 Yungas native density PASS with two 150/cell meshes;
- R22 Eifel native presentation PASS;
- R17/R18/R19/R21 and historical R12-R16 regressions PASS;
- R24 default activation/build/R4 preservation PASS.

The human FAIL that exposed the original R24 defect showed
`WorldDriveDiagnostics.forest.defaultBiomes === undefined` in the normal game.
The corrected runtime explicitly attaches R24 from `main.js` and preserves the
stable routing facade. The subsequent human retest was PASS.

## Synchronization with dev

The candidate diverged from `dev` only because `dev` had three later documentation
checkpoints for R18. Those commits contain no runtime changes. Their history has now
been merged into the candidate while retaining the newer R24 documentation/runtime.

## Exact next action

1. Run all exact-head Block 8 workflows on the synchronized + documentation checkpoint.
2. Require all 15 workflows PASS.
3. If green, integrate PR #14 into `dev` only.
4. Run exact-head Dev Integration on the new `dev` HEAD.
5. Update the canonical plan with the final integrated `dev` SHA and run ID.
6. Keep `main` untouched until the user explicitly authorizes a release.

No further human visual test is required unless synchronization/integration changes
runtime behavior or a regression appears.

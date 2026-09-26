# World Drive — Block 8 R24 default biome activation

Status: candidate-only; automatic activation implemented; exact-head QA and human
gate required before integration to dev. Main remains untouched.

## Goal

Replace the old generic forest **presentation** on already reviewed routes with the
accepted biome presentation by default. R4 remains authoritative for placement,
road/water/building exclusions, terrain anchoring, streaming, cache, progressive
first layer and all normal frame budgets.

Reviewed automatic mapping:

- Nordschleife -> R22 Eifel temperate + accepted R18 roadside understory;
- Manic-2 -> Manic-5 -> R21 boreal diversity;
- Laguna Seca -> R19 dry / maritime chaparral presentation;
- Chuspipata -> Yolosa / Yungas -> R20 humid montane + R23 density 150/cell.

Unknown or unreviewed routes retain the generic R4 presentation. R24 does not guess
world-wide land cover or invent a new biome model.

## Activation

`src/app/biome-diagnostics.js` starts the accepted presentation asynchronously
after the existing route lifecycle reports success. Route readiness is never blocked
by biome loading. Any missing/invalid data or activation error stops the presentation
and leaves the generic R4 forest visible.

`tools/biomes/default-biome-activation-r24.mjs` is a pure preset admission gate.
The existing visual pilot still performs its full per-chunk source proof before any
tree geometry is replaced.

## Bundled finite data

The exact previously accepted finite R12-R15 packages are now committed under:

- `public/local-data/biomes/pilot-r12/`
- `public/local-data/biomes/pilot-r13/`
- `public/local-data/biomes/pilot-r14/`
- `public/local-data/biomes/pilot-r15/`

Their directory SHA-256 values remain pinned by the existing launchers:

- R12: `7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8`
- R13: `a9cd32f9316c767a6554110c1e795fafef0195fe1ac54c8c84097c42fabe075d`
- R14: `23ece19d72201808d4edb3f904e2dc0ec6dea23f5cdf64f5be341a33ccf73c31`
- R15: `d40509469325de661a5f060d8e9509819fcc625950fe0d90677b8219977f0f6f`

The package bundle was copied from the exact accepted artifacts for candidate
`01b8065736bf9e5f2dc8179180229c4ebeed8794`; the one-shot bundle workflow verified
all four directory hashes before committing.

## Regression contract

R24 must preserve:

- global R4 baseline 109 candidates/cell;
- Yungas R23 dense target 150 candidates/cell only for source-proved Yungas chunks;
- R4 first layer 64 candidates/cell / 1,024 candidates per 4x4 chunk;
- 0.95 ms normal forest slice budget and existing candidate batch caps;
- all accepted R18-R23 art scales, ownership and cleanup behavior;
- generic R4 fallback for unreviewed routes;
- no automatic movement of dev or main.

Human gate: load the normal game with no console launcher and verify that the four
reviewed presets visibly select their accepted forest automatically, with no obvious
route-change leak, pop-in regression or fluidity regression.

# Block 8 R14 — scoped Laguna Seca woodland renderer

Date: 2026-09-18 (Toronto). Candidate **candidate/block8-biome-classifier-r1**,
PR #14; not integrated into dev or main. Final exact-head verification lives in the
PR checkpoint. Read the canonical plan and active ledger before changing scope.

## Accepted predecessor and new intent

R13 HUMAN PASS **5737262854** accepts the snowy-conifer Manic test at
**2d1d46b9372b9dc02f17955f22b96fb7594e0f11**. Green ground was clarified as expected;
CI's pale fallback ground was not snow. R12 Nord PASS **5736150662**, R11 summer
approval **5732527872**, R11W winter approval **5734183717**, and R9/R10 acceptance
remain intact. Do not repeat them or invent a fresh quantitative performance trace.

Use the approved **preview-woodland** tree in the existing Laguna preset. No new
model variety is authored. This is a new rendered human gate after automated QA,
not an automatic declaration that Block 8 is finished or ready to merge.

## Geographic and visual contract

Fixed profile **r14-laguna-woodland** binds revision
**resolve2017-r14-laguna-rendered**, ecoregion **423 / California interior chaparral
and woodlands / biome 12 / Nearctic**, palette **mediterranean-woodland-scrub**,
and approved model **preview-woodland**. Source ID, license and SHA, catalog SHA,
projection/layout/revision and all **1,744 exact candidate coordinates** must agree.
The actual source also contains neighboring region 425 near the sampled footprint;
a single other-region/unavailable candidate prevents a whole-chunk substitution.
No centre-point shortcut, broad realm default, fake ecological boundary or blended
palette is used. Original visible trees remain until a valid proof is available.

The route admission check compares the full committed **206-coordinate Laguna
circuit** and projection origin; a same-length route with the same first point but
an altered interior point is refused. Source file SHA-256:
`822a2c2d387ea300cf9cf066f3c7577f002e021064179b557254fbe39f9007fa`.
The data builder separately verifies these file bytes before preparing its package.

Summer model: **44 triangles**, versus the original 68-triangle conifer. Existing
instance transforms/counts and material are preserved; no new per-chunk mesh or
material pass. This does not certify constant full-scene draw calls or GPU FPS.
**There is no approved winter woodland model.** Both start({season:'winter'}) and
season('winter') reject before tearing down or altering a working summer view.
They never borrow a snowy conifer, invent bare branches or silently present summer
as winter. Nord and Manic retain their approved seasonal behavior.

**Placement and density stay R4's.** The sparse Mediterranean palette metadata is
not yet a sparse-planting implementation. This milestone tests a regional tree
shape, not actual tree-cover density, botanical species or a site reconstruction.
No terrain/road/weather/grip change, automatic season, mixed models within a mesh,
shrub/rock placement or new altitude/boundary policy. Real inputs remain required
for the latter policies; synthetic R11 test thresholds do not become defaults.

## Source, preparation and runtime boundary

Source archive SHA-256:
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Catalog SHA-256:
`e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7`.

The new Python builder uses the unchanged source-index, refinement and partition
builders. **Nine fine tiles /one manifest page**, separate `pilot-r14` directory.
The finite root is embedded in an inert launcher. All preceding packages remain
unchanged; there is no new worldwide distribution or persistent cache mechanism.

Circuit source windows use the existing **3,600/2,600/2,800 m** options in either
travel direction. No R4 visibility/prefetch or CPU budget changes. Manic's corrected
window stays 2,400/700/900 m. Shared proof/model control remains geometry-only with
128 proofs/modified meshes, 16 bridge snapshots/4 MiB accounted payload, two route
owner listeners, 120 ms polling and two chunk requests. The 0.8 ms deadline remains
cooperative and per-read, not a hard maximum; an indivisible read may overrun it.

The strict R12 boundary still compares protected src/public/server/Electron/Vite/
dependencies and approved model buffers. No new src seam, model-buffer edit,
source/Worker-domain rewrite, density/exclusion modification or unrelated cleanup.
OFF has no pilot Worker/timer/data request/model construction; route change and
pagehide stop pending work and restore only owned geometry. Hidden cached routes
and foreign geometry ownership remain protected.

## Validation design and local evidence

- **18 new pure contract groups**: fixed profiles, region/palette/source checks,
  all exact addresses, mixed/unavailable/mutable data, all-coordinate route
  admission, no default activity, geometry-only ownership, winter refusal before
  and after startup, layer replacement, missing-data retry, cancellation/generation
  boundaries, unchanged windows/idle budgets and bounded deterministic stress.
- **Six packaging groups**: manifest/file/source hashes, separate install directory,
  reproducibility, existing-output and symlink refusal, wrong pinned source rejection.
- **412 coverage windows**: every circuit vertex in both directions fits the finite
  package; no capacity/planning fallback. Local transport uses real source bytes.
- Independent original-polygon oracle: **48 chunks /83,712 candidate points**.
  Region counts are **73,998 in 423 and 9,714 in 425**. There are **39 wholly
  eligible chunks, seven mixed chunks and two wholly outside the allowed region**.
  These are source/model eligibility checks, not a rendered transition experiment.

Local package measurement: **39,290 bytes**, SHA-256
`b1d3e5c600571cd38f317dd30c5e8fbab1c54ed8658e038691d8a24414ffd732`.
The delivered package must match its own final Actions artifact; local evidence is
not transferred to a different head or silently treated as a native browser PASS.

Native QA independently runs all 83,712 addresses through a real Chromium Worker
and R6/R7 bridge, including complete proof acceptance/refusal. Then it opens the
actual Vite/Three game, selects Laguna through the normal UI, checks OFF, activates
the profile and requires four substituted chunks within 120 seconds at 1100x700
CSS/DPR1. It records actual model/count/matrix identities, 20 rejected winter
requests, actual screenshots, OFF cleanup and route-reset Worker termination.
UI teleports at 25% and 75% additionally require at least four modified chunks
after two new controller polls, not merely a larger cumulative proof count. This
does not establish complete visible-forest convergence. These are parked/jump
tests, not a continuous driven lap or a high-speed performance result.

All SIX exact-head candidate workflows must finish green: R1–R9/integration, R10,
R11/R11W, R12, R13 and R14. Record the final SHA/runs/artifacts/measured timing and
actual rendered counts in PR #14. Failed evidence must remain distinct. Docs-only
dev changes require their own exact Dev Integration. Do not move main or merge PR.

## Human test after automated gates

Stop Vite, fetch/switch/pull the existing candidate with --ff-only. Copy ONLY
`public/local-data/biomes/pilot-r14/` from the small supplied ZIP into the repository.
Keep R9/R10/R12/R13. Restart `npm run dev`, use its actual port and hard-refresh the
GAME. No Python install. Choose **Laguna Seca** normally, then:

```js
await (await import('/local-data/biomes/pilot-r14/start.mjs')).start()
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Expect `pilot: 'r14-laguna-woodland'`, positive modifiedChunks/modifiedInstances/
proofsCompleted and `error: null`. The new broad, flatter crown replaces only proved
chunks; other areas keep conifers. Close DevTools and drive one lap, including the
fast portion. Assess shape/proportions, late conifer-to-woodland changes and fluidity.
**No winter test is requested for this summer-only model.** Before stopping:

```js
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.stop()
```

OFF restores original conifers. Request the JSON and user's verdict. No repeated
Manic/Nord/gallery acceptance. CI images use controlled upstream services and pale
fallback terrain without real satellite textures/elevation: **not ground snow**.
Only the user's hardware test can supply the new driving/visual acceptance.

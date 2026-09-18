# Block 8 R13 — opt-in boreal rendering on Manic-2 → Manic-5

2026-09-18. Existing candidate `candidate/block8-biome-classifier-r1`, PR #14.
No merge, global activation or movement of main. Final exact-head workflow IDs and
measured results are recorded in the live PR checkpoint, not inherited from R12.

## Accepted predecessor and new scope

R12 rendered Nordschleife HUMAN PASS is recorded in comment **5736150662**.
User: « ok tout est beau, j'ai fait les autres test, tout est pass aucune erreur ou
perte de performance et les arbres changent de look entre summer et winter ».
This is a hardware/visual verdict, not a newly supplied numeric frame trace. The
startup launcher error was followed by a successful retry; do not reopen the R12
or earlier R9/R10/R11/R11W tests. Extra general model variety remains deferred.

R13 adds a SECOND fixed reviewed profile: **r13-manic-boreal**. It uses the approved
**conifer**, with the byte-identical 68-triangle summer shape and 180-triangle snowy
winter shape, on existing forest placements along Manic-2 → Manic-5. Summer should
look like the original R4 forest; the visible new test is the snow-covered conifer.
The prior temperate Nordschleife profile and its launcher remain available.

Winter changes the tree model only. No white terrain, snow-covered road, weather,
calendar/hemisphere rule, physics or grip change. No new tree/shrub/rock planting,
within-chunk species mixture, tropical/desert activation or altitude inference.
All approved model buffers and R4 runtime/budgets stay unchanged. The additional
winter triangles require a NEW rendered hardware test, not a repeat data-only test.

## Source and profile isolation

The Manic profile requires exact RESOLVE source agreement at ALL **1,744 original
candidate coordinates** per chunk: **373 / Eastern Canadian forests / biome 6 /
Nearctic**. The private palette registry admits only the approved generic conifer
for this profile. This is an art-family test, not proof that every actual local tree
is a conifer, species identification or a current forest-cover map.

Config profile IDs are allowlisted. A profile binds the data revision, source/catalog,
regional record and seasonal model. Snapshot revision and proof profile are checked
again before presentation; the Nord region/model cannot leak into the Manic profile.
Unknown profiles, incompatible revisions and invalid seasons are rejected before
an existing working presentation is disturbed.

Route admission for Manic uses the known start/end neighborhood, a 170–230 km length
envelope and a finite regional bounding box. It permits resampling by a live router,
not arbitrary routes or reversed endpoints. This is NOT an exact polyline identity
claim. Every position still requires independent fine-polygon source proof; a route
envelope never supplies classification. The default Nord route gate is unchanged.

R13 reuses the existing reversible geometry-only controller, not a parallel streamer.
Only the two `tools/biomes/rendered-pilot-*.mjs` files change existing behavior. No new
runtime seam is required. Existing meshes keep all instance matrices/counts,
materials, manual bounds, transforms, parent membership and placement exclusions.
Missing/corrupt/incompatible chunks retain the baseline forest, without an empty hole.
A chunk can acquire snow after preparation; this timing is part of the human test.
Route reset/OFF restores owned geometry and terminates pending work; hidden cached
route owners remain protected even when numeric chunk addresses coincide.

The existing 0.8 ms cooperative proof deadline is checked before each read, with a
finite 1,744-read cap; genuine idle admission, 120 ms polling, two requests per poll,
16 snapshot chunks/4 MiB accounted payload and the original Worker limits are kept.
A single indivisible operation can exceed the deadline. No hard real-time, constant
frame cost or whole-browser/GPU memory ceiling is claimed.

## Finite installable package

`build-rendered-manic-r13.py` uses only the Python standard library and accepts the
exact historical R10 ZIP (55,499 bytes), SHA-256:
`560c91b174f9d24b091c03a214fd9bd70fd58fce5702a59565d871f3d56d669b`.
The **26 tile gzip payloads are copied byte-for-byte**. Only revision-bearing pages,
the directory, attribution note and explicit launcher are repackaged. Two pages,
no added geographic coverage and no source-coordinate changes. A trusted finite
root is embedded in the launcher; existing R9/R10/R12 installations are not replaced.

Local reproducible R13 ZIP: **42,342 bytes**, SHA-256:
`1b9bed5cac9dc431c470182c6ec5a1bee35c29ac10ae6f30461b11ee01050bb1`.
Verify the final workflow package matches before delivery. Package size is not GPU
cost. No persistent/worldwide/signed-root distribution is added.

## Validation gates and limitations

New pure QA covers fixed profiles, source/revision isolation, all exact coordinates,
last-point incompatibility, mutable-context nonmemoization, real route/resampling
admission, OFF inertness, reversible scene state, 100 summer/winter round trips,
R4 layer replacement, hidden owners, denied idle time and generation drift.
Separate packaging QA checks exact input, reproducibility, all 26 unchanged gzip
files, revised-page digests, corrupt input rejection and no overwrite.

The R13 workflow rebuilds the pinned R10 input and its independent original-polygon
oracle from the verified source. In a native Worker it compares all distinct R10
candidate chunks and then verifies the new homogeneous-boreal proof. The original
R10 awaited 800-window replay remains an independent regression in its own workflow.

Full-game QA uses real Vite, Three, the actual R4 forest and a native Worker at
1100×700/DPR 1. Only geographic HTTP providers are fixtures; Manic routing uses the
captured real 1,497-point response, not a straight-line route. The four-chunk/120-second
rendered gate, summer/winter count/matrix identity, repeated switching, OFF, actual
UI teleport and route reset must pass. Native screenshots must be inspected.
Software-rendered frame measurements are NOT user GPU/high-speed certification.
A UI teleport is not a continuous 191 km rendered drive or all-forest convergence.

All FIVE exact-head workflows are mandatory: R1–R9/integration, R10, R11/R11W,
R12 and R13. No old PASS transfers to a new candidate SHA. Local pure/package PASS
is not a complete automated or human rendered PASS. The live PR records final results.

## R13 native fixture correction (failed evidence retained)

Initial candidate **59c433cab7e55af8676520c382ed2b6cf00fe54f**, R13 run
**35400496903**, FAILED before the vehicle picker: the test HTTP interceptor used
Python `urlparse`, which moved the semicolon-separated destination to `.params`.
The fixture therefore rejected BOTH real Manic routing URLs and the game correctly
remained at "Trajet indisponible". No R13 in-game Worker/geometry activation occurred.
The independent native source check had passed **383 chunks /667,952 exact points**;
that is not a rendered PASS for this failed run.

The QA-only correction uses a tested `urlsplit`-based finite route matcher, preserves
the real captured response and records matched routing URLs. Nine pure network
regressions cover both actual providers, literal/escaped separators and rejected
routes/values. The original 1,497-point route, four rendered chunks, 120-second gate,
1100x700/DPR1, runtime, data bytes and all earlier assertions remain unchanged.
No synthetic fallback or timeout increase is used. Require the new exact-head
workflows and inspect screenshots; never transfer partial evidence to the correction.

## New human checkpoint after automated PASS

Pull the candidate; install ONLY `public/local-data/biomes/pilot-r13/` from the
small pack. Restart Vite, use its actual port, hard-refresh the GAME (not the gallery).
Select **389 · Manic-2 → Manic-5**. No Python installation needed.

```js
await (await import('/local-data/biomes/pilot-r13/start.mjs')).start({season:'summer'})
WorldDriveDiagnostics.forest.visualPilot.snapshot()
```

Confirm `pilot: 'r13-manic-boreal'`, positive `modifiedChunks`, `modifiedInstances`
and `proofsCompleted`, and `error: null`. Summer preserves the R4 conifer look.

```js
WorldDriveDiagnostics.forest.visualPilot.season('winter')
```

Close DevTools and drive a few kilometers, including high speed. Check snowy
silhouettes, late changes and fluidity, rather than repeating the 10 km diagnostic
cache test. Capture before OFF:

```js
copy(JSON.stringify({visualPilot:WorldDriveDiagnostics.forest.visualPilot.snapshot(),framePacing:WorldDriveFramePacing()},null,2))
WorldDriveDiagnostics.forest.visualPilot.season('summer')
WorldDriveDiagnostics.forest.visualPilot.stop()
```

New R13 visual/performance HUMAN gate is OPEN. R12 remains accepted. After the R13
gate, widen the reviewed regional profiles (e.g. the approved dry-woodland model)
without a new general modeling phase. Keep main untouched and PR #14 unmerged.

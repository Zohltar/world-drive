# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-17 (Toronto).
Current restart ledger; R1–R8 detailed reports remain historical/API references.

## Current state

Existing branch `candidate/block8-biome-classifier-r1`, draft/unmerged PR #14.
Latest verified implementation: **R9 finite pilot and full production-game diagnostics**,
`b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764`, exact-head run **35290003608 PASS**.
Both integration and real-data/native/full-game jobs completed successfully.
Later documentation/ancestry checkpoints require their OWN exact-head QA. Read the
live candidate HEAD and PR before work; never transfer this PASS to another SHA.
Do not restart the importer, classifier, transport, batching, Worker, snapshots,
forest candidate adapter, lifecycle observer or pilot packager.

Integrated gameplay remains the forest-R4-certified runtime from
`45ab6bc770097239add81eeaca9c4d32de9968a2` (Dev Integration 35230199150 PASS).
Before this ledger update, dev was `84e22d4ccaa01bfa52f06f811d5992add9849664`,
canonical Dev Integration **35287039848 PASS**. This ledger-only update DOES NOT
integrate R8/R9 runtime or tests into dev. Earlier dev changes remain documentation
and the strict C6 inventory QA correction. Read current dev and its own QA live.
Stable main remains `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.
No merge, main movement, visual activation or performance certification authorized.

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
| R9 full-game pilot + corrected diagnostic re-anchoring | b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764 | 35290003608 | PASS |

## R9 pilot and full-game boundary

The standard-library Python packager verifies the exact eight-file R8 pilot whitelist,
including lengths/SHA-256, attribution and catalog. Missing, extra, corrupt or
symlinked inputs fail before output; an existing destination is never overwritten.
Source polygons and gzip bytes are copied unchanged. No network or new dependency.
A reproducible ZIP installs `public/local-data/biomes/pilot-r9/` and an explicit-only
launcher. Importing the launcher does not start the observer. Trusted packaged
input is NOT authenticated worldwide-root retrieval or a global coverage claim.

The THREE production game now runs in Chromium through its real dist/index.html,
with actual game services, native Workers and existing preset/jump UI handlers.
No internal routing/physics/rendering service is stubbed. The test deliberately
controls external responses: a short SYNTHETIC default route boots the chooser,
then the original Laguna Seca and Nordschleife presets are selected. External
imagery/DEM/OSM receive HTTP 503, exercising unchanged fallback code. This is NOT
real-terrain visual validation or a real Manic-route test.

The new test records parked OFF / activation / ON / OFF windows, then UI jumps to
25%/75%, current/forward geography, receipt cost, cache bounds and Worker termination.
Default OFF makes no biome data request or Worker; stop causes no renewed I/O.
Page errors AND caught Frame/Startup/Vehicle-start/Audio-frame errors fail the test.
Its own rAF sampling is canceled on completion/deadline, with no leaked sample loop.

## Diagnostic defect discovered and corrected

Initial run `35288897447` at `215bbc344d74865c2a7295c96f5d13d5d9a42ad6` passed
its original assertions. Report review found a weaker-than-needed progress check:
after Laguna's 25% jump, current geography was fresh but observer progress was
331.682 m instead of about 900.201 m, 355.287 m from its stale hinted segment.
The actual vehicle was on the correct authored track. That old PASS describes only
its original gates, not the stronger R9 contract.

Diagnostic-only correction `5fe9da3ddf79abbaff2a94b7d53f13f0d8459bcf` trusts the
segment hint only below 120 m of motion, and re-anchors when the local segment is
more than 20 m away. The independent 960 m Worker-reset threshold, 65-segment local
window and 20,000-point route limit remain. Full scans occur outside the frame loop,
not under a hard millisecond guarantee. Actual routing, car placement and forest
R4 are unchanged. Original failing coordinates remain in permanent regression QA.

## Verified R9 evidence (implementation b8dd4f3e464f)

- **10 packaging/launcher groups PASS**: reproducible ZIP, source-byte preservation,
  negative inputs/no overwrite, inert import and explicit start/stop/error handling.
- **4 permanent re-anchoring groups PASS**: recorded Laguna defect, original circuit
  forward/reverse jumps, densely sampled short jumps and preserved local/direction/
  teleport behavior. The original implementation fails the same recorded fixture.
- **97 maintained canonical integration commands exit zero**, requiredFailures=0,
  toleratedFailures=0. Candidate matrix, NOT the separate canonical dev-head run.
  All earlier R1–R8 and explicit certified forest R4 regressions remain green.
- Chromium **143.0.7499.4**, complete production game, WebGL2 **SwiftShader**, 960x540.
  Two original circuit presets (206 / 1,068 vertices) render successfully; no page
  errors and no caught engine errors. Every observer-owned Worker terminates on stop.
- Current and requested forward chunks at the retained jump observations each
  resolve 1,744 candidates with zero unavailable/no-data. This samples at most four
  chunks; it does NOT prove the full visible forest or entire route corridor ready.

| Real UI jump | Expected spherical progress | Observed progress | Distance from route |
| --- | ---: | ---: | ---: |
| Laguna 25% | 900.214 m | 900.201 m | <0.001 m |
| Laguna 75% | 2,700.643 m | 2,700.662 m | <0.001 m |
| Nordschleife 25% | 5,186.540 m | 5,187.578 m | 0.040 m |
| Nordschleife 75% | 15,559.621 m | 15,559.065 m | 0.023 m |

The gate requires <25 m progress disagreement and <20 m distance after each jump;
metric differences and minor vehicle drift are not confused with stale segments.
Peak retained/accounted payload: Laguna five chunks / 177,440 bytes, Nordschleife
four / 141,952 bytes. Maximum measured receipt validation/copy cost was 1.3 ms and
0.4 ms respectively. Separate service/transport/message/native costs still apply.

**No hardware FPS or absence-of-regression claim:** software rendering produced
parked p50 frame times roughly 633–833 ms, only 7–10 frames per sampled window.
These noisy, low-FPS observations do not establish 60/144 FPS or high-speed readiness.
The user-hardware diagnostic checkpoint remains open; no visual HUMAN PASS exists.

Exact artifacts: `biome-r9-fullgame-b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764`
(10525788729), `biome-r1-integration-b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764`
(10526042398), and exact-head code (10525604055). ZIP digests and raw reports were
checked; all 74 code-artifact files match locally tested bytes. Local tests use
emulated clients/schedulers where noted; native/full-game proof is from Actions.

Installable pilot: **30,321 bytes**, SHA-256
`221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
Its three fine-data tiles are limited to regions around the two circuits, NOT
Manic-2 → Manic-5 or worldwide coverage. Older experiment evidence stays historical.

## Protected R8 and source foundations

The public route facade delegates to unchanged actual routing. The opt-in observer
uses the existing `WorldDriveDiagnostics.forest.biomes` registry, not a new global.
Default OFF has no observer timer/Worker/I/O/route scan. Route/reset/origin/pagehide
invalidation, stale-response rejection and finite idle admission remain protected.
One poll admits current plus at most three forward chunks; no poll queue. Worker
prepares source data and coordinates; prepared synchronous reads never start I/O.
Bridge default is 16 chunks / 4 MiB accounted payload, with separate R5/R6 budgets.
No planting, elevation or transition authority; the actual asset registry is EMPTY.

Pinned source SHA-256 remains
`be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Earlier 6,327 real controls (4,846 source records / 1,481 explicit no-data), original
Baffin and 201-point Yungas transect stay intact. R7's 62,784 raw-coordinate/traversal
comparisons and 1,024-slot first layer remain. Source agreement is not present-day
vegetation or field ecology. Forest scheduler, density, exclusions and main are frozen.

## Exact next action — human diagnostic hardware checkpoint

Deliver the finite pilot with the final exact-head-green candidate. On the user's
machine compare a circuit with the observer OFF (default), explicitly ON, then OFF
again. Record biome readiness and existing frame pacing; keep viewport/settings
comparable and close DevTools while driving. No different trees are expected.
Copy only the pilot ZIP's public/ subtree into the candidate checkout before normal
`npm run dev` or before a production build. Choose Laguna Seca or Nordschleife.

```js
await (await import('/local-data/biomes/pilot-r9/start.mjs')).start()
WorldDriveDiagnostics.forest.biomes.snapshot()
WorldDriveFramePacing()
// Capture diagnostics before stopping; stop terminates observer work:
WorldDriveDiagnostics.forest.biomes.stop()
```

Do not require the user to install Python or run geospatial preprocessing for this
pilot. Missing fine coverage is explicit and does not alter the existing forest.
After this hardware checkpoint, broaden fine coverage to a REAL long road before
claiming sustained high-speed biome readiness. Compatible reviewed assets, ecological
transitions/local elevation policy, persistent caching and global-root distribution
remain open. No renderer/palette activation or biome merge is authorized yet.

Read candidate `WORLD_DRIVE_BLOCK8_BIOME_R9_FULL_GAME_PILOT.md`, then R8 and earlier
reports. The canonical plan delegates current state here; this ledger is synchronized
on dev/candidate. Forest R4 / Issue #12 stays integrated/HUMAN PASS; biome R1–R9 is
candidate work only. Do not merge PR #14 or move main solely because QA is green.

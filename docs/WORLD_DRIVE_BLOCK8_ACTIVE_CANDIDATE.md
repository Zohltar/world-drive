# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-18 (Toronto).
Current restart ledger; earlier detailed reports remain historical/API references.

## Current state — R9 Vite compatibility correction

Existing branch `candidate/block8-biome-classifier-r1`, draft/unmerged PR #14.
**Active correction: raw-gzip transport under Vite after the first hardware report.**
Do not restart R1–R9 or proceed to palettes on the user's latest `pass` alone.
Read live candidate HEAD, PR and its own complete exact-head QA before delivery.

User verdict: `pass` for perceived fluidity. The accompanying telemetry nevertheless
shows missing-coverage / window-not-ready, captures 0, published 0, transport
started 10 / rejected 10 / loaded 0 and compressed/decoded bytes 0. A manifest page
was verified. Retain a responsiveness HUMAN PASS for this unready path, NOT a loaded
biome hardware PASS, completed R9 certification or permission to merge/activate.
The capture reports 143.998 FPS, 6 cumulative gameplay hitches and maxFrame 83.3 ms;
there is no matching OFF/ON measurement of a successfully prepared workload.

Last fully verified candidate BEFORE this correction:
`5de485643e00cd5296f1ba36b51f614532b1aca3`, exact-head **35290980665 PASS**.
R9 implementation `b8dd4f3e464f9b66b0dce498ca26c3a60c0cd764` separately passed
35290003608. Those static-server/full-game results remain valid for their original
assertions; they did not cover the Vite gzip-serving incompatibility.

Before this docs checkpoint, dev was `3ceac5ceb30e524d61bfe4e11aad07c771c4b2f3`,
canonical **Dev Integration 35290913521 PASS**. Only this Markdown ledger advances
on dev for the current correction. No biome runtime, Vite fix or new QA is integrated.
Verify the resulting dev HEAD and its own canonical QA live, not by this old PASS.
Gameplay remains the forest-R4-certified runtime from `45ab6bc770097239add81eeaca9c4d32de9968a2`,
with earlier documentation and strict C6 inventory QA changes only.
Stable main: `ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.

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
| R9 final documentation/ancestry | 5de485643e00cd5296f1ba36b51f614532b1aca3 | 35290980665 | PASS |

## Current correction and regression gates

Vite uses sirv, which labels direct .gz responses with HTTP Content-Encoding: gzip.
The bounded Worker deliberately rejects non-identity encoding before reading the
body, instead of risking double decompression or relaxing compressed-byte limits.
Earlier full-game QA used a Python static server without that header.

`tools/biomes/vite-raw-gzip.mjs`, registered in vite.config.js, sets identity /
application/octet-stream ONLY on GET/HEAD biome tile requests. It leaves file
access, paths, length, status and streaming to Vite. No build hooks or client imports;
no changes to source tiles, existing public pilot, dependencies, runtime or budgets.
Other namespaces, scripts and ordinary JSON retain their existing behavior.

New permanent header regression: 44 scoped requests across dev/preview hooks.
Native regression uses the actual Vite config and installed lockfile version:
a control removes ONLY the new plugin and must reproduce rejection; fixed dev must
publish four chunks / 6,976 exact reads, including the reported Nordschleife origin,
progress and current chunk. Preview checks all three exact raw gzip payloads.
The browser uses the real dedicated Worker; main-page gzip/digest/tile I/O is trapped.
This is a transport/Worker test, not hardware FPS or full-game evidence. The existing
separate full-game R9, original source gates, forest R4 and all 97 maintained
integration commands must also pass on the current exact SHA. Check live results.

Current detailed report on candidate: `WORLD_DRIVE_BLOCK8_BIOME_R9_VITE_TRANSPORT.md`.
R9 full-game history: `WORLD_DRIVE_BLOCK8_BIOME_R9_FULL_GAME_PILOT.md`.

## Protected boundaries

Diagnostic-only and disabled by default: no observer timer/Worker/I/O until explicit
start. Existing route/reset/origin/pagehide invalidation, stale-result rejection,
finite admission and synchronous prepared reads remain. Current plus at most three
forward diagnostic chunks is NOT the complete visible forest or route corridor.
Bridge: 16 chunks / 4 MiB accounted resident payload, with separate transport/RPC
budgets; these are not total-heap or frame-time guarantees. No planting authority.
The actual palette asset registry remains EMPTY; no rendering activation is allowed.

Source SHA-256 `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Original 6,327 controls (4,846 records / 1,481 explicit no-data), Baffin/Yungas,
62,784 forest-coordinate/traversal comparisons and the 1,024-slot first layer stay
protected. Geographic-source agreement is not current ecological field truth.

The installed three-tile R9 ZIP is unchanged: 30,321 bytes, SHA-256
`221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
It covers finite zones around Laguna Seca/Nordschleife, NOT Manic or worldwide.
R9 full-game software-rendering measurements (SwiftShader, few frames/window) do
not certify hardware FPS, absence of regression or continuous high-speed readiness.

## Exact next action — successful-load hardware retest

After complete exact-head QA, pull the same candidate, STOP and RESTART Vite, and
keep the existing public/local-data/biomes/pilot-r9 files. No Python preprocessing
or replacement archive is needed. Explicitly start on Nordschleife/Laguna as before.
First confirm transport.loaded > 0, captures > 0, bridge.published > 0 and a fresh
current chunk while stationary inside the pilot; then repeat comparable OFF/ON/OFF
hardware driving and save the biome/frame snapshots BEFORE stop.

```js
await (await import('/local-data/biomes/pilot-r9/start.mjs')).start()
WorldDriveDiagnostics.forest.biomes.snapshot()
WorldDriveFramePacing()
WorldDriveDiagnostics.forest.biomes.stop()
```

The human responsiveness PASS remains recorded; the loaded-biome hardware gate is
OPEN. Only after that gate, expand fine coverage to a REAL long-road pilot. Global
publication, persistent caching, authenticated root retrieval, reviewed compatible
assets and ecological transitions/elevation policy remain open. Do not merge PR #14,
activate palettes or move main merely because tests are green. Forest R4 / Issue #12
remains integrated/HUMAN PASS; biome R1–R9 remains candidate diagnostic work.

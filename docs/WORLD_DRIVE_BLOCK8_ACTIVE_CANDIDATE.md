# World Drive — Block 8 active candidate

Companion to the canonical evolution/correction plan. Updated 2026-09-18 (Toronto).
Current restart ledger; earlier detailed reports remain historical/API references.

## Current state — loaded R9 hardware checkpoint accepted; R10 long-road preparation

Existing branch `candidate/block8-biome-classifier-r1`, draft/unmerged PR #14.
**The finite, successfully loaded R9 diagnostic pilot has a scoped HUMAN PASS.**
The user's latest verdict is: « personnellement tout avait l'air ok ».
PR comment 5729735550 records the evidence and supersedes the earlier retest request.
Do NOT ask for the same successful-load circuit test again because the first report
had zero publications. Do not restart the importer, classifier, transport, Worker,
snapshots, forest coordinate adapter, observer or Vite fix.

Latest independently verified implementation:
`e6ee0e223a814ae250bc8da7ea36d73bdcef920e`, exact-head **35306551976 PASS**,
both complete jobs including real Vite/native Worker, separate full-game checks,
97 canonical integration commands and protected forest R4 regressions.
Later commits need their OWN exact-head QA; inspect live candidate HEAD and PR.

Before this documentation checkpoint, dev was
`bd268e40fb64d7dc075a752a44ca647b9c407644`, canonical
**Dev Integration 35306587004 PASS**. This update changes only this Markdown ledger.
No biome runtime, Vite fix or new candidate QA is integrated into dev.
Read the resulting dev HEAD and its own canonical QA live.
Gameplay remains the forest-R4-certified runtime from
`45ab6bc770097239add81eeaca9c4d32de9968a2`, with documentation and the earlier
strict C6 inventory QA correction. Stable main remains
`ad893a9d078df4a3d24d81b929bb2905a8bc57e1` / v21.33, untouched.
No PR merge, palette activation or main movement is authorized by this checkpoint.

## Accepted human evidence and limits

The three latest attached files contain the SAME parsed JSON: one ON-state
observation, not three independent runs or an instrumented OFF/ON/OFF series.

- `enabled:true`, `diagnosticOnly:true`, `phase:observed`, `error:null`,
  `freshCurrentChunk:true`, `last.windowStatus:ready`.
- Transport: started 1, **loaded 1, rejected 0**, aborted 0; 311 compressed bytes,
  2,453 decoded bytes. One source tile can serve several forest diagnostic chunks.
- **11 captures, 5 published snapshots**, 6 cache hits; observer failures/discarded
  and bridge rejected/discarded all zero.
- Current chunk (-1,-1), forward (-2,0), forward (-3,-1): each resolves 1,744
  candidates, noData=0 and unavailable=0: **5,232 resolved candidates in this window**.
- Peak accounted resident payload: five chunks /177,440 bytes; no pending chunks
  or snapshot reservation at capture. This is not total browser heap usage.
- Max measured observation 0.4 ms, planning 1.5 ms, receipt validation/copy 0.7 ms.
  The 48.4 ms round trip is asynchronous elapsed time, NOT a main-thread stall.
- Reported instantaneous FPS 143.9253; 1,068-point circuit/projection identifies
  the previously examined Nordschleife context. Retained progress 243.638 m does
  not establish total distance driven or speed. No client commit/GPU is recorded.

Accept hardware/feel for this finite, actually loaded pilot and tested scenario.
This is NOT Block 8 DONE/CERTIFIED, visual-biome acceptance, worldwide coverage,
long-road/high-speed readiness, or merge permission. The 26 cumulative gameplay
hitches, maxFrame 229.2 ms and 10,547 gameplay frames (10 >50 ms, 2 >100 ms) remain
in the evidence. Without paired/reset intervals they cannot be attributed to the
observer or compared causally with the earlier report's six hitches.
Evidence: PR #14 comment 5729735550. First two files SHA-256
`df766fe387574bd11fe227fea97850bb8c760e1cb731814deeba0984f26efcee`;
third `80d080c6776e7ae0df8d80f0de02938b77009e17c29ebadbc0b4f65e08e9a77c`.

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

## Historical first hardware report and resolved Vite defect

The first verdict `pass` described responsiveness, but its capture had
missing-coverage/window-not-ready, captures=0, published=0, transport started=10,
rejected=10, loaded=0, compressed/decoded bytes=0, and one verified manifest page.
It reported 143.998 FPS, six cumulative hitches and maxFrame 83.3 ms. That earlier
capture did not exercise a successfully prepared workload. Preserve it as history;
the later successful-load capture above resolves that limitation for the finite pilot.

Vite/sirv labeled direct .gz responses `Content-Encoding:gzip`. The strict Worker
rejected non-identity HTTP encoding before body reads. Earlier full-game CI served
dist with Python HTTP and missed npm run dev's headers. The scoped helper
`tools/biomes/vite-raw-gzip.mjs` sets identity/application/octet-stream ONLY on
GET/HEAD biome tile requests in Vite dev/preview, leaving file access, paths,
length, status and streaming to Vite. No relaxed integrity/decompression budgets.

Permanent checks: 44 scoped header requests; actual locked Vite 7.3.6 with native
Chromium control removing ONLY the helper reproduces rejection, while corrected
dev publishes four snapshots and resolves 6,976 candidates with zero rejected loads.
Preview/dev preserve all three original gzip payloads exactly. Separate full-game
R9, all earlier source/Worker gates and 97 integration commands also pass at e6ee.
Detailed reports: `WORLD_DRIVE_BLOCK8_BIOME_R9_VITE_TRANSPORT.md` and
`WORLD_DRIVE_BLOCK8_BIOME_R9_FULL_GAME_PILOT.md` on the candidate.

## Protected boundaries

Diagnostic-only and disabled by default: no observer timer/Worker/I/O until explicit
start. Existing route/reset/origin/pagehide invalidation, stale-result rejection,
finite admission and synchronous prepared reads remain. Current plus at most three
forward diagnostic chunks is NOT the complete visible forest or route corridor.
Bridge: 16 chunks /4 MiB accounted residency, with separate transport/RPC budgets;
these are not total-heap or frame-time guarantees. No planting authority.
Actual palette asset registry stays EMPTY. Forest R4 scheduler/density/exclusions,
road/terrain/hydro/physics, ordinary startup route selection and main remain protected.

Source SHA-256 `be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60`.
Original 6,327 controls (4,846 records /1,481 explicit no-data), Baffin/Yungas,
62,784 forest-coordinate/traversal comparisons and the 1,024-slot first layer stay
protected. Geographic-source agreement is not present-day ecological field truth.
The installed three-tile R9 ZIP remains 30,321 bytes, SHA-256
`221689248d420b1fb1971723d951151e47d9a2d17202f925cf0c0e7796c4cf07`.
It covers finite circuit zones, NOT Manic or worldwide. Do not reinstall it for
this documentation update. SwiftShader QA is not a hardware FPS certificate.

## Exact next action — R10 real long-road pilot

Prepare finite fine-data coverage for the actual Manic-2 -> Manic-5 road using
existing preset endpoints and real routed geometry with recorded provenance and
hashes. Never substitute a straight or synthetic polyline while calling it real.
Reuse the existing source-coordinate refinement, fixed-size batch manifests,
Worker and exact forest adapter; keep build-time geospatial work out of gameplay.
Cover continuous route segments and their bounded corridor, then compare prepared
candidate results with the original source polygons and exercise successive windows,
cache eviction, page changes and missing-data boundaries. Do not infer sustained
high-speed readiness from awaited or accelerated replay; distinguish those results
from real-time driving. Keep source/data and runtime QA tied to their exact commits.

The accepted circuit hardware checkpoint is complete for its stated scope. The next
human request, once appropriate automated gates pass, must add long-road coverage,
not repeat the already accepted circuit test. No Python preprocessing is required
on the user's PC. Global publication, persistent caching, authenticated root
retrieval, reviewed assets and ecological transitions/elevation remain later work.
Keep PR #14 draft/unmerged; do not activate palettes or move main. Forest R4 /Issue
#12 remains integrated/HUMAN PASS; biome work remains a candidate feature.

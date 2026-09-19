# Block 8 R9 — Vite raw-gzip compatibility

Date: 2026-09-18 (Toronto). Candidate-only correction after first hardware report.

## Observed scope

User verdict: `pass` for perceived fluidity. Attached telemetry reports 143.998 FPS,
but diagnostic phase missing-coverage / window-not-ready, captures 0, published 0,
transport started 10 / rejected 10 / loaded 0, compressedBytes/decodedBytes 0.
A batch page was successfully verified. Origin 50.337751, 6.951275 and 1,068 route
vertices match the original Nordschleife preset. Retain the human responsiveness
PASS; the real loaded-biome hardware comparison is NOT validated by this report.
No merge, main movement or visual activation follows from it.

## Cause and narrowly scoped change

Vite's public/preview static middleware uses sirv. sirv derives Content-Encoding:
gzip from a .gz suffix, including direct requests (independent of negotiation).
Fetch auto-decompresses HTTP gzip. Our intentionally strict tile transport rejects
non-identity Content-Encoding before body reads, to preserve bounded Worker-side
decompression, compressed length checks and existing integrity/geometry validation.
The previously tested Python static server did not emit that header, so its green
full-game test did not cover the user's actual npm run dev path.

`tools/biomes/vite-raw-gzip.mjs`, registered in vite.config.js, sets two response
headers ONLY on GET/HEAD /local-data/biomes/.../<x>-<y>.json.gz:

- Content-Encoding: identity (removal alone would let sirv regenerate gzip).
- Content-Type: application/octet-stream.

Vite still owns file access, routing, status, content length and body streaming.
Other namespaces, non-tile JSON, scripts, invalid paths and methods are untouched.
There are no build hooks, runtime imports, file readers, extra servers or new
runtime work. Data/launcher ZIP, source polygons, hashes and compressed bytes stay
unchanged. No relaxation of gzip, digest, schema, memory or source-policy guards.

Primary source references, checked during investigation:
https://github.com/vitejs/vite/blob/v7.3.6/packages/vite/src/node/server/middlewares/static.ts
https://github.com/lukeed/sirv/blob/master/packages/sirv/index.mjs
The CI regression records the actual Vite version resolved by the project lockfile;
the reference source version is not assumed to identify the user's installation.

## Regression gates

`qa/qa-block8-biome-gzip-headers-r9.mjs`: 44 scoped requests through both hooks,
exact headers, unchanged request/next semantics, no build hooks or unrelated paths.
Included permanently in the candidate integration audit. Existing R4 loading
negatives still reject HTTP encoding, corruption, overflow and ambiguous payloads.

`qa/qa-block8-biome-vite-browser-r9.py`: actual Vite configuration and lockfile,
unchanged pinned pilot, control removes only the header plugin. The control must
reproduce gzip headers, rejected loads and zero published chunks. Fixed dev must
run the real dedicated Worker, verify source data and publish four chunks (6,976
exact reads), including the reported Nordschleife origin/progress/chunk. Main-page
traps reject gzip/digest/tile preparation. Preview verifies all three raw gzip
payloads with exact compressed-byte/length parity. The script refuses to overwrite
an existing pilot, terminates owned processes and records failures as failures.

This isolated native transport test is NOT full-game or hardware FPS evidence.
The separate unchanged full-game R9 QA, original source controls, R4 forest gates
and all maintained integration commands must also pass on the exact candidate SHA.
Read the live PR/run for the final status; old PASS is not transferred forward.

## Handoff

Pull the same candidate, stop and restart npm run dev; keep the installed pilot.
No new archive or Python step is required. Activate explicitly, then confirm
loaded > 0, captures > 0, bridge.published > 0 and fresh current coverage before
claiming that ON exercised the real workload. Repeat OFF/ON/OFF hardware comparison
and save both biome/frame diagnostics before stop. Missing coverage stays explicit.
Stable main, dev runtime and PR merge status remain protected. Canonical current
state is synchronized in WORLD_DRIVE_BLOCK8_ACTIVE_CANDIDATE.md.

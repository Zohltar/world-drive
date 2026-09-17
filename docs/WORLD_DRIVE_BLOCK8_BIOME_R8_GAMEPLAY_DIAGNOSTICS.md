# Block 8 biome R8 — opt-in gameplay lifecycle diagnostics

Continuation of the existing candidate/PR #14. No merge, planting or visual activation.
The forest-R4 scheduler, full density, exclusions, terrain and physics are unchanged.
R7's deterministic candidate adapter, R6 snapshots and the existing Worker are reused.

## Actual application connection

The stable public `src/route-lifecycle.js` still re-exports the maintained routing
implementation. Its explicit factory decorates the returned lifecycle with the
small application owner `src/app/biome-diagnostics.js`. The maintained routing
implementation and `src/main.js` are byte-for-byte unchanged.

The application owner installs `WorldDriveDiagnostics.forest.biomes`, not a new
global alias. It lazy-imports the observer ONLY on an explicit `start(config)`.
When disabled there is no diagnostic timer, Worker, route scan or biome fetch.
Non-browser callers retain the exact original lifecycle object. The real game's
route options already provide absolute position, projection origin, route points
and generation; no renderer internals or new frame-loop callbacks are introduced.

`loadRoute` and `createRequestedRoute` invalidate observation synchronously, return
the ORIGINAL routing promise, and only notify the observer after successful current
route completion. Biome readiness is never awaited by routing. Reset/generation
methods invalidate immediately. A late older route cannot resume diagnostics after
a newer request. Observer continuation failures cannot reject a successful game
route. Pagehide stops the explicitly enabled observer; BFCache restore does not
silently restart it.

## Opt-in diagnostic interface

```js
WorldDriveDiagnostics.forest.biomes.start({directory, baseUrl});
WorldDriveDiagnostics.forest.biomes.snapshot();
WorldDriveDiagnostics.forest.biomes.sample(cx, cz, candidateIndex);
WorldDriveDiagnostics.forest.biomes.refresh();
WorldDriveDiagnostics.forest.biomes.stop();
```

`directory` is STILL trusted application input with partial coverage, as in R5.
This change does not implement globally authenticated root discovery. An evidence
artifact contains a small `pilot/` directory built from the three original R7
source tiles. It is not automatically installed in `public/` or fetched by the game.
Only explicit callers supply a directory/base URL. Production world-wide fine-data
publication and a packaged one-click pilot remain separate distribution work.

## Admission, preparation and measurements

A single task is delayed 250 ms, then admitted through requestIdleCallback when it
reports at least 2 ms remaining. Lack of headroom defers the attempt; a timer task is
used on platforms without that API. These are best-effort scheduling decisions,
NOT a hard frame-time guarantee. No requestAnimationFrame instrumentation is added.

The first admitted observation makes a bounded copy of 2..20,000 actual route
vertices and initializes a single Worker. The progress map uses the canonical
route plan's cumulative spherical distances, not projected main-world metres.
The map's nearest search uses a 65-segment hint, with a bounded whole-route search
at startup/teleport or when far away. Route-plan construction and metadata lookup
costs are measured separately; neither is a per-frame operation. Oversize, singular
or dateline-incompatible projections fail explicitly, not by wrapping coordinates.

Each changed 120 m progress bucket/current chunk/direction requests one window and
at most FOUR raw-candidate snapshots: current chunk and up to three distinct chunks
480/960/1440 m along the route in the inferred direction of travel. This is a
DIAGNOSTIC SAMPLE, not coverage of the complete visible/forward forest. A parked
vehicle does not repeatedly request the same window, including after missing data.
Manual refresh or a changed window permits another attempt. Fatal initialization
errors stop admission until explicit restart or a new route.

Worker generation, source identity, absolute chunk and R6 packet checks remain
mandatory. Whole-chunk generation, geographic source queries, HTTP/gzip/digest stay
in the Worker. Main-thread R6 validation/copy is measured by `lastReceiptMs` and
`maxReceiptMs`; these do not include all message dispatch or browser allocation cost.
`maxRoundTripMs` includes asynchronous waiting and must not be reported as main CPU.
`maxObserveMs` measures progress/descriptor work; `maxPlanMs` measures initial map
construction. None substitutes for existing WorldDriveFramePacing/game GPU evidence.

The observer exposes resolved/noData/unavailable counts independently of packet
publication. `observed` means measured snapshots, not all positions resolved.
Missing-window state is `missing-coverage`; no default forest is selected. Current
freshness checks current absolute chunk, generation and origin when read. Same-route
teleports over 960 m are detected at the next observation or after asynchronous
preparation, invalidate old handles and restart the diagnostic Worker. This is not
an immediate physics teleport hook and has observation latency by design.

The observer uses a 16-chunk bridge (inside the existing 4 MiB payload ceiling),
one active poll, no pending poll queue, and at most four sequential captures per
window. Existing Worker, service, transport and R6 pending-byte caps remain. Route
coordinate copies, engine overhead, structured clone, Worker/native heap and
external handles are additional. No total-memory/FPS guarantee is claimed.

## Validation gates

- R8 Node lifecycle suite: idle admission, default-off, missing/no-data handling,
  cancellation, stale route/origin, teleport, startup failure, exact synchronous
  reads, public promise identity, lazy-import cancellation and failure isolation.
- Existing R1–R7, source parity and forest-R4 suites remain mandatory.
- A native browser harness invokes the ACTUAL public lifecycle and maintained
  implementation on the two original circuit polylines. Other terrain/render
  services are stubs, not a full Three.js game.
- The same harness is built through Vite and rerun from production assets, so the
  lazy diagnostic import and real generated Worker are tested rather than assuming
  raw-ESM success proves production packaging.
- Exact current-chunk contexts are compared to original R7 unclipped-source
  expectations. Heavy preparation APIs are trapped on the main page. Explicit
  single-point diagnostic reads may use the R7 bounded sampler.

Local unit tests pass; native/production/full integration must be verified on the
new exact candidate SHA. Never transfer R7's PASS to this runtime-connection change.

## Next gates / not completed by this stage

Package a finite trusted diagnostic pilot for straightforward in-game enablement;
exercise the full game with observer OFF/ON on real routes and measure frame pacing,
current/forward readiness and missing coverage. Preserve forest R4 while measuring.
Extend fine-data coverage to a real long road before claiming sustained high-speed
biome readiness. Only after those gates: compatible actual models, local elevation,
ecological transitions, density/visual activation and human visual certification.
Keep PR #14 draft/unmerged and stable main untouched without explicit approval.

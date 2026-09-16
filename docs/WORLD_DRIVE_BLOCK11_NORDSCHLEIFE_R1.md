# World Drive — Block 11B Nordschleife R1

Status: **R4 bridge-seam performance correction HUMAN PASS (2026-09-15); overall full-lap checkpoint held by Physics Trail-Braking R4 retest**

Branch: `candidate/block11-nordschleife-r1`

## Authored circuit contract

The preset is the clockwise Nürburgring Nordschleife full lap. Its committed
centreline is generated from [OpenStreetMap relation 38566](https://www.openstreetmap.org/relation/38566),
then rotated to the first node of T13. The snapshot contains 1,068 coordinates
from 52 ordered and continuously joined ways, so play time does not depend on a
road router accepting `highway=raceway`.

The committed centreline measures 20,746.13 m. The Nürburgring defines the
official full lap as 20.832 km with the record start/finish line in T13. Its
[official circuit facts](https://mobile.nuerburgring.de/info/nuerburgring/race-tracks/nordschleife?locale=en)
also specify 73 corners, 300 m elevation difference, climbs up to 18% and
descents up to 11%; the [official record definition](https://nuerburgring.de/info/nuerburgring/records?locale=en)
provides the exact length and timing location.

R1 uses a conservative 9 m nominal asphalt width, following the
[published description](https://tracktaxi-nordschleife.genesis.com/blogs/magazine/why-formula-1-stopped-racing-on-the-nordschleife-legacy-risk)
that the track rarely exceeds 9 m. The rendered asphalt and the
solid physical wheel-support core both measure exactly 9 m. Civil traffic and
the ordinary-road centre line are disabled.

## Long-loop correction

The road builder historically retained an entire closed loop only below 5 km.
On a longer circuit it selected a 1.8 km behind / 3.6 km ahead profile but
clamped that profile at the route endpoints. It also treated the open local
slice as if its own endpoints touched. On the Nordschleife this would leave a
road/contact discontinuity at T13 and distort the frame at both ends of every
local rebuild.

R1 keeps the bounded 5.4 km profile, unwraps its cumulative distance across the
route seam, and only applies closed-ribbon endpoint rules when the materialized
profile itself closes. Road-contact queries, terrain preloads and directional
data prefetches map canonical lap distance into the active unwrapped window.

The road refinement now measures each bounded Hermite curve before accepting
its tessellation. This closes a case around 11.2 km where a nominal 1.5 m
section was actually 1.533 m, a plausible source of suspension-scale faceting.

## Dense-scenery performance correction

The first R1 exact-head workflow passed, but the human checkpoint on 2026-09-15
reported a sustained fall to approximately 10 FPS on the Nordschleife. Static
inspection identified two Nordschleife-amplified costs; the R3 correction keeps
the route, road surface and vehicle physics unchanged:

- homogeneous OSM guard-rail sections, distant building boxes and dam sections
  are submitted as a few static `InstancedMesh` batches instead of one WebGL
  drawable per section;
- forest exclusion polygons use a 240 m spatial grid instead of testing every
  loaded blocker for every candidate tree;
- closed-loop directional prefetch measures the shortest signed progress
  change, so a small backwards correction near T13 cannot be interpreted as an
  almost-complete forward lap and retrigger background data work.

The permanent performance contract materializes 1,800 finite guard-rail
sections and verifies that they produce one drawable, a 1,800:1 object-count
reduction for that feature set. Runtime diagnostics now expose renderer and
scene load under `WorldDriveFramePacing().rendering` so the human retest can
distinguish draw-call load from background streaming if a slowdown remains.

The R3 human diagnostic then measured 8.195 FPS, 30,534 draw calls, 31,882
meshes and 30,955 geometries. It also proved the OSM batching was active: 368
guard-rail and 142 distant-building instances occupied only three static
batches, while the forest had zero active trees. The remaining synchronous
`furniture` phase alone took 244.5 ms.

R4 fixes the matching closed-loop bridge failure. A bridge feature with points
on both sides of T13 was previously reduced with a linear minimum/maximum
cumulative distance; a short seam crossing could therefore become an
almost-20.8 km bridge. Enhanced rails, posts, deck, fascia and girders were then
created as separate geometry for every 1.5 m road section. Bridge projection
now selects the minimum circular interval, preserves wrapped height/contact
queries, and emits homogeneous bridge parts through at most eight finite static
instance batches. Route geometry, surface width and vehicle physics are
unchanged.

R4 code/QA checkpoint `36a1adecfdcbbaa59e3994423d8ff62cefd9e067`
passed exact-head workflow run `34918367074`, including the new T13 bridge and
furniture performance contract, runtime integration audit and production build.
The following human retest reported normal Nordschleife performance, accepting
the R4 performance correction. The same drive still exposed easy rear
breakaway followed by excessive understeer while braking in a corner. A later
ABS ON/OFF comparison restored correct trail braking with ABS OFF and isolated
the active EBD path. The measured-reserve correction now lives on
`candidate/physics-trail-braking-r4`; it still prevents overall full-lap
promotion until the ABS-ON human retest passes.

## Automated result

- all seven sampled 5.4 km windows around the lap are finite and strictly
  monotonic, including windows that cross T13;
- maximum final road section: 1.500 m;
- T13 contact position difference across the canonical seam: 2.113 mm;
- T13 heading difference: 0.00242°;
- T13 pitch difference: 0.00009°;
- rendered asphalt: 9.00 m; physical solid support: 9.00 m;
- directional prefetch wraps to 1.3/3.1 km before continuing to 2.3/4.1 km on
  the following pass, while a 1 m backwards correction does not retrigger it;
- 1,800 synthetic static guard-rail sections collapse to one finite
  instanced drawable;
- a 60 m bridge crossing a 10 km synthetic route seam remains 60 m on a
  4,001-point local profile; its 674 furniture pieces collapse to eight finite
  drawables rather than expanding across the loop;
- circuit civil traffic remains disabled;
- Laguna Seca, ordinary-road finite geometry, hydro fallback, WRX trail
  braking, the 8-vehicle/288-case driving matrix, production build and code
  split remain green locally.

The original R1 exact-head workflow run `34905695059` passed before the human
performance failure. R3 code/QA checkpoint `6304d67c3ec37b4fe16ce036b35c36ac0745c891`
then passed exact-head workflow run `34915719869`, including the dense-scenery
performance contract, runtime integration audit and production build. The
local container cannot complete the LAN portion of Dev Integration because its
operating-system sandbox rejects `os.networkInterfaces()`; GitHub CI passed
that environment-dependent gate for both R3 and R4.

## Human checkpoint

The first human run failed this checkpoint at approximately 10 FPS and the R3
diagnostic retest measured 8.195 FPS. R4 then received HUMAN PERFORMANCE PASS
on 2026-09-15. The remaining checkpoint uses the WRX on
`Nordschleife · Circuit` for one full clockwise lap. Record
`WorldDriveFramePacing()` only if performance regresses. Inspect T13,
Hatzenbach, Flugplatz, Fuchsröhre, Karussell, Pflanzgarten and Döttinger Höhe
for:

- stable frame rate without a sustained return to approximately 10 FPS — **PASS**;
- no gap, snap or streaming stall when crossing T13;
- visible asphalt and physical road contact ending at the same width;
- no staircase impacts in tight curves, crests or steep grade changes;
- no invisible road support outside the 9 m asphalt;
- no civil vehicles on the circuit;
- stable WRX trail braking without rear breakaway followed by excessive
  understeer — **ABS OFF diagnostic PASS; retest measured-reserve Physics
  Trail-Braking R4 with ABS ON**.

R1 does not claim a survey-grade surface mesh. In particular,
[Porsche describes](https://newsroom.porsche.com/en/2020/motorsports/porsche-nuerburgring-nordschleife-caracciola-karussell-22455.html)
the Caracciola-Karussell as a unique steep, concrete, bumpy banked corner; the
current generic road surface does not claim to reproduce its exact concrete
bowl. An authored special surface should be a separate, source-backed follow-up
rather than an undocumented physics approximation.

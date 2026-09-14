# World Drive — Block 11B Nordschleife R1

Status: **automated candidate validated locally; exact-head CI and human full-lap checkpoint pending**

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

## Automated result

- all seven sampled 5.4 km windows around the lap are finite and strictly
  monotonic, including windows that cross T13;
- maximum final road section: 1.500 m;
- T13 contact position difference across the canonical seam: 2.113 mm;
- T13 heading difference: 0.00242°;
- T13 pitch difference: 0.00009°;
- rendered asphalt: 9.00 m; physical solid support: 9.00 m;
- directional prefetch wraps to 1.3/3.1 km before continuing to 2.3/4.1 km on
  the following pass;
- circuit civil traffic remains disabled;
- Laguna Seca, ordinary-road finite geometry, hydro fallback, WRX trail
  braking, the 8-vehicle/288-case driving matrix, production build and code
  split remain green locally.

The local container cannot complete the LAN portion of Dev Integration because
its operating-system sandbox rejects `os.networkInterfaces()`. The exact-head
GitHub workflow owns that environment-dependent gate.

## Human checkpoint

Use the WRX, select `Nordschleife · Circuit`, and drive one full clockwise lap.
Inspect T13, Hatzenbach, Flugplatz, Fuchsröhre, Karussell, Pflanzgarten and
Döttinger Höhe for:

- no gap, snap or streaming stall when crossing T13;
- visible asphalt and physical road contact ending at the same width;
- no staircase impacts in tight curves, crests or steep grade changes;
- no invisible road support outside the 9 m asphalt;
- no civil vehicles on the circuit;
- stable WRX trail braking without four-wheel skating.

R1 does not claim a survey-grade surface mesh. In particular,
[Porsche describes](https://newsroom.porsche.com/en/2020/motorsports/porsche-nuerburgring-nordschleife-caracciola-karussell-22455.html)
the Caracciola-Karussell as a unique steep, concrete, bumpy banked corner; the
current generic road surface does not claim to reproduce its exact concrete
bowl. An authored special surface should be a separate, source-backed follow-up
rather than an undocumented physics approximation.

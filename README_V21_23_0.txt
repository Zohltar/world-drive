WORLD DRIVE V21.23.0 — TRUCK + ARTICULATED TRAILER CANDIDATE
=============================================================

BASE
----
Official stable baseline: V21.22.6.
Terrain satellite/procedural ownership, hitch-free streaming and preload buffer
are intentionally unchanged by this candidate.

NEW SELECTABLE VEHICLE
----------------------
- Generic North-American sleeper road tractor, 6x4.
- Tractor mass: 8,600 kg.
- Effective wheelbase: 5.45 m.
- Three physical tractor axles:
  - front steer axle: 2 tire contacts;
  - first drive axle: 4 tire contacts (dual tires);
  - second drive axle: 4 tire contacts (dual tires).
- Total tractor tire contacts used by suspension/grip solver: 10.
- Truck-specific steering rack, yaw inertia, lateral envelope, braking,
  acceleration, reverse speed and suspension tuning.

TRAILER
-------
First trailer profile: generic 53 ft dry van.
- Length: 16.15 m.
- Width: 2.60 m.
- Height: 4.05 m.
- Loaded representative mass: 18,500 kg.
- Tandem axle group: 2 axles / 8 visible tires.
- Fifth-wheel kingpin constraint.
- Kingpin-to-axle-group distance: 11.75 m.
- Maximum articulation: ~82 degrees.

ARTICULATION PHYSICS
--------------------
The trailer uses a non-holonomic kingpin/axle constraint rather than a scripted
follow animation. Kingpin lateral velocity creates trailer yaw through the
trailer wheelbase. Consequences:
- forward motion naturally straightens the trailer;
- sustained turns create realistic articulation/off-tracking;
- reverse motion is naturally unstable;
- a physical articulation stop prevents the trailer rotating through the cab.

COMBINATION DYNAMICS
--------------------
- Total loaded combination mass: 27,100 kg.
- Trailer mass reduces delivered acceleration.
- Tractor + trailer brake capability determines service deceleration.
- Trailer rolling resistance and aerodynamic drag are added to the tractor.
- Loaded fifth-wheel inertia slightly damps rapid tractor yaw at road speed.
- Truck reverse speed is limited to 18 km/h.

ARCHITECTURE
------------
Trailer data lives on the vehicle profile and articulation/rendering lives in
src/truck-trailer.js. This intentionally leaves room for future trailer types
(flatbed, tanker, shorter/longer dry vans, different mass/axle layouts) without
rewriting the passenger-car systems.

NON-REGRESSION
--------------
The seven existing passenger/performance vehicles keep their previous profiles.
V21.21.26 behavior calibration remains green for all seven, including 175,000
stress cases. V21.21 fuzz remains green for 50,000 randomized states.

USER TEST PRIORITIES
--------------------
1. Select "Tracteur routier 6x4 + remorque" from the normal vehicle selector.
2. Confirm chase camera frames the complete combination.
3. Low-speed full-lock test: tractor should clearly turn wider/slower than cars.
4. Highway sweep: combination should feel heavy and reluctant to snap-yaw.
5. Hard braking: much longer stopping feel than current cars.
6. Reverse from straight, then add a little steering: trailer should begin to
   articulate and require counter-steering to recover.
7. Drive over rolling/uneven terrain and confirm all three tractor axles visually
   follow the road/terrain.
8. Confirm V21.22.6 terrain remains beautiful and hitch-free.

STATUS
------
Candidate only. V21.22.6 remains the official baseline until user validation.

# World Drive — no-ABS runtime and continuous guard rails R1

Status: **candidate implementation; automated and human validation pending**

Branch: `candidate/physics-no-abs-guardrails-r1`

Baseline: Physics Trail-Braking R4 local tree `b1ded84b26beccab8c574cd63422bdd2a687090e`
(published equivalent `0a6c43b4007ddc7cd6b5fdc4b65f069b0799c825`)

## Decision

The human comparison established that the fixed-bias no-ABS path gives the
expected trail-braking rotation, while the ABS path remains strongly
understeered. By user decision, ABS is removed from gameplay instead of being
retuned again.

The runtime now always presents `absEnabled:false` to the aggregate and
per-wheel tire solvers. The menu toggle, persisted default and live preference
wiring are removed. Authored vehicle profile fields and the isolated ABS solver
code remain as inert historical/tuning infrastructure; they cannot reactivate
ABS during gameplay.

## Nordschleife guard rails

The visible repeated gaps were caused by long OSM rail edges being rendered as
horizontal midpoint boxes. On changing relief, parts of those boxes entered
the terrain and appeared discontinuous.

Guard-rail edges are now:

- subdivided into spans no longer than 5 m;
- aligned in pitch between sampled terrain heights at both endpoints;
- extended by 0.14 m to close tiny seams at span and curve junctions;
- still submitted as one homogeneous `InstancedMesh` batch.

The correction therefore trades additional instance transforms for continuous
geometry without restoring the thousands of draw calls removed by the
Nordschleife performance work.

## Acceptance

- no ABS control appears under `Menu -> Conduite`;
- hard braking can physically lock tires on every vehicle;
- partial trail braking retains the accepted fixed vehicle brake bias;
- Nordschleife guard rails follow hills and curves without repeated gaps;
- Nordschleife performance remains at the previously accepted level;
- full driving matrix, integration audit and production build remain green.

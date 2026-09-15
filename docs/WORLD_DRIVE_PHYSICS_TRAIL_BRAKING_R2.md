# World Drive — trail-braking transient R2

Status: **exact-head automated PASS; HUMAN FAIL (2026-09-15) — excessive understeer persisted; superseded by R3**

Branch: `candidate/physics-trail-braking-r2`

Baseline: Nordschleife R4 performance candidate `af0079993109ccca4d65db90b78943f1a5c81e8a`

Validated candidate: `a1be6d5da92512ad4cfd1dd1d8009b36db9ffb79`

GitHub Actions:
[Physics Trail Braking R2 run #1](https://github.com/Zohltar/world-drive/actions/runs/35022031593)
— **PASS** on the exact candidate tree.

Scope: ABS-equipped passenger cars on pavement; WRX human report on the
Nordschleife; Laguna Seca remains the deterministic calibration circuit.

## Reported behavior

The Nordschleife R4 performance retest passed, but braking while steering could
still make the rear break away very easily and then produce excessive
understeer. This is a physics failure, not a road-streaming or frame-rate
failure, so `dev`, `main` and the exact-green R4 branch remain unchanged.

## Reproduced defects

R1 said it projected an over-limit longitudinal/lateral request onto the
combined-force envelope. It multiplied the service-brake acceleration by the
radial scale but left steering demand untouched. In the representative Laguna
state, the applied normalized request was therefore approximately `0.739`
longitudinal plus `0.911` lateral: magnitude `1.173`, still outside the unit
envelope.

Three downstream effects amplified that error:

- the global envelope did not reserve force separately for the dynamically
  loaded front and rear axles;
- EBD followed vertical load but ignored lateral force already consumed by
  each axle;
- the low-slip aggregate rear-force-loss moment continued accelerating yaw
  after the bicycle-model target had already been reached.

The R1 one-second regression consequently accepted `maxRearSlip = 0.999`,
`maxFrontSlip = 0.301` and `maxFourWheelSlide = 0.301`. A frame trace also
showed chassis sideslip growing to approximately 12.5 degrees. Those bounds
matched the human failure rather than preventing it.

## Candidate correction

R2 keeps steering, wheel-ground contact, suspension, tire coefficients and
road geometry unchanged. It changes only combined service-brake control:

1. ABS limits service-brake force to the longitudinal capacity remaining after
   the current lateral request; feasible moderate trail braking and straight
   braking remain unchanged.
2. A two-axle capacity solve reserves the zero-yaw lateral-force share required
   at each axle after longitudinal load transfer.
3. EBD distributes pressure according to that combined-force reserve instead
   of vertical load alone.
4. The 120 Hz per-wheel solver feeds measured combined utilization back into
   subsequent ABS pressure release/reapply frames.
5. Handling slip during service braking comes from load-weighted physical tire
   utilization and actual slip angle; peak ABS work in a straight stop is not
   misclassified as lateral sliding.
6. The aggregate low-slip yaw handoff may accelerate only up to the steering
   yaw target. Genuine high-sideslip rotation remains owned by the physical
   per-wheel moment, so this is not a hidden heading or position correction.

Explicit no-ABS, tractor/trailer, handbrake, off-road and airborne paths remain
outside the new allocator or feedback loop.

## Deterministic result

For the 0.741 g Laguna reference state, full service-brake demand now applies
0.490 g after the axle-aware combined-force solve, retains 0.691 g net lateral
acceleration, and keeps the aggregate rear channel below breakaway.

The closed-loop runtime probe first settles the car in the runtime's own
small-slip corner, then applies an instantaneous full brake command for one
second:

| Scenario | Rate | Final speed | Max front slip | Max rear slip | Max chassis sideslip |
|---|---:|---:|---:|---:|---:|
| Laguna R=43.5 m | 120 Hz | 28.1 km/h | 0.018 | 0.030 | 0.78° |
| Laguna R=43.5 m | 60 Hz | 28.2 km/h | 0.017 | 0.029 | 0.69° |
| Laguna R=43.5 m | 30 Hz | 28.4 km/h | 0.015 | 0.024 | 0.52° |
| Laguna R=18.8 m | 120 Hz | 11.4 km/h | 0.090 | 0.087 | 1.10° |

The permanent contract rejects rear or front slip above `0.15`, four-wheel
slide above `0.15`, chassis sideslip above 3 degrees, and a final yaw-rate error
above 4 degrees/second in these full-brake probes.

## Permanent checks

- `qa/qa-physics-trail-braking-transient-r2.mjs`
- `qa/qa-physics-combined-trail-braking-r1.mjs` (strengthened R2 regression)
- WRX brake-in-corner, trail-brake, hard-braking and tire-stability checks
- yaw fallback, handbrake, countersteer, uphill load-transfer and low-speed
  lateral regressions
- eight-vehicle/288-case driving matrix
- Nordschleife R1–R4, Laguna Seca, road/contact, streaming, hydro/OSM,
  integration, production-build and code-split gates

## Human checkpoint

Use the WRX on both `Laguna Seca · Circuit` and
`Nordschleife · Circuit`. Enter medium and tight corners under partial and full
service braking, release the brake while holding steering, then straighten the
wheel. Accept only if rear rotation builds progressively without a snap, the
front push under maximum combined demand is bounded and predictable, and full
straight-line braking returns immediately as steering load comes off.

## Human result

The follow-up test reported that the WRX was **still very understeered**. R2's
steady-corner-first regression did not exercise turn-in while braking was
already active. Physics Trail-Braking R3 supersedes this checkpoint and adds
that missing transient contract. R2 must not be integrated into `dev`.

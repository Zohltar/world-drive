# World Drive — measured-reserve ABS/EBD R4

Status: **local deterministic PASS; exact-head automation and HUMAN retest pending**

Branch: `candidate/physics-trail-braking-r4`

Baseline: player ABS toggle R1 `8eacda43baab8c4341fcb00da887c789bc60f969`

Scope: ABS-equipped passenger cars on pavement; WRX trail braking with the
player ABS option ON. `dev`, `main`, tire coefficients, steering geometry,
vehicle calibration and road geometry remain unchanged.

## Human diagnosis

The player repeated the same trail-braking test with the new ABS switch and
reported that the car behaved correctly with ABS OFF. This isolates the
remaining understeer to the active ABS/EBD path rather than the road surface,
base tire model, steering geometry or chassis response.

The deterministic pedal sweep reproduced the difference. With ABS ON, the R2
EBD calculation moved the WRX's configured `62/38` brake split progressively
forward before either axle had demonstrated a real capacity limit:

| Brake pedal | Previous ABS front share | R4 ABS front share |
|---:|---:|---:|
| 0.20 | 0.663 | 0.620 |
| 0.35 | 0.748 | 0.620 |
| 0.50 | 0.758 | 0.620 |
| 0.70 | 0.772 | 0.620 |
| 1.00 | 0.790 | 0.620 |

The combined-force allocator already reduces total brake pressure when a
corner consumes tire capacity. The additional predictive front-bias shift was
therefore removing the rear axle's normal trail-braking contribution and
creating the reported front push.

## Root cause

The previous EBD estimate treated the chassis-level requested lateral
acceleration as if the static front/rear force split had already developed at
the contact patches. Under braking, rear normal load falls immediately; this
made the model declare the rear axle saturated in advance and transfer brake
pressure toward the front even when the actual `62/38` request was feasible.

## R4 correction

Before distributing service-brake torque, the per-wheel solver now evaluates
each rolling contact at its current:

- normal load, including longitudinal and lateral transfer;
- contact-patch velocity and slip angle;
- steering/Ackermann angle;
- tire and surface friction ellipse.

That lateral-only force demand yields the longitudinal brake reserve genuinely
remaining at each axle. EBD keeps the configured mechanical split unchanged
while both axle requests fit. If one axle exceeds its measured reserve, only
the excess is moved to available capacity on the other axle. If total demand
exceeds measured capacity, pressure distribution follows the available
reserve and the existing ABS feedback reduces total pressure.

ABS OFF remains the direct fixed-bias path and still permits physical wheel
lock. R4 does not add grip, yaw, steering or position correction.

## Deterministic result

The normal Laguna `R43.5 m` entry retains `0.620` front share through the
feasible trail-braking phase, with maximum front/rear slip `0.018 / 0.030` and
less than one degree of chassis sideslip.

In the deliberately severe `R18.8 m` full-brake entry, measured reserve moves
the initial front share to `0.764` only after the rear request is constrained.
The former rear breakaway is removed:

| Metric | Pre-R4 | R4 |
|---|---:|---:|
| Maximum rear slip | 0.938 | 0.021 |
| Maximum front slip | 0.875 | 0.116 |
| Maximum chassis sideslip | 4.01° | 1.10° |

Straight full braking still reaches the WRX longitudinal limit without a
sustained locked wheel, while the no-ABS comparison retains `62/38` and can
lock/over-slip under excessive pedal demand.

## Permanent checks

- `qa/qa-physics-abs-ebd-trail-braking-r4.mjs`
- strengthened `qa/qa-physics-trail-braking-turn-in-r3.mjs`
- strengthened `qa/qa-physics-combined-trail-braking-r1.mjs`
- ABS option, hard-braking, full-fleet brake/reverse, tire, yaw, drift and
  handbrake regressions
- Laguna Seca, Nordschleife, road/contact, streaming, hydro/OSM, full driving
  matrix, integration, production-build and code-split gates

## Human checkpoint

Use the WRX with ABS ON on the same Laguna Seca or Nordschleife entries that
made ABS OFF feel correct. Under partial trail braking, ABS ON should now feel
close to the natural ABS-OFF rotation because the configured bias is retained.
With a much stronger pedal, ABS ON may redistribute pressure and should prevent
the lock/rear snap that remains possible with ABS OFF.

Do not integrate this candidate to `dev` before the human result.

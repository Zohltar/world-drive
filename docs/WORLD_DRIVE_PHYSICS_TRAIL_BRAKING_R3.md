# World Drive — trail-braking turn-in R3

Status: **exact-head automated PASS; HUMAN retest pending**

Branch: `candidate/physics-trail-braking-r3`

Baseline: Physics Trail-Braking R2 `a21099b130756c78e47c743aed2bd5c01ba6986e`

Scope: ABS-equipped passenger cars on pavement; WRX turn-in under service
braking. `dev`, `main`, tire coefficients, steering geometry and road geometry
remain unchanged.

## Human failure carried from R2

R2 removed the reproduced rear-snap feedback and passed its exact-head
workflow, but the human retest still found the WRX very understeered. Its main
closed-loop regression entered a settled corner before applying the brake, so
it did not cover steering into a corner while braking was already active.

## Root cause

R2 correctly reduced service-brake force as steering consumed the combined
tire-force envelope. Under a sufficiently large steering request it released
the applied brake force completely. Two downstream switches nevertheless
remained active solely because the pedal was still held:

- brake-specific physical axle-slip telemetry continued controlling the
  bicycle-model yaw target;
- the per-wheel ABS feedback continued reacting to tire utilization generated
  by steering alone.

During turn-in, front slip angle develops before the rear axle reaches its
steady lateral-force share. The stale brake mode therefore reported almost
`1.0` front slip and `0.0` rear slip even after applied braking had reached
`0 g`. That front-only value invoked the existing understeer conditioner and
held the chassis near its 46% minimum yaw scale. The feedback scale also stayed
pinned near `0.20`. Pedal state was changing handling despite zero transmitted
brake force.

## R3 correction

Brake-specific slip ownership and ABS feedback now require more than `0.04 g`
of actual combined-force-allocated service braking. If the allocator releases
pressure below that physical threshold:

1. handling returns to the normal non-braking axle-slip path;
2. steering-only utilization cannot keep reducing hydraulic feedback;
3. the feedback scale recovers toward full authority for brake reapplication
   as the steering demand comes off.

This does not add yaw, change tire friction, increase the lateral-acceleration
limit, alter steering angle, or correct heading/position. Applied longitudinal
tire force remains the only trigger for the brake-specific path.

## Deterministic result

The new runtime regression starts straight, applies full service braking for
0.20 seconds, then commands a strong turn. At maximum combined demand the
allocator legitimately releases braking to `0 g`; R3 verifies that a held
pedal cannot leave a phantom brake-handling state.

| Scenario | Rate | R2 yaw authority | R3 yaw authority | R3 front/rear slip | R3 sideslip | R3 feedback |
|---|---:|---:|---:|---:|---:|---:|
| Tight turn from 50 km/h | 120 Hz | 0.466 | 0.808 | 0.352 / 0.345 | 2.04° | 0.999 |
| Tight turn from 50 km/h | 60 Hz | — | 0.803 | 0.355 / 0.345 | 1.88° | 0.999 |
| Tight turn from 50 km/h | 30 Hz | — | 0.791 | 0.363 / 0.345 | 1.59° | 0.998 |
| High-speed saturation from 100 km/h | 120 Hz | 0.470 | 0.832 | 0.347 / 0.347 | 0.85° | 1.000 |

Yaw authority is actual chassis yaw rate divided by the friction-limited
bicycle target after 0.75 seconds. R3 deliberately does not promise the
kinematic radius requested by excessive steering lock; tire capacity still
limits the corner. It rejects only the additional understeer created by a
pedal whose applied force is zero.

A moderate simultaneous turn/brake probe retains `0.306 g` braking, reaches
`1.000` yaw authority, keeps front/rear slip at `0.001 / 0.009`, and remains
below one degree of chassis sideslip.

## Permanent checks

- `qa/qa-physics-trail-braking-turn-in-r3.mjs`
- R2 combined-force, settled-corner and yaw-handoff regressions
- WRX hard-braking, brake-in-corner, trail-brake and tire-stability checks
- handbrake, drift, countersteer, uphill and low-speed regressions
- eight-vehicle/288-case driving matrix
- Nordschleife R1–R4, Laguna Seca, road/contact, streaming, hydro/OSM,
  integration, production-build and code-split gates

GitHub Actions run
[`35026732737`](https://github.com/Zohltar/world-drive/actions/runs/35026732737)
passed on the exact published implementation checkpoint
`c5f2c60ec44bb8628b3e68c331fdc3b788332c14`.

## Human checkpoint

Use the WRX on Laguna Seca and the Nordschleife. Test both sequences:

1. begin braking, then steer progressively into a medium and a tight corner;
2. enter the corner first, then apply partial and full service braking.

The rear must build rotation progressively without snapping. When combined
demand is too high, the car may widen its line at the tire limit, but it must
not remain in the extreme front-plow state after ABS has released braking.
Unwind the wheel while keeping the pedal held and verify that normal braking
returns progressively.

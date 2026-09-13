# World Drive — Laguna Seca trail-braking R1

Status: **candidate validated by deterministic simulation; human driving checkpoint pending**

Branch: `candidate/physics-trail-braking-r1`

Scope: WRX report at Laguna Seca; shared ABS passenger-car runtime path

## Reported behavior

The car felt extremely understeered at Laguna Seca. Applying the service brake
while cornering caused a four-wheel slide instead of the progressive turn-in
expected from forward longitudinal load transfer.

## Validation method

The authored circuit was resampled at 5 m intervals (3,588.8 m measured), and
six separated curvature peaks were selected with radii from 18.8 m to 43.5 m.
Each test state was solved as a true steady corner rather than as a yaw-only
minimum:

```text
sum(Fy) / mass = speed^2 / radius
sum(Mz) / yawInertia = 0
```

That two-equation trim matters. A yaw-only optimizer can accept a nearly
zero-force state, which looks numerically stable but cannot represent a car
actually following the corner.

The physical reference model is consistent with three established principles:

- lateral acceleration comes from the sum of tire lateral forces, while axle
  moments determine yaw acceleration ([OpenVD vehicle model equations](https://andresmendes.github.io/openvd/build/html/simpleVehicleModels.html));
- trail braking belongs in a combined longitudinal/lateral `g-g` envelope, and
  longitudinal load transfer reduces rear normal load while changing yaw
  balance ([Stanford Dynamic Design Lab thesis](https://ddl.stanford.edu/publications/thesis/autonomous-vehicle-control-limits-handling));
- longitudinal and lateral tire forces must share a friction-circle constraint
  ([Bertipaglia et al., 2024](https://arxiv.org/abs/2405.10847)).

## Findings

The longitudinal load-transfer implementation was already correct. For the
WRX's 58% static front load, 0.1, 0.2, 0.35, 0.5 and 0.7 g braking produced
59.89%, 61.77%, 64.60%, 67.43% and 71.21% front load respectively, matching
`frontBias + brakingG * cgHeight / wheelbase` at every tested point.

The per-wheel tire solver was also directionally correct. In six steady
0.741 g corners:

| Brake | Lateral acceleration | Yaw acceleration into turn | Peak tire utilization | Saturated tires |
|---:|---:|---:|---:|---:|
| 0.0 g | 0.741 g | 0.000 rad/s² | 0.735 | 0 |
| 0.2 g | 0.724–0.733 g | 0.115–0.258 rad/s² | 0.757 | 0 |
| 0.5 g | 0.694–0.719 g | 0.257–0.634 rad/s² | 0.858 | 0 |
| 0.7 g | 0.668–0.707 g | 0.284–0.857 rad/s² | 0.976 | 0 |

The defect was in runtime force ordering. The scalar braking limiter applied
the full longitudinal result before the aggregate tire solver reserved any
lateral force. Under full service braking, the old path therefore consumed the
friction budget longitudinally and left only a small lateral residual.

## Candidate correction

For ABS-equipped passenger cars on pavement, the runtime now projects an
over-limit braking/steering request back onto the normalized combined-force
envelope. The downstream tire solvers receive the resulting applied braking
acceleration for both combined-slip accounting and longitudinal load transfer.

Straight braking and feasible moderate trail braking remain unchanged. The
established no-ABS, tractor/trailer, handbrake, off-road and airborne paths are
not opted into this correction.

Across the six Laguna samples at full brake:

| Metric | Previous runtime | R1 candidate |
|---|---:|---:|
| Applied braking | 0.966 g | 0.714–0.720 g |
| Net lateral acceleration | 0.113 g | 0.597–0.605 g |
| Trajectory lateral capacity | 0.113 g | 0.629–0.636 g |
| Front aggregate slip | 1.000 | 0.361–0.364 |
| Four-wheel saturation | Yes | No |
| Physical yaw acceleration into turn | not propagated consistently | 0.287–0.873 rad/s² |

The rear aggregate channel still reaches the edge under a sustained full-brake
corner request while the front no longer saturates. That localized rear-force
loss is the candidate's progressive rotation cue, not a claim that full braking
can preserve the original cornering speed; its feel remains part of the human
checkpoint. In a one-second closed-loop 43.5 m-radius probe, the WRX decelerated
from 64.0 to 27.0 km/h, four-wheel slide stayed below 0.301, and yaw rate
remained bounded at 17.7°/s.

## Rejected alternative

Promoting the low-slip per-wheel yaw term directly into the chassis controller
was tested and rejected. The same one-second probe reached about 128°/s, which
turned a useful load-transfer cue into an unstable spin. R1 therefore changes
only combined-force allocation and applied-force consistency.

## Permanent checks

- `qa/qa-physics-laguna-trail-brake-diagnostics-r1.mjs`
- `qa/qa-physics-combined-trail-braking-r1.mjs`
- the existing WRX, braking, uphill-load-transfer, low-speed lateral, yaw,
  momentum, vehicle-fleet and full driving-matrix regressions
- production build and exact-head candidate workflow

Automation can reject force, stability and integration regressions, but it
cannot certify steering feel. The remaining checkpoint is an in-game Laguna
drive before any integration into `dev`.

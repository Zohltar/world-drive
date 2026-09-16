# World Drive — player ABS toggle R1

Status: **exact-head automated PASS; HUMAN diagnostic complete — ABS ON path isolated**

Branch: `candidate/physics-abs-toggle-r1`

Baseline: Physics Trail-Braking R3 `bb23e201645b61e2cb4c18bdfc7906fea0a4c30c`

Scope: expose the existing physical ABS/no-ABS paths to the player without
changing vehicle calibration, tire coefficients, steering, yaw, suspension or
road geometry.

## Player control

`Menu -> Conduite -> ABS` now provides a persistent ON/OFF switch.

- ON is the default and preserves the accepted R3 behavior;
- OFF disables combined-force ABS pressure allocation, load-aware EBD and
  per-wheel anti-lock regulation;
- OFF therefore allows service-braked wheels to lock and use the existing
  sliding-tire force path;
- vehicles authored without ABS continue to show `N/D`; the player setting
  cannot add ABS hardware to them.

The selected state is saved with the existing application settings and can be
changed at runtime. A toast confirms each change.

## Deterministic comparison

The permanent WRX hard-braking/steering probe produces two physically distinct
states from the same speed, steering and brake request:

| Player setting | Locked wheels | ABS-regulated wheels |
|---|---:|---:|
| ABS ON | 0 | 2 |
| ABS OFF | 2 | 0 |

The test also verifies that ABS remains ON by default, the preference reaches
both aggregate and per-wheel tire solvers, and an authored no-ABS vehicle
cannot be forced into ABS mode.

## Permanent checks

- `qa/qa-physics-abs-toggle-r1.mjs`
- `qa/DEV_INTEGRATION_AUDIT.mjs`
- `.github/workflows/qa-physics-abs-toggle-r1.yml`
- all R2/R3 trail-braking, hard-braking, tire, yaw, drift and full-fleet checks
- Laguna Seca, Nordschleife, road/contact, streaming, hydro/OSM, build and
  code-split gates

GitHub Actions run
[`35030137277`](https://github.com/Zohltar/world-drive/actions/runs/35030137277)
passed on the exact published implementation checkpoint
`6ab85c244af4e65eafb0e2356b6a100e7b01f384`.

## Human comparison result

The player completed the comparison and reported that trail braking behaved
correctly with ABS OFF. The base no-ABS tire/chassis path is therefore accepted
for this diagnosis; the excessive understeer belongs to the active ABS/EBD
allocation. The toggle itself worked as intended and remains part of the next
candidate.

The correction continues on `candidate/physics-trail-braking-r4`, where ABS ON
preserves the configured mechanical bias until measured contact-patch reserve
requires intervention.

## Reproduction sequence

Use the WRX on the same Laguna Seca or Nordschleife corner, at the same entry
speed, and compare:

1. ABS ON: brake first, then progressively steer while holding the pedal;
2. ABS OFF: repeat the same input and observe wheel lock, line widening and
   available rotation;
3. repeat with partial braking so the no-ABS case stays below wheel lock.

This sequence distinguished an ABS allocation problem from the base tire,
steering and road-contact model. Do not integrate the stacked R4 candidate to
`dev` before its human result.

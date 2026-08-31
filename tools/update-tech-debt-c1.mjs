import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

function replaceOnce(pattern,replacement,label){
  const matches=typeof pattern==='string'
    ?text.split(pattern).length-1
    :(text.match(pattern)||[]).length;
  if(matches!==1)throw new Error(`${label}: expected exactly one match, found ${matches}`);
  text=text.replace(pattern,replacement);
}

replaceOnce(
  'Status: **AUTOMATION COMPLETE — HUMAN VALIDATION PENDING (2026-08-30)**',
  'Status: **DONE — 2026-08-30**',
  'B3 status'
);
replaceOnce(
  '- Result so far: automated equivalence and ownership boundaries are validated; final acceptance awaits driver feel/continuous-rotation confirmation.',
  '- Human validation: **PASS — 2026-08-30**. User confirmed ID.4/i3 handbrake-turn and J-turn continuity, WRX/Civic comparison, F1 180–300+ km/h steering feel and high-speed front-understeer behavior are all good in-game.\n- Result: automated equivalence, ownership boundaries and requested driver-feel/continuous-rotation checks are all validated; B3 is closed.',
  'B3 result'
);

replaceOnce(
  /### B7 — Review `legacyGripYawAcceleration` \*\*\[P1\]\*\*[\s\S]*?\n---\n\n## CLEANUP C/,
`### B7 — Review \`legacyGripYawAcceleration\` **[P1]**

Status: **DONE — 2026-08-30**

Question resolved:
- the legacy grip-loss yaw term is still useful only as a **narrow low-physical-authority fallback**;
- it is not allowed to compete with the R7+ per-wheel physical yaw solver once physical authority rises.

Required correction completed:
- reviewed the fallback across normal cornering, FWD power understeer, countersteer and handbrake/J-turn regimes;
- retained the narrow behavior but renamed/documented it as \`gripLossFallbackYawAcceleration\`;
- physical authority now progressively owns the transition, with R16/R21 suppression preventing opposing front-dominated fallback yaw;
- F1 physical-only behavior remains explicitly opted out of the legacy assist path.

Completion record:
- Source clarification commit: \`b5511a86\` — clarified grip-loss fallback yaw ownership.
- Permanent QA commit / validated B7 HEAD: \`7ae77cd3\` — added \`qa-yaw-fallback-b7.mjs\` and permanent B7 workflow coverage.
- Numerical QA: 30,000 deterministic fallback/authority samples, max equivalence error 0; low-authority fallback remains materially active where intended, then hands off to physical authority.
- Dedicated B7 run \`33345155340\`: PASS.
- Dev Integration run \`33345155259\`: PASS.
- Subsequent requested in-game maneuver/F1 validation: PASS on 2026-08-30.
- Result: no ambiguous legacy yaw owner remains; the retained fallback has a documented narrow authority regime and permanent regression coverage.

---

## CLEANUP C`,
  'B7 block'
);

replaceOnce(
  /### C1 — Flatten `vehicle-dynamics-base → v21\.29 → vehicle-dynamics` \*\*\[P1\/P2\]\*\*[\s\S]*?\n---\n\n### C2/,
`### C1 — Flatten \`vehicle-dynamics-base → v21.29 → vehicle-dynamics\` **[P1/P2]**

Status: **DONE — 2026-08-30**

Resulting responsibility-based layers:
- \`src/vehicle-dynamics-core.js\` — generalized pure dynamics math/foundation;
- \`src/vehicle-dynamics-traction-steering.js\` — clutch-demand/wheelspin and R3/R13/R22 steering ownership;
- \`src/vehicle-dynamics.js\` — canonical public facade plus anti-roll/stationary-yaw/airborne wrapper behavior.

Correction completed:
- removed the historical filenames \`src/vehicle-dynamics-base.js\` and \`src/vehicle-dynamics-v21.29.js\`;
- kept the mathematical bodies behavior-equivalent while renaming boundaries by responsibility instead of release number;
- runtime composition continues to consume only \`src/vehicle-dynamics.js\`;
- migrated B4/B6/R23 source-location QA and CI triggers to the new owners;
- added a permanent C1 gate that forbids reintroduction of either historical filename in source, QA or CI.

Completion record:
- Ownership/reference audit branch \`audit/vehicle-dynamics-c1\`; audit run \`33346403163\`: PASS.
- First deterministic candidate run \`33346748390\`: all technical C1/steering/wheelspin/clutch/V21.30/V21.31, 288-case driving matrix, 80,000-sample stress and production-build checks passed; final workflow push alone failed because the Actions token could not modify workflow files.
- Final materialized candidate run \`33347058877\`: PASS including C1 ownership, R3/R13/R22, B4/B6, clutch and V21.30/V21.31 regressions, 288 driving cases, stress and production build.
- Historical layer removal commit: \`84cc707a\`.
- First permanent C1 gate run \`33347179269\` correctly exposed three stale ownership references (B4 CI, R23 CI and R23 QA); these were migrated instead of weakening the gate.
- Follow-up commits: \`8c2fd391\` (R23 QA), \`ae5f588d\` (B4 CI), \`1d146e71\` (R23 CI), \`f85e03d5\` (permanent C1 coverage extended to those ownership paths).
- Final permanent C1 gate run \`33347258753\`: PASS.
- Final Dev Integration run \`33347258757\`: PASS all 63 steps, including stress, 288 driving cases, R2–R20, forest/frame-pacing, WebGL, live route smoke, production build and code split.
- Human validation: not required for C1; the transformation is ownership/naming-only and the requested B3/R21–R23 in-game validations had already passed before C1.
- Result: version-number dynamics layers are gone; active ownership is visible from responsibility names and the runtime has one canonical import boundary.

---

### C2`,
  'C1 block'
);

replaceOnce(
  /# 6\. Recommended next task[\s\S]*?\n---\n\n# 7\. Work log/,
`# 6. Recommended next task

**Next: C2 — Flatten transmission controller layers.**

Start with an ownership/semantic audit of \`transmission-controller-base.js\` and \`transmission-controller.js\`. Preserve exact D/N/R behavior, make Neutral explicit without wrapper repair, retain multiplayer transmission serialization compatibility, and add a permanent C2 regression before removing any layer.

---

# 7. Work log`,
  'recommended next task'
);

replaceOnce(
  '# 7. Work log\n\n',
`# 7. Work log

## 2026-08-30 — C1 completed: vehicle dynamics layers renamed by responsibility

- Audited all direct consumers of the historical base/V21.29 layers before changing ownership.
- Replaced release-number layering with \`vehicle-dynamics-core.js\`, \`vehicle-dynamics-traction-steering.js\` and the canonical \`vehicle-dynamics.js\` facade without retuning equations.
- The permanent C1 gate deliberately caught three stale B4/R23 ownership references after integration; all three were migrated and the gate was strengthened rather than relaxed.
- Final C1 gate \`33347258753\` PASS; final Dev Integration \`33347258757\` PASS all 63 steps.
- Next focus: C2 transmission-controller consolidation.

## 2026-08-30 — B7 completed: grip-loss fallback yaw ownership narrowed

- Reviewed the former \`legacyGripYawAcceleration\` role after R7–R23.
- Retained only the low-physical-authority fallback, renamed/documented its ownership and protected the physical-solver handoff with permanent QA.
- Dedicated B7 \`33345155340\` PASS; Dev Integration \`33345155259\` PASS.

## 2026-08-30 — B3 human validation completed

- User confirmed ID.4/i3 handbrake/J-turn continuity, WRX/Civic comparison and F1 high-speed steering/understeer behavior are all good in-game.
- B3 is now fully DONE; its automated ownership/equivalence evidence plus human driver-feel acceptance are both complete.

`,
  'work log insertion'
);

fs.writeFileSync(path,text);
fs.unlinkSync(new URL(import.meta.url));
console.log('WORLD_DRIVE_TECH_DEBT_PLAN.md synced through C1; next task C2');

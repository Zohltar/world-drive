import fs from 'node:fs';
const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(path,'utf8');

s=s.replace(
  'Status: **IN PROGRESS — OWNERSHIP AUDIT COMPLETE (2026-08-30)**\n\nProposed module:\n- `src/physics/momentum-direction.js`',
  'Status: **DONE (2026-08-30)**\n\nProposed module:\n- `src/physics/momentum-direction.js`'
);
const oldB4=`- Source commit: _pending_\n- Permanent B4 QA: _pending_`;
const newB4=`- Candidate source commit: \`c1b780e3\`; integration source commit on \`dev\`: \`aaa3b009\`.\n- Numerical-equivalence QA: \`qa-momentum-direction-b4.mjs\` compares the extracted owner against the exact pre-B4 equations over 25,000 deterministic randomized states; candidate run \`33343053835\` PASS with max error exactly 0.\n- R11 and R23 source-location QA were migrated to the new momentum owner; equations/thresholds were unchanged.\n- Permanent B4 gate commit: \`877f0398\`; gate run \`33343158212\` PASS.\n- Dev Integration commit: \`0e895fb1\`; final run \`33343173064\` PASS all 61 steps, including 288 driving cases, 80,000 stress samples, R9/R11/R17/R18/R19/R20/R21/R23, WebGL, live route smoke and production build/code split.\n- Human validation: not required; this was a strict ownership extraction with bit-for-bit-equivalent momentum evolution in the randomized equivalence harness.\n- Result: \`src/physics/momentum-direction.js\` is now the single owner of physical \`velocityHeading\` evolution and body-relative momentum helpers; \`main.js\` retains storage/init/reset only.`;
if(!s.includes(oldB4))throw new Error('B4 pending record not found');
s=s.replace(oldB4,newB4);

s=s.replace(
  '### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**\n\nStatus: **TODO**',
  '### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**\n\nStatus: **IN PROGRESS — OWNERSHIP AUDIT COMPLETE (2026-08-30)**'
);
const oldB5=`Completion record:\n- Commit: _pending_\n- QA: _pending_\n\n---\n\n### B6 — Eliminate hidden wheelspin state and duplicate authority **[P0]**`;
const newB5=`Completion record:\n- Ownership audit branch: \`audit/yaw-b5\`; audit workflow commit \`3fe7c458\`; audit run \`33343248476\` PASS.\n- Audit result: local chassis yaw authority is still concentrated in \`src/driving-runtime-base.js\`. Multiplayer peer extrapolation and articulated trailer yaw are separate domains and remain outside B5.\n- Planned extraction boundary: bicycle-target saturation/slip conditioning, front/rear dominance, legacy RWD power-oversteer contribution, \`driftKinematicCoupling\`, R7 physical-authority gate, R16/R21 legacy-yaw filtering, physical-vs-legacy yaw-acceleration blend, yaw settling response and \`dynamicYawRate\` integration move to \`src/physics/yaw-authority.js\`. Tire-force generation remains in the per-wheel solver; momentum direction remains in B4's owner.\n- Source commit: _pending_\n- Permanent B5 QA: _pending_\n\n---\n\n### B6 — Eliminate hidden wheelspin state and duplicate authority **[P0]**`;
if(!s.includes(oldB5))throw new Error('B5 completion anchor not found');
s=s.replace(oldB5,newB5);

fs.writeFileSync(path,s);
console.log('TECH DEBT B4/B5 PLAN SYNC: PASS');

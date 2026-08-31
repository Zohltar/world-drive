import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C6.1 DONE; C6.2 presentation selected (2026-08-31)**',
  'Status: **IN PROGRESS — C6.1/C6.2 DONE; C6.3 wheelspin audit next (2026-08-31)**'
);

const boundaryAnchor='- dedicated QA must prove snapshot equivalence, stable diagnostics-root identity, no independent global writer, and unchanged exported presentation-state behavior.\n';
const completion=`\nC6.2 completed — local authored presentation diagnostics:\n- \`src/deferred-glb-system.js\` now binds the existing exported \`readLocalAuthoredPresentationState\` function directly to \`WorldDriveDiagnostics.presentation.localAuthored\`;\n- removed the unconsumed independent global writer \`__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__\`; no compatibility delegate was required because the fresh audit found no runtime or QA reader;\n- publish/reset/source-guarded clear semantics, sequence increments, night-level clamp, deferred active-update capture and deactivation clear remain unchanged;\n- no authored rendering values, deferred loading behavior, multiplayer packet semantics, vehicle physics or visual quality were changed.\n\nC6.2 completion record:\n- Read-only audit run \`33391592921\`: PASS; presentation and wheelspin ranked lowest risk, presentation selected to avoid physics-adjacent churn.\n- Candidate run \`33391965284\`: PASS C6.2/C6.1, M4 adapter, M4.11/M4.12, M3 protocol, Sonata ownership, 288 driving cases, full stress and production build.\n- Runtime integration commit: \`02935759\` — centralize authored presentation diagnostics.\n- Permanent C6.2 gate run \`33392124520\`: PASS on integrated runtime SHA.\n- Pre-registration Dev Integration \`33392124535\`: PASS 76/76 on integrated runtime.\n- Dev Integration registration commit: \`3d721bfa\` — C6.2 added explicitly after C6.1.\n- Final Dev Integration run \`33392329882\`: PASS **77/77**, including C6.2, full stress, 288 driving cases, M4.14/M4.15 WebGL, production build and code split.\n- Human validation: not required; C6.2 is diagnostics-only and rendering/network equivalence is covered directly by deterministic, multiplayer and WebGL integration QA.\n- Result: C6.2 is DONE. Wheelspin remains the next lowest-risk category but must start with an exact read-only seam audit because its writer lives in \`driving-runtime.js\`.\n`;
if(!text.includes(boundaryAnchor))throw new Error('C6.2 boundary anchor missing');
text=text.replace(boundaryAnchor,boundaryAnchor+completion);

text=text.replace(
  '**Next: C6.2 — migrate local authored presentation diagnostics.**\n\nImplement only the selected presentation slice: canonical `WorldDriveDiagnostics.presentation` ownership around the existing local authored presentation snapshot, with no rendering/network behavior change. Validate candidate equivalence before integrating to `dev`.',
  '**Next: C6.3 — audit wheelspin diagnostics ownership before migration.**\n\nStart read-only around `WorldDriveRuntimeWheelspin` in `driving-runtime.js`. Confirm exact write timing, payload identity, zero consumers/QA assumptions and interaction with B6/V21.29 wheelspin tests before considering canonical `WorldDriveDiagnostics.wheelspin` publication. Do not change traction behavior during the audit.'
);

const logAnchor='# 7. Work log\n';
const log=`\n## 2026-08-31 — C6.2 completed: authored presentation diagnostics\n\n- Audit \`33391592921\` selected presentation as the safest remaining diagnostic category.\n- Candidate \`33391965284\` PASS; runtime integration \`02935759\`; permanent gate \`33392124520\` PASS.\n- Dev Integration registration \`3d721bfa\`; final \`33392329882\` PASS 77/77.\n- Legacy \`__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__\` removed; canonical \`WorldDriveDiagnostics.presentation.localAuthored\` uses the unchanged exported snapshot function.\n- C6.3 wheelspin requires read-only physics-adjacent audit before any runtime edit.\n`;
if(!text.includes(logAnchor))throw new Error('work log anchor missing');
text=text.replace(logAnchor,logAnchor+log);

fs.writeFileSync(path,text);
console.log('C6.2 plan closure materialized');

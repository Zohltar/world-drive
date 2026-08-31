import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');
text=text.replace(
  'Status: **IN PROGRESS — C6.1 DONE; C6.2 audit next (2026-08-31)**',
  'Status: **IN PROGRESS — C6.1 DONE; C6.2 presentation selected (2026-08-31)**'
);

const anchor='- Result: C6.1 is DONE; remaining diagnostic categories stay intentionally untouched until individually audited.\n';
const insert=`\nC6.2 read-only audit — remaining diagnostic categories:\n- fresh branch \`audit/diagnostics-c6-2\` from post-C6.1 dev; run \`33391592921\`: PASS remaining-global inventory, C6.1 regression, runtime import/debt audit and production build;\n- 22 World Drive globals remain visible in the current source scan, including compatibility surfaces retained by C6.1;\n- lowest-risk categories are presentation and wheelspin, each with exactly one global, one writer, zero runtime readers, zero QA mentions and no version alias;\n- presentation global \`__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__\` is written only by \`src/deferred-glb-system.js\`; it exposes the existing \`readLocalAuthoredPresentationState\` snapshot and has no detected consumer of the global name;\n- wheelspin global \`WorldDriveRuntimeWheelspin\` is equally isolated but is emitted directly inside the driving/traction path, so it is intentionally deferred behind presentation to avoid unnecessary physics-adjacent churn;\n- higher-risk categories remain deferred: physics has source-string QA, road signs retain versioned QA contracts, multiplayer contains a multi-owner HD-visual global, streaming has a three-writer P9.23 runtime bridge, and traffic has five globals including two multi-owner surfaces.\n\nC6.2 selected boundary — local authored presentation diagnostics:\n- move global diagnostic authority for local authored brake/reverse/night presentation state under \`WorldDriveDiagnostics.presentation\`;\n- preserve the existing \`readLocalAuthoredPresentationState()\` exported API and the exact state object semantics;\n- because the legacy global has no runtime/QA consumer, do not keep an independent store; either remove it or retain only a live delegate if candidate validation exposes an external compatibility need;\n- no changes to authored model activation, deferred loading, brake/reverse/night values, multiplayer packet semantics or rendering behavior;\n- dedicated QA must prove snapshot equivalence, stable diagnostics-root identity, no independent global writer, and unchanged exported presentation-state behavior.\n`;
if(!text.includes(anchor))throw new Error('C6.1 result anchor missing');
text=text.replace(anchor,anchor+insert);

text=text.replace(
  '**Next: C6.2 — audit the next small diagnostic category before migration.**\n\nStart read-only from the remaining traffic, multiplayer, physics, wheelspin, streaming, road-sign and presentation globals. Prefer the smallest category with a clear single owner and few compatibility consumers; document exact writers/readers/QA contracts before changing runtime.',
  '**Next: C6.2 — migrate local authored presentation diagnostics.**\n\nImplement only the selected presentation slice: canonical `WorldDriveDiagnostics.presentation` ownership around the existing local authored presentation snapshot, with no rendering/network behavior change. Validate candidate equivalence before integrating to `dev`.'
);

fs.writeFileSync(path,text);
console.log('C6.2 presentation boundary recorded');

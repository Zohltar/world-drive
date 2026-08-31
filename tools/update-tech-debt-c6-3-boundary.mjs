import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C6.1/C6.2 DONE; C6.3 wheelspin audit next (2026-08-31)**',
  'Status: **IN PROGRESS — C6.1/C6.2 DONE; C6.3 wheelspin selected (2026-08-31)**'
);

const anchor='- Result: C6.2 is DONE. Wheelspin remains the next lowest-risk category but must start with an exact read-only seam audit because its writer lives in `driving-runtime.js`.\n';
const insert=`\nC6.3 read-only audit — runtime wheelspin diagnostic seam:\n- branch \`audit/diagnostics-c6-3\` from post-C6.2 plan state; first run \`33392687723\` failed only because the audit counted its own global-name string as a QA consumer; no runtime test executed or failed;\n- corrected audit run \`33392775159\`: PASS seam audit, B6 wheelspin ownership, V21.29 runtime wheelspin, Civic clutch wheelspin, 288 driving cases, runtime import/debt audit and production build;\n- \`WorldDriveRuntimeWheelspin\` has exactly one source owner in \`src/driving-runtime.js\`, one source occurrence, zero runtime readers and zero QA consumers;\n- current publication happens only after the non-drive early return, after \`wheelspinState.advance()\`, after any wheelspin acceleration/grip mutation, and immediately before returning the drive traction result;\n- exact legacy payload is \`{level: wheelspin.level, holdSec: wheelspin.holdSec, drivetrain, wheels: wheelspin.wheels}\`; it intentionally does not expose \`gripFactor\` or \`vehicleClass\`;\n- wheelspin resets during transmission handling do not eagerly republish diagnostics; the diagnostic refreshes only on the next drive-mode longitudinal traction call. This timing must remain unchanged.\n\nC6.3 selected boundary — canonical runtime wheelspin diagnostics:\n- publish the same four-field payload at the exact existing drive-only point under the stable canonical \`WorldDriveDiagnostics.wheelspin\` category;\n- preserve B6 \`wheelspinState\` as the sole behavioral owner; diagnostics must remain a post-calculation observer and must not feed grip, skidmarks, clutch or traction decisions;\n- remove \`WorldDriveRuntimeWheelspin\` rather than keeping an independent compatibility store because the fresh audit found no runtime or QA consumer;\n- preserve object-allocation/update cadence: one new diagnostic payload per drive-mode traction publication, no eager update on reset/non-drive modes;\n- candidate validation must include C6.3 equivalence, B6, V21.29 runtime/Civic wheelspin, driving simulation matrix, full stress and production build before integration.\n`;
if(!text.includes(anchor))throw new Error('C6.2 result anchor missing');
text=text.replace(anchor,anchor+insert);

text=text.replace(
  '**Next: C6.3 — audit wheelspin diagnostics ownership before migration.**\n\nStart read-only around `WorldDriveRuntimeWheelspin` in `driving-runtime.js`. Confirm exact write timing, payload identity, zero consumers/QA assumptions and interaction with B6/V21.29 wheelspin tests before considering canonical `WorldDriveDiagnostics.wheelspin` publication. Do not change traction behavior during the audit.',
  '**Next: C6.3 — migrate runtime wheelspin diagnostics.**\n\nImplement only the audited diagnostic publication seam in `driving-runtime.js`: same drive-only timing and four-field payload under `WorldDriveDiagnostics.wheelspin`, with B6 remaining the behavioral owner. No traction, grip, clutch, skidmark or wheelspin-equation changes.'
);

fs.writeFileSync(path,text);
console.log('C6.3 wheelspin boundary recorded');

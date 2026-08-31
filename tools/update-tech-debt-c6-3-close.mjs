import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

const oldStatus='Status: **IN PROGRESS — C6.1/C6.2 DONE; C6.3 wheelspin selected (2026-08-31)**';
const newStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3 DONE; C6.4 road-sign audit next (2026-08-31)**';
if(!text.includes(oldStatus))throw new Error('C6 status marker not found');
text=text.replace(oldStatus,newStatus);

const boundary=`C6.3 selected boundary — canonical runtime wheelspin diagnostics:\n- publish the same four-field payload at the exact existing drive-only point under the stable canonical \`WorldDriveDiagnostics.wheelspin\` category;\n- preserve B6 \`wheelspinState\` as the sole behavioral owner; diagnostics must remain a post-calculation observer and must not feed grip, skidmarks, clutch or traction decisions;\n- remove \`WorldDriveRuntimeWheelspin\` rather than keeping an independent compatibility store because the fresh audit found no runtime or QA consumer;\n- preserve object-allocation/update cadence: one new diagnostic payload per drive-mode traction publication, no eager update on reset/non-drive modes;\n- candidate validation must include C6.3 equivalence, B6, V21.29 runtime/Civic wheelspin, driving simulation matrix, full stress and production build before integration.`;
const completion=`${boundary}\n\nC6.3 completion record — canonical runtime wheelspin diagnostics:\n- candidate branch \`cleanup/diagnostics-c6-3\`; candidate run \`33393082870\`: PASS C6.3 equivalence, C6.1/C6.2 regressions, B6, V21.29 runtime/Civic wheelspin, Civic clutch-dump slip, 288 driving cases, full V21.31 stress, runtime import/debt audit, production build and diff hygiene;\n- candidate materialized runtime commit \`7e775a78\` changed only \`src/driving-runtime.js\` (3 additions / 1 deletion): no wheelspin equations, grip math, clutch timing, skidmark logic or traction behavior changed;\n- permanent C6.3 QA integrated on dev at \`cd70bb36\`; runtime + permanent gate integrated at \`7767d090\`; Dev Integration registration commit \`8be82fcb\`;\n- permanent C6.3 gate run \`33396349875\`: PASS C6.3, B6, V21.29 runtime wheelspin, Civic clutch wheelspin, 288 driving cases, runtime import/debt audit and production build;\n- final Dev Integration run \`33396451688\`: PASS **78/78**, including C6.3, full stress, 288 driving cases, R2–R20, forest/frame pacing, M4.14/M4.15 WebGL, live route smoke, production build and code split;\n- legacy \`WorldDriveRuntimeWheelspin\` removed; the unchanged four-field drive-only payload now publishes at \`WorldDriveDiagnostics.wheelspin.runtime\`; reset/non-drive publication cadence remains unchanged;\n- human validation: not required because C6.3 is telemetry-only and all mechanical/visual integration regressions remained green;\n- Result: **C6.3 DONE**. Next is C6.4 read-only audit of road-sign diagnostics before any alias migration.`;
if(!text.includes(boundary))throw new Error('C6.3 boundary marker not found');
text=text.replace(boundary,completion);

const oldNext=`**Next: C6.3 — migrate runtime wheelspin diagnostics.**\n\nImplement only the audited diagnostic publication seam in \`driving-runtime.js\`: same drive-only timing and four-field payload under \`WorldDriveDiagnostics.wheelspin\`, with B6 remaining the behavioral owner. No traction, grip, clutch, skidmark or wheelspin-equation changes.`;
const newNext=`**Next: C6.4 — audit road-sign diagnostic globals.**\n\nStart read-only: inventory every road-sign diagnostic global, writer, runtime reader and QA/source-string dependency before changing ownership. Preserve the P9.37 compatibility alias until its current consumer/QA contract is explicitly migrated; no road-sign rendering, placement, timing or sign-readout behavior changes during the audit.`;
if(!text.includes(oldNext))throw new Error('recommended next C6.3 marker not found');
text=text.replace(oldNext,newNext);

const historyMarker='## 2026-08-31 — C6.1 completed: canonical frame-pacing/forest diagnostics root';
const history=`## 2026-08-31 — C6.3 completed: canonical runtime wheelspin diagnostics\n\n- Audit \`33392775159\` PASS after correcting the audit self-reference false positive.\n- Candidate \`33393082870\` PASS; runtime materialization \`7e775a78\`.\n- Dev QA \`cd70bb36\`; runtime/permanent gate \`7767d090\`; permanent gate \`33396349875\` PASS.\n- Dev Integration registration \`8be82fcb\`; final run \`33396451688\` PASS 78/78.\n- Legacy \`WorldDriveRuntimeWheelspin\` removed; canonical \`WorldDriveDiagnostics.wheelspin.runtime\` preserves the exact drive-only four-field payload and cadence.\n- No human validation required; telemetry-only change with B6/mechanical regressions unchanged.\n- C6.4 road-sign diagnostics is next.\n\n`;
if(!text.includes(historyMarker))throw new Error('history insertion marker not found');
if(!text.includes('## 2026-08-31 — C6.3 completed:'))text=text.replace(historyMarker,history+historyMarker);

fs.writeFileSync(path,text);
console.log('C6.3 closure recorded; C6.4 selected');

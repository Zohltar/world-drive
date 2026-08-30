import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(path,'utf8');

const chain=`- R22: progressively soften F1 analog steering above ~145 km/h while preserving full-stick mechanical lock\n`;
if(!s.includes(chain))throw new Error('recent physics chain anchor missing');
s=s.replace(chain,chain+`- R23: remove legacy drift/yaw authority from the F1; real slip trajectory now uses per-wheel physical forces directly, with stale V21.21 F1 steering/stability QA retired\n`);

const old=`### B4 — Extract momentum-direction ownership **[P0/P1]**\n\nStatus: **TODO**\n`;
const next=`### B4 — Extract momentum-direction ownership **[P0/P1]**\n\nStatus: **IN PROGRESS — OWNERSHIP AUDIT COMPLETE (2026-08-30)**\n`;
if(!s.includes(old))throw new Error('B4 status anchor missing');
s=s.replace(old,next);

const pending=`Completion record:\n- Commit: _pending_\n- QA: _pending_\n\n---\n\n### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**`;
const record=`Completion record:\n- Ownership audit branch: \`audit/momentum-b4\`; audit workflow commit \`ef564c30\`.\n- Audit run \`33342452650\`: PASS. All frame-by-frame physical writes to \`velocityHeading\` remain concentrated in \`src/driving-runtime-base.js\`; \`main.js\` only owns storage/init/reset/serialization and \`vehicle-placement-controller.js\` only realigns momentum on explicit placement/reset. Multiplayer keeps a separate remote/interpolated representation and is outside B4 physical ownership.\n- Planned extraction boundary: body-relative longitudinal/steering projection, true-stop canonicalization, opposing body-drive crossing reconstruction, low-speed momentum following, force-derived trajectory rotation and momentum-heading rotation limiting move into \`src/physics/momentum-direction.js\` while global state storage remains unchanged.\n- R23 prerequisite completed before extraction: source \`ff36b40c\`, permanent F1 ownership QA \`52023fe9\`, stale F1 QA cleanup \`c6933883\`, current steering-rack gate \`acb467ff\`; R23 workflow \`33342416319\` PASS and Dev Integration \`33342416332\` PASS 60/60.\n- Source commit: _pending_\n- Permanent B4 QA: _pending_\n\n---\n\n### B5 — Extract yaw authority / bicycle↔physical transition **[P0/P1]**`;
if(!s.includes(pending))throw new Error('B4 completion anchor missing');
s=s.replace(pending,record);

fs.writeFileSync(path,s);
console.log('TECH DEBT PLAN R23/B4 SYNC: PASS');

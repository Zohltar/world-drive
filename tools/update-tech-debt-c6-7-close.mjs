import fs from 'node:fs';

const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(file,'utf8');

const oldStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3/C6.4/C6.5/C6.6 DONE; C6.7 multiplayer local-gear boundary selected (2026-08-31)**';
const newStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3/C6.4/C6.5/C6.6/C6.7 DONE; C6.8 multiplayer wire diagnostics audit next (2026-08-31)**';
if(!s.includes(oldStatus))throw new Error('C6 status marker not found');
s=s.replace(oldStatus,newStatus);

const boundaryEnd='- do not change outgoing/incoming packet transformation, exact gear publication, D/N/R semantics, local state composition, authored presentation state, civil traffic sharing or connection lifecycle;';
const completion=`${boundaryEnd}\n\nC6.7 completed — canonical multiplayer local-gear telemetry:\n- fresh remaining-global audit branch \`audit/diagnostics-c6-7\`, run \`33424801038\`: PASS; inventory reduced from the original 31 diagnostic globals to 14 remaining surfaces before C6.7, while confirming \`worldDriveDesktop\` is an Electron bridge rather than C6 diagnostic debt;\n- C6.7 selected only \`__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__\`: one writer, zero runtime readers and zero QA consumers; \`__WORLD_DRIVE_MULTIPLAYER_WIRE__\` and HD visuals were deliberately left untouched;\n- candidate run \`33425199708\`: PASS canonical local-gear diagnostics, C6.1-C6.6, C2 transmission ownership, D/N/R and direction regressions, M3 exact-gear protocol, shared multiplayer traffic, 288 driving cases, full stress, M4.15 network-to-WebGL reverse, import/debt audit and production build;\n- materialized candidate commit \`9f268ff8\`; clean dev integration commit \`0afd4f83\`; permanent C6.7 gate run \`33425417927\`: PASS;\n- Dev Integration registration commit \`a2214bd9\`; final Dev Integration run \`33425546266\`: PASS **82/82**, including C6.7 at step 30, full stress, 288 driving cases, R2-R20, traffic/multiplayer regressions, both WebGL tests, production build and code-split;\n- exact callable payload is unchanged: \`{gear, reversing}\` derives on demand from \`readTransmissionNetworkGear()\` through the same wire normalization; no packet transform, transmission publication, reversing semantics or connection lifecycle changed;\n- legacy \`__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__\` removed; canonical authority is now \`WorldDriveDiagnostics.multiplayer.localGear\`;\n- human validation: not required; telemetry-only ownership migration with exact-gear/network/WebGL regressions green.\n- Result: **C6.7 DONE**. C6.8 starts read-only on \`__WORLD_DRIVE_MULTIPLAYER_WIRE__\` before deciding whether its protocol-QA compatibility name can be retired.`;
if(!s.includes(boundaryEnd))throw new Error('C6.7 boundary marker not found');
s=s.replace(boundaryEnd,completion);

s=s.replace(/# 6\. Recommended next task\n\n\*\*Next:[\s\S]*?\n\n---\n\n# 7\. Work log/,`# 6. Recommended next task\n\n**Next: C6.8 — read-only audit of multiplayer wire diagnostics.**\n\nMap \`__WORLD_DRIVE_MULTIPLAYER_WIRE__\` exactly: writer count, QA/source-string contract, outgoing/incoming snapshot payload, publication timing and whether any external DevTools workflow depends on the legacy name. Do not modify packet transforms or network state until that audit proves a safe diagnostics-only boundary. Keep \`__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__\`, streaming, forest compatibility aliases and traffic out of scope.\n\n---\n\n# 7. Work log`);

const workLogMarker='# 7. Work log\n';
const workLog=`${workLogMarker}\n## 2026-08-31 — C6.7 completed: canonical multiplayer local-gear telemetry\n\n- Remaining-global audit \`33424801038\` selected the one-writer/no-reader/no-QA local-gear surface.\n- Candidate \`33425199708\` PASS including M3 protocol, shared traffic, 288 cases, stress and M4.15 network-to-WebGL reverse; materialized commit \`9f268ff8\`.\n- Clean dev integration \`0afd4f83\`; permanent gate \`33425417927\` PASS.\n- Dev Integration registration \`a2214bd9\`; final \`33425546266\` PASS **82/82**.\n- Legacy local-gear global removed; canonical \`WorldDriveDiagnostics.multiplayer.localGear\` preserves exact on-demand \`{gear,reversing}\` semantics.\n- C6.8 begins read-only on multiplayer wire diagnostics.\n\n`;
if(!s.includes(workLogMarker))throw new Error('work log marker not found');
s=s.replace(workLogMarker,workLog);

fs.writeFileSync(file,s);
console.log('Updated C6.7 closure and selected C6.8 audit');

import fs from 'node:fs';
const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(file,'utf8');

const oldStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3/C6.4/C6.5/C6.6/C6.7/C6.8 DONE; C6.9 fresh remaining-global audit next (2026-08-31)**';
const newStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3/C6.4/C6.5/C6.6/C6.7/C6.8 DONE; C6.9 traffic-network diagnostics boundary selected (2026-08-31)**';
if(!s.includes(oldStatus))throw new Error('C6.9 status marker not found');
s=s.replace(oldStatus,newStatus);

const marker='- Result: **C6.8 DONE**. C6.9 begins with a fresh read-only inventory; do not assume the previous HD-visual candidate remains the lowest-risk seam after C6.8.\n';
const addition=`${marker}\nC6.9 fresh post-C6.8 inventory and selected boundary — traffic-network diagnostics:\n- inventory audit branch \`audit/diagnostics-c6-9\`; run \`33429382828\`: PASS remaining-global inventory, C6.1-C6.8 regressions, runtime import/debt audit and production build;\n- only 12 World Drive-style global surfaces remain visible in browser source, of which 11 are C6 diagnostic/compatibility surfaces after explicitly excluding the real Electron preload bridge \`worldDriveDesktop\`;\n- remaining categories: traffic 5, multiplayer 1, streaming 1 and retained forest compatibility 4, plus the excluded desktop bridge;\n- fresh ranking changed the expected next target: \`WorldDriveTrafficNetwork\` is lower risk than multiplayer HD visuals because it has exactly one writer, zero runtime readers, zero QA/source-string consumers and no multi-owner state; HD visuals still has two writers;\n- targeted traffic-network audit run \`33429517787\`: PASS exact seam audit, C6.1-C6.8, shared/live Traffic MP1, local traffic/pool/preload regressions, runtime import/debt audit and production build;\n- \`WorldDriveTrafficNetwork\` is an invocation-only observer in \`src/civil-traffic-network-bridge.js\`; it reads the already-authoritative \`readCivilTrafficMultiplayerBridge()\` state and returns only \`{connected,ownId,authorityId,isAuthority,peers,remoteAgents,localAgents}\`;\n- the global is not read by election, snapshot sanitization, outgoing merge, incoming consumption, Node/Electron relay or rendering code; removing its independent writer cannot change traffic authority or transport if the callable is moved unchanged;\n- canonical C6.9 boundary: publish that same callable as \`WorldDriveDiagnostics.traffic.network\` and remove \`WorldDriveTrafficNetwork\`; no compatibility alias is justified by the fresh zero-reader/zero-QA audit;\n- keep \`WorldDriveTraffic\`, \`WorldDriveTrafficPool\`, \`WorldDriveTrafficPreload\`, \`WorldDriveTrafficSpawn\`, multiplayer HD visuals, local-world streaming and all forest compatibility aliases out of C6.9 scope;\n- do not change peer election, sequence handling, traffic snapshot sanitization, at-most-two-agent cap, outgoing authority merge, incoming legacy/network handling, Node/Electron relay or traffic rendering;\n- candidate validation must include dedicated C6.9 payload/ownership QA, C6.1-C6.8, all Traffic MP1/local/pool/preload regressions, M3 multiplayer protocol, 288 driving cases, full stress, M4.15 network-to-WebGL reverse, import/debt audit and production build.\n`;
if(!s.includes(marker))throw new Error('C6.8 result marker not found');
s=s.replace(marker,addition);

const oldNext='**Next: C6.9 — fresh read-only inventory of remaining diagnostic/compatibility globals.**\n\nRecount writers, runtime readers, QA/source-string consumers and multi-owner surfaces after C6.8. Explicitly exclude `worldDriveDesktop` from diagnostic debt. Do not select or modify HD visuals, streaming, forest aliases or traffic until the fresh post-C6.8 inventory confirms the safest next boundary.';
const newNext='**Next: C6.9 — implement canonical traffic-network diagnostics.**\n\nMove only the invocation-only `WorldDriveTrafficNetwork` observer to `WorldDriveDiagnostics.traffic.network` and remove the unused legacy writer. Preserve the entire Traffic MP1 authority/transport/rendering path exactly; all other traffic globals and compatibility surfaces remain out of scope.';
if(!s.includes(oldNext))throw new Error('recommended C6.9 audit marker not found');
s=s.replace(oldNext,newNext);

const workMarker='# 7. Work log\n';
const entry=`${workMarker}\n## 2026-08-31 — C6.9 audit completed: traffic-network diagnostics selected\n\n- Fresh inventory \`33429382828\` PASS: 12 visible global surfaces / 11 actionable after excluding the Electron desktop bridge.\n- Lowest-risk seam is \`WorldDriveTrafficNetwork\`: one writer, zero runtime readers, zero QA; HD visuals remains multi-owner.\n- Targeted audit \`33429517787\` PASS C6.1-C6.8, Traffic MP1 shared/live, local traffic/pool/preload, import audit and build.\n- Selected boundary: unchanged observer payload under \`WorldDriveDiagnostics.traffic.network\`; no traffic authority/transport/rendering changes.\n\n`;
if(!s.includes(workMarker))throw new Error('work log marker not found');
s=s.replace(workMarker,entry);

fs.writeFileSync(file,s);
console.log('Recorded C6.9 traffic-network audit and selected boundary');

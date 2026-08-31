import fs from 'node:fs';

const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(file,'utf8');

const old=`Next C5 step:\n- C5.3 begins with a fresh read-only audit of the remaining \`main.js\` responsibilities after C5.1/C5.2;\n- choose the next extraction by cohesion and risk, not by line-count alone;\n- continue to avoid diagnostics consolidation until C6 unless C5 only moves publishing/composition plumbing.`;
const next=`C5.3 audit completed — selected boundary: world render scene composition:\n- post-C5.2 audit measured \`main.js\` at 2925 lines / 90703 bytes, with 56 imports and 96 top-level functions; audit branch \`audit/main-c5-3\`, run \`33354173410\` PASS source inventory, import/debt audit and production build;\n- defer the ~105-line performance governor despite its cohesion because frame pacing is more behavior-sensitive than the next available composition extraction;\n- C5.3 will introduce canonical \`src/world-scene.js\` for static Three world-group construction, the near-terrain ground mesh/material, exact near-terrain constants and static matrix/origin helpers;\n- keep mutable \`worldOffset\` / \`toRender\` in \`main.js\`;\n- keep streaming-coordinator ownership, terrain-service rebuild policy and frame/performance-governor logic in \`main.js\`;\n- preserve exact group order, initial ground geometry/material/stencil settings, 5600 m near-terrain size, 448 terrain-segment policy, initial 88x88 ground plane, matrix-freeze behavior and streamed-origin reset semantics.\n\nC5.3 required validation:\n- dedicated ownership/behavior QA for world groups, ground material/geometry and matrix/origin helpers;\n- terrain visual ownership + V21.31 terrain/road regressions;\n- 288 driving cases, stress and production build;\n- full Dev Integration before C5.3 is declared done.`;
if(!text.includes(old))throw new Error('C5.3 audit placeholder not found');
text=text.replace(old,next);

const oldRecommended=`**Next: C5.3 — audit the remaining \`main.js\` responsibilities and select the next low-risk cohesive extraction.**\n\nStart from the post-C5.2 source, quantify remaining ownership blocks and dependencies, and prefer composition/configuration plumbing over physics, terrain rules or diagnostics. Record the selected C5.3 boundary here before implementation, then validate it with dedicated QA plus full Dev Integration.`;
const newRecommended=`**Next: C5.3 — extract world render scene composition into \`src/world-scene.js\`.**\n\nMove only static Three world-group/ground construction plus exact matrix/origin helpers and near-terrain constants. Keep mutable world offset, streaming policy, terrain rebuild policy, diagnostics and frame governor in \`main.js\`. Preserve all visual constants exactly and require dedicated QA plus full Dev Integration.`;
if(!text.includes(oldRecommended))throw new Error('C5.3 recommended audit text not found');
text=text.replace(oldRecommended,newRecommended);

const marker='# 7. Work log\n';
const i=text.indexOf(marker);
if(i<0)throw new Error('work log marker missing');
const entry=`\n## 2026-08-30 — C5.3 audit completed; world-scene boundary selected\n\n- Fresh post-C5.2 audit: \`main.js\` = 2925 lines / 90703 bytes / 56 imports / 96 top-level functions. Audit run \`33354173410\` PASS.\n- Performance governor (~105 contiguous lines) deliberately deferred because of frame-pacing sensitivity.\n- Selected C5.3: static world render scene composition into \`src/world-scene.js\`; mutable world offset, streaming and terrain policy stay in \`main.js\`.\n- Required invariant: exact group order, ground visual/stencil constants, near-terrain 5600/448 policy, initial 88x88 plane and matrix/origin behavior.\n`;
text=text.slice(0,i+marker.length)+entry+text.slice(i+marker.length);

fs.writeFileSync(file,text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log('C5.3 boundary recorded in tech debt plan');

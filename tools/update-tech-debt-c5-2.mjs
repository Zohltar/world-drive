import fs from 'node:fs';

const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(file,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C5.1 DONE (2026-08-30)**',
  'Status: **IN PROGRESS — C5.1 + C5.2 DONE (2026-08-30)**'
);

const oldNext=`Next C5 extraction:\n- C5.2: extract sky/lighting construction (hemisphere light, sun, crescent-moon texture/sprite/light and moon positioning) behind a responsibility-based module;\n- retain \`environment-controller.js\` as owner of time-of-day/display-distance behavior;\n- retain \`animate()\` cadence and performance-governor ownership in \`main.js\` for this step;\n- verify exact light/material constants plus environment QA, stress, driving matrix and build before integration.\n\nCompletion record:\n- C5 overall remains open until additional high-value responsibilities are removed and \`main.js\` is materially closer to a composition root.`;
const newNext=`C5.2 completed — sky/lighting construction:\n- extracted hemisphere light, sun construction, crescent-moon texture/sprite/light and moon positioning into canonical \`src/sky-lighting.js\`;\n- preserved every accepted sky/light constant, moon canvas/halo geometry, shadow envelope, sprite scale/material and the 3100 m / 850 m camera-relative moon positioning distances;\n- kept \`environment-controller.js\` authoritative for time-of-day, sun/moon intensity/direction, display distance and automatic-headlight daylight behavior;\n- kept \`animate()\` authoritative for moon-update cadence through \`perfGovernor.nextMoonAt\`;\n- removed 112 net lines from \`main.js\` in the clean integration commit without changing visual policy.\n\nC5.2 completion record:\n- Integration commit: \`d791b046\` — move sky lighting out of main.\n- Dev Integration registration commit: \`d00d648a\`.\n- Permanent C5.2 gate run \`33353945084\`: PASS exact sky-light contract, environment regression, Sonata/WRX night lighting, 288 driving cases, stress and build.\n- Final C5.2 Dev Integration run \`33353966798\`: PASS 71/71.\n- Human validation: not required for this exact extraction; accepted light/material constants and the existing environment/night-lighting behavior are directly protected by QA.\n\nNext C5 step:\n- C5.3 begins with a fresh read-only audit of the remaining \`main.js\` responsibilities after C5.1/C5.2;\n- choose the next extraction by cohesion and risk, not by line-count alone;\n- continue to avoid diagnostics consolidation until C6 unless C5 only moves publishing/composition plumbing.\n\nCompletion record:\n- C5 overall remains open until the remaining high-value responsibilities are reduced enough that \`main.js\` is materially a composition root.`;
if(!text.includes(oldNext))throw new Error('C5.2 pending block not found');
text=text.replace(oldNext,newNext);

const oldRecommended=`# 6. Recommended next task\n\n**Next: C5.2 — extract sky/lighting construction from \`main.js\`.**\n\nKeep time-of-day policy in \`environment-controller.js\` and frame cadence/performance-governor logic in \`main.js\`. Move only static sky-light construction and moon positioning behind a responsibility-based module, preserve every accepted visual constant, and require dedicated QA plus full Dev Integration before continuing C5.`;
const newRecommended=`# 6. Recommended next task\n\n**Next: C5.3 — audit the remaining \`main.js\` responsibilities and select the next low-risk cohesive extraction.**\n\nStart from the post-C5.2 source, quantify remaining ownership blocks and dependencies, and prefer composition/configuration plumbing over physics, terrain rules or diagnostics. Record the selected C5.3 boundary here before implementation, then validate it with dedicated QA plus full Dev Integration.`;
if(!text.includes(oldRecommended))throw new Error('recommended C5.2 block not found');
text=text.replace(oldRecommended,newRecommended);

const marker='# 7. Work log\n';
const i=text.indexOf(marker);
if(i<0)throw new Error('work log marker missing');
const entry=`\n## 2026-08-30 — C5.2 completed: sky/lighting construction extracted\n\n- Added canonical \`src/sky-lighting.js\` for static hemisphere/sun/moon construction and camera-relative moon positioning.\n- Time-of-day/display-distance policy remains in \`environment-controller.js\`; moon cadence/performance-governor ownership remains in \`main.js\`.\n- Clean integration \`d791b046\` removed 112 net lines from \`main.js\`; Dev Integration registration \`d00d648a\`.\n- Permanent C5.2 gate \`33353945084\` PASS; final Dev Integration \`33353966798\` PASS 71/71.\n- Next focus: C5.3 fresh responsibility audit before choosing another extraction.\n`;
text=text.slice(0,i+marker.length)+entry+text.slice(i+marker.length);

fs.writeFileSync(file,text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log('Tech debt plan updated through C5.2');

import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 + C5.5 + C5.6 DONE (2026-08-31)**',
  'Status: **DONE (2026-08-31)**'
);

const nextBlock=`Next C5 step:\n- C5.7 begins with a fresh post-C5.6 read-only responsibility audit of \`main.js\`;\n- continue to prefer cohesive composition/plumbing boundaries and keep frame governor/animate, route, hydro and vehicle behavior deferred unless the audit identifies a clearly safer seam.\n\nCompletion record:\n- C5 overall remains open until the remaining high-value responsibilities are reduced enough that \`main.js\` is materially a composition root.\n`;
const closure=`C5.7 closure audit — no further low-risk extraction justified:\n- audit branch \`audit/main-c5-7\`, run \`33384448039\`: PASS brace-aware responsibility inventory, runtime import/debt audit and production build;\n- post-C5.6 \`main.js\` = 2722 lines / 85528 bytes / 59 imports / 83 declared functions + 32 arrow definitions; all 115 source modules are runtime-reachable;\n- brace-aware measurement removed prior false-large spans and identified the remaining largest responsibilities accurately: \`animate\` 190 lines, road-metadata loading 61, vehicle nearest-route optimization 44, terrain frame 38, V21 menu composition 35, governor functions 31/26;\n- the remaining large blocks are behavior/performance sensitive (frame loop/governor, road metadata affecting grip/speed-limit state, route-nearest driving optimization, terrain/road support) and should not be moved merely to reduce line count;\n- the largest remaining low-behavior block, \`ensureV21MenuSystem\` (~35 lines), is almost entirely dependency/callback composition; moving it would create another wiring layer without reducing actual coupling; collapsible-panel wiring is only ~13 lines and similarly not worth a module;\n- C5 therefore stops at the point of diminishing returns rather than forcing architectural churn.\n\nC5 completion record:\n- \`main.js\` reduced from 3245 to 2722 lines: 523 net lines removed (~16.1%) across six responsibility-based extractions/corrections;\n- completed owners: world materials, sky lighting, world scene, geographic sign orchestration, stable settings lifecycle, loaded-settings runtime/UI application;\n- C5 also fixed a real stale settings-reference persistence bug and modernized stale source-location QA without altering accepted physics, visuals or frame-pacing policy;\n- final C5.6 Dev Integration \`33384125829\`: PASS 75/75; C5.7 closure audit \`33384448039\`: PASS;\n- human validation: not required for C5 closure; no new behavior change occurred in C5.7, and each behavior-adjacent extraction already had dedicated regression coverage.\n- Result: \`main.js\` is materially more composition-oriented; remaining runtime-heavy responsibilities are intentionally retained until/if they receive their own behavior-focused refactor plan.\n`;
if(!text.includes(nextBlock))throw new Error('C5 next-step/closure anchor missing');
text=text.replace(nextBlock,closure);

const recommended=`**Next: C5.7 — fresh post-C5.6 responsibility audit of \`main.js\`.**\n\nRe-measure the remaining responsibilities after \`main.js\` reached 2722 lines. Select the next step by cohesion and risk rather than line count; continue to keep frame governor/animate, route, hydro and vehicle behavior deferred unless a clearly safer composition boundary emerges.`;
const recommendedReplacement=`**Next: C6 — consolidate diagnostic globals.**\n\nC5 is closed after the C5.7 audit found no further worthwhile low-risk \`main.js\` boundary. Start C6 with a read-only inventory of active diagnostic globals/aliases and their QA consumers; define a compatibility-preserving migration plan before changing runtime diagnostics.`;
if(!text.includes(recommended))throw new Error('recommended C5.7 anchor missing');
text=text.replace(recommended,recommendedReplacement);

const logAnchor='# 7. Work log\n\n';
const entry=`## 2026-08-31 — C5 closed after C5.7 diminishing-returns audit\n\n- Brace-aware audit \`33384448039\` PASS: \`main.js\` = 2722 lines / 85528 bytes / 59 imports / 83 declared functions + 32 arrow definitions; 115/115 source modules runtime-reachable.\n- Remaining large owners are behavior/performance-sensitive: frame loop/governor, road metadata, nearest-route vehicle optimization, terrain/road support.\n- V21 menu composition (~35 lines) and collapsible-panel wiring (~13 lines) are too small/wiring-heavy to justify another module.\n- C5 closes at 3245 -> 2722 lines (523 lines, ~16.1%) after six coherent extractions and one real settings-reference bug fix.\n- Final preceding Dev Integration \`33384125829\` PASS 75/75; C5.7 audit/build PASS.\n- Next focus: C6 read-only inventory of diagnostic globals and compatibility aliases.\n\n`;
if(!text.includes(logAnchor))throw new Error('work log anchor missing');
text=text.replace(logAnchor,logAnchor+entry);

fs.writeFileSync(path,text);
console.log('C5 closure recorded');

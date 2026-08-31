import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — audit complete, C6.1 selected (2026-08-31)**',
  'Status: **IN PROGRESS — C6.1 DONE; C6.2 audit next (2026-08-31)**'
);

const oldRecord=`Completion record:\n- Audit V1: \`33386355567\` PASS (consumer scan later strengthened).\n- Audit V2: \`33386461640\` PASS.\n- C6.1 commit: _pending_\n- C6.1 QA: _pending_`;
const newRecord=`C6.1 completed — canonical diagnostics root + frame-pacing/forest bridge:\n- added canonical \`src/diagnostics.js\` with one stable \`WorldDriveDiagnostics\` root; frame-pacing and forest diagnostics now publish through that authority;\n- preserved \`WorldDriveFramePacing\` and \`__WORLD_DRIVE_P928_RECORD_HITCH__\` as live compatibility delegates/fallbacks rather than independent stores;\n- startup forest readiness now prefers canonical forest diagnostics while P9.33/P9.34/P9.35 READY compatibility remains equivalent;\n- modernized stale V21.22.3 hitch-free QA to current ownership/accepted values and P9.29 to canonical-first hitch-recorder semantics without changing thresholds/timing;\n- no physics, visual-quality, forest-density, streaming-distance or frame-budget tuning was introduced.\n\nCompletion record:\n- Audit V1: \`33386355567\` PASS (consumer scan later strengthened).\n- Audit V2: \`33386461640\` PASS.\n- Candidate final run \`33387813899\`: PASS C6.1, C4, modernized V21.22.3, P9.29–P9.42, forest runtime/stress, 288 driving cases, full stress and production build.\n- Runtime integration commit: \`b8104d63\` — centralize frame and forest diagnostics.\n- Permanent C6.1 gate run \`33388072639\`: PASS.\n- Dev Integration registration commit: \`8786af33\` — C6.1 added explicitly as step 24.\n- Final Dev Integration run \`33391069457\`: PASS **76/76**, including C6.1, full stress, 288 driving cases, M4.14/M4.15 WebGL, production build and code split.\n- Human validation: not required; C6.1 changes diagnostics ownership/compatibility only and all runtime-facing forest/frame-pacing semantics are directly covered by deterministic and integration QA.\n- Result: C6.1 is DONE; remaining diagnostic categories stay intentionally untouched until individually audited.`;
if(!text.includes(oldRecord))throw new Error('C6.1 completion record anchor not found');
text=text.replace(oldRecord,newRecord);

text=text.replace(
  '**Next: C6.1 — canonical diagnostics root + frame-pacing/forest bridge.**\n\nThe strengthened C6 audit is complete. Implement the first compatibility-preserving slice only: one stable diagnostics root for frame pacing/forest, with current P9.28 and frame-pacing aliases delegating to the same authority and startup forest readiness migrated to the canonical path.',
  '**Next: C6.2 — audit the next small diagnostic category before migration.**\n\nStart read-only from the remaining traffic, multiplayer, physics, wheelspin, streaming, road-sign and presentation globals. Prefer the smallest category with a clear single owner and few compatibility consumers; document exact writers/readers/QA contracts before changing runtime.'
);

const worklogAnchor='# 7. Work log\n';
const entry=`\n## 2026-08-31 — C6.1 completed: canonical frame-pacing/forest diagnostics root\n\n- Runtime integration \`b8104d63\`; permanent C6.1 gate \`33388072639\` PASS.\n- Dev Integration registration \`8786af33\`; final run \`33391069457\` PASS 76/76.\n- Candidate \`33387813899\` passed the full forest/frame-pacing stack, 288 driving cases, stress and build.\n- V21.22.3 and P9.29 stale source-location assertions were modernized to current ownership without restoring historical policy.\n- C6.2 remains read-only until the next category's writers/readers/QA contracts are mapped.\n`;
if(!text.includes(worklogAnchor))throw new Error('work log anchor not found');
text=text.replace(worklogAnchor,worklogAnchor+entry);

fs.writeFileSync(path,text);
console.log('C6.1 plan closure materialized');

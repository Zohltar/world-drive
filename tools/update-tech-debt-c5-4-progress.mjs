import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 DONE (2026-08-30)**',
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 DONE (2026-08-30)**'
);

const start='C5.4 audit completed — selected boundary: geographic sign orchestration:';
const end='Completion record:\n- C5 overall remains open until the remaining high-value responsibilities are reduced enough that `main.js` is materially a composition root.';
const startIndex=text.indexOf(start);
const endIndex=text.indexOf(end,startIndex);
if(startIndex<0||endIndex<0)throw new Error('C5.4 plan block markers missing');

const completed=`C5.4 completed — geographic sign orchestration:\n- post-C5.3 audit measured \`main.js\` at 2859 lines / 88091 bytes, with 57 imports and 93 top-level functions; audit branch \`audit/main-c5-4\`, run \`33354840492\` PASS responsibility inventory, import/debt audit and production build;\n- completed the boundary already documented in \`src/signs.js\`: OSM sign/city/river loading/parsing remains in \`createSignDataService(...)\`, while fallback city/river/speed selection and placement orchestration now live in canonical \`createGeographicSignOrchestrator(...)\`;\n- kept \`road-furniture.js\` / P9.30 authoritative for 3D sign geometry/materials, atomic sign refresh, face cache and frame-budget behavior;\n- froze exact geographic-sign policy in \`GEOGRAPHIC_SIGN_POLICY\`: route correlation <120 m, speed confidence >.20, nearby-speed suppression <900 m, speed +95 m, river -22 m, city -55 m and visible corridor +/-1600 m;\n- preserved endpoint city deduplication, French river-name priority, road-height placement, side=1 semantics, sign status count, minimap consumption and transient readout behavior;\n- reduced \`main.js\` from 2859 to 2782 lines (77 net lines) without visual, routing, physics, streaming or metadata tuning.\n\nC5.4 material discovery — stale V21.25 sign-readout QA:\n- candidate validation exposed that \`qa/V21_25_MINIMAP_SIGN_READOUT_QA.mjs\` still required the historical literal \`currentRoadGuideSign={...}\` inside \`main.js\`;\n- current production ownership already creates the guide descriptor in \`road-furniture-p930.js\`, publishes it through \`setRoadGuideSign(...)\`, stores only the current value in \`main.js\`, resets it through \`route-lifecycle.js\`, and consumes it in \`minimap.js\`;\n- modernized the QA to protect that real ownership chain instead of reintroducing stale source-location code;\n- the accepted transient readout remains explicitly protected at 5000 ms duration with 1100 ms fade and bidirectional re-arm behavior.\n\nC5.4 completion record:\n- Integration commit: \`bf820b19\` — move geographic sign orchestration out of main.\n- Dev Integration registration commit: \`f1ef70bb\`.\n- Candidate validation run \`33355404813\`: PASS C5.4 policy/ownership, P9.30 sign runtime, minimap, updated sign readout, import audit, 288 driving cases, stress, build and diff hygiene.\n- Permanent C5.4 gate run \`33355486837\`: PASS.\n- Final C5.4 Dev Integration run \`33355510959\`: PASS 73/73, with C5.4 explicitly executed plus WebGL reverse, build and production code-split QA.\n- Human validation: not required for this exact wiring/ownership extraction; exact sign policy, 3D sign runtime, minimap/readout behavior and full integration are directly protected.\n\nNext C5 step:\n- C5.5 begins with a fresh post-C5.4 audit before selecting another boundary;\n- continue to prefer cohesive UI/composition/plumbing extraction over frame-governor, physics, route, hydro or vehicle behavior unless the audit shows a cleaner boundary.\n\n`;
text=text.slice(0,startIndex)+completed+text.slice(endIndex);

text=text.replace(
  '**Next: C5.4 — complete geographic sign orchestration extraction into `src/signs.js`.**\n\nMove only fallback city/river/speed selection and sign-placement orchestration. Keep OSM loading/parsing in the existing sign data service and keep all 3D sign construction/frame-budget ownership in `road-furniture.js`. Preserve thresholds and placement constants exactly; require dedicated sign orchestration QA, existing sign/minimap regressions, stress and full Dev Integration.',
  '**Next: C5.5 — fresh post-C5.4 responsibility audit of `main.js`.**\n\nRe-measure the remaining responsibilities after `main.js` reached 2782 lines. Choose the next extraction by cohesion and risk, favoring UI/composition/plumbing when practical. Continue to defer frame-governor, route/hydro/vehicle behavior and C6 diagnostics unless the audit proves a smaller, safer boundary.'
);

const logAnchor='# 7. Work log\n\n';
if(!text.includes(logAnchor))throw new Error('work-log anchor missing');
const log=`## 2026-08-30 — C5.4 completed: geographic sign orchestration extracted\n\n- C5.4 audit \`33354840492\` selected the existing \`signs.js\` fallback/orchestration boundary; no new competing subsystem was introduced.\n- Added \`createGeographicSignOrchestrator(...)\` and frozen exact fallback/placement policy while leaving OSM parsing in the sign data service and 3D construction in road furniture.\n- Clean integration \`bf820b19\`; Dev Integration registration \`f1ef70bb\`; resulting \`main.js\` = 2782 lines.\n- Candidate \`33355404813\` PASS; permanent gate \`33355486837\` PASS; final Dev Integration \`33355510959\` PASS 73/73.\n- Discovery: stale V21.25 minimap sign-readout QA was migrated to current road-furniture → main → route-lifecycle → minimap ownership; accepted 5 s readout + 1.1 s fade remains protected.\n- Next focus: C5.5 fresh audit before another extraction.\n\n`;
text=text.replace(logAnchor,logAnchor+log);

fs.writeFileSync(path,text);
console.log('C5.4 progress recorded in tech-debt plan');

import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 + C5.5 DONE (2026-08-30)**',
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 + C5.5 + C5.6 DONE (2026-08-31)**'
);

const nextAnchor=`Next C5 step:\n- implement C5.6 on an isolated cleanup branch using a small canonical runtime-settings applicator module;\n- validate C5.5 identity/persistence, V21.25 UI, V21.26 environment, imagery/settings behavior, import audit, 288 driving cases, stress and production build before integration.\n`;
const completed=`C5.6 completed — loaded-settings runtime/UI application:\n- added canonical \`src/loaded-settings-application.js\` for applying already-loaded settings to live runtime/UI state while keeping persistence/schema ownership in \`application-settings.js\`;\n- preserved exact semantics: only literal \`manual\` selects manual, only explicit \`false\` disables assist/road-speed-limit honoring, imagery toggles only on mismatch, display distance falls back to \`high\`, Assist label remains \`Assist: ON/OFF\`, transmission selector/runtime controls remain synchronized;\n- preserved dynamic assist-element lookup and startup order \`settings load -> install menu -> apply settings -> initial route\`;\n- modernized C5.5 QA so it protects identity/persistence rather than pinning runtime application to \`main.js\`;\n- modernized V21.25 UI-refactor QA so it protects current import/composition/delegation instead of requiring the historical implementation body in \`main.js\`;\n- reduced \`main.js\` from 2752 to 2722 lines (30 net lines) without physics, visual, routing, hydro, vehicle-selection or frame-governor changes.\n\nC5.6 completion record:\n- Audit run \`33382825080\`: PASS.\n- Candidate green run \`33383932517\`: PASS C5.6 semantics, C5.5 identity, V21.25 UI init/refactor, V21.26 environment, import/debt audit, 288 driving cases, stress, build and diff hygiene.\n- Candidate materialized commit: \`17e5c931\`.\n- Integration commit: \`59d12aee\` — move loaded settings application out of main.\n- Dev Integration registration commit: \`2e1f7c2e\`.\n- Permanent C5.6 gate run \`33384073842\`: PASS.\n- Final C5.6 Dev Integration run \`33384125829\`: PASS 75/75, with C5.6 explicitly executed at step 23 plus stress, 288 driving cases, both WebGL reverse tests, build and production code-split QA.\n- Human validation: not required for this exact settings-plumbing extraction; all preserved semantics and startup/UI/environment contracts are directly reproduced by QA.\n\nNext C5 step:\n- C5.7 begins with a fresh post-C5.6 read-only responsibility audit of \`main.js\`;\n- continue to prefer cohesive composition/plumbing boundaries and keep frame governor/animate, route, hydro and vehicle behavior deferred unless the audit identifies a clearly safer seam.\n`;
if(!text.includes(nextAnchor))throw new Error('C5.6 next-step anchor missing');
text=text.replace(nextAnchor,completed);

const recommended=`**Next: C5.6 — extract loaded-settings runtime/UI application.**\n\nThe post-C5.5 audit is complete and selected the settings-application boundary. Move only the application of already-loaded settings into a small canonical runtime applicator while keeping persistence in \`application-settings.js\` and startup composition/state ownership in \`main.js\`. Preserve exact UI, imagery, environment and transmission semantics; keep frame governor, route, hydro, vehicle behavior and C6 diagnostics deferred.`;
const recommendedReplacement=`**Next: C5.7 — fresh post-C5.6 responsibility audit of \`main.js\`.**\n\nRe-measure the remaining responsibilities after \`main.js\` reached 2722 lines. Select the next step by cohesion and risk rather than line count; continue to keep frame governor/animate, route, hydro and vehicle behavior deferred unless a clearly safer composition boundary emerges.`;
if(!text.includes(recommended))throw new Error('recommended C5.6 task anchor missing');
text=text.replace(recommended,recommendedReplacement);

const logAnchor='# 7. Work log\n\n';
const entry=`## 2026-08-31 — C5.6 completed: loaded settings application extracted\n\n- Audit \`33382825080\` selected the loaded-settings runtime/UI boundary after rejecting false-large parser spans and higher-risk frame/route/hydro/vehicle areas.\n- Candidate exposed two stale source-location assertions: C5.5 pinned \`applyLoadedV21Settings()\` to main, then V21.25 UI refactor did the same. Both discoveries were recorded before QA modernization; no old runtime behavior was reintroduced.\n- Candidate \`33383932517\` PASS; materialized commit \`17e5c931\`; clean integration \`59d12aee\`; permanent gate \`33384073842\` PASS.\n- Dev Integration registration \`2e1f7c2e\`; final Dev Integration \`33384125829\` PASS 75/75.\n- \`main.js\`: 2752 -> 2722 lines. No human validation required for this exact plumbing extraction.\n- Next focus: C5.7 fresh read-only responsibility audit.\n\n`;
if(!text.includes(logAnchor))throw new Error('work log anchor missing');
text=text.replace(logAnchor,logAnchor+entry);

fs.writeFileSync(path,text);
console.log('C5.6 completion recorded');

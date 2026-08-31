import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

text=text.replace(
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 DONE (2026-08-30)**',
  'Status: **IN PROGRESS — C5.1 + C5.2 + C5.3 + C5.4 + C5.5 DONE (2026-08-30)**'
);

const start='C5.5 audit completed — selected boundary: stable application-settings identity/lifecycle:';
const end='Completion record:\n- C5 overall remains open until the remaining high-value responsibilities are reduced enough that `main.js` is materially a composition root.';
const startIndex=text.indexOf(start);
const endIndex=text.indexOf(end,startIndex);
if(startIndex<0||endIndex<0)throw new Error('C5.5 plan block markers missing');

const completed=`C5.5 completed — stable application-settings identity/lifecycle:\n- post-C5.4 audit measured \`main.js\` at 2782 lines / 85782 bytes, with 57 imports and 88 top-level functions; audit branch \`audit/main-c5-5\`, run \`33355730962\` PASS responsibility inventory, import/debt audit and production build;\n- material functional discovery confirmed that the boot path replaced \`appSettings\` after \`keyboard-controls.js\` and \`environment-controller.js\` had captured the original defaults root, while \`WorldSettings.load()\` returns a fresh merged object;\n- this could make loaded custom keyboard bindings invisible to the keyboard controller, let rebinding mutate a stale root while a different root was saved, and let display-distance changes diverge from persisted settings; gamepad/autopilot getter-based access was not affected;\n- added canonical \`src/application-settings.js\` with one stable settings root, recursive in-place load, default-safe cloning and the existing exact 120 ms save debounce;\n- root identity and nested plain-object identities (controls, keyboard, gamepad, display) now survive IndexedDB load, so controllers constructed before async boot continue observing and mutating the same settings objects;\n- pre-load save remains a no-op; post-load saves debounce/cancel exactly as before and persist edits made through pre-load captured references;\n- \`applyLoadedV21Settings()\` remains in \`main.js\` as runtime/UI application orchestration; settings schema/default values and accepted UI/environment behavior were not tuned;\n- reduced \`main.js\` from 2782 to 2752 lines (30 net lines) while fixing the stale-reference bug.\n\nC5.5 completion record:\n- Candidate validation run \`33356127350\`: PASS stable root/nested identity, loaded keyboard visibility, persistence through captured references, 120 ms debounce, V21.25 UI init/refactor, V21.26 environment, import/debt audit, 288 driving cases, stress, build and diff hygiene.\n- Note: earlier run \`33356122826\` passed all functional tests but its final candidate push lost a branch fast-forward race; this was a push-only failure, not a runtime/QA failure.\n- Integration commit: \`6cec0450\` — keep application settings identity stable.\n- Dev Integration registration commit: \`02b27eb1\`.\n- Permanent C5.5 gate run \`33356215309\`: PASS.\n- Final C5.5 Dev Integration run \`33356240462\`: PASS 74/74, with C5.5 explicitly executed plus stress, 288 driving cases, both WebGL reverse tests, build and production code-split QA.\n- Human validation: not required for this identity/persistence correction; the previously stale reference behavior and all affected UI/environment contracts are directly reproduced and protected by QA.\n\nNext C5 step:\n- C5.6 begins with a fresh post-C5.5 read-only audit before selecting another boundary;\n- continue to prefer cohesive composition/plumbing cleanup and keep the frame-performance governor, route/hydro/vehicle behavior and C6 diagnostics deferred unless the audit proves a smaller safe boundary.\n\n`;
text=text.slice(0,startIndex)+completed+text.slice(endIndex);

text=text.replace(
  '**Next: C5.5 — establish stable application-settings identity and lifecycle.**\n\nFix the discovered stale-settings-reference bug before further cosmetic extraction. Introduce a canonical settings controller that loads IndexedDB values into one stable root, preserves the existing 120 ms save debounce/default schema, and keeps keyboard/environment/menu on the same settings object. Do not move `applyLoadedV21Settings()` or tune runtime behavior in this step.',
  '**Next: C5.6 — fresh post-C5.5 responsibility audit of `main.js`.**\n\nRe-measure the remaining responsibilities after `main.js` reached 2752 lines. Select the next extraction by cohesion and risk rather than line count. Continue to defer the frame-performance governor, route/hydro/vehicle behavior and C6 diagnostics unless the audit identifies a clearly safer boundary.'
);

const logAnchor='# 7. Work log\n\n';
if(!text.includes(logAnchor))throw new Error('work-log anchor missing');
const log=`## 2026-08-30 — C5.5 completed: stable application settings identity\n\n- C5.5 audit \`33355730962\` found a real stale-reference bug: keyboard/environment captured the defaults settings root before IndexedDB load replaced \`appSettings\`.\n- Added canonical \`src/application-settings.js\` with stable root/nested plain-object identity, in-place load and unchanged 120 ms debounced persistence.\n- QA proves a keyboard reference captured before load sees loaded bindings and that edits through that same captured reference are what persistence saves; UI/environment regressions remain green.\n- Candidate \`33356127350\` PASS; clean integration \`6cec0450\`; permanent gate \`33356215309\` PASS; Dev Integration registration \`02b27eb1\`; final Dev Integration \`33356240462\` PASS 74/74.\n- Resulting \`main.js\` = 2752 lines. No human validation required for this identity/persistence correction.\n- Next focus: C5.6 fresh read-only responsibility audit.\n\n`;
text=text.replace(logAnchor,logAnchor+log);

fs.writeFileSync(path,text);
console.log('C5.5 completion recorded in tech-debt plan');

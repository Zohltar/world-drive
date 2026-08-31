import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');
const anchor=`C5.6 required invariants:\n`;
const note=`C5.6 material discovery — stale V21.25 UI-refactor facade assertion:\n- candidate run \`33383639485\` passed C5.6 semantics, C5.5 stable settings identity and V21.25 UI init-order, then \`qa/V21_25_UI_REFACTOR_QA.mjs\` failed because it still required \`async function applyLoadedV21Settings()\` to be implemented in \`main.js\`;\n- C5.6 intentionally replaces that implementation body with a thin composition facade delegating to canonical \`loaded-settings-application.js\`;\n- modernize the V21.25 UI refactor QA to protect the current import/composition/delegation and awaited startup call instead of pinning the historical implementation location;\n- exact loaded-settings semantics remain authoritative in the dedicated C5.6 QA.\n\n`;
if(!text.includes(anchor))throw new Error('C5.6 invariant anchor missing');
if(!text.includes('C5.6 material discovery — stale V21.25 UI-refactor facade assertion:')){
  text=text.replace(anchor,note+anchor);
}
fs.writeFileSync(path,text);
console.log('C5.6 stale V21.25 UI QA discovery recorded');

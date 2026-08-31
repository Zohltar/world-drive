import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');
const anchor=`C5.6 required invariants:\n`;
const note=`C5.6 material discovery — stale C5.5 implementation-location assertion:\n- first candidate run reached the new C5.6 semantics QA successfully, then \`qa-main-c5-settings.mjs\` failed only because C5.5 explicitly asserted that \`async function applyLoadedV21Settings()\` must remain implemented inside \`main.js\`;\n- that assertion was intentionally valid for C5.5, whose scope stopped before runtime/UI application, but becomes stale when C5.6 deliberately extracts exactly that responsibility;\n- C5.5 must continue protecting stable root/nested identity, in-place IndexedDB load, 120 ms debounce and keyboard/environment shared references, while C5.6 becomes authoritative for runtime/UI settings-application semantics and startup order;\n- do not reintroduce the old implementation into \`main.js\` merely to satisfy the C5.5 source-location check.\n\n`;
if(!text.includes(anchor))throw new Error('C5.6 invariant anchor missing');
if(!text.includes('C5.6 material discovery — stale C5.5 implementation-location assertion:')){
  text=text.replace(anchor,note+anchor);
}
fs.writeFileSync(path,text);
console.log('C5.6 stale C5.5 QA discovery recorded');

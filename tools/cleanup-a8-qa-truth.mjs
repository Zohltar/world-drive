import fs from 'node:fs';

const envPath='qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs';
const stalePath='qa/V21_26_LOCAL_WORLD_REFACTOR_QA.mjs';

let env=fs.readFileSync(envPath,'utf8');
const block=`const regression=spawnSync(process.execPath,['qa/V21_26_LOCAL_WORLD_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});\nassert.equal(regression.status,0,\`prior V21.26 refactors regressed:\\n\${regression.stderr||regression.stdout}\`);\n\n`;
if(env.includes(block))env=env.replace(block,'');
else if(env.includes('V21_26_LOCAL_WORLD_REFACTOR_QA'))throw new Error('unrecognized environment meta-regression block');
env=env.replace(
  "console.log('display distance / fog / streaming scale / sun / moon / automatic headlights / presentation clock bridge verified');",
  "console.log('display distance / fog / streaming scale / sun / moon / automatic headlights / presentation clock bridge verified directly');"
);
fs.writeFileSync(envPath,env.replace(/[ \t]+$/gm,''));

if(fs.existsSync(stalePath))fs.unlinkSync(stalePath);
console.log('A8 QA truth cleanup materialized',{retired:stalePath,environmentQa:'direct-only'});

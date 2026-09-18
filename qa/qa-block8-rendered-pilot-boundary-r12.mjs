// Authorizes ONLY two reviewed additive owner seams and one inert lazy port.
// All other runtime, R4 code/budgets, assets, source/Worker domain and dependencies
// stay byte-identical to the human-accepted R11W checkpoint.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const BASE='c7bb678d290c8e275c79b134a23cc6897d1e26f7';
const scopes=['src','public','server','electron','vite.config.js','package.json','package-lock.json','.github/workflows/qa-dev-integration.yml'];
const port='src/app/forest-visual-pilot.js';
const edits=new Map([
 ['src/app/biome-diagnostics.js',[
  ["import {registerForestPilotRoute} from './forest-visual-pilot.js';\n",''],
  ["  const visualPilot=registerForestPilotRoute({getState:options.getState,\n    getGeneration:()=>lifecycle.worldDrive.route.generation,getRoute:()=>options.route,\n    isRouteReady:()=>routeReady},target);\n",''],
  ['function invalidate(){visualPilot.invalidate();request++;routeReady=false;','function invalidate(){request++;routeReady=false;']]],
 ['src/scenery/scenery-renderer-p933.js',[
  ["import {registerForestPilotScene} from '../app/forest-visual-pilot.js';\n",''],
  ['  registerForestPilotScene(options); // R12: inert until explicit pilot start.\n','']]]
]);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const changed=git('diff','--name-only',BASE,'HEAD','--',...scopes).trim().split('\n').filter(Boolean);
assert.deepEqual(changed.toSorted(),[port,...edits.keys()].toSorted(),'Unexpected runtime addition/deletion/change');
for(const [path,replacements] of edits){
 let text=readFileSync(path,'utf8');
 for(const [from,to] of replacements){assert.equal(text.split(from).length,2,`Exact seam missing/duplicated: ${path}`);text=text.replace(from,to);}
 assert.equal(text,git('show',`${BASE}:${path}`),`Runtime changed beyond the explicit seam: ${path}`);
}
const source=readFileSync(port,'utf8');
assert.ok(source.includes("import('../../tools/biomes/rendered-pilot-r12.mjs')"));
assert.doesNotMatch(source,/\b(?:fetch|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)\s*\(|new\s+(?:Worker|THREE\.)/);
for(const path of ['tools/biomes/vegetation-prototypes.mjs','tools/biomes/vegetation-prototype-data.mjs',
 'tools/biomes/vegetation-winter-data.mjs','tools/biomes/vegetation-seasonal-prototypes.mjs'])
 assert.equal(readFileSync(path,'utf8'),git('show',`${BASE}:${path}`),'Approved asset changed: '+path);
console.log('PASS R12 exact owner seams only; entire remaining runtime and approved models preserved');

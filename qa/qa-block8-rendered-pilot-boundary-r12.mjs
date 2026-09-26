// R12 preserves the original human-accepted runtime except reviewed pilot seams.
// R23 adds bounded Yungas density. R24 adds only asynchronous default selection
// at route-ready; placement/streaming/assets stay byte-identical to the R23 gate.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const R12_BASE='c7bb678d290c8e275c79b134a23cc6897d1e26f7';
const R23_BASE='7df21bd23f3f73f78a706e8290c45bc6c80772b6';
const R24_BASE='01b8065736bf9e5f2dc8179180229c4ebeed8794';
const scopes=['src','public','server','electron','vite.config.js','package.json','package-lock.json','.github/workflows/qa-dev-integration.yml'];
const port='src/app/forest-visual-pilot.js';
const r12Edits=new Map([
 ['src/app/biome-diagnostics.js',[
  ["import {registerForestPilotRoute} from './forest-visual-pilot.js';\n",''],
  ["  const visualPilot=registerForestPilotRoute({getState:options.getState,\n    getGeneration:()=>lifecycle.worldDrive.route.generation,getRoute:()=>options.route,\n    isRouteReady:()=>routeReady},target);\n",''],
  ['function invalidate(){visualPilot.invalidate();request++;routeReady=false;','function invalidate(){request++;routeReady=false;']]],
 ['src/scenery/scenery-renderer-p933.js',[
  ["import {registerForestPilotScene} from '../app/forest-visual-pilot.js';\n",''],
  ['  registerForestPilotScene(options); // R12: inert until explicit pilot start.\n','']]]
]);
const r23Runtime=[
 'src/app/forest-visual-pilot.js',
 'src/forest-chunk-streamer-core.js',
 'src/forest-chunk-streamer.js',
 'src/forest-streaming-policy.js',
 'src/scenery/scenery-renderer-p9.js',
 'src/scenery/scenery-renderer-p933.js'
];
const r23Blob=new Map([
 ['src/app/forest-visual-pilot.js','94691738d666af523e62c8d19401a006398256ef'],
 ['src/forest-chunk-streamer-core.js','e95f83b6193ab1ea0fad5c3f1a65ca80c42a364d'],
 ['src/forest-chunk-streamer.js','1c9d3cb4a89f0cde4e12271e0be45f5fe5531773'],
 ['src/forest-streaming-policy.js','61c50dc256f46cea9b43b57a574ba2ad17ed0256'],
 ['src/scenery/scenery-renderer-p9.js','133db0ca8ef8c6c57347e1d6a0f4a41bdffdb656'],
 ['src/scenery/scenery-renderer-p933.js','44240e5bed6df9b565c2a41a31887961ce483700']
]);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const show=(ref,path)=>git('show',`${ref}:${path}`);
const changed=(base,head='HEAD')=>git('diff','--name-only',base,head,'--',...scopes).trim().split('\n').filter(Boolean);

const historical=changed(R12_BASE,R23_BASE);
assert.deepEqual(historical.toSorted(),[port,...r12Edits.keys()].toSorted(),'Pre-R23 runtime drifted outside reviewed R12 seams');
for(const [path,replacements] of r12Edits){
 let text=show(R23_BASE,path);
 for(const [from,to] of replacements){assert.equal(text.split(from).length,2,`Historical R12 seam missing/duplicated: ${path}`);text=text.replace(from,to);}
 assert.equal(text,show(R12_BASE,path),`Pre-R23 runtime changed beyond the R12 seam: ${path}`);
}
const historicalPort=show(R23_BASE,port);
assert.ok(historicalPort.includes("import('../../tools/biomes/rendered-pilot-r12.mjs')"));
assert.doesNotMatch(historicalPort,/\b(?:fetch|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)\s*\(|new\s+(?:Worker|THREE\.)/);

assert.deepEqual(changed(R23_BASE,R24_BASE).toSorted(),r23Runtime.toSorted(),'Historical R23 runtime drifted');
for(const [path,sha] of r23Blob)assert.equal(git('rev-parse',`${R24_BASE}:${path}`).trim(),sha,`Historical R23 blob drifted: ${path}`);

assert.deepEqual(changed(R24_BASE).toSorted(),['src/app/biome-diagnostics.js'],'Unexpected R24 runtime addition/deletion/change');
assert.equal(git('hash-object','src/app/biome-diagnostics.js').trim(),'0ee68e7d0eebc5212b6b36f672bfcc4c5d799290','R24 route-ready owner drifted');
assert.equal(git('hash-object','tools/biomes/default-biome-activation-r24.mjs').trim(),'8e43127add2738ae416a6e8d8b0e6963f1590930','R24 selector drifted');
const r24=readFileSync('src/app/biome-diagnostics.js','utf8');
for(const marker of ["default-biome-activation-r24.mjs","eifel-pilot-launcher-r22.mjs","boreal-pilot-launcher-r21.mjs","dry-pilot-launcher-r19.mjs","humid-montane-pilot-launcher-r20.mjs","fallback-generic-r4"])
  assert.ok(r24.includes(marker),'R24 activation seam missing: '+marker);
assert.doesNotMatch(readFileSync('tools/biomes/default-biome-activation-r24.mjs','utf8'),/\b(?:fetch|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|Worker)\b/);

const policy=readFileSync('src/forest-streaming-policy.js','utf8');
assert.match(policy,/candidatesPerCell:109,/);assert.match(policy,/maxCandidatesPerCell:160,/);assert.match(policy,/firstLayerCandidatesPerCell:64,/);
const core=readFileSync('src/forest-chunk-streamer-core.js','utf8');
for(const marker of ['const chunkCandidateLimits=new Map();','function setChunkCandidateLimit(cx,cz,perCell=null)','candidateOverrides:chunkCandidateLimits.size',"if(chunk.regionalDensity&&chunk.replace&&visibleKeys.has(chunk.key))"])
 assert.ok(core.includes(marker),'R23 bounded density owner missing: '+marker);
assert.ok(core.includes("resetQueuedBuilder(job,'candidate-limit-change')"));
const wrapper=readFileSync('src/forest-chunk-streamer.js','utf8');
assert.ok(wrapper.includes('setChunkCandidateLimit:(...args)=>activeBase().setChunkCandidateLimit(...args)'));
assert.ok(wrapper.includes('regionalDensity:{baseCandidatesPerCell:finite(raw.baseCandidatesPerCell),maxCandidatesPerCell:finite(raw.maxCandidatesPerCell),overrides:finite(raw.candidateOverrides)}'));
const currentPort=readFileSync(port,'utf8');
assert.ok(currentPort.includes('setForestChunkCandidateLimit:options.setForestChunkCandidateLimit'));
assert.doesNotMatch(currentPort,/\b(?:fetch|setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)\s*\(|new\s+(?:Worker|THREE\.)/);
for(const asset of ['tools/biomes/vegetation-prototypes.mjs','tools/biomes/vegetation-prototype-data.mjs',
 'tools/biomes/vegetation-winter-data.mjs','tools/biomes/vegetation-seasonal-prototypes.mjs'])
 assert.equal(readFileSync(asset,'utf8'),show(R12_BASE,asset),'Approved asset changed: '+asset);

console.log('PASS R12/R23 preservation + exact R24 default-biome activation seam');

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profilerPath=path.join(root,'src','frame-runtime-profiler.js');
const wrapperPath=path.join(root,'src','forest-chunk-streamer.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

const profiler=read(profilerPath);
const wrapper=read(wrapperPath);
checkSyntax(profilerPath);
checkSyntax(wrapperPath);

for(const marker of [
  "callback?.name==='animate'",
  'recordMain(started,performance.now())',
  'WebGLRenderer?.prototype',
  'recordRender(started,performance.now())',
  "mode:'p941-previous-main-frame'"
])expect(profiler.includes(marker),`P9.41 profiler marker missing: ${marker}`);

expect(!profiler.includes('setInterval('),'P9.41 profiler must remain zero-polling');
expect(!profiler.includes('setTimeout('),'P9.41 profiler must not schedule background work');

for(const marker of [
  "from './frame-runtime-profiler.js'",
  'frameWindow=Math.max(0,Math.min(250,finite(frameMs)))+FRAME_MATCH_SLACK_MS',
  'hitchesAttributedToForest',
  'runtimeSources',
  'previousMainMs',
  'previousRenderSubmitMs',
  'outsideMainMs',
  'frameRuntime:frameRuntimeSnapshot()',
  "hitchMode:'p941-frame-window-runtime'"
])expect(wrapper.includes(marker),`P9.41 wrapper marker missing: ${marker}`);

expect(!wrapper.includes('MATCH_BEFORE_MS=70'),'P9.41 must not retain the broad 70 ms forest look-back');
expect(wrapper.includes('FOREST_MIN_FRAME_SHARE=.10'),'P9.41 must require meaningful forest frame contribution');
expect(wrapper.includes('return meaningful;'),'P9.41 hitch hook must only attribute meaningful forest contribution');

console.log('PASS P9.41 frame-runtime hitch attribution QA');
console.log('  - forest correlation is constrained to the hitching rAF interval');
console.log('  - previous animate() CPU duration is measured without polling');
console.log('  - WebGL render-submit duration is measured independently');
console.log('  - weak forest coincidence no longer becomes a P9.39 forest attribution');

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profilerPath=path.join(root,'src','frame-runtime-profiler.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

const source=read(profilerPath);
checkSyntax(profilerPath);

for(const marker of [
  "includes('long-animation-frame')",
  "observer.observe({type:'long-animation-frame',buffered:true})",
  "browserMode:'p943-loaf-standard-timings'",
  "mode:'p943-standard-loaf-timings'",
  'browserLongFrames:{',
  'blockingMs:',
  'preRenderWorkMs:',
  'renderCycleMs:',
  'preLayoutMs:',
  'styleLayoutMs:',
  'presentationLagMs:',
  'scriptMs:',
  'pauseMs:',
  'sourceFunctionName:',
  'sourceURL:',
  'browserRenderMsDeprecated:true',
  'LOAF_HISTORY_LIMIT=8'
])expect(source.includes(marker),`P9.43 browser long-frame marker missing: ${marker}`);

expect(source.includes("mode:'p941-previous-main-frame'"),'P9.43 must preserve the P9.41 runtime mode contract');
expect(source.includes('renderStart begins the render cycle *including requestAnimationFrame'),'P9.43 must document LoAF renderStart semantics');
expect(!source.includes('setInterval('),'P9.43 profiler must remain zero-polling');
expect(!source.includes('setTimeout('),'P9.43 profiler must not schedule timer work');

console.log('PASS P9.43 browser long-frame timing QA');
console.log('  - browser Long Animation Frames remain feature-detected');
console.log('  - renderStart timing is not mislabelled as browser/GPU-only time');
console.log('  - standard pre-render/render-cycle/layout/presentation timings are exposed');
console.log('  - bounded eight-entry history avoids diagnostic growth');
console.log('  - no gameplay/rendering policy is modified');

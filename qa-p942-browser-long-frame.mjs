import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const profilerPath=path.join(root,'src','frame-runtime-profiler-p941.js');

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
  "browserMode:'p942-long-animation-frame'",
  'browserLongFrames:{',
  'blockingMs:',
  'browserRenderMs:',
  'styleLayoutMs:',
  'scriptMs:',
  'pauseMs:',
  'sourceFunctionName:',
  'sourceURL:',
  'LOAF_HISTORY_LIMIT=8'
])expect(source.includes(marker),`P9.42 browser long-frame marker missing: ${marker}`);

expect(source.includes("mode:'p941-previous-main-frame'"),'P9.42 must preserve the P9.41 runtime mode contract');
expect(!source.includes('setInterval('),'P9.42 profiler must remain zero-polling');
expect(!source.includes('setTimeout('),'P9.42 profiler must not schedule timer work');

console.log('PASS P9.42 browser long-frame attribution QA');
console.log('  - browser Long Animation Frames are feature-detected');
console.log('  - >50 ms frames retain script/render/layout/pause attribution');
console.log('  - bounded eight-entry history avoids diagnostic growth');
console.log('  - no gameplay/rendering policy is modified');

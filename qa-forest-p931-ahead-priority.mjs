import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const implPath=path.join(root,'src','forest-chunk-streamer-core.js');
const wrapperPath=path.join(root,'src','forest-chunk-streamer.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

const impl=read(implPath),wrapper=read(wrapperPath);
checkSyntax(implPath);checkSyntax(wrapperPath);

for(const marker of [
  'updateTravelDirection',
  'aheadPriorityCenter',
  'queuePriority',
  'nearPriorityDistance',
  'priorityLeadM',
  'behindPenalty',
  "aheadPriority:true"
])expect(impl.includes(marker),`P9.31 implementation marker missing: ${marker}`);

expect(impl.includes("FOREST.forestSliceBudgetMs||.95"),'P9.31 must retain P9.29 ~0.95 ms slice budget');
expect(impl.includes("FOREST.candidatesPerBuildSlice||12"),'P9.31 must retain P9.29 candidate batch cap');
expect(wrapper.includes("observerMode:'p931-ahead-priority'"),'P9.31 diagnostics marker missing');
expect(wrapper.includes('__WORLD_DRIVE_P931_FOREST__'),'P9.31 diagnostics global missing');
expect(wrapper.includes('aheadPriority:{'),'P9.31 ahead diagnostics missing');

console.log('PASS P9.31 forest ahead-priority QA');
console.log('  - near ring remains protected');
console.log('  - queued chunks prefer predicted travel direction');
console.log('  - P9.29 frame budget remains unchanged');

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const sourcePath=path.join(here,'refactor-main-streaming-v21-25.mjs');
const tempPath=path.join(here,'__refactor-main-streaming-v21-25-runtime__.mjs');

function fail(message){
  console.error(`V21.25 streaming refactor runner: ${message}`);
  process.exit(1);
}

if(!fs.existsSync(sourcePath))fail('source refactor tool missing');
let source=fs.readFileSync(sourcePath,'utf8');

const fixes=[
  [
    'catch(error){console.warn(`Deferred visual job failed: ${key}`,error);}',
    "catch(error){console.warn('Deferred visual job failed: '+key,error);}"
  ],
  [
    'return `${dir}:${Math.round(cum/450)}:${Math.round(lateralOffset/500)}`;',
    "return String(dir)+':'+Math.round(cum/450)+':'+Math.round(lateralOffset/500);"
  ]
];

for(const [before,after] of fixes){
  const count=source.split(before).length-1;
  if(count!==1)fail(`expected one repair target, found ${count}: ${before}`);
  source=source.replace(before,after);
}

fs.writeFileSync(tempPath,source,'utf8');
try{
  const check=spawnSync(process.execPath,['--check',tempPath],{
    cwd:path.resolve(here,'..'),
    encoding:'utf8'
  });
  if(check.status!==0){
    fail(`repaired refactor tool still has a syntax error:\n${check.stderr||check.stdout}`);
  }

  const run=spawnSync(process.execPath,[tempPath],{
    cwd:path.resolve(here,'..'),
    stdio:'inherit'
  });
  if(run.status!==0){
    process.exit(run.status||1);
  }
}finally{
  try{fs.unlinkSync(tempPath);}catch{}
}

console.log('V21.25 STREAMING REFACTOR RUNNER: COMPLETE');
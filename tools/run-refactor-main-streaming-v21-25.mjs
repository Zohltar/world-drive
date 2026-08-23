import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const sourcePath=path.join(here,'refactor-main-streaming-v21-25.mjs');
const tempPath=path.join(here,'__refactor-main-streaming-v21-25-runtime__.mjs');

function fail(message){
  console.error(`V21.25 streaming refactor runner: ${message}`);
  process.exitCode=1;
  throw new Error(message);
}

if(!fs.existsSync(sourcePath))fail('source refactor tool missing');
try{fs.unlinkSync(tempPath);}catch{}
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

const cadenceBefore="const cadenceStart=main.indexOf('   if(\\n     gameStarted&&\\n     !v21MenuOpen&&\\n     now>=nextDirectionalPrefetchAt');";
const cadenceAfter=[
  "const cadenceMatch=/   if\\(\\r?\\n     gameStarted&&\\r?\\n     !v21MenuOpen&&\\r?\\n     now>=nextDirectionalPrefetchAt/.exec(main);",
  'const cadenceStart=cadenceMatch?.index??-1;'
].join('\n');
const cadenceCount=source.split(cadenceBefore).length-1;
if(cadenceCount!==1)fail(`expected one animation cadence search, found ${cadenceCount}`);
source=source.replace(cadenceBefore,cadenceAfter);

let runStatus=0;
fs.writeFileSync(tempPath,source,'utf8');
try{
  const check=spawnSync(process.execPath,['--check',tempPath],{
    cwd:root,
    encoding:'utf8'
  });
  if(check.status!==0){
    console.error(`V21.25 streaming refactor runner: repaired refactor tool still has a syntax error:\n${check.stderr||check.stdout}`);
    runStatus=check.status||1;
  }else{
    const run=spawnSync(process.execPath,[tempPath],{
      cwd:root,
      stdio:'inherit'
    });
    runStatus=run.status??1;
  }
}finally{
  try{fs.unlinkSync(tempPath);}catch{}
}

if(runStatus!==0){
  process.exitCode=runStatus;
}else{
  console.log('V21.25 STREAMING REFACTOR RUNNER: COMPLETE');
}

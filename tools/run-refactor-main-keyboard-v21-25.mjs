import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const sourcePath=path.join(here,'refactor-main-keyboard-v21-25.mjs');
const tempPath=path.join(here,'__refactor-main-keyboard-v21-25-runtime__.mjs');

function fail(message){
  console.error(`V21.25 keyboard refactor runner: ${message}`);
  process.exit(1);
}

if(!fs.existsSync(sourcePath))fail('source refactor tool missing');
let source=fs.readFileSync(sourcePath,'utf8');

// Patch only the post-transform stale-check block. The same keydown text is
// intentionally still required inside the original block before extraction.
const staleStart=source.indexOf('for(const stale of [');
const staleEnd=source.indexOf('for(const required of [',staleStart);
if(staleStart<0||staleEnd<0)fail('stale-check block markers not found');

let staleBlock=source.slice(staleStart,staleEnd);
const falsePositiveLine=`  "addEventListener('keydown',e=>{",\n`;
const occurrences=staleBlock.split(falsePositiveLine).length-1;
if(occurrences!==1){
  fail(`expected one keydown stale-check entry, found ${occurrences}`);
}
staleBlock=staleBlock.replace(falsePositiveLine,'');

const anchoredCheck=[
  "if(/^addEventListener\\('keydown',e=>\\{/m.test(main)){",
  "  die(\"stale global keyboard keydown handler remains in main.js. No files changed.\");",
  "}",
  ""
].join('\n');

source=
  source.slice(0,staleStart)+
  staleBlock+
  anchoredCheck+
  source.slice(staleEnd);

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
  if(run.status!==0)process.exit(run.status||1);
}finally{
  try{fs.unlinkSync(tempPath);}catch{}
}

console.log('V21.25 KEYBOARD REFACTOR RUNNER: COMPLETE');

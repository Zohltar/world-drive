import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const minimapPath=path.join(root,'src','minimap.js');
const mainCheck=path.join(root,'src','__repair_main_check__.mjs');
const minimapCheck=path.join(root,'src','__repair_minimap_check__.mjs');

function fail(message){
  console.error(`V21.25 minimap reset repair: ${message}`);
  process.exit(1);
}

function check(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)fail(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))fail('src/main.js missing.');
if(!fs.existsSync(minimapPath))fail('src/minimap.js missing. Run the minimap refactor first.');

let main=fs.readFileSync(mainPath,'utf8');
let minimap=fs.readFileSync(minimapPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const legacyReset="passedSignKeys.clear();signReadout.key=null;signReadout.text='';signReadout.startedAt=0;";

const alreadyFixed=
  main.includes('resetSignReadout:resetMinimapSignReadout,')&&
  main.includes('resetMinimapSignReadout();')&&
  minimap.includes('function resetSignReadout(){')&&
  minimap.includes('resetSignReadout,');

if(alreadyFixed){
  console.log('V21.25 MINIMAP RESET REPAIR: already fixed; nothing to do.');
  process.exit(0);
}

if(!main.includes("from './minimap.js'"))fail('main.js does not look minimap-refactored. No files changed.');
if(!main.includes(legacyReset))fail('legacy reset call not found in main.js. No files changed.');

const oldDestructure=[
  'const {',
  '  prepMap,',
  '  drawMap,',
  '  updatePassedSignReadout',
  '}=minimapSystem;'
].join(eol);

const newDestructure=[
  'const {',
  '  resetSignReadout:resetMinimapSignReadout,',
  '  prepMap,',
  '  drawMap,',
  '  updatePassedSignReadout',
  '}=minimapSystem;'
].join(eol);

if(!main.includes(oldDestructure))fail('expected minimap destructuring block not found. No files changed.');
main=main.replace(oldDestructure,newDestructure);
main=main.replace(legacyReset,'resetMinimapSignReadout();');

const returnAnchor=[
  '  return Object.freeze({',
  '    prepMap,',
  '    drawMap,',
  '    updatePassedSignReadout',
  '  });'
].join(eol);

const replacement=[
  '  function resetSignReadout(){',
  '    passedSignKeys.clear();',
  '    signReadout.key=null;',
  "    signReadout.text='';",
  '    signReadout.startedAt=0;',
  '  }',
  '',
  '  return Object.freeze({',
  '    resetSignReadout,',
  '    prepMap,',
  '    drawMap,',
  '    updatePassedSignReadout',
  '  });'
].join(eol);

if(!minimap.includes(returnAnchor))fail('expected minimap export block not found. No files changed.');
minimap=minimap.replace(returnAnchor,replacement);

if(/\bpassedSignKeys\b/.test(main)||/\bsignReadout\b/.test(main)){
  fail('minimap-private state still leaks into main.js. No files changed.');
}
if(!main.includes('resetMinimapSignReadout();'))fail('main reset delegation missing. No files changed.');
if(!minimap.includes('function resetSignReadout(){'))fail('minimap reset function missing. No files changed.');

check(mainCheck,main,'main.js');
check(minimapCheck,minimap,'minimap.js');

fs.writeFileSync(mainPath,main,'utf8');
fs.writeFileSync(minimapPath,minimap,'utf8');

console.log('V21.25 MINIMAP RESET REPAIR: APPLIED');
console.log('resetWorldCaches now delegates transient sign state to minimapSystem.');

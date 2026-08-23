import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const minimapPath=path.join(root,'src','minimap.js');
const mainCheck=path.join(root,'src','__main_minimap_reset_check__.mjs');
const minimapCheck=path.join(root,'src','__minimap_reset_check__.mjs');

function die(message){
  console.error(`V21.25 minimap reset repair: ${message}`);
  process.exit(1);
}

function check(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`${label} syntax error:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js missing');
if(!fs.existsSync(minimapPath))die('src/minimap.js missing — run the minimap refactor first');

let main=fs.readFileSync(mainPath,'utf8');
let minimap=fs.readFileSync(minimapPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';

const legacyReset="passedSignKeys.clear();signReadout.key=null;signReadout.text='';signReadout.startedAt=0;";
const repairedReset='resetMinimapSignReadout();';

if(main.includes(legacyReset)){
  main=main.replace(legacyReset,repairedReset);
}else if(!main.includes(repairedReset)){
  die('legacy minimap reset line not found and repaired reset call is absent. No files were changed.');
}

if(!minimap.includes('function resetSignReadout(){')){
  const anchor='// ---------- minimap ----------';
  const index=minimap.indexOf(anchor);
  if(index<0)die('minimap insertion anchor not found. No files were changed.');
  const resetFn=[
    'function resetSignReadout(){',
    '  passedSignKeys.clear();',
    '  signReadout.key=null;',
    "  signReadout.text='';",
    '  signReadout.startedAt=0;',
    '}',
    '',
    ''
  ].join(eol);
  minimap=minimap.slice(0,index)+resetFn+minimap.slice(index);
}

if(!minimap.includes('resetSignReadout,')){
  minimap=minimap.replace(
    '  return Object.freeze({'+eol+'    prepMap,',
    '  return Object.freeze({'+eol+'    resetSignReadout,'+eol+'    prepMap,'
  );
}

if(!main.includes('resetMinimapSignReadout')){
  die('main.js reset integration missing after transform. No files were changed.');
}

const destructureOld=[
  'const {',
  '  prepMap,',
  '  drawMap,',
  '  updatePassedSignReadout',
  '}=minimapSystem;'
].join(eol);

const destructureNew=[
  'const {',
  '  resetSignReadout:resetMinimapSignReadout,',
  '  prepMap,',
  '  drawMap,',
  '  updatePassedSignReadout',
  '}=minimapSystem;'
].join(eol);

if(main.includes(destructureOld)){
  main=main.replace(destructureOld,destructureNew);
}else if(!main.includes('resetSignReadout:resetMinimapSignReadout')){
  die('minimap destructuring block not found. No files were changed.');
}

for(const stale of ['passedSignKeys.clear();signReadout.key=null','signReadout.startedAt=0;']){
  if(main.includes(stale))die(`stale minimap state remains in main.js: ${stale}. No files were changed.`);
}

for(const required of [
  'function resetSignReadout(){',
  'passedSignKeys.clear();',
  'resetSignReadout,'
]){
  if(!minimap.includes(required))die(`minimap.js repair missing: ${required}. No files were changed.`);
}

check(mainCheck,main,'main.js');
check(minimapCheck,minimap,'minimap.js');

fs.writeFileSync(mainPath,main,'utf8');
fs.writeFileSync(minimapPath,minimap,'utf8');

console.log('V21.25 MINIMAP RESET REPAIR: APPLIED');
console.log('resetWorldCaches now delegates transient sign-state reset to minimap.js');

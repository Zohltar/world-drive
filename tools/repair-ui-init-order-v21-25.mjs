import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const checkPath=path.join(root,'src','__main_ui_init_order_check__.mjs');

function die(message){
  console.error(`V21.25 UI init-order repair: ${message}`);
  process.exit(1);
}

if(!fs.existsSync(mainPath))die('src/main.js missing.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';

if(!main.includes("from './v21-menu.js'")){
  die('main.js is not UI-refactored. Run the UI refactor first.');
}

const declaration='let v21MenuSystem=null;';
const declarationCount=main.split(declaration).length-1;
if(declarationCount!==1){
  die(`expected exactly one v21MenuSystem declaration, found ${declarationCount}. No files changed.`);
}

const earlyAnchor='let keyboardRebindAction=null;';
const anchorIndex=main.indexOf(earlyAnchor);
if(anchorIndex<0)die('keyboard rebind state anchor missing. No files changed.');

const firstCapabilityCall=main.indexOf('syncVehicleSpeedCapability();');
if(firstCapabilityCall<0)die('speed capability initialization call missing. No files changed.');

let declarationIndex=main.indexOf(declaration);
if(declarationIndex>firstCapabilityCall){
  // Remove the late declaration from the menu facade and move ownership beside
  // the rest of the top-level UI state. This avoids the ES module TDZ during
  // early vehicle-capability synchronization.
  main=main.slice(0,declarationIndex)+main.slice(declarationIndex+declaration.length);

  const insertAt=main.indexOf(earlyAnchor)+earlyAnchor.length;
  main=main.slice(0,insertAt)+eol+declaration+main.slice(insertAt);
  declarationIndex=main.indexOf(declaration);
}

if(declarationIndex<0||declarationIndex>main.indexOf('syncVehicleSpeedCapability();')){
  die('v21MenuSystem is still declared after early vehicle synchronization. No files changed.');
}

if((main.split(declaration).length-1)!==1){
  die('repair produced duplicate v21MenuSystem declarations. No files changed.');
}

for(const required of [
  'function syncV21RuntimeControls(){v21MenuSystem?.syncRuntimeControls();}',
  'function syncV21VehicleInfo(){v21MenuSystem?.syncVehicleInfo();}',
  'function applyV21DisplayVisibility(){v21MenuSystem?.applyDisplayVisibility();}',
  'function ensureV21MenuSystem(){'
]){
  if(!main.includes(required)){
    die(`required lazy menu facade missing: ${required}. No files changed.`);
  }
}

fs.writeFileSync(checkPath,main,'utf8');
try{
  const syntax=spawnSync(process.execPath,['--check',checkPath],{cwd:root,encoding:'utf8'});
  if(syntax.status!==0)die(`repaired main.js syntax error:\n${syntax.stderr||syntax.stdout}`);
}finally{
  try{fs.unlinkSync(checkPath);}catch{}
}

fs.writeFileSync(mainPath,main,'utf8');
console.log('V21.25 UI INIT-ORDER REPAIR: APPLIED');
console.log('v21MenuSystem now exists before early vehicle/UI synchronization.');

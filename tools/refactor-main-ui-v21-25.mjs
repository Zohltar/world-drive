import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const startupPath=path.join(root,'src','startup-ui.js');
const menuPath=path.join(root,'src','v21-menu.js');
const mainCheck=path.join(root,'src','__main_ui_refactor_check__.mjs');
const startupCheck=path.join(root,'src','__startup_ui_check__.mjs');
const menuCheck=path.join(root,'src','__v21_menu_check__.mjs');

function die(message){
  console.error(`V21.25 UI refactor: ${message}`);
  process.exit(1);
}

function count(text,needle){
  let total=0;
  let offset=0;
  while(true){
    const index=text.indexOf(needle,offset);
    if(index<0)return total;
    total++;
    offset=index+needle.length;
  }
}

function requireCount(text,needle,expected,label=needle){
  const found=count(text,needle);
  if(found!==expected){
    die(`${label}: expected ${expected}, found ${found}. No files were changed.`);
  }
}

function range(text,startMarker,endMarker,label){
  const start=text.indexOf(startMarker);
  if(start<0)die(`${label}: start marker not found. No files were changed.`);
  const end=text.indexOf(endMarker,start+startMarker.length);
  if(end<0)die(`${label}: end marker not found. No files were changed.`);
  return {start,end,text:text.slice(start,end)};
}

function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{
      cwd:root,
      encoding:'utf8'
    });
    if(result.status!==0){
      die(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
    }
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js not found.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;
const beforeBytes=Buffer.byteLength(main,'utf8');

const alreadyRefactored=
  main.includes("from './startup-ui.js'")&&
  main.includes("from './v21-menu.js'")&&
  main.includes('createStartupUi({')&&
  main.includes('createV21MenuSystem({')&&
  !main.includes('function createV21BootOverlay(){')&&
  !main.includes('// ---------- V21 reorganized menu ----------');

if(alreadyRefactored){
  if(!fs.existsSync(startupPath)||!fs.existsSync(menuPath)){
    die('main.js is UI-refactored but one or more extracted UI modules are missing.');
  }
  console.log('V21.25 UI refactor: already applied; nothing to do.');
  process.exit(0);
}

requireCount(main,"import { createMinimapSystem } from './minimap.js';",1,'minimap import anchor');
requireCount(main,'function createV21BootOverlay(){',1,'startup overlay');
requireCount(main,'function setV21BootProgress(',1,'startup progress');
requireCount(main,'function showV21VehicleChooser(){',1,'startup vehicle chooser');
requireCount(main,'createV21BootOverlay();',1,'startup install call');
requireCount(main,'// ---------- V21 reorganized menu ----------',1,'V21 menu block');
requireCount(main,'async function applyLoadedV21Settings(){',1,'menu block end');
requireCount(main,'function syncV21RuntimeControls(){',1,'runtime control sync');
requireCount(main,'function installV21Menu(){',1,'menu installer');
requireCount(main,"let v21BootMode='loading';",1,'legacy boot mode state');
requireCount(main,'let v21SelectedStartupVehicle=null;',1,'legacy startup vehicle state');
requireCount(main,'let v21MenuEl=null;',1,'legacy menu element state');
requireCount(main,'let v21MenuButton=null;',1,'legacy menu button state');

const startupStart='function createV21BootOverlay(){';
const startupEnd='// ---------- competitive route challenge ----------';
const startupBlock=range(main,startupStart,startupEnd,'startup UI block');
const menuStart='// ---------- V21 reorganized menu ----------';
const menuEnd='async function applyLoadedV21Settings(){';
const menuBlock=range(main,menuStart,menuEnd,'V21 menu block');

const startupModule=[
  '// World Drive V21.25 — startup overlay and vehicle chooser.',
  '// Rendering/UI ownership only. Engine state remains in main.js through callbacks.',
  '',
  'export function createStartupUi({',
  '  versionLabel,',
  '  title,',
  '  loading,',
  '  getRouteSummary,',
  '  getVehicles,',
  '  onStartVehicle',
  '}){',
  "  if(typeof getRouteSummary!=='function')throw new Error('startup UI requires getRouteSummary');",
  "  if(typeof getVehicles!=='function')throw new Error('startup UI requires getVehicles');",
  "  if(typeof onStartVehicle!=='function')throw new Error('startup UI requires onStartVehicle');",
  "  const $=id=>document.getElementById(id);",
  "  let selectedVehicle=null;",
  '',
  '  function install(){',
  "    if(document.getElementById('v21Startup'))return;",
  '    const overlay=document.createElement(\'div\');',
  "    overlay.id='v21Startup';",
  '    overlay.innerHTML=`',
  '      <div class="v21StartupCard">',
  '        <div class="v21StartupBrand">',
  '          <h1>WORLD DRIVE</h1>',
  '          <p>${versionLabel} · initialisation du monde</p>',
  '        </div>',
  '        <div id="v21BootContent">',
  '          <div class="v21RouteSummary">',
  '            <span>Trajet par défaut</span>',
  '            <b>Manic-2 → Manic-5</b>',
  '          </div>',
  '          <div class="v21BootRows">',
  '            <div class="v21BootRow" id="v21BootRoute" data-state="loading"><span class="v21BootDot"></span><span>Trajet</span><b>Préparation…</b></div>',
  '            <div class="v21BootRow" id="v21BootHydro" data-state="waiting"><span class="v21BootDot"></span><span>Hydrographie initiale</span><b>En attente</b></div>',
  '            <div class="v21BootRow" id="v21BootSettings" data-state="loading"><span class="v21BootDot"></span><span>Réglages</span><b>Chargement…</b></div>',
  '          </div>',
  '        </div>',
  '      </div>',
  '    `;',
  '    document.body.appendChild(overlay);',
  '    document.title=title;',
  "    const oldLoadingTitle=loading?.querySelector('h1');",
  '    if(oldLoadingTitle)oldLoadingTitle.textContent=title;',
  "    loading?.classList.add('hidden');",
  '  }',
  '',
  '  function setProgress(key,state,text){',
  "    const map={route:'v21BootRoute',hydro:'v21BootHydro',settings:'v21BootSettings'};",
  '    const row=$(map[key]);',
  '    if(!row)return;',
  '    row.dataset.state=state;',
  "    const value=row.querySelector('b');",
  '    if(value)value.textContent=text;',
  '  }',
  '',
  '  function showVehicleChooser(){',
  "    const content=$('v21BootContent');",
  '    if(!content)return;',
  '    selectedVehicle=null;',
  '    const route=getRouteSummary()||{};',
  '    content.innerHTML=`',
  '      <div class="v21RouteSummary"><span>Trajet prêt</span><b>${route.start||\'Départ\'} → ${route.end||\'Arrivée\'}</b></div>',
  '      <div style="margin-top:18px">',
  '        <div style="font-size:11px;color:#8aa0b3;text-transform:uppercase;letter-spacing:.12em;font-weight:800">Choisissez votre véhicule</div>',
  '        <div class="v21VehicleGrid" id="v21VehicleGrid"></div>',
  '      </div>',
  '      <button id="v21StartButton" disabled>DÉMARRER</button>',
  '    `;',
  "    const grid=$('v21VehicleGrid');",
  '    for(const vehicle of getVehicles()||[]){',
  "      const button=document.createElement('button');",
  "      button.type='button';",
  "      button.className='v21VehicleChoice';",
  '      button.dataset.vehicleId=vehicle.id;',
  '      button.innerHTML=`<b>${vehicle.name}</b><span>${vehicle.description}</span>`;',
  "      button.addEventListener('click',()=>{",
  '        selectedVehicle=vehicle.id;',
  "        grid.querySelectorAll('.v21VehicleChoice').forEach(item=>item.classList.toggle('selected',item===button));",
  "        const startButton=$('v21StartButton');",
  '        if(startButton)startButton.disabled=false;',
  '      });',
  '      grid.appendChild(button);',
  '    }',
  "    $('v21StartButton')?.addEventListener('click',async()=>{",
  '      if(!selectedVehicle)return;',
  "      const startButton=$('v21StartButton');",
  "      if(startButton){startButton.disabled=true;startButton.textContent='DÉMARRAGE…';}",
  '      try{',
  '        const started=await onStartVehicle(selectedVehicle);',
  '        if(started===false){',
  "          if(startButton){startButton.disabled=false;startButton.textContent='DÉMARRER';}",
  '          return;',
  '        }',
  "        $('v21Startup')?.classList.add('hidden');",
  '      }catch(error){',
  "        console.error('Vehicle start failed',error);",
  "        if(startButton){startButton.disabled=false;startButton.textContent='DÉMARRER';}",
  '        throw error;',
  '      }',
  '    });',
  '  }',
  '',
  '  return Object.freeze({install,setProgress,showVehicleChooser});',
  '}',
  '',
  ''
].join(eol);

let extractedMenu=menuBlock.text;

// Menu open state is now private to the menu module; main receives a mirror
// boolean through onMenuOpenChange so simulation/input gating remains unchanged.
extractedMenu=extractedMenu.replace(
  /function setV21MenuOpen\(open\)\{\s+v21MenuOpen=\s+!!open;/,
  `function setV21MenuOpen(open){${eol}  v21MenuOpen=${eol}    !!open;${eol}  onMenuOpenChange?.(v21MenuOpen);`
);

// Keyboard rebinding still belongs to main's global key handler. Keep the menu
// editor synchronized through explicit getter/setter callbacks.
extractedMenu=extractedMenu.replace(
  /keyboardRebindAction=\s+action;/,
  'setKeyboardRebindAction(action);'
);
extractedMenu=extractedMenu.replace(
  '!keyboardRebindAction',
  '!getKeyboardRebindAction()'
);

// Runtime driving state is sampled immediately before UI synchronization.
extractedMenu=extractedMenu.replace(
  'function syncV21RuntimeControls(){',
  `function syncV21RuntimeControls(){${eol}  syncLiveState();`
);

if(!extractedMenu.includes('onMenuOpenChange?.(v21MenuOpen);')){
  die('failed to inject menu-open synchronization. No files were changed.');
}
if(!extractedMenu.includes('setKeyboardRebindAction(action);')){
  die('failed to inject keyboard rebind setter. No files were changed.');
}
if(!extractedMenu.includes('!getKeyboardRebindAction()')){
  die('failed to inject keyboard rebind getter. No files were changed.');
}
if(!extractedMenu.includes('syncLiveState();')){
  die('failed to inject runtime-state synchronization. No files were changed.');
}

const menuHeader=[
  '// World Drive V21.25 — V21 application menu and settings presentation.',
  '// The menu owns DOM; main.js remains authoritative for driving/runtime state.',
  '',
  'export function createV21MenuSystem({',
  '  WORLD_DRIVE_VERSION_LABEL,',
  '  DEFAULT_WORLD_SETTINGS,',
  '  appSettings,',
  '  vehicleSystem,',
  '  vehicleSelect,',
  '  transmissionModeSelect,',
  '  timeSlider,',
  '  timeLabel,',
  '  vehicleTopSpeedKmh,',
  '  keyboardCodes,',
  '  clearKeyboardState,',
  '  queueSettingsSave,',
  '  cloneDefaultControls,',
  '  applyDisplayDistanceProfile,',
  '  imageryService,',
  '  vehicleAudio,',
  '  multiplayer,',
  '  cameraController,',
  '  toggleAssist,',
  '  toggleRoadSpeedLimits,',
  '  toggleAutopilot,',
  '  resetToRoad,',
  '  getWorldCacheStats,',
  '  clearWorldDriveCache,',
  '  toast,',
  '  getRuntimeState,',
  '  getKeyboardRebindAction,',
  '  setKeyboardRebindAction,',
  '  onMenuOpenChange',
  '}){',
  "  if(!appSettings)throw new Error('V21 menu requires appSettings');",
  "  if(typeof getRuntimeState!=='function')throw new Error('V21 menu requires getRuntimeState');",
  "  if(typeof getKeyboardRebindAction!=='function'||typeof setKeyboardRebindAction!=='function')throw new Error('V21 menu requires keyboard rebind accessors');",
  "  const $=id=>document.getElementById(id);",
  '  let v21MenuOpen=false;',
  '  let v21MenuEl=null;',
  '  let v21MenuButton=null;',
  '  let assist=false;',
  '  let obeyRoadSpeedLimits=true;',
  "  let transmissionMode='automatic';",
  '  let autopilot=false;',
  '',
  '  function syncLiveState(){',
  '    const state=getRuntimeState()||{};',
  '    assist=!!state.assist;',
  '    obeyRoadSpeedLimits=state.obeyRoadSpeedLimits!==false;',
  "    transmissionMode=state.transmissionMode==='manual'?'manual':'automatic';",
  '    autopilot=!!state.autopilot;',
  '  }',
  ''
].join(eol);

const menuFooter=[
  '',
  '  return Object.freeze({',
  '    install:installV21Menu,',
  '    syncRuntimeControls:syncV21RuntimeControls,',
  '    syncVehicleInfo:syncV21VehicleInfo,',
  '    applyDisplayVisibility:applyV21DisplayVisibility,',
  '    setOpen:setV21MenuOpen,',
  '    isOpen:()=>v21MenuOpen,',
  '    showButton(){if(v21MenuButton)v21MenuButton.style.display=\'block\';},',
  '    hideButton(){if(v21MenuButton)v21MenuButton.style.display=\'none\';}',
  '  });',
  '}',
  '',
  ''
].join(eol);

const menuModule=menuHeader+extractedMenu+menuFooter;

const startupReplacement=[
  '// ---------- startup UI ----------',
  'const startupUi=createStartupUi({',
  '  versionLabel:WORLD_DRIVE_VERSION_LABEL,',
  '  title:WORLD_DRIVE_TITLE,',
  '  loading,',
  '  getRouteSummary:()=>({start:ROUTE_START.name,end:ROUTE_END.name}),',
  '  getVehicles:()=>vehicleSystem.list(),',
  '  onStartVehicle:async vehicleId=>{',
  '    applyVehicleSelection(vehicleId,{announce:false});',
  '    transmissionMode=',
  "      appSettings.transmissionMode==='manual'",
  "        ?'manual'",
  "        :'automatic';",
  '    if(transmissionModeSelect)transmissionModeSelect.value=transmissionMode;',
  '    try{',
  '      await vehicleAudio.setEnabled(!!appSettings.audioEnabled);',
  '    }catch(error){',
  "      console.warn('Default audio activation failed',error);",
  '    }',
  '    gameStarted=true;',
  '    showV21MenuButton();',
  "    $('speedometerDock')?.classList.add('visible');",
  '    syncV21RuntimeControls();',
  '    syncV21VehicleInfo();',
  '    toast(`Bonne route · ${vehicleSystem.active.name}`);',
  '    return true;',
  '  }',
  '});',
  'startupUi.install();',
  'const setV21BootProgress=(...args)=>startupUi.setProgress(...args);',
  'const showV21VehicleChooser=()=>startupUi.showVehicleChooser();',
  '',
  startupEnd
].join(eol);

const menuReplacement=[
  '// ---------- V21 menu facade ----------',
  'let v21MenuSystem=null;',
  'function ensureV21MenuSystem(){',
  '  if(v21MenuSystem)return v21MenuSystem;',
  '  v21MenuSystem=createV21MenuSystem({',
  '    WORLD_DRIVE_VERSION_LABEL,',
  '    DEFAULT_WORLD_SETTINGS,',
  '    appSettings,',
  '    vehicleSystem,',
  '    vehicleSelect,',
  '    transmissionModeSelect,',
  '    timeSlider,',
  '    timeLabel,',
  '    vehicleTopSpeedKmh,',
  '    keyboardCodes,',
  '    clearKeyboardState,',
  '    queueSettingsSave,',
  '    cloneDefaultControls,',
  '    applyDisplayDistanceProfile,',
  '    imageryService,',
  '    vehicleAudio,',
  '    multiplayer,',
  '    cameraController,',
  '    toggleAssist,',
  '    toggleRoadSpeedLimits,',
  '    toggleAutopilot,',
  '    resetToRoad,',
  '    getWorldCacheStats,',
  '    clearWorldDriveCache,',
  '    toast,',
  '    getRuntimeState:()=>({assist,obeyRoadSpeedLimits,transmissionMode,autopilot}),',
  '    getKeyboardRebindAction:()=>keyboardRebindAction,',
  '    setKeyboardRebindAction:value=>{keyboardRebindAction=value;},',
  '    onMenuOpenChange:open=>{v21MenuOpen=!!open;}',
  '  });',
  '  return v21MenuSystem;',
  '}',
  'function installV21Menu(){ensureV21MenuSystem().install();}',
  'function syncV21RuntimeControls(){v21MenuSystem?.syncRuntimeControls();}',
  'function syncV21VehicleInfo(){v21MenuSystem?.syncVehicleInfo();}',
  'function applyV21DisplayVisibility(){v21MenuSystem?.applyDisplayVisibility();}',
  'function showV21MenuButton(){v21MenuSystem?.showButton();}',
  '',
  menuEnd
].join(eol);

// Replace later block first so earlier offsets remain valid.
main=main.slice(0,menuBlock.start)+menuReplacement+main.slice(menuBlock.end+menuEnd.length);
main=main.slice(0,startupBlock.start)+startupReplacement+main.slice(startupBlock.end+startupEnd.length);

const importAnchor="import { createMinimapSystem } from './minimap.js';";
main=main.replace(
  importAnchor,
  importAnchor+eol+"import { createStartupUi } from './startup-ui.js';"+eol+"import { createV21MenuSystem } from './v21-menu.js';"
);

for(const legacyState of [
  "let v21BootMode='loading';"+eol,
  'let v21MenuEl=null;'+eol,
  'let v21MenuButton=null;'+eol,
  'let v21SelectedStartupVehicle=null;'+eol
]){
  if(!main.includes(legacyState)){
    die(`legacy startup/menu state missing before cleanup: ${legacyState.trim()}. No files were changed.`);
  }
  main=main.replace(legacyState,'');
}

for(const stale of [
  'function createV21BootOverlay(){',
  'function showV21VehicleChooser(){',
  '// ---------- V21 reorganized menu ----------',
  'const KEYBOARD_ACTION_LABELS={',
  'function installV21DesktopMultiplayer(',
  'function setV21MenuOpen(',
  'function installV21Menu(){\n  if(v21MenuEl)return;'
]){
  if(main.includes(stale)){
    die(`post-transform stale UI implementation remains in main.js: ${stale}. No files were changed.`);
  }
}

for(const required of [
  "from './startup-ui.js'",
  "from './v21-menu.js'",
  'const startupUi=createStartupUi({',
  'let v21MenuSystem=null;',
  'createV21MenuSystem({',
  'function installV21Menu(){ensureV21MenuSystem().install();}',
  'async function applyLoadedV21Settings(){',
  'let v21MenuOpen=false;',
  'let keyboardRebindAction=null;'
]){
  if(!main.includes(required)){
    die(`post-transform main integration missing: ${required}. No files were changed.`);
  }
}

for(const required of [
  'export function createStartupUi({',
  'function install(){',
  'function setProgress(',
  'function showVehicleChooser(){',
  'onStartVehicle(selectedVehicle)'
]){
  if(!startupModule.includes(required)){
    die(`startup-ui.js generation missing: ${required}. No files were changed.`);
  }
}

for(const required of [
  'export function createV21MenuSystem({',
  'function syncLiveState(){',
  'function syncV21RuntimeControls(){',
  'function installV21Menu(){',
  'onMenuOpenChange?.(v21MenuOpen);',
  'setKeyboardRebindAction(action);',
  '!getKeyboardRebindAction()',
  'showButton(){'
]){
  if(!menuModule.includes(required)){
    die(`v21-menu.js generation missing: ${required}. No files were changed.`);
  }
}

syntaxCheck(mainCheck,main,'transformed main.js');
syntaxCheck(startupCheck,startupModule,'generated startup-ui.js');
syntaxCheck(menuCheck,menuModule,'generated v21-menu.js');

// All validation passed. Only now mutate the working tree.
fs.writeFileSync(startupPath,startupModule,'utf8');
fs.writeFileSync(menuPath,menuModule,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
const afterBytes=Buffer.byteLength(main,'utf8');
console.log('V21.25 UI REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines (${beforeBytes} -> ${afterBytes} bytes)`);
console.log(`startup-ui.js: ${startupModule.split(/\r?\n/).length} lines`);
console.log(`v21-menu.js: ${menuModule.split(/\r?\n/).length} lines`);
console.log('Extracted: startup overlay, vehicle chooser, V21 menu/settings/controls/multiplayer UI.');
console.log('Next: node qa/V21_25_UI_REFACTOR_QA.mjs');
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','keyboard-controls.js');
const mainCheck=path.join(root,'src','__main_keyboard_check__.mjs');
const moduleCheck=path.join(root,'src','__keyboard_controls_check__.mjs');

function die(message){
  console.error(`V21.25 keyboard refactor: ${message}`);
  process.exit(1);
}
function count(text,needle){return text.split(needle).length-1;}
function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js missing.');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';
const beforeLines=main.split(/\r?\n/).length;

const already=
  main.includes("from './keyboard-controls.js'")&&
  main.includes('createKeyboardControls({')&&
  !main.includes('const keys={};');
if(already){
  if(!fs.existsSync(modulePath))die('main.js references keyboard-controls.js but the module is missing.');
  console.log('V21.25 keyboard refactor: already applied; nothing to do.');
  process.exit(0);
}

const startMarker='const keys={};';
const endMarker='let maxSpeedKmh=200;';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start+startMarker.length);
if(start<0||end<0)die('keyboard control block markers not found. No files changed.');
const oldBlock=main.slice(start,end);
for(const required of [
  'function keyboardCodes(action){',
  'function keyboardActionDown(action){',
  'function keyboardActionMatches(action,code){',
  'function clearKeyboardState(){',
  'function assignKeyboardBinding(action,code){',
  "addEventListener('keydown',e=>{",
  "'keyup'"
]){
  if(!oldBlock.includes(required))die(`keyboard block member missing: ${required}. No files changed.`);
}

const module=[
  '// World Drive V21.25 — keyboard input controller.',
  '// Owns key state and rebinding events; gameplay actions remain callbacks into main.js.',
  '',
  'export function createKeyboardControls({',
  '  appSettings,',
  '  defaults,',
  '  queueSettingsSave,',
  '  getKeyboardRebindAction,',
  '  setKeyboardRebindAction,',
  '  getRuntimeState,',
  '  onShiftUp,',
  '  onShiftDown,',
  '  onCycleCamera,',
  '  onToggleAssist,',
  '  onToggleAutopilot,',
  '  onResetToRoad,',
  '  onManualTakeover',
  '}){',
  "  if(!appSettings||!defaults)throw new Error('keyboard controls require settings');",
  "  if(typeof getRuntimeState!=='function')throw new Error('keyboard controls require runtime state');",
  "  if(typeof getKeyboardRebindAction!=='function'||typeof setKeyboardRebindAction!=='function')throw new Error('keyboard controls require rebind accessors');",
  '',
  '  const keys={};',
  '',
  '  function codes(action){',
  '    const configured=appSettings?.controls?.keyboard?.[action];',
  '    const fallback=defaults?.controls?.keyboard?.[action]||[];',
  '    return Array.isArray(configured)&&configured.length?configured:fallback;',
  '  }',
  '',
  '  function actionDown(action){',
  '    return codes(action).some(code=>!!keys[code]);',
  '  }',
  '',
  '  function actionMatches(action,code){',
  '    return codes(action).includes(code);',
  '  }',
  '',
  '  function clearState(){',
  '    for(const key of Object.keys(keys))delete keys[key];',
  '  }',
  '',
  '  function assignBinding(action,code){',
  '    const controls=appSettings.controls.keyboard;',
  '    for(const otherAction of Object.keys(controls)){',
  '      if(otherAction===action)continue;',
  '      controls[otherAction]=(controls[otherAction]||[]).filter(existing=>existing!==code);',
  '    }',
  '    controls[action]=[code];',
  '    queueSettingsSave?.();',
  '  }',
  '',
  '  function keydown(e){',
  '    const rebindAction=getKeyboardRebindAction();',
  '    if(rebindAction){',
  '      e.preventDefault();',
  '      e.stopPropagation();',
  "      if(e.code==='Escape'){",
  '        setKeyboardRebindAction(null);',
  "        window.dispatchEvent(new CustomEvent('worlddrive-keyboard-rebind-cancel'));",
  '        return;',
  '      }',
  '      setKeyboardRebindAction(null);',
  '      assignBinding(rebindAction,e.code);',
  "      window.dispatchEvent(new CustomEvent('worlddrive-keyboard-rebound',{detail:{action:rebindAction,code:e.code}}));",
  '      return;',
  '    }',
  '',
  '    const state=getRuntimeState()||{};',
  "    const inputTag=String(e.target?.tagName||'').toUpperCase();",
  '    if(',
  '      !state.gameStarted||',
  '      state.menuOpen||',
  "      inputTag==='INPUT'||inputTag==='TEXTAREA'||inputTag==='SELECT'||",
  '      e.target?.isContentEditable',
  '    )return;',
  '',
  '    keys[e.code]=true;',
  "    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','BracketLeft','BracketRight'].includes(e.code))e.preventDefault();",
  '',
  "    if(!e.repeat&&actionMatches('shiftUp',e.code))onShiftUp?.();",
  "    if(!e.repeat&&actionMatches('shiftDown',e.code))onShiftDown?.();",
  "    if(!e.repeat&&actionMatches('camera',e.code))onCycleCamera?.();",
  "    if(!e.repeat&&actionMatches('assist',e.code))onToggleAssist?.();",
  "    if(!e.repeat&&actionMatches('autopilot',e.code))onToggleAutopilot?.();",
  "    if(!e.repeat&&actionMatches('reset',e.code))onResetToRoad?.();",
  '',
  '    if(',
  '      state.autopilot&&(',
  "        actionMatches('steerLeft',e.code)||",
  "        actionMatches('steerRight',e.code)||",
  "        actionMatches('brake',e.code)||",
  "        actionMatches('handbrake',e.code)",
  '      )',
  '    )onManualTakeover?.();',
  '  }',
  '',
  '  function keyup(e){',
  '    keys[e.code]=false;',
  '  }',
  '',
  "  addEventListener('keydown',keydown);",
  "  addEventListener('keyup',keyup);",
  '',
  '  return Object.freeze({',
  '    codes,',
  '    actionDown,',
  '    actionMatches,',
  '    clearState,',
  '    dispose(){',
  "      removeEventListener('keydown',keydown);",
  "      removeEventListener('keyup',keyup);",
  '      clearState();',
  '    }',
  '  });',
  '}',
  ''
].join(eol);

const replacement=[
  '// ---------- keyboard controller facade ----------',
  'const keyboardControls=createKeyboardControls({',
  '  appSettings,',
  '  defaults:DEFAULT_WORLD_SETTINGS,',
  '  queueSettingsSave,',
  '  getKeyboardRebindAction:()=>keyboardRebindAction,',
  '  setKeyboardRebindAction:value=>{keyboardRebindAction=value;},',
  '  getRuntimeState:()=>({',
  '    gameStarted,',
  '    menuOpen:v21MenuOpen,',
  '    autopilot',
  '  }),',
  '  onShiftUp:()=>requestManualShift(1),',
  '  onShiftDown:()=>requestManualShift(-1),',
  '  onCycleCamera:()=>cameraController.cycle(),',
  '  onToggleAssist:()=>toggleAssist(),',
  '  onToggleAutopilot:()=>toggleAutopilot(),',
  '  onResetToRoad:()=>resetToRoad(),',
  "  onManualTakeover:()=>setAutopilot(false,'Reprise manuelle')",
  '});',
  'const keyboardCodes=action=>keyboardControls.codes(action);',
  'const keyboardActionDown=action=>keyboardControls.actionDown(action);',
  'const keyboardActionMatches=(action,code)=>keyboardControls.actionMatches(action,code);',
  'const clearKeyboardState=()=>keyboardControls.clearState();',
  '',
  endMarker
].join(eol);

main=main.slice(0,start)+replacement+main.slice(end+endMarker.length);

const importAnchor="import { createGamepadController } from './gamepad.js';";
if(count(main,importAnchor)!==1)die('gamepad import anchor missing/duplicated. No files changed.');
main=main.replace(importAnchor,importAnchor+eol+"import { createKeyboardControls } from './keyboard-controls.js';");

for(const stale of [
  'const keys={};',
  'function assignKeyboardBinding(action,code){'
]){
  if(main.includes(stale))die(`stale keyboard implementation remains in main.js: ${stale}. No files changed.`);
}
for(const required of [
  "from './keyboard-controls.js'",
  'const keyboardControls=createKeyboardControls({',
  'const keyboardActionDown=action=>keyboardControls.actionDown(action);',
  'const clearKeyboardState=()=>keyboardControls.clearState();',
  'getKeyboardRebindAction:()=>keyboardRebindAction',
  "onManualTakeover:()=>setAutopilot(false,'Reprise manuelle')"
]){
  if(!main.includes(required))die(`keyboard facade missing: ${required}. No files changed.`);
}
for(const required of [
  'export function createKeyboardControls({',
  'function actionDown(action){',
  'function assignBinding(action,code){',
  "addEventListener('keydown',keydown);",
  "worlddrive-keyboard-rebound",
  'onManualTakeover?.();'
]){
  if(!module.includes(required))die(`keyboard-controls.js generation missing: ${required}. No files changed.`);
}

syntaxCheck(mainCheck,main,'transformed main.js');
syntaxCheck(moduleCheck,module,'generated keyboard-controls.js');

fs.writeFileSync(modulePath,module,'utf8');
fs.writeFileSync(mainPath,main,'utf8');

const afterLines=main.split(/\r?\n/).length;
console.log('V21.25 KEYBOARD REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`keyboard-controls.js: ${module.split(/\r?\n/).length} lines`);
console.log('Extracted: key state, action matching, rebinding, keyboard event dispatch.');
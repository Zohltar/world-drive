import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const startupPath=path.join(src,'startup-ui.js');
const menuPath=path.join(src,'v21-menu.js');
const loadedSettingsPath=path.join(src,'loaded-settings-application.js');

for(const filePath of [mainPath,startupPath,menuPath,loadedSettingsPath]){
  assert.equal(fs.existsSync(filePath),true,`${path.basename(filePath)} missing`);
}

const main=fs.readFileSync(mainPath,'utf8');
const startup=fs.readFileSync(startupPath,'utf8');
const menu=fs.readFileSync(menuPath,'utf8');
const loadedSettings=fs.readFileSync(loadedSettingsPath,'utf8');

for(const pattern of [
  /function createV21BootOverlay\s*\(/,
  /function showV21VehicleChooser\s*\(/,
  /v21SelectedStartupVehicle/,
  /v21BootMode/,
  /V21 reorganized menu/,
  /const KEYBOARD_ACTION_LABELS=\{/,
  /function installV21DesktopMultiplayer\s*\(/,
  /function createV21Section\s*\(/,
  /function buildV21GamepadControls\s*\(/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted application UI: ${pattern}`);
}

for(const pattern of [
  /from '\.\/startup-ui\.js'/,
  /from '\.\/v21-menu\.js'/,
  /from '\.\/loaded-settings-application\.js'/,
  /const startupUi=createStartupUi\s*\(/,
  /let v21MenuSystem=null/,
  /createV21MenuSystem\s*\(/,
  /function installV21Menu\(\)\{ensureV21MenuSystem\(\)\.install\(\);\}/,
  /function syncV21RuntimeControls\(\)\{v21MenuSystem\?\.syncRuntimeControls\(\);\}/,
  /function showV21MenuButton\(\)/,
  /const loadedSettingsApplication=createLoadedSettingsApplication\(\{/,
  /const applyLoadedV21Settings=\(\)=>loadedSettingsApplication\.apply\(\);/,
  /await applyLoadedV21Settings\(\);/,
  /let v21MenuOpen=false;/,
  /let keyboardRebindAction=null;/
]){
  assert.match(main,pattern,`main.js missing extracted UI/composition facade: ${pattern}`);
}

assert.doesNotMatch(
  main,
  /async function applyLoadedV21Settings\s*\(/,
  'main.js still owns the pre-C5.6 loaded-settings implementation body'
);
assert.match(
  loadedSettings,
  /export function createLoadedSettingsApplication\s*\(/,
  'loaded-settings application module missing canonical factory'
);

for(const pattern of [
  /export function createStartupUi\s*\(/,
  /function install\(\)/,
  /function setProgress\s*\(/,
  /function showVehicleChooser\s*\(/,
  /onStartVehicle\(selectedVehicle\)/,
  /v21VehicleChoice/,
  /v21BootHydro/,
  /v21BootSettings/
]){
  assert.match(startup,pattern,`startup-ui.js missing expected behavior: ${pattern}`);
}

for(const pattern of [
  /export function createV21MenuSystem\s*\(/,
  /function syncLiveState\s*\(/,
  /function syncV21RuntimeControls\s*\(/,
  /function installV21Menu\s*\(/,
  /function installV21DesktopMultiplayer\s*\(/,
  /function buildV21KeyboardControls\s*\(/,
  /function buildV21GamepadControls\s*\(/,
  /onMenuOpenChange\?\.\(v21MenuOpen\)/,
  /setKeyboardRebindAction\(action\)/,
  /!getKeyboardRebindAction\(\)/,
  /getWorldCacheStats\(\)/,
  /clearWorldDriveCache\(\)/,
  /showButton\(\)/
]){
  assert.match(menu,pattern,`v21-menu.js missing expected behavior: ${pattern}`);
}

assert.doesNotMatch(
  menu,
  /\bkeyboardRebindAction\b/,
  'v21-menu.js must use keyboard rebind accessors rather than owning stale state'
);

for(const filePath of [mainPath,startupPath,menuPath,loadedSettingsPath]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

const startupImport=await import(`${pathToFileURL(startupPath).href}?qa=${Date.now()}`);
const menuImport=await import(`${pathToFileURL(menuPath).href}?qa=${Date.now()}`);
const loadedSettingsImport=await import(`${pathToFileURL(loadedSettingsPath).href}?qa=${Date.now()}`);
assert.equal(typeof startupImport.createStartupUi,'function','createStartupUi export missing');
assert.equal(typeof menuImport.createV21MenuSystem,'function','createV21MenuSystem export missing');
assert.equal(typeof loadedSettingsImport.createLoadedSettingsApplication,'function','createLoadedSettingsApplication export missing');

const mainLines=main.split(/\r?\n/).length;
const startupLines=startup.split(/\r?\n/).length;
const menuLines=menu.split(/\r?\n/).length;
assert.ok(mainLines<8500,`main.js is still unexpectedly large after UI extraction: ${mainLines} lines`);

console.log('V21.25 UI REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; startup-ui.js: ${startupLines}; v21-menu.js: ${menuLines}`);
console.log('startup/menu ownership: extracted; loaded settings: delegated through current composition facade');

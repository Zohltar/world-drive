import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createApplicationSettingsController,
  cloneSettingsValue,
  replaceSettingsInPlace
} from './src/application-settings.js';
import {DEFAULT_WORLD_SETTINGS} from './src/cache.js';

const defaultsSnapshot=JSON.stringify(DEFAULT_WORLD_SETTINGS);
const loaded=cloneSettingsValue(DEFAULT_WORLD_SETTINGS);
loaded.audioEnabled=false;
loaded.displayDistance='medium';
loaded.display.cluster=false;
loaded.controls.keyboard.accelerate=['KeyZ'];
loaded.controls.keyboard.camera=['KeyV'];
loaded.controls.gamepad.joystickSensitivity=.73;
loaded.controls.gamepad.steerAxis=4;

let loadCalls=0;
const saved=[];
const store={
  async load(){loadCalls++;return cloneSettingsValue(loaded);},
  async save(settings){saved.push(cloneSettingsValue(settings));return true;}
};
let nextTimerId=1;
let pending=null;
const cleared=[];
const warnings=[];
const setTimeoutFn=(fn,delay)=>{
  const id=nextTimerId++;
  pending={id,fn,delay};
  return id;
};
const clearTimeoutFn=id=>{cleared.push(id);if(pending?.id===id)pending=null;};

const controller=createApplicationSettingsController({
  defaults:DEFAULT_WORLD_SETTINGS,
  store,
  setTimeoutFn,
  clearTimeoutFn,
  warn:(...args)=>warnings.push(args)
});

assert.equal(controller.saveDelayMs,120,'settings save debounce changed');
assert.equal(controller.loaded,false,'settings controller must start unloaded');
assert.equal(controller.queueSave(),false,'pre-load settings save must remain a no-op');
assert.equal(pending,null,'pre-load queueSave unexpectedly scheduled a timer');

const rootRef=controller.settings;
const controlsRef=rootRef.controls;
const keyboardRef=rootRef.controls.keyboard;
const gamepadRef=rootRef.controls.gamepad;
const displayRef=rootRef.display;
const defaultControlsClone=controller.cloneDefaultControls();
defaultControlsClone.keyboard.accelerate[0]='MutatedClone';
assert.equal(DEFAULT_WORLD_SETTINGS.controls.keyboard.accelerate[0],'KeyW','default controls clone mutated defaults');

const loadedResult=await controller.load();
assert.equal(loadCalls,1,'settings store load count changed');
assert.strictEqual(loadedResult,rootRef,'load() replaced the stable settings root');
assert.strictEqual(controller.settings,rootRef,'controller settings root identity changed');
assert.strictEqual(rootRef.controls,controlsRef,'controls object identity changed');
assert.strictEqual(rootRef.controls.keyboard,keyboardRef,'keyboard object identity changed');
assert.strictEqual(rootRef.controls.gamepad,gamepadRef,'gamepad object identity changed');
assert.strictEqual(rootRef.display,displayRef,'display object identity changed');
assert.equal(controller.loaded,true,'settings controller did not mark load complete');
assert.deepEqual(keyboardRef.accelerate,['KeyZ'],'pre-load keyboard reference did not see loaded binding');
assert.deepEqual(keyboardRef.camera,['KeyV'],'pre-load keyboard reference did not see loaded camera binding');
assert.equal(gamepadRef.joystickSensitivity,.73,'pre-load gamepad reference did not see loaded sensitivity');
assert.equal(gamepadRef.steerAxis,4,'pre-load gamepad reference did not see loaded axis');
assert.equal(displayRef.cluster,false,'pre-load display reference did not see loaded visibility');
assert.equal(rootRef.displayDistance,'medium','loaded display distance missing from stable root');
assert.equal(JSON.stringify(DEFAULT_WORLD_SETTINGS),defaultsSnapshot,'application defaults were mutated by load');

keyboardRef.accelerate=['KeyQ'];
rootRef.displayDistance='low';
assert.equal(controller.queueSave(),true,'post-load settings save was not queued');
assert.equal(pending?.delay,120,'settings save debounce is no longer 120 ms');
const firstTimerId=pending.id;
keyboardRef.camera=['KeyB'];
assert.equal(controller.queueSave(),true,'second settings save was not queued');
assert.deepEqual(cleared,[firstTimerId],'second queueSave did not cancel prior debounce timer');
assert.equal(pending?.delay,120,'replacement debounce timer changed delay');
const flush=pending.fn;
pending=null;
flush();
await Promise.resolve();
await Promise.resolve();
assert.equal(saved.length,1,'debounced settings save count changed');
assert.deepEqual(saved[0].controls.keyboard.accelerate,['KeyQ'],'saved settings missed edit through captured keyboard reference');
assert.deepEqual(saved[0].controls.keyboard.camera,['KeyB'],'saved settings missed second captured-reference edit');
assert.equal(saved[0].displayDistance,'low','saved settings missed stable-root display distance edit');
assert.equal(warnings.length,0,'unexpected settings save warning');

// Replacement helper must preserve nested plain-object identity while replacing
// arrays/primitives and pruning values no longer present in the loaded source.
{
  const target={a:{b:1,c:2},arr:[1,2],stale:true};
  const nested=target.a;
  replaceSettingsInPlace(target,{a:{b:9,d:4},arr:[7]});
  assert.strictEqual(target.a,nested,'replaceSettingsInPlace replaced nested plain object');
  assert.deepEqual(target,{a:{b:9,d:4},arr:[7]},'replaceSettingsInPlace content changed');
}

const main=fs.readFileSync('src/main.js','utf8');
const settingsModule=fs.readFileSync('src/application-settings.js','utf8');
const mainLines=main.split(/\r?\n/).length;
assert.match(main,/import \{ createApplicationSettingsController \} from ['"]\.\/application-settings\.js['"]/,'main missing application-settings import');
assert.match(main,/const settingsController=createApplicationSettingsController\(\{/,'main missing settings controller composition');
assert.match(main,/defaults:DEFAULT_WORLD_SETTINGS,/,'main settings controller no longer uses canonical defaults');
assert.match(main,/store:WorldSettings,/,'main settings controller no longer uses canonical IndexedDB store');
assert.match(main,/saveDelayMs:120/,'main settings debounce changed');
assert.match(main,/const appSettings=settingsController\.settings;/,'main does not use stable settings root');
assert.match(main,/const queueSettingsSave=\(\)=>settingsController\.queueSave\(\);/,'main settings save facade changed');
assert.match(main,/const cloneDefaultControls=\(\)=>settingsController\.cloneDefaultControls\(\);/,'main default-controls facade changed');
assert.match(main,/await settingsController\.load\(\);/,'boot does not load settings in place');
assert.doesNotMatch(main,/\blet appSettings\b/,'main still exposes reassignable settings root');
assert.doesNotMatch(main,/appSettings\s*=\s*[\r\n ]*await WorldSettings\.load\(\)/,'boot still replaces settings root');
assert.doesNotMatch(main,/\bsettingsLoaded\b/,'main still owns settings loaded state');
assert.doesNotMatch(main,/\bsettingsSaveTimer\b/,'main still owns settings debounce timer');
assert.match(main,/createKeyboardControls\(\{[\s\S]*?appSettings,/,'keyboard controller no longer receives stable settings root');
assert.match(main,/createEnvironmentController\(\{[\s\S]*?appSettings,/,'environment controller no longer receives stable settings root');
assert.doesNotMatch(settingsModule,/applyDisplayDistanceProfile|updateSpeedLimitModeUI|toggleImagery/,'C5.5 persistence owner absorbed runtime/UI settings application');
assert.ok(mainLines<2782,`C5.5 did not reduce main settings lifecycle ownership: ${mainLines} lines`);

console.log('CLEANUP C5.5 STABLE SETTINGS QA: PASS',{
  stableRoot:true,
  stableNestedObjects:['controls','keyboard','gamepad','display'],
  loadedKeyboardVisibleThroughCapturedReference:true,
  savedCapturedReferenceEdits:true,
  runtimeApplicationLocation:'owned outside C5.5',
  saveDelayMs:controller.saveDelayMs,
  mainLines
});

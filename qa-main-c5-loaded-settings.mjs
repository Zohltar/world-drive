import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','loaded-settings-application.js');

assert.equal(fs.existsSync(modulePath),true,'loaded-settings application module missing');
const {createLoadedSettingsApplication}=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createLoadedSettingsApplication,'function');

async function runCase(settings,{imageryInitially=false,withUi=true}={}){
  const calls=[];
  let imageryEnabled=imageryInitially;
  let transmissionMode=null;
  let assist=null;
  let obeyRoadSpeedLimits=null;
  const assistStatusEl=withUi?{textContent:''}:null;
  const transmissionModeSelect=withUi?{value:''}:null;

  const app=createLoadedSettingsApplication({
    settings,
    setTransmissionMode:value=>{transmissionMode=value;calls.push(['transmission',value]);},
    setAssist:value=>{assist=value;calls.push(['assist',value]);},
    setObeyRoadSpeedLimits:value=>{obeyRoadSpeedLimits=value;calls.push(['roadLimits',value]);},
    updateSpeedLimitModeUI:()=>calls.push(['speedLimitUi']),
    isImageryEnabled:()=>imageryEnabled,
    toggleImagery:()=>{imageryEnabled=!imageryEnabled;calls.push(['toggleImagery']);},
    applyDisplayDistanceProfile:value=>calls.push(['displayDistance',value]),
    applyDisplayVisibility:()=>calls.push(['displayVisibility']),
    assistStatusEl,
    transmissionModeSelect,
    syncRuntimeControls:()=>calls.push(['syncRuntimeControls'])
  });

  await app.apply();
  return {calls,imageryEnabled,transmissionMode,assist,obeyRoadSpeedLimits,assistStatusEl,transmissionModeSelect};
}

const manual=await runCase({
  transmissionMode:'manual',
  assist:false,
  obeyRoadSpeedLimits:false,
  imageryEnabled:true,
  displayDistance:'medium'
},{imageryInitially:false});
assert.equal(manual.transmissionMode,'manual');
assert.equal(manual.assist,false);
assert.equal(manual.obeyRoadSpeedLimits,false);
assert.equal(manual.imageryEnabled,true);
assert.equal(manual.assistStatusEl.textContent,'Assist: OFF');
assert.equal(manual.transmissionModeSelect.value,'manual');
assert.deepEqual(manual.calls,[
  ['transmission','manual'],
  ['assist',false],
  ['roadLimits',false],
  ['speedLimitUi'],
  ['toggleImagery'],
  ['displayDistance','medium'],
  ['displayVisibility'],
  ['syncRuntimeControls']
]);

const defaults=await runCase({
  transmissionMode:'unexpected',
  imageryEnabled:false,
  displayDistance:''
},{imageryInitially:false});
assert.equal(defaults.transmissionMode,'automatic','non-manual must remain automatic');
assert.equal(defaults.assist,true,'only explicit false may disable assist');
assert.equal(defaults.obeyRoadSpeedLimits,true,'only explicit false may disable road limits');
assert.equal(defaults.imageryEnabled,false,'matching imagery state must not toggle');
assert.equal(defaults.assistStatusEl.textContent,'Assist: ON');
assert.equal(defaults.transmissionModeSelect.value,'automatic');
assert.equal(defaults.calls.filter(call=>call[0]==='toggleImagery').length,0,'imagery toggled unnecessarily');
assert.deepEqual(defaults.calls.find(call=>call[0]==='displayDistance'),['displayDistance','high']);

const noUi=await runCase({
  transmissionMode:'automatic',
  assist:true,
  obeyRoadSpeedLimits:true,
  imageryEnabled:true,
  displayDistance:'high'
},{imageryInitially:true,withUi:false});
assert.equal(noUi.imageryEnabled,true);
assert.equal(noUi.calls.filter(call=>call[0]==='toggleImagery').length,0);

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
assert.match(main,/import \{ createLoadedSettingsApplication \} from '\.\/loaded-settings-application\.js';/,'main missing C5.6 import');
assert.match(main,/const loadedSettingsApplication=createLoadedSettingsApplication\(\{/,'main missing C5.6 composition');
assert.match(main,/const applyLoadedV21Settings=\(\)=>loadedSettingsApplication\.apply\(\);/,'main missing thin loaded-settings facade');
assert.doesNotMatch(main,/async function applyLoadedV21Settings\s*\(/,'old loaded-settings implementation still lives in main');

const loadIndex=main.indexOf('await settingsController.load();');
const menuIndex=main.indexOf('installV21Menu();',loadIndex);
const applyIndex=main.indexOf('await applyLoadedV21Settings();',menuIndex);
const routeIndex=main.indexOf('await createRequestedRoute(',applyIndex);
assert.ok(loadIndex>=0&&menuIndex>loadIndex&&applyIndex>menuIndex&&routeIndex>applyIndex,'startup settings/menu/apply/route order changed');

for(const fragment of [
  "settings.transmissionMode==='manual'",
  'settings.assist!==false',
  'settings.obeyRoadSpeedLimits!==false',
  'const imageryEnabled=!!settings.imageryEnabled',
  "settings.displayDistance||'high'",
  "'Assist: '+(assist?'ON':'OFF')"
]){
  assert.match(fs.readFileSync(modulePath,'utf8'),new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`C5.6 invariant missing: ${fragment}`);
}

console.log('CLEANUP C5.6 LOADED SETTINGS QA: PASS',{
  manualExact:true,
  falseOnlyDisables:true,
  imageryToggleOnlyOnMismatch:true,
  displayFallback:'high',
  startupOrder:'load -> menu -> apply -> route'
});

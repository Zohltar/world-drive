import fs from 'node:fs';

const path='src/main.js';
let source=fs.readFileSync(path,'utf8');

const importAnchor="import { createApplicationSettingsController } from './application-settings.js';\n";
const importLine="import { createLoadedSettingsApplication } from './loaded-settings-application.js';\n";
if(!source.includes(importLine)){
  if(!source.includes(importAnchor))throw new Error('application-settings import anchor missing');
  source=source.replace(importAnchor,importAnchor+importLine);
}

const start=source.indexOf('async function applyLoadedV21Settings(){');
const endAnchor="\n\n$('clearHydroCacheBtn').addEventListener('click',async()=>{";
const end=source.indexOf(endAnchor,start);
if(start<0||end<0)throw new Error('loaded settings implementation boundary missing');

const replacement=`const loadedSettingsApplication=createLoadedSettingsApplication({
  settings:appSettings,
  setTransmissionMode:value=>{transmissionMode=value;},
  setAssist:value=>{assist=value;},
  setObeyRoadSpeedLimits:value=>{obeyRoadSpeedLimits=value;},
  updateSpeedLimitModeUI,
  isImageryEnabled:()=>imageryService.enabled,
  toggleImagery:()=>imageryService.toggle(),
  applyDisplayDistanceProfile,
  applyDisplayVisibility:()=>applyV21DisplayVisibility(),
  getAssistStatusEl:()=>$('assist'),
  getTransmissionModeSelect:()=>transmissionModeSelect,
  syncRuntimeControls:()=>syncV21RuntimeControls()
});
const applyLoadedV21Settings=()=>loadedSettingsApplication.apply();`;

source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(path,source);

console.log('C5.6 loaded-settings application materialized',{
  mainLines:source.split(/\r?\n/).length,
  stableStartupOrder:
    source.indexOf('await settingsController.load();')<
    source.indexOf('await applyLoadedV21Settings();')&&
    source.indexOf('await applyLoadedV21Settings();')<
    source.indexOf('await createRequestedRoute(')
});

import fs from 'node:fs';

const mainPath='src/main.js';
let main=fs.readFileSync(mainPath,'utf8');

const importAnchor="import { createOverpassClient } from './overpass.js';";
const settingsImport="import { createApplicationSettingsController } from './application-settings.js';";
if(!main.includes(settingsImport)){
  if(!main.includes(importAnchor))throw new Error('C5.5 import anchor missing');
  main=main.replace(importAnchor,`${settingsImport}\n${importAnchor}`);
}

const blockStart='// ---------- V21 application settings / startup state ----------';
const blockEnd='// ---------- startup UI ----------';
const start=main.indexOf(blockStart);
const end=main.indexOf(blockEnd,start);
if(start<0||end<0||end<=start)throw new Error('C5.5 settings lifecycle block markers missing');

const current=main.slice(start,end);
for(const required of [
  'let appSettings=',
  'let settingsLoaded=false;',
  'let settingsSaveTimer=null;',
  'function queueSettingsSave(){',
  'function cloneDefaultControls(){',
  'let gameStarted=false;',
  'let v21MenuOpen=false;',
  'let keyboardRebindAction=null;',
  'let v21MenuSystem=null;'
]){
  if(!current.includes(required))throw new Error(`C5.5 expected settings block content missing: ${required}`);
}

const replacement=`// ---------- V21 application settings / startup state ----------\nconst settingsController=createApplicationSettingsController({\n  defaults:DEFAULT_WORLD_SETTINGS,\n  store:WorldSettings,\n  saveDelayMs:120\n});\nconst appSettings=settingsController.settings;\nconst queueSettingsSave=()=>settingsController.queueSave();\nconst cloneDefaultControls=()=>settingsController.cloneDefaultControls();\n\nlet gameStarted=false;\nlet v21MenuOpen=false;\nlet keyboardRebindAction=null;\nlet v21MenuSystem=null;\n\n`;
main=main.slice(0,start)+replacement+main.slice(end);

const oldBoot=`   appSettings=\n     await WorldSettings.load();\n\n   settingsLoaded=true;`;
const newBoot='   await settingsController.load();';
if(!main.includes(oldBoot))throw new Error('C5.5 boot settings load anchor missing');
main=main.replace(oldBoot,newBoot);

for(const stale of [
  /\blet appSettings\b/,
  /\bsettingsLoaded\b/,
  /\bsettingsSaveTimer\b/,
  /appSettings\s*=\s*[\r\n ]*await WorldSettings\.load\(\)/
]){
  if(stale.test(main))throw new Error(`C5.5 stale settings ownership remains: ${stale}`);
}
if(!main.includes('const appSettings=settingsController.settings;'))throw new Error('C5.5 stable root composition missing');
if(!main.includes('await settingsController.load();'))throw new Error('C5.5 in-place boot load missing');

main=main.replace(/[ \t]+$/gm,'').trimEnd()+'\n';
fs.writeFileSync(mainPath,main);
console.log('C5.5 stable settings lifecycle materialized',{
  mainLines:main.split(/\r?\n/).length,
  module:'src/application-settings.js',
  stableRoot:true,
  saveDelayMs:120
});

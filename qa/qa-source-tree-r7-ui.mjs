import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src');
const main=fs.readFileSync(path.join(src,'main.js'),'utf8').replace(/\r\n/g,'\n');

const modules={
  'heading-compass.js':'createHeadingCompass',
  'instrument-cluster.js':'createInstrumentCluster',
  'minimap.js':'createMinimapSystem',
  'route-planner-ui.js':'createRoutePlannerUi',
  'startup-ui.js':'createStartupUi',
  'v21-menu.js':'createV21MenuSystem'
};

for(const [file,exportName] of Object.entries(modules)){
  const facadePath=path.join(src,file);
  const implPath=path.join(src,'ui',file);
  assert.ok(fs.existsSync(facadePath),`missing root UI facade: ${file}`);
  assert.ok(fs.existsSync(implPath),`missing nested UI implementation: ui/${file}`);

  const facade=fs.readFileSync(facadePath,'utf8').trim();
  assert.equal(facade,`export * from './ui/${file}';`,`root UI facade changed for ${file}`);

  const impl=fs.readFileSync(implPath,'utf8');
  assert.match(impl,new RegExp(`export function ${exportName}\\s*\\(`),`nested UI implementation missing ${exportName}: ${file}`);

  const facadeModule=await import(`${pathToFileURL(facadePath).href}?qa=${Date.now()}-${file}`);
  assert.equal(typeof facadeModule[exportName],'function',`root facade no longer exports ${exportName}: ${file}`);
}

for(const file of ['instrument-cluster.js','minimap.js','route-planner-ui.js','startup-ui.js','v21-menu.js']){
  assert.match(main,new RegExp(`from '\\.\\/${file.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'`),`main.js no longer consumes stable root UI facade ${file}`);
  assert.doesNotMatch(main,new RegExp(`from '\\.\\/ui\\/${file.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'`),`main.js bypasses stable root UI facade ${file}`);
}

const instruments=fs.readFileSync(path.join(src,'ui','instrument-cluster.js'),'utf8');
assert.match(instruments,/from '\.\/heading-compass\.js'/,'instrument cluster no longer keeps heading compass inside the UI boundary');

const minimap=fs.readFileSync(path.join(src,'ui','minimap.js'),'utf8');
for(const pattern of [/function drawMap\s*\(/,/function updatePassedSignReadout\s*\(/,/function resetSignReadout\s*\(/,/multiplayer\.getPeers\s*\(/]){
  assert.match(minimap,pattern,`nested minimap lost runtime behavior: ${pattern}`);
}

const startup=fs.readFileSync(path.join(src,'ui','startup-ui.js'),'utf8');
assert.match(startup,/whenInitialReady/,'startup UI lost forest-ready gate');
assert.match(startup,/onStartVehicle\(selectedVehicle\)/,'startup UI lost vehicle start callback');

const menu=fs.readFileSync(path.join(src,'ui','v21-menu.js'),'utf8');
for(const marker of ['queueSettingsSave','toggleAutopilot','clearWorldDriveCache','setKeyboardRebindAction']){
  assert.ok(menu.includes(marker),`nested menu lost ${marker} contract`);
}

console.log('SOURCE TREE R7 UI QA: PASS',{
  stableRootFacades:Object.keys(modules).length,
  nestedImplementations:Object.keys(modules).length,
  mainFacadeBoundary:true,
  minimapRuntimePreserved:true,
  startupGatePreserved:true,
  settingsMenuContractPreserved:true
});

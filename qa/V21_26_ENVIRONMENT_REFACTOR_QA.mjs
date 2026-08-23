import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','environment-controller.js');

assert.ok(fs.existsSync(modulePath),'src/environment-controller.js missing — run tools/refactor-main-environment-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const environment=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}

syntaxCheck(mainPath);
syntaxCheck(modulePath);

assert.match(main,/import \{ createEnvironmentController \} from '\.\/environment-controller\.js';/,'main.js missing environment controller import');
assert.match(main,/const environmentController=createEnvironmentController\(\{/,'main.js missing environment controller initialization');
assert.match(main,/applyDisplayDistanceProfile,\s*setTimeOfDay,\s*timeSlider,\s*timeLabel\s*\}=environmentController;/s,'main.js missing environment facade exports');

for(const pattern of [
  /const DISPLAY_DISTANCE_PROFILES=\{/,
  /function applyDisplayDistanceProfile\s*\(/,
  /let timeOfDay=12;/,
  /function setTimeOfDay\s*\(/,
  /timeSlider\.addEventListener\('input'/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns extracted environment behavior: ${pattern}`);
  assert.match(environment,pattern,`environment-controller.js missing extracted behavior: ${pattern}`);
}

for(const pattern of [
  /export function createEnvironmentController\s*\(\{/,
  /camera\.far=\s*profile\.cameraFar;/s,
  /scene\.fog\.density=\s*profile\.fogDensity;/s,
  /worldStreaming\.setDistanceScale\?\.\(/,
  /vehicleVisuals\.updateAutomaticHeadlights\(daylight\);/,
  /moonLight\.intensity=/,
  /moonSprite\.visible=/,
  /sun\.position\.set\(/,
  /moonDirection\.set\(/,
  /updateMoonSkyPosition\(\);/,
  /getTimeOfDay:\(\)=>timeOfDay/
]){
  assert.match(environment,pattern,`environment-controller.js missing expected behavior: ${pattern}`);
}

const worldStreamingInit=main.indexOf('const worldStreaming=streamingCoordinator.worldStreaming;');
const environmentInit=main.indexOf('const environmentController=createEnvironmentController({');
const menuMarker=main.indexOf('// ---------- V21 menu facade ----------');
assert.ok(worldStreamingInit>=0&&environmentInit>worldStreamingInit,'environment controller must initialize after worldStreaming exists');
assert.ok(menuMarker>environmentInit,'environment controller must initialize before V21 menu consumes its facade');

const { createEnvironmentController }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createEnvironmentController,'function','createEnvironmentController export missing');

const elements={
  v21DisplayDistance:{value:''},
  timeLabel:{textContent:''},
  timeSlider:{
    listeners:{},
    addEventListener(type,handler){this.listeners[type]=handler;}
  }
};
const $=id=>elements[id]||null;

class FakeColor{
  setHSL(h,s,l){this.hsl=[h,s,l];return this;}
}

const appSettings={displayDistance:'high'};
const camera={
  far:0,
  updates:0,
  updateProjectionMatrix(){this.updates++;}
};
const scene={
  background:null,
  fog:{
    density:0,
    color:{copy(value){this.value=value;}}
  }
};
let distanceScale=0;
const worldStreaming={setDistanceScale(value){distanceScale=value;}};
let saves=0;
const queueSettingsSave=()=>{saves++;};
const hemi={intensity:0};
const sun={intensity:0,position:{set(...args){this.value=args;}}};
const moonLight={intensity:0};
const moonMaterial={opacity:0};
const moonSprite={visible:false};
let daylightSeen=null;
const vehicleVisuals={updateAutomaticHeadlights(value){daylightSeen=value;}};
const moonDirection={
  value:null,
  normalized:false,
  set(...args){this.value=args;return this;},
  normalize(){this.normalized=true;return this;}
};
let moonUpdates=0;
const updateMoonSkyPosition=()=>{moonUpdates++;};

const controller=createEnvironmentController({
  THREE:{Color:FakeColor},
  $,
  appSettings,
  camera,
  scene,
  worldStreaming,
  queueSettingsSave,
  hemi,
  sun,
  moonLight,
  moonMaterial,
  moonSprite,
  vehicleVisuals,
  moonDirection,
  updateMoonSkyPosition
});

assert.equal(controller.getTimeOfDay(),12,'initial time-of-day changed');
assert.equal(controller.timeSlider,elements.timeSlider,'time slider facade changed');
assert.equal(controller.timeLabel,elements.timeLabel,'time label facade changed');
assert.equal(typeof elements.timeSlider.listeners.input,'function','time slider input listener was not installed');

const medium=controller.applyDisplayDistanceProfile('medium',{save:true});
assert.equal(medium,'medium','medium display profile selection changed');
assert.equal(appSettings.displayDistance,'medium','display profile did not update settings');
assert.equal(camera.far,4500,'medium camera far distance changed');
assert.equal(camera.updates,1,'camera projection was not refreshed');
assert.equal(scene.fog.density,.00082,'medium fog density changed');
assert.equal(distanceScale,1.32,'medium streaming scale changed');
assert.equal(saves,1,'saved display profile did not queue settings save');
assert.equal(elements.v21DisplayDistance.value,'medium','display-distance select was not synchronized');

const fallback=controller.applyDisplayDistanceProfile('not-a-profile');
assert.equal(fallback,'high','invalid display profile must fall back to high');
assert.equal(camera.far,6500,'high fallback camera far distance changed');
assert.equal(distanceScale,1.82,'high fallback streaming scale changed');

controller.setTimeOfDay(21.5);
assert.equal(controller.getTimeOfDay(),21.5,'time-of-day state did not update');
assert.equal(elements.timeLabel.textContent,'21:30','time label formatting changed');
assert.equal(daylightSeen,0,'nighttime automatic-headlight daylight factor changed');
assert.ok(moonLight.intensity>0,'moon light did not activate at night');
assert.ok(moonMaterial.opacity>0,'moon material did not become visible at night');
assert.equal(moonSprite.visible,true,'moon sprite did not become visible at night');
assert.equal(moonDirection.normalized,true,'moon direction was not normalized');
assert.equal(moonUpdates,1,'moon sky position was not refreshed');

const previousUpdates=moonUpdates;
elements.timeSlider.listeners.input({target:{value:'6.5'}});
assert.equal(elements.timeLabel.textContent,'06:30','time slider listener no longer drives time-of-day');
assert.equal(moonUpdates,previousUpdates+1,'time slider did not refresh moon sky position');

const mainLines=main.split('\n').length;
assert.ok(mainLines<4100,`main.js is still unexpectedly large after environment extraction: ${mainLines} lines`);

const regression=spawnSync(process.execPath,['qa/V21_26_LOCAL_WORLD_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(regression.status,0,`prior V21.26 refactors regressed:\n${regression.stderr||regression.stdout}`);

console.log('V21.26 ENVIRONMENT REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; environment-controller.js: ${environment.split('\n').length} lines`);
console.log('display distance / fog / streaming scale / sun / moon / automatic headlights verified');
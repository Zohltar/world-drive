import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','autopilot-controller.js');

assert.ok(fs.existsSync(modulePath),'src/autopilot-controller.js missing — run tools/refactor-main-autopilot-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const controllerSource=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(modulePath);

for(const pattern of [
  /import \{ createAutopilotController \} from '\.\/autopilot-controller\.js';/,
  /let autopilotController=null;/,
  /function setAutopilot\(\.\.\.args\)\{return autopilotController\.setAutopilot\(\.\.\.args\);\}/,
  /function toggleAutopilot\(\.\.\.args\)\{return autopilotController\.toggleAutopilot\(\.\.\.args\);\}/,
  /function autopilotControl\(\.\.\.args\)\{return autopilotController\.autopilotControl\(\.\.\.args\);\}/,
  /function toggleAssist\(\.\.\.args\)\{return autopilotController\.toggleAssist\(\.\.\.args\);\}/,
  /function updateSpeedLimitModeUI\(\.\.\.args\)\{return autopilotController\.updateSpeedLimitModeUI\(\.\.\.args\);\}/,
  /function toggleRoadSpeedLimits\(\.\.\.args\)\{return autopilotController\.toggleRoadSpeedLimits\(\.\.\.args\);\}/,
  /autopilotController=createAutopilotController\(\{/,
  /appSettings:\{get:\(\)=>appSettings\}/,
  /activeRoadMeta:\{get:\(\)=>activeRoadMeta\}/,
  /maxSpeedMps:\{get:\(\)=>MAX\}/
]){
  assert.match(main,pattern,`main.js missing autopilot facade/live bridge: ${pattern}`);
}

for(const pattern of [
  /function setAutopilot\(enabled,message=''/,
  /function autopilotControl\(dt,nr\)/,
  /function toggleAssist\(\)/,
  /function updateSpeedLimitModeUI\(\)/,
  /function toggleRoadSpeedLimits\(\)/,
  /headingErr\*1\.55-crossTrack\*\.34/,
  /Math\.sqrt\(3\.0\/maxCurve\)/,
  /state\.activeRoadMeta\.maxspeed\/3\.6/,
  /Arrivée à destination/,
  /state\.appSettings\.assist=state\.assist/,
  /state\.appSettings\.obeyRoadSpeedLimits=state\.obeyRoadSpeedLimits/
]){
  assert.match(controllerSource,pattern,`autopilot-controller.js missing expected behavior: ${pattern}`);
}

for(const pattern of [
  /function setAutopilot\(enabled,message=''/,
  /function autopilotControl\(dt,nr\)/,
  /function toggleAssist\(\)/,
  /function updateSpeedLimitModeUI\(\)/,
  /function toggleRoadSpeedLimits\(\)/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns autopilot implementation: ${pattern}`);
}

const { createAutopilotController }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createAutopilotController,'function','createAutopilotController export missing');

const elements=new Map();
function element(id){
  if(!elements.has(id)){
    elements.set(id,{
      id,
      textContent:'',
      title:'',
      active:false,
      classList:{
        toggle(name,value){
          if(name==='active')elements.get(id).active=!!value;
        }
      }
    });
  }
  return elements.get(id);
}

const calls=[];
const settings={assist:false,obeyRoadSpeedLimits:true};
const state={
  autopilot:false,
  autopilotSteer:.4,
  assist:false,
  roadContact:false,
  speed:12,
  absX:25,
  absZ:30,
  heading:0,
  routeLength:1000,
  maxSpeedMps:55,
  obeyRoadSpeedLimits:true,
  activeRoadMeta:{maxspeed:50},
  appSettings:settings
};

const controller=createAutopilotController({
  state,
  $:id=>element(id),
  nearestRoute:(x,z)=>({d:8,px:x-5,pz:z-10}),
  recenterIfNeeded:(x,z,force)=>calls.push(`recenter:${x}:${z}:${force}`),
  routePointAtCum:cum=>({x:0,z:cum,angle:0,cum}),
  angleDelta:(a,b)=>{
    let d=a-b;
    while(d>Math.PI)d-=Math.PI*2;
    while(d<-Math.PI)d+=Math.PI*2;
    return d;
  },
  queueSettingsSave:()=>calls.push('save'),
  syncRuntimeControls:()=>calls.push('sync'),
  toast:text=>calls.push(`toast:${text}`)
});

controller.setAutopilot(true);
assert.equal(state.autopilot,true,'autopilot did not enable');
assert.equal(state.assist,true,'autopilot did not force assist on');
assert.equal(state.roadContact,true,'autopilot did not restore road contact');
assert.equal(settings.assist,true,'assist setting did not follow autopilot activation');
assert.equal(state.absX,20,'autopilot road snap X changed');
assert.equal(state.absZ,20,'autopilot road snap Z changed');
assert.ok(calls.includes('recenter:20:20:true'),'autopilot did not force recenter after road snap');
assert.equal(element('autopilotBtn').textContent,'Pilote auto: ON','autopilot button text changed');
assert.equal(element('autopilotStatus').textContent,'ACTIF','autopilot status text changed');
assert.equal(element('assist').textContent,'Assist: ON','assist HUD did not follow autopilot');

controller.toggleAssist();
assert.equal(state.autopilot,false,'assist toggle did not disable autopilot first');
assert.equal(state.assist,false,'assist toggle did not switch assist off');
assert.equal(settings.assist,false,'assist setting did not update');
assert.equal(state.autopilotSteer,0,'autopilot disable did not clear steering');
assert.equal(element('assist').textContent,'Assist: OFF','assist HUD changed');

controller.updateSpeedLimitModeUI();
assert.equal(element('speedLimitModeBtn').textContent,'Limites route: ON','speed-limit button initial text changed');
assert.equal(element('speedLimitModeBtn').active,true,'speed-limit active class changed');
controller.toggleRoadSpeedLimits();
assert.equal(state.obeyRoadSpeedLimits,false,'speed-limit toggle did not change runtime state');
assert.equal(settings.obeyRoadSpeedLimits,false,'speed-limit setting did not update');
assert.equal(element('speedLimitModeBtn').textContent,'Limites route: OFF','speed-limit button off text changed');
assert.equal(element('speedLimitModeBtn').active,false,'speed-limit active class did not clear');

state.autopilot=true;
state.assist=true;
state.autopilotSteer=0;
state.absX=0;
state.absZ=0;
state.heading=0;
state.speed=10;
state.routeLength=1000;
state.obeyRoadSpeedLimits=true;
state.activeRoadMeta={maxspeed:50};
const command=controller.autopilotControl(.016,{cum:100,angle:0,d:0,px:0,pz:100});
assert.equal(command.hand,false,'autopilot handbrake behavior changed');
assert.ok(Number.isFinite(command.throttle),'autopilot throttle became non-finite');
assert.ok(Number.isFinite(command.turn),'autopilot steering became non-finite');
assert.ok(command.throttle>0,'autopilot should accelerate below its legal/curve target');

state.autopilot=true;
state.speed=.1;
state.routeLength=100;
controller.autopilotControl(.016,{cum:99,angle:0,d:0,px:0,pz:99});
assert.equal(state.speed,0,'destination stop did not zero speed');
assert.equal(state.autopilot,false,'destination stop did not disable autopilot');
assert.ok(calls.includes('toast:Arrivée à destination'),'destination feedback changed');

const mainLines=main.split('\n').length;
assert.ok(mainLines<3300,`main.js is still unexpectedly large after autopilot extraction: ${mainLines} lines`);

const regression=spawnSync(process.execPath,['qa/V21_26_ROUTE_LIFECYCLE_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(regression.status,0,`prior V21.26 refactors regressed:\n${regression.stderr||regression.stdout}`);

console.log('V21.26 AUTOPILOT REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; autopilot-controller.js: ${controllerSource.split('\n').length} lines`);
console.log('autopilot activation / steering / destination stop / assist / OSM speed-limit mode verified');

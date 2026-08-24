import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','vehicle-placement-controller.js');

assert.ok(fs.existsSync(modulePath),'src/vehicle-placement-controller.js missing — run tools/refactor-main-vehicle-placement-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const placement=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(modulePath);

for(const pattern of [
  /import \{ createVehiclePlacementController \} from '\.\/vehicle-placement-controller\.js';/,
  /const vehiclePlacementState=\{\};/,
  /vehiclePlacementController=createVehiclePlacementController\(\{/,
  /function placeAt\(\.\.\.args\)\{return vehiclePlacementController\.placeAt\(\.\.\.args\);\}/,
  /function resetToRoad\(\.\.\.args\)\{return vehiclePlacementController\.resetToRoad\(\.\.\.args\);\}/,
  /gripSolverAccumulator:\{get:\(\)=>gripSolverAccumulator,set:value=>\{gripSolverAccumulator=value;\}\}/,
  /worldOffset:\{get:\(\)=>worldOffset\}/
]){
  assert.match(main,pattern,`main.js missing vehicle placement facade/live bridge: ${pattern}`);
}

// Only the placement/reset implementations must leave main.js. A separate
// physicsWheelCount calculation still legitimately exists in applyVehicleSelection()
// and belongs to that later cleanup target, not to this extraction.
for(const pattern of [
  /function placeAt\(frac\)\{/,
  /function resetToRoad\(\)\{/,
  /resetTransmissionState\(\);vehiclePresentation\.reset\(\);skidMarks\.resetSource\('local'\);/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns vehicle placement implementation: ${pattern}`);
}

for(const pattern of [
  /export function createVehiclePlacementController\s*\(\{/,
  /function physicsWheelCount\(\)/,
  /function resetVehicleDynamics\(\{resetGripSolver=false\}=\{\}\)/,
  /state\.wheelGripUsage=Array\(wheelCount\)\.fill\(0\)/,
  /state\.wheelSlipLevels=Array\(wheelCount\)\.fill\(0\)/,
  /state\.wheelLateralUsage=Array\(wheelCount\)\.fill\(0\)/,
  /state\.wheelLongitudinalUsage=Array\(wheelCount\)\.fill\(0\)/,
  /resetVehicleDynamics\(\{resetGripSolver:false\}\)/,
  /const placedFrame=roadProfileFrameAtCum\(p\.cum\)/,
  /placedFrame\?\.y\?\?roadHeightAt\(state\.absX,state\.absZ\)/,
  /resetVehicleDynamics\(\{resetGripSolver:true\}\)/,
  /truckTrailerSystem\.resetPose\(/
]){
  assert.match(placement,pattern,`vehicle-placement-controller.js missing expected behavior: ${pattern}`);
}

const { createVehiclePlacementController }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createVehiclePlacementController,'function','createVehiclePlacementController export missing');

const state={
  absX:99,
  absZ:88,
  heading:1.2,
  speed:22,
  steer:.7,
  visualSteer:.6,
  currentSteerAngle:.5,
  driveHudAccumulator:0,
  minimapAccumulator:0,
  gripSolverAccumulator:.777,
  longitudinalAccel:5,
  lateralGripUsage:.9,
  wheelGripUsage:[1,1,1,1],
  wheelSlipLevels:[1,1,1,1],
  wheelLateralUsage:[1,1,1,1],
  wheelLongitudinalUsage:[1,1,1,1],
  frontSlipAmount:.8,
  rearSlipAmount:.7,
  dynamicYawRate:.6,
  velocityHeading:2,
  roadContact:false,
  worldOffset:{x:2,z:3}
};

const calls=[];
let carSet=null;
const controller=createVehiclePlacementController({
  state,
  VEHICLE:{axles:[{wheelCount:2},{wheelCount:2}]},
  routePointAt:frac=>({x:10,z:20,angle:.3,cum:100*frac}),
  nearestRoute:(x,z)=>({px:x+4,pz:z+5,angle:.9}),
  resetTransmissionState:()=>calls.push('transmission'),
  vehiclePresentation:{reset:()=>calls.push('presentation')},
  skidMarks:{resetSource:id=>calls.push(`skid:${id}`)},
  recenterIfNeeded:(x,z,force)=>calls.push(`recenter:${x}:${z}:${force}`),
  ensureRoadProfileNear:(x,z)=>calls.push(`profile:${x}:${z}`),
  roadProfileFrameAtCum:cum=>({x:11,z:21,angle:.4,y:5,cum}),
  roadHeightAt:()=>999,
  ROAD_SURFACE_OFFSET:.10,
  TIRE_VISUAL_CLEARANCE:.02,
  car:{position:{set:(x,y,z)=>{carSet={x,y,z};}}},
  truckTrailerSystem:{active:true,resetPose:(x,z,h)=>calls.push(`trailer:${x}:${z}:${h}`)},
  drawMap:cum=>calls.push(`map:${cum}`),
  DRIVE_HUD_INTERVAL:.10,
  MINIMAP_INTERVAL:.20,
  GRIP_SOLVER_INTERVAL:.05
});

controller.placeAt(.5);
assert.equal(state.absX,11,'placeAt cumulative-profile X correction changed');
assert.equal(state.absZ,21,'placeAt cumulative-profile Z correction changed');
assert.equal(state.heading,.4,'placeAt cumulative-profile heading correction changed');
assert.equal(state.velocityHeading,.4,'placeAt velocity heading no longer follows corrected heading');
assert.equal(state.speed,0,'placeAt speed reset changed');
assert.equal(state.steer,0,'placeAt steering reset changed');
assert.equal(state.driveHudAccumulator,.10,'placeAt HUD cadence reset changed');
assert.equal(state.minimapAccumulator,.20,'placeAt minimap cadence reset changed');
assert.equal(state.gripSolverAccumulator,.777,'placeAt must preserve historical grip-solver accumulator behavior');
assert.deepEqual(state.wheelGripUsage,[0,0,0,0],'placeAt wheel grip reset changed');
assert.deepEqual(state.wheelSlipLevels,[0,0,0,0],'placeAt wheel slip reset changed');
assert.equal(state.frontSlipAmount,0,'placeAt front slip reset changed');
assert.equal(state.rearSlipAmount,0,'placeAt rear slip reset changed');
assert.equal(state.dynamicYawRate,0,'placeAt yaw reset changed');
assert.equal(state.roadContact,true,'placeAt road-contact restore changed');
assert.deepEqual(carSet,{x:9,y:5.5,z:18},'placeAt car render placement changed');
assert.ok(calls.includes('recenter:10:20:true'),'placeAt no longer recenters from initial route point before profile correction');
assert.ok(calls.includes('profile:10:20'),'placeAt no longer refreshes profile from initial route point');
assert.ok(calls.includes('transmission'),'placeAt transmission reset missing');
assert.ok(calls.includes('presentation'),'placeAt presentation reset missing');
assert.ok(calls.includes('skid:local'),'placeAt skid reset missing');
assert.ok(calls.includes('trailer:11:21:0.4'),'placeAt trailer reset no longer follows corrected pose');
assert.ok(calls.includes('map:50'),'placeAt minimap cumulative placement changed');

calls.length=0;
carSet=null;
state.absX=30;
state.absZ=40;
state.heading=1;
state.speed=12;
state.gripSolverAccumulator=.9;
state.roadContact=false;
controller.resetToRoad();
assert.equal(state.absX,34,'resetToRoad nearest-route X changed');
assert.equal(state.absZ,45,'resetToRoad nearest-route Z changed');
assert.equal(state.heading,.9,'resetToRoad nearest-route heading changed');
assert.equal(state.velocityHeading,.9,'resetToRoad velocity heading reset changed');
assert.equal(state.speed,0,'resetToRoad speed reset changed');
assert.equal(state.gripSolverAccumulator,.05,'resetToRoad must re-arm grip solver immediately');
assert.equal(state.roadContact,true,'resetToRoad road-contact restore changed');
assert.equal(carSet,null,'resetToRoad historically must not directly reposition car render root');
assert.ok(calls.includes('recenter:34:45:true'),'resetToRoad recenter changed');
assert.ok(calls.includes('profile:34:45'),'resetToRoad profile refresh changed');
assert.ok(calls.includes('trailer:34:45:0.9'),'resetToRoad trailer pose reset changed');

const mainLines=main.split('\n').length;
assert.ok(mainLines<3300,`main.js is still unexpectedly large after vehicle placement extraction: ${mainLines} lines`);

const wheelRegression=spawnSync(process.execPath,['qa/V21_26_WHEEL_GROUND_SUPPORT_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(wheelRegression.status,0,`prior wheel-ground refactor regressed:\n${wheelRegression.stderr||wheelRegression.stdout}`);

const overpassRegression=spawnSync(process.execPath,['qa/V21_26_OVERPASS_ABORT_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(overpassRegression.status,0,`Overpass abort handling regressed:\n${overpassRegression.stderr||overpassRegression.stdout}`);

console.log('V21.26 VEHICLE PLACEMENT REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; vehicle-placement-controller.js: ${placement.split('\n').length} lines`);
console.log('placeAt / reset-to-road / per-wheel state reset / cumulative-profile placement ordering verified');

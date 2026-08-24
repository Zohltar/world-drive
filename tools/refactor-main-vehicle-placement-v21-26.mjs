import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','vehicle-placement-controller.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const moduleImport="import { createVehiclePlacementController } from './vehicle-placement-controller.js';";

if(main.includes(moduleImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 VEHICLE PLACEMENT REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(moduleImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 vehicle placement refactor: partial previous application detected. Restore generated files before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 vehicle placement refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 vehicle placement refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='function placeAt(frac){';
const endMarker="const maxSpeedSlider=$('maxSpeedSlider');";
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start){
  throw new Error('V21.26 vehicle placement refactor: placement/reset block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  'function placeAt(frac){',
  'const p=routePointAt(frac);',
  'driveHudAccumulator=DRIVE_HUD_INTERVAL;minimapAccumulator=MINIMAP_INTERVAL;',
  'const physicsWheelCount=Math.max(',
  "resetTransmissionState();vehiclePresentation.reset();skidMarks.resetSource('local');",
  'roadContact=true;recenterIfNeeded(absX,absZ,true);ensureRoadProfileNear(absX,absZ);',
  'const placedFrame=roadProfileFrameAtCum(p.cum);',
  'const placedY=(placedFrame?.y??roadHeightAt(absX,absZ))+ROAD_SURFACE_OFFSET;',
  'truckTrailerSystem.resetPose(absX,absZ,heading);',
  'drawMap(p.cum);',
  'function resetToRoad(){',
  'const n=nearestRoute(absX,absZ);',
  'gripSolverAccumulator=GRIP_SOLVER_INTERVAL;'
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 vehicle placement refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const moduleSource=`export function createVehiclePlacementController({
  state,
  VEHICLE,
  routePointAt,
  nearestRoute,
  resetTransmissionState,
  vehiclePresentation,
  skidMarks,
  recenterIfNeeded,
  ensureRoadProfileNear,
  roadProfileFrameAtCum,
  roadHeightAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  car,
  truckTrailerSystem,
  drawMap,
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL,
}){
  function physicsWheelCount(){
    return Math.max(
      4,
      (VEHICLE.axles||[]).reduce(
        (sum,axle)=>sum+(Number(axle.wheelCount)||0),
        0
      )
    );
  }

  function resetVehicleDynamics({resetGripSolver=false}={}){
    state.speed=0;
    state.steer=0;
    state.visualSteer=0;
    state.currentSteerAngle=0;
    state.driveHudAccumulator=DRIVE_HUD_INTERVAL;
    state.minimapAccumulator=MINIMAP_INTERVAL;
    if(resetGripSolver){
      state.gripSolverAccumulator=GRIP_SOLVER_INTERVAL;
    }
    state.longitudinalAccel=0;
    state.lateralGripUsage=0;

    const wheelCount=physicsWheelCount();
    state.wheelGripUsage=Array(wheelCount).fill(0);
    state.wheelSlipLevels=Array(wheelCount).fill(0);
    state.wheelLateralUsage=Array(wheelCount).fill(0);
    state.wheelLongitudinalUsage=Array(wheelCount).fill(0);

    state.frontSlipAmount=0;
    state.rearSlipAmount=0;
    state.dynamicYawRate=0;
    state.velocityHeading=state.heading;

    resetTransmissionState();
    vehiclePresentation.reset();
    skidMarks.resetSource('local');

    state.roadContact=true;
    recenterIfNeeded(state.absX,state.absZ,true);
    ensureRoadProfileNear(state.absX,state.absZ);
  }

  function resetTrailerPose(){
    if(truckTrailerSystem.active){
      truckTrailerSystem.resetPose(
        state.absX,
        state.absZ,
        state.heading
      );
    }
  }

  function placeAt(frac){
    const p=routePointAt(frac);
    state.absX=p.x;
    state.absZ=p.z;
    state.heading=p.angle;

    // Preserve historical ordering: recenter/profile refresh occurs from the
    // route-point placement before the cumulative road-profile correction.
    resetVehicleDynamics({resetGripSolver:false});

    // On stacked mountain roads, horizontal X/Z can overlap multiple branches.
    // Spawn from route cumulative distance so 0% remains the true first segment.
    const placedFrame=roadProfileFrameAtCum(p.cum);
    if(placedFrame){
      state.absX=placedFrame.x;
      state.absZ=placedFrame.z;
      state.heading=placedFrame.angle;
      state.velocityHeading=state.heading;
    }

    const placedY=
      (placedFrame?.y??roadHeightAt(state.absX,state.absZ))+
      ROAD_SURFACE_OFFSET;

    car.position.set(
      state.absX-state.worldOffset.x,
      placedY+.38+TIRE_VISUAL_CLEARANCE,
      state.absZ-state.worldOffset.z
    );

    resetTrailerPose();
    drawMap(p.cum);
  }

  function resetToRoad(){
    const n=nearestRoute(state.absX,state.absZ);
    if(!n)return;

    state.absX=n.px;
    state.absZ=n.pz;
    state.heading=n.angle;

    // Historical reset-to-road behavior also forces the secondary tire solver
    // to run again immediately; placeAt() intentionally does not do this.
    resetVehicleDynamics({resetGripSolver:true});
    resetTrailerPose();
  }

  return {
    placeAt,
    resetToRoad,
    resetVehicleDynamics
  };
}
`;

const facade=`// ---------- vehicle placement / reset controller facade ----------
const vehiclePlacementState={};
Object.defineProperties(vehiclePlacementState,{
  absX:{get:()=>absX,set:value=>{absX=value;}},
  absZ:{get:()=>absZ,set:value=>{absZ=value;}},
  heading:{get:()=>heading,set:value=>{heading=value;}},
  speed:{get:()=>speed,set:value=>{speed=value;}},
  steer:{get:()=>steer,set:value=>{steer=value;}},
  visualSteer:{get:()=>visualSteer,set:value=>{visualSteer=value;}},
  currentSteerAngle:{get:()=>currentSteerAngle,set:value=>{currentSteerAngle=value;}},
  driveHudAccumulator:{get:()=>driveHudAccumulator,set:value=>{driveHudAccumulator=value;}},
  minimapAccumulator:{get:()=>minimapAccumulator,set:value=>{minimapAccumulator=value;}},
  gripSolverAccumulator:{get:()=>gripSolverAccumulator,set:value=>{gripSolverAccumulator=value;}},
  longitudinalAccel:{get:()=>longitudinalAccel,set:value=>{longitudinalAccel=value;}},
  lateralGripUsage:{get:()=>lateralGripUsage,set:value=>{lateralGripUsage=value;}},
  wheelGripUsage:{get:()=>wheelGripUsage,set:value=>{wheelGripUsage=value;}},
  wheelSlipLevels:{get:()=>wheelSlipLevels,set:value=>{wheelSlipLevels=value;}},
  wheelLateralUsage:{get:()=>wheelLateralUsage,set:value=>{wheelLateralUsage=value;}},
  wheelLongitudinalUsage:{get:()=>wheelLongitudinalUsage,set:value=>{wheelLongitudinalUsage=value;}},
  frontSlipAmount:{get:()=>frontSlipAmount,set:value=>{frontSlipAmount=value;}},
  rearSlipAmount:{get:()=>rearSlipAmount,set:value=>{rearSlipAmount=value;}},
  dynamicYawRate:{get:()=>dynamicYawRate,set:value=>{dynamicYawRate=value;}},
  velocityHeading:{get:()=>velocityHeading,set:value=>{velocityHeading=value;}},
  roadContact:{get:()=>roadContact,set:value=>{roadContact=value;}},
  worldOffset:{get:()=>worldOffset}
});
const vehiclePlacementController=createVehiclePlacementController({
  state:vehiclePlacementState,
  VEHICLE,
  routePointAt,
  nearestRoute,
  resetTransmissionState,
  vehiclePresentation,
  skidMarks,
  recenterIfNeeded,
  ensureRoadProfileNear,
  roadProfileFrameAtCum,
  roadHeightAt,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  car,
  truckTrailerSystem,
  drawMap,
  DRIVE_HUD_INTERVAL,
  MINIMAP_INTERVAL,
  GRIP_SOLVER_INTERVAL
});
function placeAt(...args){return vehiclePlacementController.placeAt(...args);}
function resetToRoad(...args){return vehiclePlacementController.resetToRoad(...args);}

`;

// Replace the ownership block before inserting an earlier import.
main=main.slice(0,start)+facade+main.slice(end);

const importAnchor="import { createWheelGroundSupport } from './wheel-ground-support.js';";
main=replaceOnce(main,importAnchor,`${importAnchor}\n${moduleImport}`,'wheel-ground-support import anchor');

for(const forbidden of [
  'function placeAt(frac){',
  'function resetToRoad(){',
  'const physicsWheelCount=Math.max(\n   4,',
  "resetTransmissionState();vehiclePresentation.reset();skidMarks.resetSource('local');"
]){
  if(main.includes(forbidden)){
    throw new Error(`V21.26 vehicle placement refactor: legacy implementation remains in main.js: ${forbidden}`);
  }
}

for(const required of [
  'export function createVehiclePlacementController({',
  'function resetVehicleDynamics({resetGripSolver=false}={}){',
  'state.gripSolverAccumulator=GRIP_SOLVER_INTERVAL;',
  'function placeAt(frac){',
  'resetVehicleDynamics({resetGripSolver:false});',
  'const placedFrame=roadProfileFrameAtCum(p.cum);',
  'function resetToRoad(){',
  'resetVehicleDynamics({resetGripSolver:true});',
  "skidMarks.resetSource('local');",
  'truckTrailerSystem.resetPose('
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 vehicle placement refactor: generated module lost behavior: ${required}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_vehicle_placement_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_vehicle_placement_module_check__.mjs');
function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempModule,moduleSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempModule);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempModule,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputModule=eol==='\n'?moduleSource:moduleSource.replace(/\n/g,eol);
fs.writeFileSync(modulePath,outputModule,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const moduleLinesCount=outputModule.split(/\r?\n/).length;
console.log('V21.26 VEHICLE PLACEMENT REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`vehicle-placement-controller.js: ${moduleLinesCount} lines`);
console.log('Extracted: route placement, reset-to-road and shared vehicle dynamics reset orchestration.');

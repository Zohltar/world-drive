import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehiclePlacementController} from '../src/vehicles/vehicle-placement-controller.js';

const placementSource=fs.readFileSync(
  new URL('../src/vehicles/vehicle-placement-controller.js',import.meta.url),
  'utf8'
);
const lifecycleSource=fs.readFileSync(
  new URL('../src/routing/route-lifecycle.js',import.meta.url),
  'utf8'
);

assert.match(placementSource,/let lastPlacementCum=null;/,
  'route-start final placement must retain the chosen cumulative spawn point');
assert.match(placementSource,/finalizeOnly=options\?\.finalizeOnly===true/,
  'route-start final placement mode missing');
assert.match(lifecycleSource,/if\(commitLocalWorldRefresh\(\)\)\{[\s\S]*?placeAt\(0,\{finalizeOnly:true\}\)/,
  'route lifecycle must finalize the stored spawn after the final local-world commit');

let roadY=10;
let recenterCalls=0;
let ensureCalls=0;
let transmissionResets=0;
let presentationResets=0;
let skidResets=0;
let trailerResets=0;
let mapDraws=0;

const state={
  speed:0,
  steer:0,
  visualSteer:0,
  currentSteerAngle:0,
  driveHudAccumulator:0,
  minimapAccumulator:0,
  gripSolverAccumulator:0,
  longitudinalAccel:0,
  lateralGripUsage:0,
  wheelGripUsage:[],
  wheelSlipLevels:[],
  wheelLateralUsage:[],
  wheelLongitudinalUsage:[],
  frontSlipAmount:0,
  rearSlipAmount:0,
  dynamicYawRate:0,
  velocityHeading:0,
  roadContact:false,
  absX:0,
  absZ:0,
  heading:0,
  worldOffset:{x:0,z:0}
};

const car={
  position:{
    x:0,y:0,z:0,
    set(x,y,z){this.x=x;this.y=y;this.z=z;}
  }
};

const controller=createVehiclePlacementController({
  state,
  VEHICLE:{axles:[{wheelCount:2},{wheelCount:2}]},
  routePointAt:()=>({x:0,z:0,angle:0,cum:0}),
  nearestRoute:()=>({px:35,pz:10,angle:0,cum:35}),
  resetTransmissionState:()=>{transmissionResets++;},
  vehiclePresentation:{reset:()=>{presentationResets++;}},
  skidMarks:{resetSource:()=>{skidResets++;}},
  recenterIfNeeded:()=>{recenterCalls++;return true;},
  ensureRoadProfileNear:()=>{ensureCalls++;},
  roadProfileFrameAtCum:cum=>({
    px:Number(cum),
    pz:10,
    y:roadY,
    pitch:0,
    angle:0
  }),
  roadHeightAt:()=>roadY,
  ROAD_SURFACE_OFFSET:.05,
  TIRE_VISUAL_CLEARANCE:.02,
  car,
  truckTrailerSystem:{
    active:true,
    resetPose:()=>{trailerResets++;}
  },
  drawMap:()=>{mapDraws++;},
  DRIVE_HUD_INTERVAL:.1,
  MINIMAP_INTERVAL:.1,
  GRIP_SOLVER_INTERVAL:.1
});

controller.placeAt(0);

assert.equal(recenterCalls,1,'initial placement must keep the existing forced recenter');
assert.equal(ensureCalls,1,'initial placement must keep the existing road-profile refresh');
assert.equal(transmissionResets,1,'initial placement must reset transmission once');
assert.equal(presentationResets,1,'initial placement must reset presentation once');
assert.equal(skidResets,1,'initial placement must reset skid state once');
assert.equal(mapDraws,1,'initial placement must draw the map once');
assert.equal(state.absX,35,'initial stable-departure cumulative position changed');
assert.equal(state.absZ,10,'initial road frame Z changed');
assert.ok(Math.abs(car.position.y-10.45)<1e-9,'initial pre-DEM road height placement changed');

// Simulate the final DEM/local-world commit changing the engineered road height.
roadY=40;
controller.placeAt(0,{finalizeOnly:true});

assert.equal(state.absX,35,'final placement did not reuse the original stable departure point');
assert.equal(state.absZ,10,'final placement did not reuse the original road branch');
assert.ok(Math.abs(car.position.y-40.45)<1e-9,'final placement did not resample the post-DEM road height');
assert.equal(recenterCalls,1,'final placement must not trigger a second forced world rebuild');
assert.equal(ensureCalls,1,'final placement must not trigger a second road-profile refresh');
assert.equal(transmissionResets,1,'final placement must not reset transmission twice');
assert.equal(presentationResets,1,'final placement must not reset presentation twice');
assert.equal(skidResets,1,'final placement must not reset skid state twice');
assert.equal(mapDraws,1,'final placement must not redraw the route map');
assert.equal(trailerResets,2,'trailer pose must follow both initial and final vehicle transforms');

console.log('R8 ROUTE START FINAL PLACEMENT QA: PASS',{
  initialRoadY:10,
  finalRoadY:roadY,
  recenterCalls,
  transmissionResets,
  finalCarY:car.position.y
});

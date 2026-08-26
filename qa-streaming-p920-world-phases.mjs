import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLocalWorldBuilder} from './src/local-world-builder.js';

const coordinatorSource=fs.readFileSync(
  new URL('./src/streaming-coordinator.js',import.meta.url),
  'utf8'
);

assert.match(coordinatorSource,/localWorldPhases/,
  'P9.20 local-world phase diagnostics missing');
assert.match(coordinatorSource,/localWorldPhaseMax/,
  'P9.20 local-world phase max diagnostics missing');

const group=()=>({children:[],add(object){this.children.push(object);}});
const roadGroup=group();
const forestGroup=group();
const infrastructureGroup=group();
const signGroup=group();

const builder=createLocalWorldBuilder({
  THREE:{},
  resetStreamedWorldOrigins(){},
  terrainService:{
    resetRoadBedOrigin(){},
    setRoadBed(){return true;}
  },
  clearGroup(g){g.children.length=0;},
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer:{clear(){}},
  getBridgeFeatureCount:()=>0,
  rebuildBridgeSpans(){},
  buildRoadProfile:()=>[
    {x:0,z:0,y:0,cum:0,roll:0},
    {x:3,z:0,y:0,cum:3,roll:0}
  ],
  setActiveRoadProfile(){},
  buildRoadVolume:()=>null,
  buildLateralBand:()=>null,
  buildRibbon:()=>null,
  buildOffsetRibbon:()=>null,
  shoulderMat:{},
  roadMat:{},
  lineYellow:{},
  lineWhite:{},
  ROAD_SURFACE_OFFSET:.1,
  getWorldOffset:()=>({x:0,z:0}),
  rebuildLocalWater(){},
  scheduleVisualJob(){return true;},
  rebuildLocalScenery(){},
  addEnhancedBridgeFurniture(){},
  refreshRoadSignsOnly(){},
  freezeStaticMatrices(){},
  rebuildHorizon(){},
  markStaticShadowsDirty(){}
});

const report=builder.rebuild();
assert.ok(report&&Number.isFinite(report.totalMs),
  'world phase report totalMs missing');
assert.equal(report.profilePoints,2,
  'world phase report profile point count wrong');

const required=[
  'resetClear',
  'bridges',
  'roadProfile',
  'terrainRoadBed',
  'roadMeshes',
  'water',
  'furniture',
  'finalize'
];

for(const key of required){
  assert.ok(Number.isFinite(report.phases[key]),
    `world phase timing missing: ${key}`);
  assert.ok(report.phases[key]>=0,
    `world phase timing negative: ${key}`);
}

console.log('Streaming P9.20 world-phase QA passed');
console.log({
  totalMs:Number(report.totalMs.toFixed(3)),
  profilePoints:report.profilePoints,
  phases:Object.fromEntries(
    Object.entries(report.phases).map(([key,value])=>[key,Number(value.toFixed(3))])
  )
});

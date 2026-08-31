import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GEOGRAPHIC_SIGN_POLICY,
  createGeographicSignOrchestrator
} from './src/signs.js';

assert.deepEqual(
  GEOGRAPHIC_SIGN_POLICY,
  {
    routeCorrelationM:120,
    speedConfidenceMin:.20,
    nearbySpeedSuppressionM:900,
    speedAheadM:95,
    riverLeadM:22,
    cityLeadM:55,
    visibleCorridorM:1600
  },
  'C5.4 geographic sign policy changed'
);
assert.equal(Object.isFrozen(GEOGRAPHIC_SIGN_POLICY),true,'geographic sign policy must be frozen');

function makeHarness({
  nearestCum=1000,
  activeRoadMeta={maxspeed:90,confidence:.9},
  waterFeatures=[],
  routeStart={name:'Départ Test'},
  routeEnd={name:'Arrivée Test'},
  routeLength=4000
}={}){
  const signs=[];
  const rendered=[];
  const statusEl={textContent:''};
  const nearestCalls=[];
  const state={
    nearestCum,
    activeRoadMeta:{...activeRoadMeta},
    waterFeatures:[...waterFeatures],
    routeStart,
    routeEnd,
    routeLength,
    vehicle:{x:10,z:20}
  };

  const nearestRoute=(x,z)=>{
    nearestCalls.push({x,z});
    const d=Number.isFinite(x)?Math.abs(x):0;
    return {d,cum:state.nearestCum,px:x,pz:z,angle:0};
  };
  const routePointAtCum=cum=>({x:cum,z:cum*.1,cum,angle:0});
  const roadHeightAt=(x,z)=>x*.001+z*.002+3;

  const orchestrator=createGeographicSignOrchestrator({
    signs,
    statusEl,
    getWaterFeatures:()=>state.waterFeatures,
    getRouteEndpoints:()=>({start:state.routeStart,end:state.routeEnd}),
    getRouteLength:()=>state.routeLength,
    nearestRoute,
    routePointAtCum,
    roadHeightAt,
    getActiveRoadMeta:()=>state.activeRoadMeta,
    getVehiclePosition:()=>state.vehicle,
    addRoadSignAt:(point,label,kind,side)=>rendered.push({point:{...point},label,kind,side})
  });

  return {signs,rendered,statusEl,state,nearestCalls,orchestrator,roadHeightAt};
}

// Route-correlation boundary remains strictly below 120 m.
{
  const h=makeHarness();
  const accepted=h.orchestrator.nearestRouteCumToFeature([{x:119.9,z:5}]);
  assert.ok(accepted,'119.9 m route correlation should be accepted');
  const rejected=h.orchestrator.nearestRouteCumToFeature([{x:120,z:5}]);
  assert.equal(rejected,null,'120 m route correlation must remain rejected');
}

// Endpoint city fallback keeps placeholder filtering and case-insensitive dedup.
{
  const h=makeHarness({
    routeStart:{name:'Montréal'},
    routeEnd:{name:'Québec'},
    routeLength:3200
  });
  h.signs.push({key:'osm-city',kind:'city',label:'montréal',routeCum:400});
  h.orchestrator.collectEndpointLocalitySigns();
  assert.equal(h.signs.filter(sign=>sign.kind==='city'&&String(sign.label).toLowerCase()==='montréal').length,1,'endpoint city dedup changed');
  const quebec=h.signs.find(sign=>sign.key==='city:endpoint:3200:Québec');
  assert.ok(quebec?.fallback,'route-end city fallback missing');
  assert.equal(quebec.routeCum,3200,'route-end city cumulative placement changed');

  h.state.routeStart={name:'Départ'};
  h.state.routeEnd={name:'Waypoint'};
  h.signs.length=0;
  h.orchestrator.collectEndpointLocalitySigns();
  assert.equal(h.signs.length,0,'placeholder endpoint names must stay filtered');
}

// River fallback keeps French-name priority, dedup and strict route-correlation policy.
{
  const h=makeHarness({
    waterFeatures:[
      {type:'way',id:1,tags:{name:'River A','name:fr':'Rivière A'},points:[{x:80,z:2}]},
      {type:'way',id:2,tags:{name:'Rivière A'},points:[{x:70,z:2}]},
      {type:'way',id:3,tags:{name:'Too Far'},points:[{x:120,z:2}]}
    ]
  });
  h.orchestrator.collectFallbackRiverSigns();
  assert.equal(h.signs.length,1,'river fallback dedup/correlation changed');
  assert.equal(h.signs[0].label,'Rivière A','French river-name priority changed');
  assert.equal(h.signs[0].key,'river:fallback:way:1:Rivière A','river fallback key changed');
  assert.equal(h.signs[0].fallback,true,'river fallback flag missing');
}

// Speed fallback confidence and nearby suppression remain strict.
{
  const h=makeHarness();
  h.state.activeRoadMeta={maxspeed:90,confidence:.20};
  h.orchestrator.addFallbackSpeedSign();
  assert.equal(h.rendered.length,0,'confidence exactly .20 must remain rejected');

  h.state.activeRoadMeta={maxspeed:90.4,confidence:.2001};
  h.signs.push({kind:'speed',routeCum:h.state.nearestCum+899.9,label:'80',maxspeed:80});
  h.orchestrator.addFallbackSpeedSign();
  assert.equal(h.rendered.length,0,'speed sign within 900 m must suppress fallback');

  h.signs[0].routeCum=h.state.nearestCum+900;
  h.orchestrator.addFallbackSpeedSign();
  assert.equal(h.rendered.length,1,'speed sign exactly 900 m away must not suppress fallback');
  const speed=h.rendered[0];
  assert.equal(speed.kind,'speed');
  assert.equal(speed.label,90,'fallback speed rounding changed');
  assert.equal(speed.side,1,'fallback speed side changed');
  assert.equal(speed.point.cum,h.state.nearestCum+95,'fallback speed +95 m placement changed');
  assert.equal(speed.point.y,h.roadHeightAt(speed.point.x,speed.point.z),'fallback speed road height changed');
}

// Full orchestration preserves city/river lead distances, visibility boundary and status count.
{
  const h=makeHarness({
    routeStart:{name:'Startville'},
    routeEnd:{name:'Endville'},
    routeLength:5000,
    waterFeatures:[
      {type:'way',id:10,tags:{name:'Rivière Proche'},points:[{x:40,z:4}]}
    ]
  });
  h.state.nearestCum=1000;
  h.state.activeRoadMeta={maxspeed:null,confidence:0};
  h.signs.push(
    {key:'city-visible-edge',kind:'city',label:'Edge City',routeCum:2600,maxspeed:null},
    {key:'city-hidden',kind:'city',label:'Hidden City',routeCum:2600.1,maxspeed:null},
    {key:'speed-visible',kind:'speed',label:'77.6',maxspeed:77.6,routeCum:1100}
  );

  h.orchestrator.addGeographicRoadSigns();
  assert.equal(h.statusEl.textContent,String(h.signs.length),'sign status count changed');

  const edgeCity=h.rendered.find(item=>item.label==='Edge City');
  assert.ok(edgeCity,'sign exactly 1600 m from vehicle must remain visible');
  assert.equal(edgeCity.point.cum,2545,'city -55 m lead changed');
  assert.equal(edgeCity.side,1,'city sign side changed');
  assert.equal(h.rendered.some(item=>item.label==='Hidden City'),false,'sign beyond 1600 m must remain hidden');

  const river=h.rendered.find(item=>item.label==='Rivière Proche');
  assert.ok(river,'river fallback did not render');
  const riverSign=h.signs.find(sign=>sign.label==='Rivière Proche');
  assert.equal(river.point.cum,Math.max(0,riverSign.routeCum-22),'river -22 m lead changed');

  const speed=h.rendered.find(item=>item.kind==='speed');
  assert.ok(speed,'existing speed sign did not render');
  assert.equal(speed.label,78,'existing speed sign rounding changed');
}

const main=fs.readFileSync('src/main.js','utf8');
const lines=main.split(/\r?\n/).length;
assert.match(main,/createGeographicSignOrchestrator/,'main does not compose geographic sign orchestrator');
assert.doesNotMatch(main,/function nearestRouteCumToFeature\(/,'main still owns geographic route correlation');
assert.doesNotMatch(main,/function collectEndpointLocalitySigns\(/,'main still owns endpoint sign fallback');
assert.doesNotMatch(main,/function collectFallbackRiverSigns\(/,'main still owns river sign fallback');
assert.doesNotMatch(main,/function addFallbackSpeedSign\(/,'main still owns fallback speed sign placement');
assert.doesNotMatch(main,/function addGeographicRoadSigns\(/,'main still owns geographic sign orchestration');
assert.match(main,/addGeographicRoadSigns:\(\)=>geographicSignOrchestrator\?\.addGeographicRoadSigns\(\)/,'road-furniture late orchestration contract changed');
assert.match(main,/const geographicSigns=signData\.signs/,'sign data ownership changed');
assert.ok(lines<2810,`C5.4 did not materially reduce main.js: ${lines} lines`);

console.log('CLEANUP C5.4 GEOGRAPHIC SIGN QA: PASS',{
  mainLines:lines,
  policy:GEOGRAPHIC_SIGN_POLICY,
  ownership:'signs.js orchestration / road-furniture.js 3D rendering'
});

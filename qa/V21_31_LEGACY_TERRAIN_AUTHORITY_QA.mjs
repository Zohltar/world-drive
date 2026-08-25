import assert from 'node:assert/strict';
import {
  stripLegacyTerrainAuthorityV21_31,
  smoothRoadProfileV21_31
} from '../src/road-geometry-v21.31.js';

const legacy=[];
for(let i=0;i<80;i++){
  const x=i*3,z=0;
  legacy.push({x,z,cum:x,y:100+i*.15,roll:10*Math.PI/180});
}

// Strong cross-slope terrain: +0.8 m per metre in z. The road is straight in plan.
const terrainAbs=(x,z)=>100+x*.01+z*.8;
const noBridge=()=>null;
const bridgeManager={isNearApproach(){return false;}};

const stripped=stripLegacyTerrainAuthorityV21_31(legacy,{terrainAbs});
assert(stripped.every(p=>p.roll===0),'legacy terrain-derived roll must be discarded immediately');
assert.notEqual(stripped[20].y,legacy[20].y,'legacy processed Y must not remain authoritative');

const engineered=smoothRoadProfileV21_31(legacy,{terrainAbs,bridgeHeightAtCum:noBridge,bridgeManager});
assert(engineered.every(p=>Math.abs(p.roll)<1e-12),'straight road must remain exactly flat crosswise on sloped terrain');

console.log('V21.31 legacy terrain authority QA passed');

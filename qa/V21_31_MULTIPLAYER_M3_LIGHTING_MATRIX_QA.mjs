import assert from 'node:assert/strict';
import fs from 'node:fs';
import {computeRemoteLightLevels} from '../src/multiplayer-authored-lighting-v2.js';
import {listMultiplayerVehicleSpecs} from '../src/multiplayer-vehicle-registry.js';

const day=computeRemoteLightLevels({});
assert.equal(day.braking,false);assert.equal(day.reversing,false);assert(day.brake<.02);assert(day.reverse<.02);assert(day.headlight<.02);assert(day.leftSignal<.02);assert(day.rightSignal<.02);

const night=computeRemoteLightLevels({nightLevel:.8});
assert.equal(night.nightOn,true);assert(night.running>.5);assert(night.headlight>4);

const brake=computeRemoteLightLevels({braking:true,nightLevel:.4});
assert(brake.brake>5);assert.equal(brake.braking,true);assert(brake.running>.3);

const reverseStopped=computeRemoteLightLevels({reversing:true,nightLevel:0});
assert(reverseStopped.reverse>5,'stationary selector-R must illuminate reverse without requiring negative speed');
assert.equal(reverseStopped.reversing,true);

const reverseNightBrake=computeRemoteLightLevels({reversing:true,braking:true,nightLevel:1});
assert(reverseNightBrake.reverse>5&&reverseNightBrake.brake>5&&reverseNightBrake.headlight>5,'reverse/brake/night states must coexist');

const leftOn=computeRemoteLightLevels({signalLeft:true,signalBlink:true});
const leftOff=computeRemoteLightLevels({signalLeft:true,signalBlink:false});
const rightOn=computeRemoteLightLevels({signalRight:true,signalBlink:true});
assert(leftOn.leftSignal>5&&leftOn.rightSignal<.02);
assert(leftOff.leftSignal<.02,'blink OFF phase must actually extinguish signal');
assert(rightOn.rightSignal>5&&rightOn.leftSignal<.02);

const authored=fs.readFileSync('src/multiplayer-authored-lighting-v2.js','utf8');
for(const marker of [
  "findMeshes(root,['fh_reverse_material'])",
  "namedMesh(root,'Object_46')",
  "namedMesh(root,'Object_33')",
  "namedMesh(root,'Object_7')",
  "n==='carro_refletor_lanterna'",
  "names.includes('signallights')",
  "namedMesh(root,'13_headlight_glass_1_glass_0')",
  "namedMesh(root,'REARLEDs_011_001_RearLight_0')",
  "mode:'authored-glb-lamps-v2'",
  'missingFamilies:Object.freeze(missing)',
  'geometryFallbackFamilies'
])assert(authored.includes(marker),`missing M3 lighting implementation marker: ${marker}`);

const coverage=listMultiplayerVehicleSpecs().map(spec=>({id:spec.id,required:[...(spec.lighting.requiredFamilies||[])]}));
for(const spec of coverage){
  assert(spec.required.includes('brake'),`${spec.id}: brake must be a declared remote-light capability`);
  assert(spec.required.includes('reverse'),`${spec.id}: reverse must be a declared remote-light capability`);
  if(spec.id!=='f1_2010'){
    assert(spec.required.includes('night'),`${spec.id}: night lights must be declared`);
    assert(spec.required.includes('signal-left')&&spec.required.includes('signal-right'),`${spec.id}: turn signals must be declared`);
  }
}

console.log('V21.31 MULTIPLAYER M3 LIGHTING MATRIX QA: PASS',{
  states:['day','night','brake','reverse-stopped','reverse+brake+night','left-on','left-off','right-on'],
  coverage,
  reverseIndependentOfSpeed:true,
  authoredGeometryFallbackOnly:true
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of ['src/sonata-glb.js','src/vehicle-authored-registry.js']){
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}

const sonata=fs.readFileSync('src/sonata-glb.js','utf8');
const registry=fs.readFileSync('src/vehicle-authored-registry.js','utf8');

assert(!registry.includes('restoreSonataBrakeGlowContract'),'authored registry must not patch Sonata rendering');
assert(!registry.includes("vehicleId==='sonata'"),'authored registry must not special-case Sonata factory behavior');
assert(registry.includes('return factory;'),'authored registry factory loading must stay declarative');

const innerRed="registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearInnerLens,filter:'red',side:0,tint:0xff2a2e,tintMix:0.42});";
assert(sonata.includes(innerRed),'Sonata inner red authored layer must be full-mesh texture-driven');
assert(!sonata.includes("filter:'red',side:0,tint:0xff2a2e,tintMix:0.42,uvRegion:"),'Sonata red layer must not regain guessed UV crop');

const outerStart=sonata.indexOf('sourceMesh:rearOuterLens');
const outerEnd=sonata.indexOf("filter:'amber'",outerStart);
assert(outerStart>=0&&outerEnd>outerStart,'Sonata outer red authored block missing');
const outerRedBlock=sonata.slice(outerStart,outerEnd);
assert(outerRedBlock.includes("filter:'red'"),'Sonata outer rear lens must retain red authored layer');
assert(!outerRedBlock.includes('uvRegion:'),'Sonata outer red layer must remain full-mesh texture-driven');

const reverseContract="filter:'white',side:0,tint:0xf8fbff,whiteWarmth:0.10,tintMix:1.0,uvRegion:{min:[0.04,0.00],max:[0.54,0.842],feather:[0.008,0.008]}";
assert(sonata.includes(reverseContract),'Sonata reverse must retain audited lower Object_46 UV region');
assert(sonata.includes("setGlow(authoredRearGlowLayers,'red',0,Math.max(runningRed,brakingRed))"),'running/brake red must share the authored red lens');
assert(sonata.includes("setGlow(authoredRearGlowLayers,'white',0,reverseWhite)"),'reverse must remain independently driven');

console.log('V21.31 SONATA CONTROLLER OWNERSHIP QA: PASS',{
  registryDeclarative:true,
  redGlow:'full authored lens + texture mask',
  reverseGlow:'Object_46 lower audited UV region',
  externalRuntimePatch:false
});

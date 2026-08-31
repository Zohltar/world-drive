import assert from 'node:assert/strict';
import {solveRemoteSupportPlane} from '../src/multiplayer/multiplayer-support-math.js';
import {listMultiplayerVehicleSpecs,getMultiplayerVehicleSpec} from '../src/multiplayer/multiplayer-vehicle-registry.js';

for(const spec of listMultiplayerVehicleSpecs()){
  const contacts=spec.visual.supportContacts;
  const flat=solveRemoteSupportPlane({centerX:100,centerZ:-40,heading:.4,contacts,groundHeight:()=>12.5,tireHalfWidth:.135,clearance:.018});
  assert(flat,`${spec.id}: flat support failed`);
  assert(Math.abs(flat.wheelPitch)<1e-10,`${spec.id}: flat pitch must be zero`);
  assert(Math.abs(flat.wheelRoll)<1e-10,`${spec.id}: flat roll must be zero`);
  assert.equal(flat.wheelLocalY.length,contacts.length,`${spec.id}: wheel local Y count mismatch`);
  assert.equal(flat.supportAxles,spec.physics.axles.length,`${spec.id}: support axle count mismatch`);
  assert(flat.wheelContacts.every(c=>Number.isFinite(c.absX)&&Number.isFinite(c.absZ)&&Number.isFinite(c.ground)),`${spec.id}: support contacts must remain finite`);

  const uphill=solveRemoteSupportPlane({contacts,heading:0,groundHeight:(x,z)=>100+z*.08});
  assert(uphill.wheelPitch<0,`${spec.id}: +Z uphill must raise nose using World Drive negative pitch convention`);

  const camber=solveRemoteSupportPlane({contacts,heading:0,groundHeight:(x,z)=>20-x*.06});
  assert(camber.wheelRoll>0,`${spec.id}: higher left side must produce positive support roll`);

  const turned=solveRemoteSupportPlane({centerX:350,centerZ:-120,contacts,heading:Math.PI/2,groundHeight:(x,z)=>x*.02+z*.01});
  assert(Number.isFinite(turned.rootY)&&Number.isFinite(turned.wheelPitch)&&Number.isFinite(turned.wheelRoll),`${spec.id}: rotated support must stay finite`);
}

const semi=getMultiplayerVehicleSpec('semi_6x4');
const semiSlope=solveRemoteSupportPlane({contacts:semi.visual.supportContacts,groundHeight:(x,z)=>z*.10});
assert.equal(semiSlope.supportAxles,3);
assert.equal(semiSlope.wheelContacts.length,6);
assert(semiSlope.wheelPitch<0);

console.log('V21.31 MULTIPLAYER M3 SUPPORT QA: PASS',{
  vehicles:listMultiplayerVehicleSpecs().length,
  semiAxles:semiSlope.supportAxles,
  semiContacts:semiSlope.wheelContacts.length,
  scenarios:['flat','grade','camber','rotated-world']
});

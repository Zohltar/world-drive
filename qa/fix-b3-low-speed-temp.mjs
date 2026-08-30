import fs from 'node:fs';

const path='qa/V21_27_HANDRAKE_180_LOW_SPEED_QA.mjs';
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf('// P6.1:');
const end=s.indexOf('// P7:',start);
if(start<0||end<0)throw new Error('legacy P6.1 low-speed QA block not found');
const modern=`// Current maneuver semantics:\n// - with the handbrake held, steering/yaw keeps the signed translational speed\n//   magnitude through the spin so rear lock does not create a 90-degree wall;\n// - after release, ordinary R4 steering follows body-longitudinal velocity and\n//   therefore crosses continuously through zero at 90 degrees.\nconst maneuverAngles=[0,45,80,89,90,91,100,135,180];\nfor(const angleDeg of maneuverAngles){\n  const heldSpeed=bodyRelativeSteeringSpeed({\n    speed,heading:angleDeg*DEG,velocityHeading:0,handbrake:true\n  });\n  assert.ok(Math.abs(Math.abs(heldSpeed)-speed)<1e-9,\n    \`held-handbrake steering magnitude collapsed at \${angleDeg} deg: \${heldSpeed}\`);\n  assert.ok(heldSpeed>0,\n    \`held-handbrake steering sign should preserve the signed scalar speed at \${angleDeg} deg: \${heldSpeed}\`);\n\n  const releasedSpeed=bodyRelativeSteeringSpeed({\n    speed,heading:angleDeg*DEG,velocityHeading:0,handbrake:false\n  });\n  const expectedReleased=speed*Math.cos(angleDeg*DEG);\n  assert.ok(Math.abs(releasedSpeed-expectedReleased)<1e-9,\n    \`released R4 steering projection mismatch at \${angleDeg} deg: \${releasedSpeed} vs \${expectedReleased}\`);\n}\nassert.ok(bodyRelativeSteeringSpeed({speed,heading:89*DEG,velocityHeading:0,handbrake:false})>0);\nassert.ok(Math.abs(bodyRelativeSteeringSpeed({speed,heading:90*DEG,velocityHeading:0,handbrake:false}))<1e-9);\nassert.ok(bodyRelativeSteeringSpeed({speed,heading:91*DEG,velocityHeading:0,handbrake:false})<0);\nassert.ok(bodyRelativeSteeringSpeed({speed,heading:180*DEG,velocityHeading:0,handbrake:false})<0);\nassert.ok(bodyRelativeLongitudinalSpeed({speed,heading:180*DEG,velocityHeading:0})<0);\n\n`;
s=s.slice(0,start)+modern+s.slice(end);
const oldTransition="assert.ok(at20kph>.15&&at20kph<.45,`20 km/h transition unexpected: ${at20kph}`);";
const newTransition="assert.ok(at20kph>.35&&at20kph<.60,`20 km/h transition unexpected: ${at20kph}`);";
if(!s.includes(oldTransition))throw new Error('legacy 20 km/h handbrake transition bound not found');
s=s.replace(oldTransition,newTransition);
fs.writeFileSync(path,s);
console.log('B3 LOW-SPEED LEGACY QA MIGRATION: PASS');

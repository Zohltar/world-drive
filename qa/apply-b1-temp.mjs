import fs from 'node:fs';

const runtimePath='src/driving-runtime-base.js';
let runtime=fs.readFileSync(runtimePath,'utf8');
const helper=`export function postSpinSteeringAuthority(){\n  // Grip R4 — steering input itself is never artificially removed in a spin.\n  // Tire force and body-relative contact velocity decide how much authority the\n  // front axle can physically produce. The old 28% valley around 90 degrees was\n  // a numerical anti-spin aid and created a perceptible rotation wall.\n  return 1;\n}\n\n`;
if(!runtime.includes(helper))throw new Error('postSpinSteeringAuthority helper anchor missing');
runtime=runtime.replace(helper,'');
const authorityLine='    const steeringAuthority=postSpinSteeringAuthority({rearSlipAmount,heading,velocityHeading,handbrake:hand});\n';
if(!runtime.includes(authorityLine))throw new Error('steeringAuthority call anchor missing');
runtime=runtime.replace(authorityLine,'');

const replacements=[
  ['    let yawRate=lateralEnvelope.yawRate*truckTrailerSystem.tractorYawScale(speedAbs)*steeringAuthority;','    let yawRate=lateralEnvelope.yawRate*truckTrailerSystem.tractorYawScale(speedAbs);','yaw multiplier'],
  ['    const requestedLatAccel=lateralEnvelope.requestedLatAccel*steeringAuthority;','    const requestedLatAccel=lateralEnvelope.requestedLatAccel;','requested lateral acceleration multiplier'],
  ['    const signedLatAccel=lateralEnvelope.signedLatAccel*steeringAuthority;','    const signedLatAccel=lateralEnvelope.signedLatAccel;','signed lateral acceleration multiplier'],
  ['      yawRate+=rearSlipYaw*Math.sign((hand?speed:steeringTravelSpeed)||speed||1)*steeringAuthority;','      yawRate+=rearSlipYaw*Math.sign((hand?speed:steeringTravelSpeed)||speed||1);','RWD power-oversteer multiplier']
];
for(const [from,to,label] of replacements){
  if(!runtime.includes(from))throw new Error(`${label} anchor missing`);
  runtime=runtime.replace(from,to);
}
if(runtime.includes('postSpinSteeringAuthority'))throw new Error('postSpinSteeringAuthority still present in runtime');
if(/\bsteeringAuthority\b/.test(runtime))throw new Error('legacy steeringAuthority indirection still present in runtime');
fs.writeFileSync(runtimePath,runtime);

const qaPath='qa-grip-drift-r4.mjs';
let qa=fs.readFileSync(qaPath,'utf8');
qa=qa.replace('  postSpinSteeringAuthority,\n','');
const loop=`for(const angle of [0,45,80,90,100,135,180]){\n  for(const rearSlipAmount of [0,.4,.8,1]){\n    const authority=postSpinSteeringAuthority({rearSlipAmount,heading:angle*DEG,velocityHeading:0,handbrake:false});\n    assert.equal(authority,1,'steering command must not have an artificial 90-degree authority valley');\n  }\n}\n\n`;
if(!qa.includes(loop))throw new Error('R4 authority loop anchor missing');
qa=qa.replace(loop,'');
const sourceAnchor="assert.ok(!source.includes('projectionDeadband=speedAbs*.06'),'legacy 90-degree steering sign deadband still present');";
if(!qa.includes(sourceAnchor))throw new Error('R4 source assertion anchor missing');
qa=qa.replace(sourceAnchor,`assert.ok(!source.includes('postSpinSteeringAuthority'),'B1 no-op steering authority helper must remain removed');\nassert.ok(!/\\bsteeringAuthority\\b/.test(source),'B1 hidden steering-authority indirection must remain removed');\n${sourceAnchor}`);
fs.writeFileSync(qaPath,qa);

const fleetPath='qa/V21_28_ALL_CARS_PHYSICS_QA.mjs';
let fleet=fs.readFileSync(fleetPath,'utf8');
fleet=fleet.replace("import {bodyRelativeSteeringSpeed,postSpinSteeringAuthority} from '../src/driving-runtime.js';","import {bodyRelativeSteeringSpeed} from '../src/driving-runtime.js';");
const fleetOld=`  const reverseSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});\n  const reverseAuthority=postSpinSteeringAuthority({rearSlipAmount:.8,heading:Math.PI,velocityHeading:0,handbrake:false});\n  assert.ok(reverseSpeed<0,\`${'${info.id}'}: post-180 travel must steer reverse-relative\`);\n  assert.ok(reverseAuthority>.98,\`${'${info.id}'}: clean reverse-axis travel must retain steering authority\`);`;
const fleetNew=`  const reverseSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});\n  assert.equal(reverseSpeed,-15,\`${'${info.id}'}: clean post-180 travel must preserve the full reverse-relative steering speed\`);`;
if(!fleet.includes(fleetOld))throw new Error('fleet V21.28 post-spin authority block missing');
fleet=fleet.replace(fleetOld,fleetNew);
if(fleet.includes('postSpinSteeringAuthority'))throw new Error('fleet V21.28 QA still references removed helper');
fs.writeFileSync(fleetPath,fleet);

const id4Path='qa/V21_28_ID4_PHYSICS_QA.mjs';
let id4=fs.readFileSync(id4Path,'utf8');
id4=id4.replace(`import {\n  bodyRelativeSteeringSpeed,\n  postSpinSteeringAuthority\n} from '../src/driving-runtime.js';`,`import {bodyRelativeSteeringSpeed} from '../src/driving-runtime.js';`);
const id4Old=`// 4) V21.27 reverse-axis corrections are generic: a clean 180 must behave like\n// reverse steering, while full authority returns once aligned on that axis.\nconst reverseSteerSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});\nconst reverseAuthority=postSpinSteeringAuthority({rearSlipAmount:.8,heading:Math.PI,velocityHeading:0,handbrake:false});\nassert(reverseSteerSpeed<0,'ID.4 post-180 steering direction must be reverse-relative');\nassert(reverseAuthority>.98,'clean reverse-axis travel must retain full front steering authority');`;
const id4New=`// 4) Reverse-axis correction is generic: once cleanly aligned after 180°,\n// body-relative steering must retain the full reverse travel magnitude.\nconst reverseSteerSpeed=bodyRelativeSteeringSpeed({speed:15,heading:Math.PI,velocityHeading:0,handbrake:false});\nassert.equal(reverseSteerSpeed,-15,'ID.4 clean post-180 steering must retain full reverse-relative speed');`;
if(!id4.includes(id4Old))throw new Error('ID4 V21.28 post-spin authority block missing');
id4=id4.replace(id4Old,id4New);
if(id4.includes('postSpinSteeringAuthority'))throw new Error('ID4 V21.28 QA still references removed helper');
fs.writeFileSync(id4Path,id4);

console.log('CLEANUP B1 PATCH: PASS');

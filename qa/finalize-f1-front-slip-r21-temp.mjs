import fs from 'node:fs';
const oldPath='qa-f1-front-slip-probe-r21.mjs';
const newPath='qa-grip-f1-front-slip-r21.mjs';
let s=fs.readFileSync(oldPath,'utf8');
s=s.replace(
  `const frontDominated=(lastGrip.front||0)>(lastGrip.rear||0)+.03 || (lastGrip.frontScale??1)<(lastGrip.rearScale??1)-.05;`,
  `const frontDominated=(lastGrip.front||0)>(lastGrip.rear||0)+.03 || (lastGrip.frontScale??1)<(lastGrip.rearScale??1)-.015;`
);
s=s.replace(
  `const legacy=legacyGripYawAcceleration({frictionYawAccel:lastGrip.frictionYawAccel,yawRate:lastLat.yawRate,frontSlip:lastGrip.front,rearSlip:lastGrip.rear});`,
  `const legacy=legacyGripYawAcceleration({frictionYawAccel:lastGrip.frictionYawAccel,yawRate:lastLat.yawRate,frontSlip:lastGrip.front,rearSlip:lastGrip.rear,frontForceScale:lastGrip.frontScale,rearForceScale:lastGrip.rearScale});`
);
const oldEnd=`const f1Opposite=reports.filter(r=>r.id==='f1_2010'&&r.worst&&r.worst.steerDeg>0&&r.worst.dynYaw<-5);\nconsole.log('F1 opposite-yaw cases',f1Opposite.map(r=>({speed:r.initialKmh,worst:r.worst})));\nif(!f1Opposite.length)throw new Error('Probe did not reproduce the reported F1 opposite-yaw condition');\n`;
const newEnd=`const highSpeedF1=reports.filter(r=>r.id==='f1_2010'&&r.initialKmh>=220);\nfor(const r of highSpeedF1){\n  if(!r.worst)throw new Error(\`F1 \${r.initialKmh}: no front-force-dominated sample captured\`);\n  if(r.worst.rawLegacy*r.worst.bicycleYaw>=0)throw new Error(\`F1 \${r.initialKmh}: test did not exercise opposing front-loss yaw\`);\n  if(Math.abs(r.worst.filteredLegacy)>1e-6)throw new Error(\`F1 \${r.initialKmh}: front-loss legacy counter-yaw escaped R21 filter: \${JSON.stringify(r.worst)}\`);\n  if(r.worst.dynYaw<-.5)throw new Error(\`F1 \${r.initialKmh}: chassis yaw reversed against steering: \${JSON.stringify(r.worst)}\`);\n}\n// R21 must not erase small balanced axle-force differences on other RWD cars.\nfor(const r of reports.filter(r=>r.id!=='f1_2010')){\n  for(const x of r.rows){\n    if(Math.abs(x.frontScale-x.rearScale)<.015&&Math.abs(x.rawLegacy)>1e-6&&Math.abs(x.filteredLegacy)<1e-9){\n      throw new Error(\`\${r.id}: balanced legacy yaw was incorrectly suppressed: \${JSON.stringify(x)}\`);\n    }\n  }\n}\nconsole.log('GRIP R21 F1 HIGH-SPEED FRONT-SLIP QA: PASS',highSpeedF1.map(r=>({speed:r.initialKmh,worst:r.worst})));\n`;
if(!s.includes(oldEnd))throw new Error('R21 probe final assertion anchor missing');
s=s.replace(oldEnd,newEnd);
fs.writeFileSync(newPath,s);
fs.unlinkSync(oldPath);
console.log('GRIP R21 PROBE FINALIZER: PASS');

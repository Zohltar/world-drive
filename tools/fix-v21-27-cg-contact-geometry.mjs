import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');

function fail(message){
  console.error(`V21.27 CG CONTACT GEOMETRY: ABORTED\n${message}`);
  process.exit(1);
}
function readEditable(filePath){
  const raw=fs.readFileSync(filePath,'utf8');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  return {raw,eol,lf:raw.replace(/\r\n/g,'\n')};
}
function restoreEol(lf,eol){return eol==='\r\n'?lf.replace(/\n/g,'\r\n'):lf;}
function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)fail(`Missing ${label} anchor.`);
  if(source.indexOf(needle,first+needle.length)>=0)fail(`Ambiguous ${label} anchor.`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function syntaxCheck(filePath){
  const result=spawnSync(process.execPath,['--check',filePath],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||result.stdout||`Syntax check failed: ${filePath}`);
}

const file=readEditable(solverPath);
let source=file.lf;
const marker='V21.27.6 CG-RELATIVE CONTACT GEOMETRY';

if(source.includes(marker)){
  console.log('V21.27 CG CONTACT GEOMETRY: ALREADY APPLIED');
  process.exit(0);
}

source=replaceOnce(
  source,
  `      const side=contact.side||(finite(contact.localX)<0?'left':'right');\n      const localX=finite(contact.localX);\n      const localZ=finite(contact.localZ,axle?.positionM||0);\n      const steerAngle=contactSteerAngle({contact:{...contact,side},axle,geometry});`,
  `      const side=contact.side||(finite(contact.localX)<0?'left':'right');\n      const probeLocalX=finite(contact.localX);\n      const probeLocalZ=finite(contact.localZ,axle?.positionM||0);\n\n      // ${marker}\n      // Suspension/visual probes are authored around the GLB/procedural model\n      // origin. Tire forces and yaw moments must instead be measured around the\n      // PHYSICAL centre of gravity. With a 58/42 WRX, using symmetric visual\n      // probes (z=+/-1.25 m) gives the stronger front axle the same lever arm as\n      // the lighter rear axle and reverses the vehicle's static sideslip\n      // stability. Use profile axle geometry for rigid-body kinematics/moments;\n      // keep probe coordinates only for terrain/suspension contact ownership.\n      const trackHalf=Math.max(.25,finite(axle?.trackWidth,vehicle?.trackWidth||1.55)*.5);\n      const localX=side==='left'?-trackHalf:trackHalf;\n      const localZ=finite(axle?.positionM,probeLocalZ);\n      const steerAngle=contactSteerAngle({contact:{...contact,side},axle,geometry});`,
  'contact coordinate ownership'
);

source=replaceOnce(
  source,
  `    localX:wheel.localX,\n    localZ:wheel.localZ,`,
  `    localX:wheel.localX,\n    localZ:wheel.localZ,\n    probeLocalX:wheel.probeLocalX,\n    probeLocalZ:wheel.probeLocalZ,`,
  'wheel geometry diagnostics'
);

source=replaceOnce(
  source,
  `        localX,\n        localZ,\n        steerAngle,`,
  `        localX,\n        localZ,\n        probeLocalX,\n        probeLocalZ,\n        steerAngle,`,
  'wheel diagnostic payload'
);

const backup=file.raw;
try{
  fs.writeFileSync(solverPath,restoreEol(source,file.eol),'utf8');
  syntaxCheck(solverPath);
}catch(error){
  fs.writeFileSync(solverPath,backup,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 CG CONTACT GEOMETRY: APPLIED');
console.log('Tire kinematics/yaw moments now use profile axle positions around the physical CG.');
console.log('Visual suspension probes remain unchanged and continue to own ground contact sampling.');
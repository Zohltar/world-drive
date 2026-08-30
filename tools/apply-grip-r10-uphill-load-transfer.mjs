import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function patchFile(path,edits){
  let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
  for(const {needle,replacement,label} of edits){
    const at=source.indexOf(needle);
    if(at<0)throw new Error(`Grip R10 missing anchor in ${path}: ${label}`);
    if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Grip R10 ambiguous anchor in ${path}: ${label}`);
    source=source.slice(0,at)+replacement+source.slice(at+needle.length);
  }
  fs.writeFileSync(path,source,'utf8');
  if(path.endsWith('.js')||path.endsWith('.mjs')){
    const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    if(check.status!==0)throw new Error(`${path} syntax error\n${check.stderr||check.stdout}`);
  }
}

const solverPath='src/physics/per-wheel-shadow-solver.js';
const solverSource=fs.readFileSync(solverPath,'utf8');
if(solverSource.includes('Grip R10 — slope gravity must not masquerade as tire-force load transfer')){
  console.log('Grip R10 already applied');
  process.exit(0);
}

patchFile(solverPath,[
  {
    label:'separate slope gravity from tire load transfer',
    needle:`    const body=bodyVelocityFromWorldMotion(input);\n    const axleLoads=axleLoadFractions(vehicle,axles,input?.longitudinalAccel);\n`,
    replacement:`    const body=bodyVelocityFromWorldMotion(input);\n    // Grip R10 — slope gravity must not masquerade as tire-force load transfer.\n    // The chassis net acceleration includes grade, rolling resistance and aero.\n    // Feeding that net value into axle loading unloaded the rear on climbs, so a\n    // small steering correction at speed could provoke artificial oversteer.\n    // Use only longitudinal force requested through the contact patches here.\n    const requestedTireForceAccel=\n      finite(input?.requestedDriveAccel,0)+\n      finite(input?.requestedBrakeAccel,0);\n    const explicitLoadTransferAccel=Number(input?.longitudinalLoadTransferAccel);\n    const transferLimit=Math.max(3,Math.abs(finite(vehicle?.longitudinalAccelLimit,9.80665)));\n    const longitudinalLoadTransferAccel=clamp(\n      Number.isFinite(explicitLoadTransferAccel)?explicitLoadTransferAccel:requestedTireForceAccel,\n      -transferLimit,\n      transferLimit\n    );\n    const axleLoads=axleLoadFractions(vehicle,axles,longitudinalLoadTransferAccel);\n`
  },
  {
    label:'publish load-transfer diagnostics',
    needle:`      bodySideslipRad:body.sideslipRad,\n      centerSteerAngle:finite(input?.centerSteerAngle),\n`,
    replacement:`      bodySideslipRad:body.sideslipRad,\n      longitudinalLoadTransferAccel,\n      axleLoads:[...axleLoads],\n      centerSteerAngle:finite(input?.centerSteerAngle),\n`
  }
]);

patchFile('.github/workflows/qa-dev-integration.yml',[
  {
    label:'permanent Grip R10 CI gate',
    needle:`      - name: Grip R9 reverse and J-turn braking QA\n        run: node qa-grip-braking-r9.mjs\n`,
    replacement:`      - name: Grip R9 reverse and J-turn braking QA\n        run: node qa-grip-braking-r9.mjs\n      - name: Grip R10 uphill load-transfer stability QA\n        run: node qa-grip-uphill-r10.mjs\n`
  }
]);

console.log('Grip R10 uphill load-transfer fix applied');

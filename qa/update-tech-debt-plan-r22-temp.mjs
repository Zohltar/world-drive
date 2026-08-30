import fs from 'node:fs';
const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(path,'utf8');
if(!s.includes('- R21: prevent high-downforce F1 front-slip loss from creating an opposing legacy counter-yaw')){
  throw new Error('R21 chain anchor missing');
}
s=s.replace(
  '- R21: prevent high-downforce F1 front-slip loss from creating an opposing legacy counter-yaw\n',
  '- R21: prevent high-downforce F1 front-slip loss from creating an opposing legacy counter-yaw\n- R22: progressively soften F1 analog steering above ~145 km/h while preserving full-stick mechanical lock\n'
);
const anchor='- Human-validation interruption: F1 high-speed front-slip exposed a separate counter-yaw defect; fixed as Grip R21 on `dev` (`97e73d7d`) with permanent QA workflow commit `434dd0bc`. B3 remains pending until the requested in-game maneuver checks, now including F1 high-speed understeer feel, are confirmed.\n';
if(!s.includes(anchor))throw new Error('B3 R21 human-validation anchor missing');
const replacement=anchor+
'- Follow-up steering calibration: F1 remained too reactive at high speed even after R21. Grip R22 source commit `49223ab` adds a racecar-only second input-exponent stage from ~145 km/h to ~324 km/h; permanent QA workflow commit `2d3274ac`; clean post-temp HEAD `39fe2d36`. Half-stick mapping: ~6.2% rack at 150 km/h, 2.8% at 220, 1.7% at 250, 0.86% at 300; 100% stick remains 100% rack. R22 targeted run `33340583498`, permanent R22 run `33340620476`, final clean Dev Integration run `33340642930` all PASS. Human validation pending for F1 steering feel at 180–300+ km/h.\n';
s=s.replace(anchor,replacement);
fs.writeFileSync(path,s);
console.log('R22 TECH DEBT PLAN UPDATE: PASS');

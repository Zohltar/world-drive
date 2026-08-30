import fs from 'node:fs';
const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(path,'utf8');

const chain='- R21: prevent high-downforce F1 front-slip loss from creating an opposing legacy counter-yaw\n';
if(!s.includes(chain))throw new Error('R21 chain anchor missing');
if(!s.includes('- R22/R22.1: F1-specific ultra-high-speed stick curve; 0–150 km/h preserves accepted R13 behavior, >150 km/h progressively compresses analog input\n')){
  s=s.replace(chain,chain+'- R22/R22.1: F1-specific ultra-high-speed stick curve; 0–150 km/h preserves accepted R13 behavior, >150 km/h progressively compresses analog input\n');
}

const b3='- Human-validation interruption: F1 high-speed front-slip exposed a separate counter-yaw defect; fixed as Grip R21 on `dev` (`97e73d7d`) with permanent QA workflow commit `434dd0bc`. B3 remains pending until the requested in-game maneuver checks, now including F1 high-speed understeer feel, are confirmed.\n';
if(!s.includes(b3))throw new Error('B3 R21 anchor missing');
const record='- Steering human-feedback record: initial R22 was accepted from 0–150 km/h but remained **much too sensitive above 150 km/h**. R22.1 therefore freezes the accepted R13 mapping through 150 km/h, moves ultra-high-speed tuning into the explicit F1 profile, ramps exponent 4→9 from 150→260 km/h, and plateaus thereafter. Final source/QA commit on `dev`: `132c5bf2`; audit validation run `33341044464`; permanent R22 gate run `33341109576`; final Dev Integration run `33341109581` PASS 60/60. Representative half-stick mapping: 150=6.25%, 170=4.62%, 180=3.32%, 200=1.40%, 220=0.55%, 250=0.21%, 260+=0.195%; 85% stick at 300 km/h=23.2%; full stick remains 100%. Human validation remains pending for >150 km/h steering feel.\n';
if(!s.includes(record))s=s.replace(b3,b3+record);

fs.writeFileSync(path,s);
console.log('R22.1 TECH DEBT PLAN UPDATE: PASS');

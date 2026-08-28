import assert from 'node:assert/strict';
import {clampRoadBankV21_31,smoothRoadProfileV21_31} from './src/road-geometry.js';

const rad=deg=>deg*Math.PI/180;
const deg=value=>value*180/Math.PI;
const near=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<=epsilon,`expected ${expected}, got ${actual}`);

near(deg(clampRoadBankV21_31(rad(-30))),-5);
near(deg(clampRoadBankV21_31(rad(-5))),-5);
near(deg(clampRoadBankV21_31(rad(-3))),-3);
near(deg(clampRoadBankV21_31(0)),0);
near(deg(clampRoadBankV21_31(rad(8))),8);
near(deg(clampRoadBankV21_31(rad(15))),15);
near(deg(clampRoadBankV21_31(rad(30))),15);
near(deg(clampRoadBankV21_31(Number.NaN)),0);

const profile=Array.from({length:7},(_,i)=>({
  x:0,
  z:i*3,
  y:100,
  cum:i*3,
  roll:i===2?rad(-12):(i===4?rad(12):0)
}));
const smoothed=smoothRoadProfileV21_31(profile,{
  terrainAbs:()=>100,
  bridgeHeightAtCum:()=>null,
  bridgeManager:{isNearApproach:()=>false}
});

assert.ok(smoothed.every(p=>p.roll>=rad(-5)-1e-12),'final active profile must never bank below -5 degrees');
assert.ok(smoothed.every(p=>p.roll<=rad(15)+1e-12),'final active profile must never bank above +15 degrees');
near(deg(smoothed[2].roll),-5);
near(deg(smoothed[4].roll),12);

console.log('PASS Road R1 banking limits');
console.log('  - negative banking hard-limited to -5 deg');
console.log('  - positive banking hard-limited to +15 deg');
console.log('  - in-range banking remains unchanged');

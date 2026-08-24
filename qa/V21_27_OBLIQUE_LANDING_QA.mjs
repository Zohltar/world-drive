import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {landingSideslipGripSeed}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;

function seed(deg,speedMps=25){
  return landingSideslipGripSeed({sideslipRad:deg*DEG,speedAbs:speedMps});
}

// Straight touchdown must not invent slip.
assert.equal(seed(0),0,'straight landing invents tire slip');
assert.equal(seed(2),0,'landing dead-zone should absorb ~2 degree numerical noise');

// Oblique touchdown must progressively re-seed the four-wheel slip state.
const s5=seed(5);
const s10=seed(10);
const s15=seed(15);
assert.ok(s5>0&&s5<.35,`5deg landing seed unreasonable: ${s5}`);
assert.ok(s10>s5&&s10<.90,`10deg landing seed should be stronger but not saturated: ${s10}`);
assert.ok(s15>s10&&s15<=.92,`15deg landing seed should approach the configured cap: ${s15}`);

// Walking-speed landings must not be promoted into a dramatic slide.
assert.equal(seed(15,3),0,'very-low-speed landing should stay in the no-slip region');
const medium=seed(15,7);
const fast=seed(15,25);
assert.ok(medium>0&&medium<fast,'landing slip seed must ramp with useful road speed');

// The P4 seed is state only: it is dimensionless and bounded, so it cannot add
// force, rotate heading or directly modify momentum by itself.
for(const deg of [0,2,5,10,15,25,45]){
  const value=seed(deg,35);
  assert.ok(Number.isFinite(value)&&value>=0&&value<=.92,`seed out of bounds at ${deg}deg: ${value}`);
}

console.log('V21.27 OBLIQUE LANDING QA: PASS');
console.log('touchdown sideslip re-seeds tire-slip state progressively without adding grip or rotating momentum');

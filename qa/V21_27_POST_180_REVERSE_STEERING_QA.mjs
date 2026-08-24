import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {
  bodyRelativeSteeringSpeed,
  postSpinSteeringAuthority
}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const DEG=Math.PI/180;
const speed=20;
const velocityHeading=0;

for(const headingDeg of [150,170,180,190,210]){
  const heading=headingDeg*DEG;
  const steeringSpeed=bodyRelativeSteeringSpeed({
    speed,heading,velocityHeading,handbrake:false
  });
  assert.ok(steeringSpeed<0,
    `post-180 steering did not use reverse sign at ${headingDeg} deg: ${steeringSpeed}`);

  for(const rearSlipAmount of [.25,.55,.85]){
    const authority=postSpinSteeringAuthority({
      rearSlipAmount,heading,velocityHeading,handbrake:false
    });
    assert.ok(authority>0,
      `steering authority became non-positive at ${headingDeg} deg / slip ${rearSlipAmount}`);
    assert.ok(authority<=1,
      `steering authority exceeded 1 at ${headingDeg} deg / slip ${rearSlipAmount}`);
  }
}

// Active handbrake spin intentionally preserves the momentum sign so the 180
// can finish; the reverse sign must take over immediately on release.
{
  const heading=180*DEG;
  const held=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:true});
  const released=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false});
  assert.ok(held>0,'active handbrake spin lost momentum sign');
  assert.ok(released<0,'handbrake release did not switch to reverse steering sign');
}

console.log('V21.27 POST-180 REVERSE STEERING QA: PASS');

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePath=path.join(root,'src','driving-runtime.js');
const {bodyRelativeSteeringSpeed}=await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);

const speed=20;
const heading=Math.PI;
const velocityHeading=0;

const held=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:true,rearSlipAmount:.9});
const deep=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false,rearSlipAmount:.9});
const mid=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false,rearSlipAmount:.4});
const recovered=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:false,rearSlipAmount:.05});

assert.ok(held>0,'active handbrake spin must preserve momentum-direction steering sign');
assert.ok(deep>0,'deep rear slip immediately after release must not snap to full reverse steering');
assert.ok(mid<deep,'steering travel must progressively migrate toward reverse as rear grip recovers');
assert.ok(recovered<0,'once rear grip has recovered, post-180 steering must behave like true reverse');
assert.ok(Math.abs(recovered+speed)<1e-9,'fully recovered post-180 steering should match reverse magnitude');

console.log(JSON.stringify({held,deep,mid,recovered},null,2));
console.log('V21.27 POST-180 RECOVERY QA: PASS');

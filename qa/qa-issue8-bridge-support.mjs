import assert from 'node:assert/strict';
import {createWheelGroundSupport} from '../src/physics/wheel-ground-support.js';

function makeSupport({terrainY=0,roadY=5,lateral=5.8}={}){
  return createWheelGroundSupport({
    roadHalfWidth:8.5,
    terrainAbs:()=>terrainY,
    roadSurfaceAt:()=>({y:roadY,lateral})
  });
}

{
  const support=makeSupport({terrainY:0,roadY:5,lateral:5.8});
  assert.equal(
    support.groundHeightForWheel(0,0,false),
    0,
    'detached elevated road must not create fallback support outside the solid road core'
  );
}

{
  const support=makeSupport({terrainY:0,roadY:5,lateral:5.2});
  assert.ok(
    support.groundHeightForWheel(0,0,false)>5,
    'road core must retain authoritative road support even when the deck is elevated'
  );
}

{
  const support=makeSupport({terrainY:0,roadY:2,lateral:5.8});
  const y=support.groundHeightForWheel(0,0,false);
  assert.ok(
    y>0&&y<2.1,
    'ordinary modest embankment must keep the existing smooth road-to-terrain blend'
  );
}

{
  const support=makeSupport({terrainY:4,roadY:0,lateral:5.8});
  const y=support.groundHeightForWheel(0,0,false);
  assert.ok(
    y>0.1&&y<4,
    'road cuts below surrounding terrain must keep the existing blend'
  );
}

{
  const belowThreshold=makeSupport({terrainY:0,roadY:2.29,lateral:5.8});
  assert.ok(
    belowThreshold.groundHeightForWheel(0,0,false)>0,
    'ordinary support below the detached-road threshold must remain blended'
  );

  const aboveThreshold=makeSupport({terrainY:0,roadY:2.31,lateral:5.8});
  assert.equal(
    aboveThreshold.groundHeightForWheel(0,0,false),
    0,
    'support clearly beyond the 2.4 m road-surface gap including inferred offset must be terrain-owned'
  );
}

{
  const support=createWheelGroundSupport({
    roadHalfWidth:8.5,
    terrainAbs:()=>0,
    roadSurfaceAt:()=>({y:5,lateral:5.8})
  });
  support.setFastWheelRoadSupport(
    true,
    {angle:0,pitch:0,roll:0,px:0,pz:0,y:5},
    5.1,
    0,
    0
  );
  assert.equal(
    support.groundHeightForWheel(5.8,0,true),
    0,
    'fast local road plane must also reject detached elevated support outside the road core'
  );
  assert.ok(
    support.groundHeightForWheel(5.0,0,true)>5,
    'fast local road plane must preserve bridge-deck support inside the road core'
  );
}

console.log('ISSUE 8 BRIDGE / OFF-ROAD WHEEL SUPPORT QA: PASS');
console.log({
  detachedElevatedBleedRejected:true,
  roadCorePreserved:true,
  modestEmbankmentBlendPreserved:true,
  roadCutBlendPreserved:true,
  thresholdBoundaryCovered:true,
  fastAndFallbackCovered:true
});

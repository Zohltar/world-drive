// World Drive V21.27 — deterministic fixed-step helper.
//
// The future per-wheel solver will run at a fixed simulation cadence independent
// of renderer refresh rate. This helper is not wired into driving-runtime.js in
// Phase 1; it only establishes and tests the timing primitive.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

export function createFixedStepAccumulator({
  hz=120,
  maxSubSteps=8,
  maxFrameTime=.10
}={}){
  const frequency=Math.max(1,finite(hz,120));
  const step=1/frequency;
  const maxSteps=Math.max(1,Math.floor(finite(maxSubSteps,8)));
  const frameCap=Math.max(step,finite(maxFrameTime,.10));
  let accumulator=0;
  let simulatedTime=0;
  let droppedTime=0;

  function advance(frameDt,simulate){
    if(typeof simulate!=='function'){
      throw new Error('Fixed-step advance requires simulate(step)');
    }

    const accepted=Math.max(0,Math.min(frameCap,finite(frameDt,0)));
    accumulator+=accepted;
    let steps=0;

    while(accumulator+1e-12>=step&&steps<maxSteps){
      simulate(step);
      accumulator-=step;
      simulatedTime+=step;
      steps++;
    }

    // Avoid a spiral of death after a pause/debug breakpoint. Time that cannot
    // be simulated inside maxSubSteps is explicitly reported as dropped time.
    if(accumulator>=step){
      const keep=accumulator%step;
      droppedTime+=accumulator-keep;
      accumulator=keep;
    }

    return {
      steps,
      step,
      alpha:Math.max(0,Math.min(1,accumulator/step)),
      accumulator,
      simulatedTime,
      droppedTime,
      acceptedFrameTime:accepted
    };
  }

  function reset(){
    accumulator=0;
    simulatedTime=0;
    droppedTime=0;
  }

  function diagnostics(){
    return {
      hz:frequency,
      step,
      maxSubSteps:maxSteps,
      maxFrameTime:frameCap,
      accumulator,
      simulatedTime,
      droppedTime
    };
  }

  return {advance,reset,diagnostics};
}

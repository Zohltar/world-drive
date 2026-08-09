// World Drive - bridge geometry subsystem
// Owns bridge-to-route projection, bridge spans and deck height interpolation.
// Three.js bridge furniture/rendering remains in main.js.

export function createBridgeManager({
  statusEl,
  getBridgeFeatures,
  getRouteLength,
  nearestRoute,
  routePointAtCum,
  terrainHeight
}) {
  if(typeof getBridgeFeatures!=='function'){
    throw new Error('BridgeManager requires getBridgeFeatures()');
  }
  if(typeof getRouteLength!=='function'){
    throw new Error('BridgeManager requires getRouteLength()');
  }
  if(typeof nearestRoute!=='function'){
    throw new Error('BridgeManager requires nearestRoute()');
  }
  if(typeof routePointAtCum!=='function'){
    throw new Error('BridgeManager requires routePointAtCum()');
  }
  if(typeof terrainHeight!=='function'){
    throw new Error('BridgeManager requires terrainHeight()');
  }

  const spans=[];
  let rebuildCount=0;

  function updateStatus(){
    if(statusEl){
      statusEl.textContent=`${spans.length} · r${rebuildCount}`;
    }
  }

  function projectPointToRoute(x,z){
    const nearest=nearestRoute(x,z);
    if(!nearest)return null;

    return {
      cum:nearest.cum,
      d:nearest.d,
      x:nearest.px,
      z:nearest.pz
    };
  }

  function rebuild(){
    const next=[];
    const bridgeFeatures=getBridgeFeatures()||[];
    const routeLength=Number(getRouteLength())||0;

    for(const bridge of bridgeFeatures){
      if(!bridge.points||bridge.points.length<2)continue;

      const projections=bridge.points
        .map(point=>projectPointToRoute(point.x,point.z))
        .filter(Boolean);

      if(!projections.length)continue;

      // Ignore unrelated bridges merely inside the Overpass radius.
      const close=projections.filter(point=>point.d<22);
      if(close.length<2)continue;

      const start=Math.min(...close.map(point=>point.cum));
      const end=Math.max(...close.map(point=>point.cum));
      if(end-start<3)continue;

      // Sample far enough onto each approach so the bridge deck does not inherit
      // the river-bed/valley elevation under the structure.
      const approach=45;
      const rampStart=Math.max(0,start-approach);
      const rampEnd=Math.min(routeLength,end+approach);

      const startPoint=routePointAtCum(rampStart);
      const endPoint=routePointAtCum(rampEnd);
      if(!startPoint||!endPoint)continue;

      const y0=terrainHeight(startPoint.x,startPoint.z);
      const y1=terrainHeight(endPoint.x,endPoint.z);

      next.push({
        id:bridge.id,
        start,
        end,
        rampStart,
        rampEnd,
        y0,
        y1,
        length:end-start
      });
    }

    next.sort((a,b)=>a.start-b.start);

    // Preserve the shared array identity used by main.js render code.
    spans.length=0;
    spans.push(...next);

    rebuildCount++;
    updateStatus();
    return spans;
  }

  function heightAtCum(cum){
    for(const bridge of spans){
      if(cum<bridge.rampStart||cum>bridge.rampEnd)continue;

      const t=
        (cum-bridge.rampStart)/
        Math.max(.001,bridge.rampEnd-bridge.rampStart);

      // Smoothstep grade transition between both bridge approaches.
      const smooth=t*t*(3-2*t);
      return bridge.y0+(bridge.y1-bridge.y0)*smooth;
    }

    return null;
  }

  function isNearApproach(cum,distance=18){
    return spans.some(bridge=>
      Math.abs(cum-bridge.rampStart)<distance ||
      Math.abs(cum-bridge.rampEnd)<distance
    );
  }

  function reset(){
    spans.length=0;
    rebuildCount=0;
    updateStatus();
  }

  function resetCounter(){
    rebuildCount=0;
    updateStatus();
  }

  function getRebuildCount(){
    return rebuildCount;
  }

  updateStatus();

  return {
    spans,
    rebuild,
    heightAtCum,
    isNearApproach,
    reset,
    resetCounter,
    getRebuildCount,
    updateStatus
  };
}

// World Drive - bridge geometry subsystem
// Owns bridge-to-route projection, bridge spans and deck height interpolation.
// Three.js bridge furniture/rendering remains in main.js.

export function createBridgeManager({
  statusEl,
  getBridgeFeatures,
  getRouteLength,
  getRouteClosedLoop=()=>false,
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

  function normalizeCum(cum,routeLength){
    if(!routeLength)return Number(cum)||0;
    return ((Number(cum)||0)%routeLength+routeLength)%routeLength;
  }

  function minimalProjectionInterval(points,routeLength,closedLoop){
    const cums=points.map(point=>Number(point.cum)).filter(Number.isFinite);
    if(!cums.length)return null;
    if(!closedLoop||routeLength<=0){
      const start=Math.min(...cums),end=Math.max(...cums);
      return {start,end,length:end-start,wrapped:false};
    }

    const sorted=cums.map(cum=>normalizeCum(cum,routeLength)).sort((a,b)=>a-b);
    let largestGap=-Infinity;
    let gapIndex=0;
    for(let i=0;i<sorted.length;i++){
      const next=i===sorted.length-1?sorted[0]+routeLength:sorted[i+1];
      const gap=next-sorted[i];
      if(gap>largestGap){largestGap=gap;gapIndex=i;}
    }
    const start=sorted[(gapIndex+1)%sorted.length];
    let end=sorted[gapIndex];
    if(end<start)end+=routeLength;
    return {start,end,length:end-start,wrapped:end>routeLength};
  }

  function equivalentCumInRange(cum,start,end,routeLength,closedLoop){
    const value=Number(cum);
    if(!Number.isFinite(value))return null;
    if(!closedLoop||routeLength<=0)return value>=start&&value<=end?value:null;
    const canonical=normalizeCum(value,routeLength);
    const minTurn=Math.ceil((start-canonical)/routeLength);
    const maxTurn=Math.floor((end-canonical)/routeLength);
    if(minTurn>maxTurn)return null;
    const preferred=Math.round((value-canonical)/routeLength);
    const turn=Math.max(minTurn,Math.min(maxTurn,preferred));
    return canonical+turn*routeLength;
  }

  function containsCum(span,cum,{approach=false}={}){
    if(!span)return false;
    const start=approach?span.rampStart:span.start;
    const end=approach?span.rampEnd:span.end;
    return equivalentCumInRange(
      cum,start,end,span.routeLength||0,span.closedLoop===true
    )!==null;
  }

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
    const closedLoop=getRouteClosedLoop?.()===true;

    for(const bridge of bridgeFeatures){
      if(!bridge.points||bridge.points.length<2)continue;

      const projections=bridge.points
        .map(point=>projectPointToRoute(point.x,point.z))
        .filter(Boolean);

      if(!projections.length)continue;

      // Ignore unrelated bridges merely inside the Overpass radius.
      const close=projections.filter(point=>point.d<22);
      if(close.length<2)continue;

      const interval=minimalProjectionInterval(close,routeLength,closedLoop);
      if(!interval||interval.length<3)continue;
      const {start,end}=interval;

      // Sample far enough onto each approach so the bridge deck does not inherit
      // the river-bed/valley elevation under the structure.
      const approach=45;
      const rampStart=closedLoop?start-approach:Math.max(0,start-approach);
      const rampEnd=closedLoop?end+approach:Math.min(routeLength,end+approach);

      const routeCum=value=>closedLoop?normalizeCum(value,routeLength):value;
      const startPoint=routePointAtCum(routeCum(rampStart));
      const endPoint=routePointAtCum(routeCum(rampEnd));
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
        length:interval.length,
        wrapped:interval.wrapped,
        closedLoop,
        routeLength
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
      const equivalent=equivalentCumInRange(
        cum,
        bridge.rampStart,
        bridge.rampEnd,
        bridge.routeLength||0,
        bridge.closedLoop===true
      );
      if(equivalent===null)continue;

      const t=
        (equivalent-bridge.rampStart)/
        Math.max(.001,bridge.rampEnd-bridge.rampStart);

      // Smoothstep grade transition between both bridge approaches.
      const smooth=t*t*(3-2*t);
      return bridge.y0+(bridge.y1-bridge.y0)*smooth;
    }

    return null;
  }

  function isNearApproach(cum,distance=18){
    return spans.some(bridge=>{
      if(!bridge.closedLoop||!bridge.routeLength){
        return Math.abs(cum-bridge.rampStart)<distance||Math.abs(cum-bridge.rampEnd)<distance;
      }
      const circularDistance=target=>{
        const length=bridge.routeLength;
        const delta=normalizeCum(cum-target+length/2,length)-length/2;
        return Math.abs(delta);
      };
      return circularDistance(bridge.rampStart)<distance||circularDistance(bridge.rampEnd)<distance;
    });
  }

  function diagnostics(){
    return {
      rebuildCount,
      spans:spans.length,
      wrappedSpans:spans.filter(span=>span.wrapped).length,
      maxSpanM:spans.reduce((max,span)=>Math.max(max,span.length||0),0)
    };
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
    containsCum,
    isNearApproach,
    reset,
    resetCounter,
    getRebuildCount,
    updateStatus,
    diagnostics
  };
}

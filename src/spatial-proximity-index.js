// Exact bounded spatial indexes for high-frequency geographic proximity queries.
// Block 8 R2 keeps authoritative geometry tests unchanged while avoiding full
// route/hydro scans for every procedural forest candidate.

export function pointSegmentDistanceSquared(px,pz,a,b){
  const packed=b===undefined&&a&&('ax' in a||'bx' in a);
  const ax=Number(packed?a.ax:a?.x),az=Number(packed?a.az:a?.z);
  const bx=Number(packed?a.bx:b?.x),bz=Number(packed?a.bz:b?.z);
  if(!Number.isFinite(ax)||!Number.isFinite(az)||!Number.isFinite(bx)||!Number.isFinite(bz))return Infinity;
  const vx=bx-ax,vz=bz-az,wx=px-ax,wz=pz-az;
  const vv=vx*vx+vz*vz||1;
  const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  const dx=px-(ax+t*vx),dz=pz-(az+t*vz);
  return dx*dx+dz*dz;
}

export function createBoundsSpatialIndex({cellSize=240,maxIndexedCells=900}={}){
  const size=Math.max(20,Number(cellSize)||240);
  const maxCells=Math.max(1,Math.floor(Number(maxIndexedCells)||900));
  let buckets=new Map(),globals=[];
  const perf={rebuilds:0,items:0,buckets:0,indexedEntries:0,globalItems:0,queries:0,candidatesTested:0,maxCandidatesTested:0};

  const keyFor=(cx,cz)=>`${cx},${cz}`;

  function rebuild(items=[],boundsFor=item=>item?.bbox){
    const nextBuckets=new Map(),nextGlobals=[];
    let indexedEntries=0,itemCount=0;
    for(const item of items||[]){
      const bounds=boundsFor(item);
      const minx=Number(bounds?.minx),maxx=Number(bounds?.maxx);
      const minz=Number(bounds?.minz),maxz=Number(bounds?.maxz);
      if(!Number.isFinite(minx)||!Number.isFinite(maxx)||!Number.isFinite(minz)||!Number.isFinite(maxz))continue;
      const minCx=Math.floor(Math.min(minx,maxx)/size),maxCx=Math.floor(Math.max(minx,maxx)/size);
      const minCz=Math.floor(Math.min(minz,maxz)/size),maxCz=Math.floor(Math.max(minz,maxz)/size);
      const cells=(maxCx-minCx+1)*(maxCz-minCz+1);
      itemCount++;
      if(!Number.isFinite(cells)||cells>maxCells){
        nextGlobals.push(item);
        continue;
      }
      for(let cx=minCx;cx<=maxCx;cx++)for(let cz=minCz;cz<=maxCz;cz++){
        const key=keyFor(cx,cz);
        let bucket=nextBuckets.get(key);
        if(!bucket){bucket=[];nextBuckets.set(key,bucket);}
        bucket.push(item);indexedEntries++;
      }
    }
    buckets=nextBuckets;globals=nextGlobals;
    perf.rebuilds++;perf.items=itemCount;perf.buckets=buckets.size;
    perf.indexedEntries=indexedEntries;perf.globalItems=globals.length;
    return stats();
  }

  function someAt(x,z,predicate){
    const bucket=buckets.get(keyFor(Math.floor(x/size),Math.floor(z/size)));
    let tested=0;
    if(bucket)for(const item of bucket){
      tested++;
      if(predicate(item)){recordQuery(tested);return true;}
    }
    for(const item of globals){
      tested++;
      if(predicate(item)){recordQuery(tested);return true;}
    }
    recordQuery(tested);
    return false;
  }

  function recordQuery(tested){
    perf.queries++;perf.candidatesTested+=tested;
    perf.maxCandidatesTested=Math.max(perf.maxCandidatesTested,tested);
  }

  function stats(){
    return {...perf,cellSize:size,maxIndexedCells:maxCells};
  }

  return Object.freeze({rebuild,someAt,stats});
}

export function createWaterProximityIndex({
  getFeatures,
  waterWidth,
  pointInPolygon,
  cellSize=240,
  maxMargin=16,
  maxIndexedCells=900
}={}){
  if(typeof getFeatures!=='function')throw new Error('Water proximity index requires getFeatures()');
  if(typeof waterWidth!=='function')throw new Error('Water proximity index requires waterWidth()');
  if(typeof pointInPolygon!=='function')throw new Error('Water proximity index requires pointInPolygon()');

  const marginLimit=Math.max(1,Number(maxMargin)||16);
  const index=createBoundsSpatialIndex({cellSize,maxIndexedCells});
  let invalidated=true;
  let signature={list:null,length:-1,first:null,middle:null,last:null};
  const perf={queries:0,fallbackQueries:0,rebuilds:0};

  function featureBounds(feature){
    const points=feature?.points;
    if(!Array.isArray(points)||!points.length)return null;
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const point of points){
      const x=Number(point?.x),z=Number(point?.z);
      if(!Number.isFinite(x)||!Number.isFinite(z))continue;
      minx=Math.min(minx,x);maxx=Math.max(maxx,x);
      minz=Math.min(minz,z);maxz=Math.max(maxz,z);
    }
    if(!Number.isFinite(minx))return null;
    const reach=feature.kind==='polygon'
      ?marginLimit
      :Math.max(marginLimit,(Number(waterWidth(feature.tags))||0)*.55+marginLimit);
    return {minx:minx-reach,maxx:maxx+reach,minz:minz-reach,maxz:maxz+reach};
  }

  function currentSignature(features){
    const length=features.length;
    return {
      list:features,length,
      first:features[0]||null,
      middle:features[Math.floor(length/2)]||null,
      last:features[length-1]||null
    };
  }

  function signatureMatches(next){
    return !invalidated&&signature.list===next.list&&signature.length===next.length&&
      signature.first===next.first&&signature.middle===next.middle&&signature.last===next.last;
  }

  function rebuild(){
    const features=getFeatures()||[];
    index.rebuild(features,featureBounds);
    signature=currentSignature(features);
    invalidated=false;perf.rebuilds++;
    return stats();
  }

  function ensure(){
    const features=getFeatures()||[];
    const next=currentSignature(features);
    if(!signatureMatches(next))rebuild();
    return features;
  }

  function featureContains(feature,x,z,margin){
    const points=feature?.points;
    if(!Array.isArray(points)||!points.length)return false;
    if(feature.kind==='polygon'){
      if(pointInPolygon(x,z,points))return true;
      const limit2=margin*margin;
      for(let i=0;i<points.length;i++){
        if(pointSegmentDistanceSquared(x,z,points[i],points[(i+1)%points.length])<limit2)return true;
      }
      return false;
    }
    const half=Math.max(margin,(Number(waterWidth(feature.tags))||0)*.55+margin);
    const limit2=half*half;
    for(let i=0;i<points.length-1;i++){
      if(pointSegmentDistanceSquared(x,z,points[i],points[i+1])<limit2)return true;
    }
    return false;
  }

  function isWaterAt(x,z,margin=5){
    const features=ensure();
    const safeMargin=Math.max(0,Number(margin)||0);
    perf.queries++;
    if(safeMargin>marginLimit){
      perf.fallbackQueries++;
      for(const feature of features)if(featureContains(feature,x,z,safeMargin))return true;
      return false;
    }
    return index.someAt(x,z,feature=>featureContains(feature,x,z,safeMargin));
  }

  function invalidate(){invalidated=true;}

  function stats(){
    return {...perf,maxMargin:marginLimit,index:index.stats()};
  }

  return Object.freeze({isWaterAt,invalidate,rebuild,stats});
}

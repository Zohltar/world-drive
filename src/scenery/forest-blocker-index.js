const DEFAULT_CELL_SIZE=720;
const MAX_BUCKET_SPAN=256;

function bboxForPoints(points){
  let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
  for(const point of points||[]){
    const x=Number(point?.x),z=Number(point?.z);
    if(!Number.isFinite(x)||!Number.isFinite(z))continue;
    minx=Math.min(minx,x);maxx=Math.max(maxx,x);
    minz=Math.min(minz,z);maxz=Math.max(maxz,z);
  }
  return Number.isFinite(minx)&&Number.isFinite(minz)
    ?{minx,maxx,minz,maxz}
    :null;
}

export function isForestBlockingFeature(feature){
  const tags=feature?.tags||{};
  return !!tags.building||
    ['residential','commercial','industrial','retail','farmland','farmyard','meadow','grass','construction','quarry'].includes(tags.landuse)||
    ['bare_rock','scree','sand','beach'].includes(tags.natural);
}

export function createForestBlockerIndex({
  pointInPolygon,
  cellSize=DEFAULT_CELL_SIZE
}={}){
  if(typeof pointInPolygon!=='function'){
    throw new Error('Forest blocker index requires pointInPolygon()');
  }
  const size=Math.max(120,Number(cellSize)||DEFAULT_CELL_SIZE);
  let buckets=new Map();
  let globalBlockers=[];
  let blockerCount=0;
  let bucketReferences=0;
  let maxBucketSize=0;
  let signature='';

  const bucketKey=(cx,cz)=>`${cx}:${cz}`;

  function insertBucket(cx,cz,blocker){
    const key=bucketKey(cx,cz);
    let list=buckets.get(key);
    if(!list){list=[];buckets.set(key,list);}
    list.push(blocker);
    bucketReferences++;
    if(list.length>maxBucketSize)maxBucketSize=list.length;
  }

  function rebuild(features=[]){
    const nextBuckets=new Map();
    buckets=nextBuckets;
    globalBlockers=[];
    blockerCount=0;
    bucketReferences=0;
    maxBucketSize=0;
    const signatureParts=[];

    for(const feature of features||[]){
      if(!isForestBlockingFeature(feature))continue;
      const points=feature?.points;
      if(!Array.isArray(points)||points.length<3)continue;
      const bbox=bboxForPoints(points);
      if(!bbox)continue;
      const blocker={points,bbox};
      blockerCount++;
      signatureParts.push(
        `${Math.round(bbox.minx/20)},${Math.round(bbox.minz/20)},`+
        `${Math.round(bbox.maxx/20)},${Math.round(bbox.maxz/20)}`
      );

      const minCx=Math.floor(bbox.minx/size),maxCx=Math.floor(bbox.maxx/size);
      const minCz=Math.floor(bbox.minz/size),maxCz=Math.floor(bbox.maxz/size);
      const span=(maxCx-minCx+1)*(maxCz-minCz+1);
      if(span>MAX_BUCKET_SPAN){
        globalBlockers.push(blocker);
        continue;
      }
      for(let cx=minCx;cx<=maxCx;cx++){
        for(let cz=minCz;cz<=maxCz;cz++)insertBucket(cx,cz,blocker);
      }
    }

    const nextSignature=signatureParts.join('|');
    const changed=nextSignature!==signature;
    signature=nextSignature;
    return {...diagnostics(),changed};
  }

  function candidateList(x,z){
    const cx=Math.floor(x/size),cz=Math.floor(z/size);
    return buckets.get(bucketKey(cx,cz))||[];
  }

  function blocksForest(x,z){
    const local=candidateList(x,z);
    for(const blocker of local){
      const b=blocker.bbox;
      if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
      if(pointInPolygon(x,z,blocker.points))return true;
    }
    for(const blocker of globalBlockers){
      const b=blocker.bbox;
      if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
      if(pointInPolygon(x,z,blocker.points))return true;
    }
    return false;
  }

  function candidateCountAt(x,z){
    return candidateList(x,z).length+globalBlockers.length;
  }

  function clear(){
    buckets=new Map();
    globalBlockers=[];
    blockerCount=0;
    bucketReferences=0;
    maxBucketSize=0;
    signature='';
  }

  function diagnostics(){
    return {
      cellSize:size,
      blockers:blockerCount,
      buckets:buckets.size,
      bucketReferences,
      globalBlockers:globalBlockers.length,
      maxBucketSize
    };
  }

  return Object.freeze({
    rebuild,
    clear,
    blocksForest,
    candidateCountAt,
    diagnostics
  });
}

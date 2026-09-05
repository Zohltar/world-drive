import fs from 'node:fs';
import {createForestBlockerIndex,isForestBlockingFeature} from '../src/scenery/forest-blocker-index.js';

function pointInPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const xi=points[i].x,zi=points[i].z;
    const xj=points[j].x,zj=points[j].z;
    const crosses=((zi>z)!==(zj>z))&&
      x<((xj-xi)*(z-zi))/(zj-zi||1e-12)+xi;
    if(crosses)inside=!inside;
  }
  return inside;
}

function squareFeature(id,x,z,size=70,tags={building:'yes'}){
  const h=size*.5;
  return {
    id,
    type:'way',
    tags,
    points:[
      {x:x-h,z:z-h},{x:x+h,z:z-h},
      {x:x+h,z:z+h},{x:x-h,z:z+h}
    ]
  };
}

function bbox(points){
  let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
  for(const point of points){
    minx=Math.min(minx,point.x);maxx=Math.max(maxx,point.x);
    minz=Math.min(minz,point.z);maxz=Math.max(maxz,point.z);
  }
  return {minx,maxx,minz,maxz};
}

function baselineBlockers(features){
  return features.filter(isForestBlockingFeature).map(feature=>({points:feature.points,bbox:bbox(feature.points)}));
}

function baselineBlocks(x,z,blockers){
  let checks=0;
  for(const blocker of blockers){
    checks++;
    const b=blocker.bbox;
    if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
    if(pointInPolygon(x,z,blocker.points))return {blocked:true,checks};
  }
  return {blocked:false,checks};
}

const all=[];
let id=1;
for(let z=-4560;z<=13200;z+=120){
  for(let x=-1680;x<=1680;x+=240){
    all.push(squareFeature(id++,x,z));
  }
}
// Non-blocking scenery must never enter the forest blocker index.
all.push(squareFeature(id++,0,0,200,{landuse:'forest'}));
// Exercise the large-polygon fallback without making it intersect the route.
all.push({
  id:id++,type:'way',tags:{landuse:'industrial'},
  points:[
    {x:18000,z:-18000},{x:42000,z:-18000},
    {x:42000,z:18000},{x:18000,z:18000}
  ]
});

const rendererSource=fs.readFileSync(new URL('../src/scenery/scenery-renderer-p9.js',import.meta.url),'utf8');
if(!rendererSource.includes("createForestBlockerIndex")){
  throw new Error('Issue #12 renderer does not use the spatial forest blocker index');
}
if(rendererSource.includes('for(const blocker of forestBlockers)')){
  throw new Error('Issue #12 renderer still contains the historical full blocker scan');
}

const index=createForestBlockerIndex({pointInPolygon,cellSize:720});
const centers=[0,2600,5200,7800];
const stages=[];
let previousIndexedAverage=null;
let firstLinearAverage=null;

for(const centerZ of centers){
  // Scenery-data is intentionally cumulative. Model a 4.5 km query window whose
  // older features remain resident as the route advances.
  const loaded=all.filter(feature=>{
    if(feature.points?.[0]?.x>=18000)return true;
    const c=feature.points?.[0]?.z??0;
    return c<=centerZ+4500;
  });
  const blockers=baselineBlockers(loaded);
  const diag=index.rebuild(loaded);
  if(diag.blockers!==blockers.length){
    throw new Error(`Issue #12 blocker count mismatch at ${centerZ} m: index=${diag.blockers}, baseline=${blockers.length}`);
  }

  let indexedChecks=0;
  let linearChecks=0;
  let samples=0;
  for(let dz=-1440;dz<=1440;dz+=480){
    for(let x=-1560;x<=1560;x+=480){
      // Mid-cell probes stay outside the 70 m synthetic blockers, forcing the
      // historical implementation to scan the full accumulated list.
      const qx=x+120;
      const qz=centerZ+dz+60;
      const baseline=baselineBlocks(qx,qz,blockers);
      const indexed=index.blocksForest(qx,qz);
      if(indexed!==baseline.blocked){
        throw new Error(`Issue #12 blocker parity mismatch at ${qx},${qz}`);
      }
      indexedChecks+=index.candidateCountAt(qx,qz);
      linearChecks+=baseline.checks;
      samples++;
    }
  }

  // Also verify positive containment against representative local blockers.
  const insideFeature=loaded.find(feature=>
    feature.tags?.building&&
    Math.abs(feature.points[0].z+35-centerZ)<700&&
    Math.abs(feature.points[0].x+35)<700
  );
  if(!insideFeature)throw new Error(`Issue #12 missing positive blocker probe at ${centerZ} m`);
  const insideX=(insideFeature.points[0].x+insideFeature.points[2].x)*.5;
  const insideZ=(insideFeature.points[0].z+insideFeature.points[2].z)*.5;
  if(index.blocksForest(insideX,insideZ)!==baselineBlocks(insideX,insideZ,blockers).blocked){
    throw new Error(`Issue #12 positive blocker parity mismatch at ${centerZ} m`);
  }

  const indexedAverage=indexedChecks/samples;
  const linearAverage=linearChecks/samples;
  if(firstLinearAverage===null)firstLinearAverage=linearAverage;
  if(indexedAverage>85){
    throw new Error(`Issue #12 local blocker workload too large at ${centerZ} m: ${indexedAverage.toFixed(1)} candidates/query`);
  }
  if(previousIndexedAverage!==null&&indexedAverage>previousIndexedAverage*1.55){
    throw new Error(
      `Issue #12 indexed blocker workload grew with route history at ${centerZ} m: `+
      `${previousIndexedAverage.toFixed(1)} -> ${indexedAverage.toFixed(1)}`
    );
  }
  previousIndexedAverage=indexedAverage;
  stages.push({
    centerZ,
    blockers:blockers.length,
    buckets:diag.buckets,
    globalBlockers:diag.globalBlockers,
    maxBucketSize:diag.maxBucketSize,
    indexedAverage:Number(indexedAverage.toFixed(2)),
    linearAverage:Number(linearAverage.toFixed(2)),
    reduction:Number((1-indexedAverage/linearAverage).toFixed(4))
  });
}

const final=stages.at(-1);
if(final.linearAverage<firstLinearAverage*1.7){
  throw new Error('Issue #12 synthetic route did not accumulate enough historical blocker work');
}
if(final.reduction<.90){
  throw new Error(`Issue #12 blocker index reduction too small: ${(final.reduction*100).toFixed(1)}%`);
}

console.log('PASS Issue #12 accumulated scenery blocker spatial-index QA');
console.log(stages);

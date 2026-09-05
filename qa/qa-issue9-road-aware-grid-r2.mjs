import assert from 'node:assert/strict';
import {buildRoadAwareImageryGrid} from '../src/imagery/road-aware-grid.js';

const BASE_STEP=18.341;
const SEGMENTS=32;
const HALF=BASE_STEP*SEGMENTS/2;
const spec={
  west:-HALF,
  east:HALF,
  north:-HALF,
  south:HALF,
  centerX:0,
  centerZ:0
};
const INNER=5.2;
const OUTER=30.5;
const SURFACE_OFFSET=.2;
const ASPHALT_OFFSET=.1;

function roadModel(angle,phase){
  const dx=Math.sin(angle);
  const dz=Math.cos(angle);
  const nx=dz;
  const nz=-dx;
  const roadGrade=.15;
  const signed=(x,z)=>x*nx+z*nz-phase;
  const along=(x,z)=>x*dx+z*dz;
  const roadY=(x,z)=>roadGrade*along(x,z);
  const natural=(x,z)=>roadY(x,z)+Math.max(0,3*signed(x,z));
  const visual=(x,z)=>{
    const n=natural(x,z);
    const support=roadY(x,z)-SURFACE_OFFSET;
    const distance=Math.abs(signed(x,z));
    if(distance<=INNER)return Math.min(n,support);
    if(distance>=OUTER)return n;
    const t=(distance-INNER)/(OUTER-INNER);
    const rise=1-Math.pow(1-Math.max(0,Math.min(1,t)),2.35);
    return Math.min(n,support*(1-rise)+n*rise);
  };
  return {
    terrain:(x,z)=>visual(x,z),
    roadVisual:(x,z)=>Math.abs(signed(x,z))<=OUTER?visual(x,z):null,
    roadY,
    pointAt:u=>({
      x:dx*u+nx*phase,
      z:dz*u+nz*phase
    })
  };
}

function triangleHeightAt(grid,x,z){
  const p=grid.positions;
  const idx=grid.indices;
  let highest=-Infinity;
  for(let i=0;i<idx.length;i+=3){
    const ia=idx[i]*3,ib=idx[i+1]*3,ic=idx[i+2]*3;
    const ax=p[ia],az=p[ia+2];
    const bx=p[ib],bz=p[ib+2];
    const cx=p[ic],cz=p[ic+2];
    if(x<Math.min(ax,bx,cx)-1e-6||x>Math.max(ax,bx,cx)+1e-6||
       z<Math.min(az,bz,cz)-1e-6||z>Math.max(az,bz,cz)+1e-6)continue;
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    if(Math.abs(den)<1e-10)continue;
    const wa=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den;
    const wb=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;
    const wc=1-wa-wb;
    if(wa<-1e-6||wb<-1e-6||wc<-1e-6)continue;
    const y=wa*p[ia+1]+wb*p[ib+1]+wc*p[ic+1];
    highest=Math.max(highest,y);
  }
  return highest;
}

// No road callback: preserve the exact certified P9.13 base grid/cost.
const plain=buildRoadAwareImageryGrid({
  spec,
  segments:SEGMENTS,
  sampleTerrainHeight:()=>0
});
assert.equal(plain.stats.refinedCells,0,'ordinary terrain unexpectedly refined');
assert.equal(plain.stats.vertexCount,(SEGMENTS+1)**2,'ordinary vertex count changed');
assert.equal(plain.stats.triangleCount,SEGMENTS*SEGMENTS*2,'ordinary triangle count changed');

let worstClearance=Infinity;
let maxRefinedRatio=0;
for(const angle of [0,Math.PI/6,Math.PI/4,Math.PI/3,Math.PI/2]){
  for(const phaseFraction of [-.49,-.25,0,.25,.49]){
    const phase=BASE_STEP*phaseFraction;
    const model=roadModel(angle,phase);
    const grid=buildRoadAwareImageryGrid({
      spec,
      segments:SEGMENTS,
      sampleTerrainHeight:model.terrain,
      sampleRoadVisualHeight:model.roadVisual,
      refineFactor:6,
      refinementRing:1,
      verticalOffset:0
    });
    assert.ok(grid.stats.refinedCells>0,'road corridor was not refined');
    maxRefinedRatio=Math.max(maxRefinedRatio,grid.stats.refinedCells/grid.stats.baseCells);

    for(let u=-180;u<=180;u+=3){
      const point=model.pointAt(u);
      if(point.x<=spec.west+2||point.x>=spec.east-2||
         point.z<=spec.north+2||point.z>=spec.south-2)continue;
      const imageryY=triangleHeightAt(grid,point.x,point.z);
      assert.ok(Number.isFinite(imageryY),'road sample fell outside generated imagery mesh');
      const asphaltY=model.roadY(point.x,point.z)+ASPHALT_OFFSET;
      const clearance=asphaltY-imageryY;
      worstClearance=Math.min(worstClearance,clearance);
      assert.ok(clearance>=-.025,
        `road-aware imagery crossed asphalt: angle=${angle.toFixed(3)} phase=${phaseFraction} u=${u} clearance=${clearance.toFixed(3)} m`);
    }
  }
}

// The mechanism must remain localized. The small synthetic chunk has a much
// larger road-to-area ratio than a real 96x96 satellite chunk; even here, less
// than half the cells should refine.
assert.ok(maxRefinedRatio<.5,`road refinement became too broad: ${(maxRefinedRatio*100).toFixed(1)}%`);

console.log('ISSUE #9 ROAD-AWARE GRID R2 QA: PASS');
console.log(JSON.stringify({
  baseStepM:BASE_STEP,
  refineFactor:6,
  refinedStepM:Number((BASE_STEP/6).toFixed(3)),
  worstClearanceM:Number(worstClearance.toFixed(3)),
  maxRefinedRatio:Number(maxRefinedRatio.toFixed(3))
},null,2));

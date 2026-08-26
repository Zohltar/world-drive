// World Drive forest terrain anchoring.
//
// Forest placement must follow the triangles that are actually on screen, not a
// fresh DEM sample at the tree coordinate. On steep relief a height function and
// a coarse/medium triangle interpolation can differ by metres between vertices.
// This sampler reads the live near-terrain PlaneGeometry and performs the same
// triangle interpolation the GPU sees.

export function createForestTerrainSampler({
  THREE,
  forestGroup,
  getWorldOffset,
  fallbackHeight
}){
  if(!THREE)throw new Error('Forest terrain sampler requires THREE');
  if(!forestGroup)throw new Error('Forest terrain sampler requires forestGroup');
  if(typeof getWorldOffset!=='function')throw new Error('Forest terrain sampler requires getWorldOffset()');
  if(typeof fallbackHeight!=='function')throw new Error('Forest terrain sampler requires fallbackHeight()');

  let cachedGround=null;
  const worldPosition=new THREE.Vector3();

  function sceneRoot(){
    let node=forestGroup;
    while(node?.parent)node=node.parent;
    return node||null;
  }

  function usableGround(mesh){
    if(!mesh?.isMesh||!mesh.geometry)return false;
    const p=mesh.geometry.parameters||{};
    const sx=Number(p.widthSegments)||0;
    const sz=Number(p.heightSegments)||0;
    const width=Number(p.width)||0;
    const height=Number(p.height)||0;

    // World Drive's visible near terrain is the 5.6 km / 448 segment plane.
    // Do not accidentally latch onto a satellite/imaging PlaneGeometry. P7.1
    // searched every large plane in the scene; selecting the wrong one can
    // produce perfectly finite but completely unrelated heights and bury every
    // tree while the forest still consumes render resources.
    return width>=5200&&height>=5200&&sx>=400&&sz>=400&&
      !!mesh.geometry.getAttribute?.('position');
  }

  function findGround(){
    if(usableGround(cachedGround))return cachedGround;
    const root=sceneRoot();
    if(!root?.traverse)return null;
    let best=null,bestScore=-Infinity;
    root.traverse(object=>{
      if(!usableGround(object))return;
      const p=object.geometry.parameters;
      const score=(Number(p.width)||0)*(Number(p.height)||0)*
        ((Number(p.widthSegments)||0)+1)*((Number(p.heightSegments)||0)+1);
      if(score>bestScore){bestScore=score;best=object;}
    });
    cachedGround=best;
    return best;
  }

  function vertex(attr,index){
    return {x:attr.getX(index),y:attr.getY(index),z:attr.getZ(index)};
  }

  function triangleHeight(px,pz,a,b,c){
    const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    if(Math.abs(denominator)<1e-9)return null;
    const wa=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/denominator;
    const wb=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/denominator;
    const wc=1-wa-wb;
    const epsilon=-1e-5;
    if(wa<epsilon||wb<epsilon||wc<epsilon)return null;
    return wa*a.y+wb*b.y+wc*c.y;
  }

  function sampleGround(x,z){
    const ground=findGround();
    if(!ground)return null;
    const geometry=ground.geometry;
    const attr=geometry.getAttribute('position');
    const p=geometry.parameters||{};
    const gridX=Math.max(1,Number(p.widthSegments)||0);
    const gridZ=Math.max(1,Number(p.heightSegments)||0);
    const width=Number(p.width)||0;
    const depth=Number(p.height)||0;
    if(!attr||!width||!depth)return null;
    if(attr.count!==(gridX+1)*(gridZ+1))return null;

    // Convert the geographic tree coordinate to current render space, then to
    // terrain-mesh local X/Z. Floating-origin shifts move the mesh but do not
    // rebuild it immediately, so using the live world position is essential.
    const offset=getWorldOffset()||{x:0,z:0};
    ground.getWorldPosition(worldPosition);
    const localX=(x-offset.x)-worldPosition.x;
    const localZ=(z-offset.z)-worldPosition.z;
    const halfW=width*.5,halfD=depth*.5;
    if(localX<-halfW||localX>halfW||localZ<-halfD||localZ>halfD)return null;

    const stepX=width/gridX;
    const stepZ=depth/gridZ;
    const fx=(localX+halfW)/stepX;

    // Three r179 PlaneGeometry creates row 0 at +Y in its original XY plane.
    // World Drive bakes rotateX(-PI/2) into the geometry, therefore that first
    // row becomes local -Z and row indices increase toward +Z.
    const fz=(localZ+halfD)/stepZ;
    const ix=Math.max(0,Math.min(gridX-1,Math.floor(Math.min(gridX-1e-9,fx))));
    const iz=Math.max(0,Math.min(gridZ-1,Math.floor(Math.min(gridZ-1e-9,fz))));
    const row=gridX+1;
    const aIndex=ix+row*iz;
    const bIndex=ix+row*(iz+1);
    const cIndex=(ix+1)+row*(iz+1);
    const dIndex=(ix+1)+row*iz;
    const a=vertex(attr,aIndex),b=vertex(attr,bIndex),c=vertex(attr,cIndex),d=vertex(attr,dIndex);

    // Three.js PlaneGeometry indices are (a,b,d) and (b,c,d). Interpolating
    // those exact triangles guarantees the trunk base sits on the visible mesh.
    let y=triangleHeight(localX,localZ,a,b,d);
    if(y===null)y=triangleHeight(localX,localZ,b,c,d);
    if(y===null)return null;
    return y+worldPosition.y;
  }

  function heightAt(x,z){
    const fallback=fallbackHeight(x,z);
    const visible=sampleGround(x,z);

    if(!Number.isFinite(visible))return fallback;
    if(!Number.isFinite(fallback))return visible;

    // Safety fuse. Exact triangle interpolation should normally stay close to
    // the DEM height used to build that same terrain. A large delta means the
    // sampler has latched onto stale/misaligned geometry during a floating-origin
    // transition. Never let that transient state hide the forest underground.
    const delta=visible-fallback;
    if(Math.abs(delta)>6)return fallback;

    // Even for a valid steep triangle, bound the correction so a single coarse
    // facet cannot move a trunk several metres in one rebuild. This still fixes
    // the visible float/bury gap while keeping placement robust.
    const correction=Math.max(-2.5,Math.min(2.5,delta));
    return fallback+correction;
  }

  return {
    heightAt,
    sampleGround,
    invalidate(){cachedGround=null;}
  };
}

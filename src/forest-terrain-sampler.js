// Foret P9.12 fast rendered-terrain sampler.
// Caches the live near-terrain grid transform and reads BufferAttribute storage
// directly so dense forest chunk builds do not allocate temporary vertex objects
// or call getWorldPosition()/getWorldOffset() for every tree.
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

  let cachedContext=null;
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
    return width>=5200&&height>=5200&&sx>=400&&sz>=400&&
      !!mesh.geometry.getAttribute?.('position');
  }

  function findGround(){
    const root=sceneRoot();
    if(!root?.traverse)return null;
    let best=null,bestScore=-Infinity;
    root.traverse(object=>{
      if(!usableGround(object))return;
      const p=object.geometry.parameters||{};
      const score=(Number(p.width)||0)*(Number(p.height)||0)*
        ((Number(p.widthSegments)||0)+1)*((Number(p.heightSegments)||0)+1);
      if(score>bestScore){bestScore=score;best=object;}
    });
    return best;
  }

  function buildContext(){
    const ground=findGround();
    if(!ground)return null;
    const geometry=ground.geometry;
    const attr=geometry.getAttribute('position');
    const p=geometry.parameters||{};
    const gridX=Math.max(1,Number(p.widthSegments)||0);
    const gridZ=Math.max(1,Number(p.heightSegments)||0);
    const width=Number(p.width)||0;
    const depth=Number(p.height)||0;
    if(!attr||!width||!depth||attr.count!==(gridX+1)*(gridZ+1))return null;

    const array=attr.array;
    const stride=attr.itemSize||3;
    if(!array||stride<3)return null;

    const offset=getWorldOffset()||{x:0,z:0};
    ground.getWorldPosition(worldPosition);

    return {
      ground,
      array,
      stride,
      gridX,
      gridZ,
      row:gridX+1,
      width,
      depth,
      halfW:width*.5,
      halfD:depth*.5,
      stepX:width/gridX,
      stepZ:depth/gridZ,
      centerX:(Number(offset.x)||0)+worldPosition.x,
      centerZ:(Number(offset.z)||0)+worldPosition.z,
      baseY:worldPosition.y
    };
  }

  function context(){
    if(cachedContext?.ground?.parent)return cachedContext;
    cachedContext=buildContext();
    return cachedContext;
  }

  function vertexY(ctx,index){
    return ctx.array[index*ctx.stride+1];
  }

  function triangleY(px,pz,ax,az,ay,bx,bz,by,cx,cz,cy){
    const denominator=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    if(Math.abs(denominator)<1e-9)return null;
    const wa=((bz-cz)*(px-cx)+(cx-bx)*(pz-cz))/denominator;
    const wb=((cz-az)*(px-cx)+(ax-cx)*(pz-cz))/denominator;
    const wc=1-wa-wb;
    if(wa<-1e-5||wb<-1e-5||wc<-1e-5)return null;
    return wa*ay+wb*by+wc*cy;
  }

  function sampleGround(x,z){
    const ctx=context();
    if(!ctx)return null;
    const localX=x-ctx.centerX;
    const localZ=z-ctx.centerZ;
    if(localX<-ctx.halfW||localX>ctx.halfW||localZ<-ctx.halfD||localZ>ctx.halfD)return null;

    const fx=(localX+ctx.halfW)/ctx.stepX;
    const fz=(localZ+ctx.halfD)/ctx.stepZ;
    const ix=Math.max(0,Math.min(ctx.gridX-1,Math.floor(Math.min(ctx.gridX-1e-9,fx))));
    const iz=Math.max(0,Math.min(ctx.gridZ-1,Math.floor(Math.min(ctx.gridZ-1e-9,fz))));
    const a=ix+ctx.row*iz;
    const b=ix+ctx.row*(iz+1);
    const c=(ix+1)+ctx.row*(iz+1);
    const d=(ix+1)+ctx.row*iz;

    const x0=-ctx.halfW+ix*ctx.stepX;
    const x1=x0+ctx.stepX;
    const z0=-ctx.halfD+iz*ctx.stepZ;
    const z1=z0+ctx.stepZ;
    const ay=vertexY(ctx,a),by=vertexY(ctx,b),cy=vertexY(ctx,c),dy=vertexY(ctx,d);

    let y=triangleY(localX,localZ,x0,z0,ay,x0,z1,by,x1,z0,dy);
    if(y===null)y=triangleY(localX,localZ,x0,z1,by,x1,z1,cy,x1,z0,dy);
    if(y===null)return null;
    return y+ctx.baseY;
  }

  function heightAt(x,z){
    const visible=sampleGround(x,z);
    return Number.isFinite(visible)?visible:fallbackHeight(x,z);
  }

  return Object.freeze({
    heightAt,
    sampleGround,
    invalidate(){cachedContext=null;}
  });
}

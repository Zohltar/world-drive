import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';

export function createWaterRenderer({THREE,group,statusEl,waterFeatures,coastlineFeatures,materials,terrainHeight,getWorldOffset,waterWidth}){
  if(!THREE||!group)throw new Error('Water renderer requires THREE/group');
  const {waterMat,riverMat,coastWaterMat}=materials;
  let assets=getForestWaterAssets();

  function applyAuthoredWaterStyle(){
    const style=assets?.waterStyle;
    if(!style)return;
    const tint=new THREE.Color(style.tint);
    for(const mat of [waterMat,riverMat,coastWaterMat]){
      if(!mat)continue;
      mat.color?.lerp?.(tint,.34);
      if('roughness' in mat)mat.roughness=style.roughness;
      if('metalness' in mat)mat.metalness=style.metalness;
      mat.transparent=true;
      mat.opacity=Math.min(mat.opacity??1,style.opacity);
      mat.depthWrite=false;
      mat.needsUpdate=true;
    }
  }

  function disposeObject(object){
    object.traverse?.(child=>child.geometry?.dispose?.());
  }

  function clear(){
    while(group.children.length){
      const child=group.children.pop();
      disposeObject(child);
    }
  }

  function smoothProfile(values){
    let out=values.slice();
    for(let pass=0;pass<3;pass++){
      const src=out.slice();
      for(let i=1;i<src.length-1;i++)out[i]=(src[i-1]+2*src[i]+src[i+1])/4;
    }
    return out;
  }

  // Find where a horizontal water plane meets the terrain. Unlike the P2
  // implementation, the water vertex itself never climbs the bank. This keeps
  // every cross-section flat and prevents giant blue triangular facets.
  function shorelineDistance(point,nx,nz,sign,maxHalf,waterY){
    const groundAt=d=>terrainHeight(point.x+nx*d*sign,point.z+nz*d*sign);
    if(!Number.isFinite(groundAt(maxHalf))||groundAt(maxHalf)<=waterY+.02)return maxHalf;

    let lo=0,hi=maxHalf;
    for(let i=0;i<8;i++){
      const mid=(lo+hi)*.5;
      if(groundAt(mid)>waterY+.02)hi=mid;
      else lo=mid;
    }
    return Math.max(1.2,(lo+hi)*.5);
  }

  function addWaterRibbon(points,width,material){
    if(points.length<2)return null;
    const offset=getWorldOffset();
    const maxHalf=Math.max(2,width*.5);
    const levels=smoothProfile(points.map(p=>terrainHeight(p.x,p.z)+.045));
    const positions=[];
    const indices=[];

    for(let i=0;i<points.length;i++){
      const p=points[i];
      const prev=points[Math.max(0,i-1)];
      const next=points[Math.min(points.length-1,i+1)];
      const dx=next.x-prev.x,dz=next.z-prev.z;
      const len=Math.hypot(dx,dz)||1;
      const nx=-dz/len,nz=dx/len;
      const y=levels[i];
      const left=shorelineDistance(p,nx,nz,1,maxHalf,y);
      const right=shorelineDistance(p,nx,nz,-1,maxHalf,y);

      positions.push(
        p.x+nx*left-offset.x,y,p.z+nz*left-offset.z,
        p.x-offset.x,y,p.z-offset.z,
        p.x-nx*right-offset.x,y,p.z-nz*right-offset.z
      );

      if(i<points.length-1){
        const a=i*3,b=a+3;
        indices.push(
          a,b,a+1,
          b,b+1,a+1,
          a+1,b+1,a+2,
          b+1,b+2,a+2
        );
      }
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.renderOrder=2;
    mesh.receiveShadow=false;
    return mesh;
  }

  function simplify(points,maxPoints=700){
    if(points.length<=maxPoints)return points;
    const step=Math.ceil(points.length/maxPoints),out=[];
    for(let i=0;i<points.length;i+=step)out.push(points[i]);
    return out.length>=3?out:points.slice(0,maxPoints);
  }

  function waterLevel(points){
    const heights=points.map(p=>terrainHeight(p.x,p.z)).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!heights.length)return 0;
    return heights[Math.max(0,Math.min(heights.length-1,Math.floor(heights.length*.18)))]+.045;
  }

  function addWaterPolygon(input){
    if(input.length<3)return null;
    const points=simplify(input),offset=getWorldOffset(),level=waterLevel(points);
    const shape=new THREE.Shape();
    shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));
    shape.closePath();

    let geometry;
    try{
      geometry=new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI/2);
    }catch(error){
      console.warn('Water polygon triangulation failed',error);
      return null;
    }

    const mesh=new THREE.Mesh(geometry,waterMat);
    mesh.position.y=level;
    mesh.renderOrder=2;
    mesh.receiveShadow=false;
    return mesh;
  }

  function rebuildCoastalWater(){
    if(!coastlineFeatures.length)return 0;
    const offset=getWorldOffset(),radius2=2200*2200,coastWidth=3400;
    let shown=0;

    for(const feature of coastlineFeatures){
      const raw=feature.points||[];
      if(raw.length<2)continue;
      if(!raw.some(p=>{const dx=p.x-offset.x,dz=p.z-offset.z;return dx*dx+dz*dz<radius2;}))continue;
      const pts=simplify(raw,500),level=waterLevel(pts),positions=[],indices=[];

      for(let i=0;i<pts.length;i++){
        const p=pts[i],prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)];
        const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
        let nx=-dz/len,nz=dx/len;
        const probe=180;
        if(terrainHeight(p.x+nx*probe,p.z+nz*probe)>terrainHeight(p.x-nx*probe,p.z-nz*probe)){nx=-nx;nz=-nz;}

        // Both shoreline and offshore vertices stay on the water plane. Terrain
        // intersects/occludes the shoreline naturally instead of creating a ramp.
        positions.push(
          p.x-offset.x,level,p.z-offset.z,
          p.x-offset.x+nx*coastWidth,level,p.z-offset.z+nz*coastWidth
        );
        if(i<pts.length-1){
          const a=i*2;
          indices.push(a,a+2,a+1,a+2,a+3,a+1);
        }
      }

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,coastWaterMat);
      mesh.renderOrder=1;
      mesh.receiveShadow=false;
      group.add(mesh);
      shown++;
    }
    return shown;
  }

  function rebuild(){
    clear();
    const offset=getWorldOffset(),radius2=1650*1650;
    let shown=0;
    rebuildCoastalWater();

    for(const feature of waterFeatures){
      if(!(feature.points||[]).some(p=>{const dx=p.x-offset.x,dz=p.z-offset.z;return dx*dx+dz*dz<radius2;}))continue;
      const mesh=feature.kind==='polygon'
        ?addWaterPolygon(feature.points)
        :addWaterRibbon(feature.points,waterWidth(feature.tags),feature.tags?.waterway==='river'?riverMat:waterMat);
      if(mesh){group.add(mesh);shown++;}
    }

    if(shown&&statusEl)statusEl.textContent=`${shown} éléments`;
    return shown;
  }

  loadForestWaterAssets().then(value=>{
    assets=value;
    applyAuthoredWaterStyle();
    if(group.children.length)rebuild();
  });

  return {rebuild,clear};
}

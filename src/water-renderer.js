import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';

export function createWaterRenderer({THREE,group,statusEl,waterFeatures,coastlineFeatures,materials,terrainHeight,getWorldOffset,waterWidth,buildRibbon}){
  if(!THREE||!group)throw new Error('Water renderer requires THREE/group');
  const {waterMat,riverMat,coastWaterMat}=materials;
  let assets=getForestWaterAssets();
  let styledWaterMat=waterMat;
  let styledRiverMat=riverMat;
  let styledCoastMat=coastWaterMat;
  void buildRibbon;

  function copyStencil(from,to){
    for(const key of ['stencilWrite','stencilRef','stencilFunc','stencilFail','stencilZFail','stencilZPass']){
      if(key in from)to[key]=from[key];
    }
  }

  function styleFromGlb(base){
    const template=assets?.waterMaterial;
    if(!template)return base;
    const material=base.clone();
    if('roughness' in material&&Number.isFinite(template.roughness))material.roughness=template.roughness;
    if('metalness' in material&&Number.isFinite(template.metalness))material.metalness=template.metalness;
    material.transparent=true;
    material.depthWrite=false;
    material.opacity=Math.min(.88,Math.max(.66,Number(template.opacity)||material.opacity||.8));
    copyStencil(base,material);
    return material;
  }

  function refreshStyledMaterials(){
    styledWaterMat=styleFromGlb(waterMat);
    styledRiverMat=styleFromGlb(riverMat);
    styledCoastMat=styleFromGlb(coastWaterMat);
  }

  function disposeObject(object){
    object.traverse?.(child=>child.geometry?.dispose?.());
  }
  function clear(){while(group.children.length){const child=group.children.pop();disposeObject(child);}}

  function smooth(values){
    let src=values.slice();
    for(let pass=0;pass<2;pass++){
      const out=src.slice();
      for(let i=1;i<src.length-1;i++)out[i]=(src[i-1]+2*src[i]+src[i+1])/4;
      src=out;
    }
    return src;
  }

  // Five vertices per cross-section: terrain-contact bank, inner water edge,
  // centre, inner water edge, terrain-contact bank. This keeps the visible
  // water surface smooth while guaranteeing that both shores touch terrain.
  function addWaterRibbon(points,width,material){
    if(points.length<2)return null;
    const offset=getWorldOffset();
    const half=Math.max(2,width*.5);
    const innerHalf=half*.82;
    const rawCenter=points.map(p=>terrainHeight(p.x,p.z)+.035);
    const centers=smooth(rawCenter);
    const pos=[];
    const idx=[];

    for(let i=0;i<points.length;i++){
      const p=points[i];
      const prev=points[Math.max(0,i-1)];
      const next=points[Math.min(points.length-1,i+1)];
      const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
      const nx=-dz/len,nz=dx/len;

      const bankLX=p.x+nx*half,bankLZ=p.z+nz*half;
      const bankRX=p.x-nx*half,bankRZ=p.z-nz*half;
      const innerLX=p.x+nx*innerHalf,innerLZ=p.z+nz*innerHalf;
      const innerRX=p.x-nx*innerHalf,innerRZ=p.z-nz*innerHalf;
      const bankL=terrainHeight(bankLX,bankLZ)+.018;
      const bankR=terrainHeight(bankRX,bankRZ)+.018;
      const channel=Math.min(centers[i],bankL+.08,bankR+.08);

      pos.push(
        bankLX-offset.x,bankL,bankLZ-offset.z,
        innerLX-offset.x,channel,innerLZ-offset.z,
        p.x-offset.x,channel,p.z-offset.z,
        innerRX-offset.x,channel,innerRZ-offset.z,
        bankRX-offset.x,bankR,bankRZ-offset.z
      );

      if(i<points.length-1){
        const a=i*5,b=a+5;
        for(let strip=0;strip<4;strip++){
          idx.push(a+strip,b+strip,a+strip+1,b+strip,b+strip+1,a+strip+1);
        }
      }
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geometry.setIndex(idx);
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
    return heights[Math.max(0,Math.min(heights.length-1,Math.floor(heights.length*.18)))]+.035;
  }

  function addShoreSkirt(points,level,material){
    const offset=getWorldOffset(),positions=[],indices=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],ground=terrainHeight(p.x,p.z)+.012;
      positions.push(
        p.x-offset.x,level,p.z-offset.z,
        p.x-offset.x,ground,p.z-offset.z
      );
      const n=(i+1)%points.length,a=i*2,b=n*2;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const skirt=new THREE.Mesh(geometry,material);
    skirt.renderOrder=1;
    skirt.receiveShadow=false;
    return skirt;
  }

  function addWaterPolygon(input){
    if(input.length<3)return null;
    const points=simplify(input),offset=getWorldOffset(),level=waterLevel(points),shape=new THREE.Shape();
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

    const container=new THREE.Group();
    const mesh=new THREE.Mesh(geometry,styledWaterMat);
    mesh.position.y=level;
    mesh.renderOrder=2;
    mesh.receiveShadow=false;
    container.add(mesh,addShoreSkirt(points,level,styledWaterMat));
    return container;
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
        const shoreY=terrainHeight(p.x,p.z)+.015;
        positions.push(
          p.x-offset.x,shoreY,p.z-offset.z,
          p.x-offset.x+nx*coastWidth,level,p.z-offset.z+nz*coastWidth
        );
        if(i<pts.length-1){const a=i*2;indices.push(a,a+2,a+1,a+2,a+3,a+1);}
      }

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,styledCoastMat);
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
      let mesh=null;
      if(feature.kind==='polygon'){
        mesh=addWaterPolygon(feature.points);
      }else{
        mesh=addWaterRibbon(
          feature.points,
          waterWidth(feature.tags),
          feature.tags?.waterway==='river'?styledRiverMat:styledWaterMat
        );
      }
      if(mesh){group.add(mesh);shown++;}
    }

    if(shown&&statusEl)statusEl.textContent=`${shown} éléments`;
    return shown;
  }

  refreshStyledMaterials();
  loadForestWaterAssets().then(value=>{
    assets=value;
    refreshStyledMaterials();
    if(group.children.length)rebuild();
  });

  return {rebuild,clear};
}

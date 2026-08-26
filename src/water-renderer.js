import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';

export function createWaterRenderer({THREE,group,statusEl,waterFeatures,coastlineFeatures,materials,terrainHeight,getWorldOffset,waterWidth,buildRibbon}){
  if(!THREE||!group)throw new Error('Water renderer requires THREE/group');
  const {waterMat,riverMat,coastWaterMat}=materials;
  let assets=getForestWaterAssets();
  const rippleMaterial=new THREE.MeshBasicMaterial({color:0xaedfff,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});

  function disposeObject(object){object.traverse?.(child=>{if(!child.userData?.sharedWaterGeometry)child.geometry?.dispose?.();});}
  function clear(){while(group.children.length){const child=group.children.pop();disposeObject(child);}}

  function smooth(values){
    const out=values.slice();
    for(let pass=0;pass<2;pass++)for(let i=1;i<out.length-1;i++)out[i]=(values[i-1]+2*values[i]+values[i+1])/4;
    return out;
  }

  function addWaterRibbon(points,width,material){
    if(points.length<2)return null;const offset=getWorldOffset(),half=Math.max(2,width*.5),centers=smooth(points.map(p=>terrainHeight(p.x,p.z)+.035));const pos=[],idx=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
      const lx=p.x+nx*half,lz=p.z+nz*half,rx=p.x-nx*half,rz=p.z-nz*half,bankL=terrainHeight(lx,lz)+.025,bankR=terrainHeight(rx,rz)+.025,center=Math.min(centers[i],Math.min(bankL,bankR)+.12);
      pos.push(lx-offset.x,bankL,lz-offset.z,p.x-offset.x,center,p.z-offset.z,rx-offset.x,bankR,rz-offset.z);
      if(i<points.length-1){const a=i*3,b=a+3;idx.push(a,b,a+1,b,a+4,a+1,a+1,a+4,a+2,a+4,a+5,a+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setIndex(idx);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=2;mesh.receiveShadow=false;
    const container=new THREE.Group();container.add(mesh);addRippleDetails(container,points,width,centers);return container;
  }

  function addRippleDetails(container,points,width,centers){
    const geom=assets?.water;if(!geom||points.length<2)return;const offset=getWorldOffset(),step=Math.max(3,Math.ceil(points.length/18)),samples=[];
    for(let i=0;i<points.length;i+=step)samples.push({p:points[i],y:centers[i]});
    if(!samples.length)return;const inst=new THREE.InstancedMesh(geom,rippleMaterial,samples.length),dummy=new THREE.Object3D();inst.userData.sharedWaterGeometry=true;inst.renderOrder=3;
    samples.forEach((s,i)=>{const scale=Math.max(.08,Math.min(.34,width/100));dummy.position.set(s.p.x-offset.x,s.y+.018,s.p.z-offset.z);dummy.rotation.set(0,(i*.91)%Math.PI,0);dummy.scale.set(scale,scale,scale);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});inst.instanceMatrix.needsUpdate=true;container.add(inst);
  }

  function simplify(points,maxPoints=700){if(points.length<=maxPoints)return points;const step=Math.ceil(points.length/maxPoints),out=[];for(let i=0;i<points.length;i+=step)out.push(points[i]);return out.length>=3?out:points.slice(0,maxPoints);}

  function waterLevel(points){
    const heights=points.map(p=>terrainHeight(p.x,p.z)).filter(Number.isFinite).sort((a,b)=>a-b);if(!heights.length)return 0;return heights[Math.max(0,Math.min(heights.length-1,Math.floor(heights.length*.18)))]+.035;
  }

  function addShoreSkirt(points,level,material){
    const offset=getWorldOffset(),positions=[],indices=[];
    for(let i=0;i<points.length;i++){const p=points[i],ground=terrainHeight(p.x,p.z)+.015;positions.push(p.x-offset.x,level,p.z-offset.z,p.x-offset.x,ground,p.z-offset.z);const n=(i+1)%points.length,a=i*2,b=n*2;indices.push(a,b,a+1,b,b+1,a+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const skirt=new THREE.Mesh(geometry,material);skirt.renderOrder=1;skirt.receiveShadow=false;return skirt;
  }

  function addWaterPolygon(input){
    if(input.length<3)return null;const points=simplify(input),offset=getWorldOffset(),level=waterLevel(points),shape=new THREE.Shape();shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));shape.closePath();let geometry;try{geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);}catch(error){console.warn('Water polygon triangulation failed',error);return null;}
    const container=new THREE.Group(),mesh=new THREE.Mesh(geometry,waterMat);mesh.position.y=level;mesh.renderOrder=2;mesh.receiveShadow=false;container.add(mesh,addShoreSkirt(points,level,waterMat));
    if(assets?.water){const c=points.reduce((a,p)=>({x:a.x+p.x/points.length,z:a.z+p.z/points.length}),{x:0,z:0}),detail=new THREE.Mesh(assets.water,rippleMaterial);detail.userData.sharedWaterGeometry=true;detail.position.set(c.x-offset.x,level+.018,c.z-offset.z);let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}const sx=Math.max(.1,Math.min(1.8,(maxx-minx)/48)),sz=Math.max(.1,Math.min(1.8,(maxz-minz)/48));detail.scale.set(sx,1,sz);detail.renderOrder=3;container.add(detail);}
    return container;
  }

  function rebuildCoastalWater(){
    if(!coastlineFeatures.length)return 0;const offset=getWorldOffset(),radius2=2200*2200,coastWidth=3400;let shown=0;
    for(const feature of coastlineFeatures){const raw=feature.points||[];if(raw.length<2)continue;if(!raw.some(p=>{const dx=p.x-offset.x,dz=p.z-offset.z;return dx*dx+dz*dz<radius2;}))continue;const pts=simplify(raw,500),level=waterLevel(pts),positions=[],indices=[];
      for(let i=0;i<pts.length;i++){const p=pts[i],prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;let nx=-dz/len,nz=dx/len;const probe=180;if(terrainHeight(p.x+nx*probe,p.z+nz*probe)>terrainHeight(p.x-nx*probe,p.z-nz*probe)){nx=-nx;nz=-nz;}const shoreY=terrainHeight(p.x,p.z)+.02;positions.push(p.x-offset.x,shoreY,p.z-offset.z,p.x-offset.x+nx*coastWidth,level,p.z-offset.z+nz*coastWidth);if(i<pts.length-1){const a=i*2;indices.push(a,a+2,a+1,a+2,a+3,a+1);}}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,coastWaterMat);mesh.renderOrder=1;mesh.receiveShadow=false;group.add(mesh);shown++;}
    return shown;
  }

  function rebuild(){
    clear();const offset=getWorldOffset(),radius2=1650*1650;let shown=0;rebuildCoastalWater();
    for(const feature of waterFeatures){if(!(feature.points||[]).some(p=>{const dx=p.x-offset.x,dz=p.z-offset.z;return dx*dx+dz*dz<radius2;}))continue;let mesh;if(feature.kind==='polygon')mesh=addWaterPolygon(feature.points);else mesh=addWaterRibbon(feature.points,waterWidth(feature.tags),feature.tags?.waterway==='river'?riverMat:waterMat);if(mesh){group.add(mesh);shown++;}}
    if(shown&&statusEl)statusEl.textContent=`${shown} éléments`;return shown;
  }

  loadForestWaterAssets().then(value=>{assets=value;if(group.children.length)rebuild();});
  return {rebuild,clear};
}

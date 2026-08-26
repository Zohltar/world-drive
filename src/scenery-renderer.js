import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';

export function createSceneryRenderer({THREE,statusEl,features,terrainDetailGroup,infrastructureGroup,buildingGroup,forestGroup,materials,featureCentroid,terrainHeight,nearestRoute,isWaterAt,pointInPolygon,getWorldOffset}){
  if(!THREE)throw new Error('Scenery renderer requires THREE');
  const {buildingWallMat,rockMat,scrubMat,towerMat,lineMatPower,railMat,damMat,treeTrunkMat,treeMat}=materials;
  let forestAssets=getForestWaterAssets();
  let rebuildingFromAsset=false;

  function disposeObject(object){
    object.traverse?.(child=>{
      if(child.userData?.sharedForestGeometry)return;
      child.geometry?.dispose?.();
    });
  }
  function clearGroup(group){while(group.children.length){const child=group.children.pop();disposeObject(child);}}
  function clear(){clearGroup(terrainDetailGroup);clearGroup(infrastructureGroup);clearGroup(buildingGroup);clearGroup(forestGroup);}

  function makeFootprintMesh(points,height=6,material=buildingWallMat){
    if(points.length<3)return null;const offset=getWorldOffset();const shape=new THREE.Shape();
    const first=points[0];shape.moveTo(first.x-offset.x,-(first.z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
    const c=featureCentroid(points),mesh=new THREE.Mesh(geometry,material);mesh.position.y=terrainHeight(c.x,c.z)+.08;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  function addUtilityTower(x,z,scale=1){
    const offset=getWorldOffset(),group=new THREE.Group(),y=terrainHeight(x,z);
    for(const sx of [-1,1])for(const sz of [-1,1]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,10*scale,5),towerMat);leg.position.set(x-offset.x+sx*.9*scale,y+5*scale,z-offset.z+sz*.7*scale);leg.rotation.z=sx*.06;group.add(leg);}
    for(const h of [4,7.2,9.2]){const bar=new THREE.Mesh(new THREE.BoxGeometry(5.2*scale,.12,.12),towerMat);bar.position.set(x-offset.x,y+h*scale,z-offset.z);group.add(bar);}return group;
  }
  function addDam(points){
    if(points.length<2)return null;const offset=getWorldOffset(),group=new THREE.Group();
    for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1)continue;const h=14,mesh=new THREE.Mesh(new THREE.BoxGeometry(6,h,len),damMat),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;mesh.position.set(mx-offset.x,Math.min(terrainHeight(a.x,a.z),terrainHeight(b.x,b.z))+h/2,mz-offset.z);mesh.rotation.y=Math.atan2(dx,dz);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}return group;
  }
  function addGuardRail(points){
    const offset=getWorldOffset(),group=new THREE.Group();for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.5)continue;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),railMat),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;mesh.position.set(mx-offset.x,terrainHeight(mx,mz)+.72,mz-offset.z);mesh.rotation.y=Math.atan2(dx,dz);group.add(mesh);}return group;
  }
  function addPowerLine(points){
    const group=new THREE.Group();if(points.length<2)return group;const offset=getWorldOffset(),vertices=[];for(const p of points)vertices.push(p.x-offset.x,terrainHeight(p.x,p.z)+14,p.z-offset.z);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));group.add(new THREE.Line(geometry,lineMatPower));return group;
  }
  function addLandPatch(points,material,yOffset=.03){
    if(points.length<3)return null;const offset=getWorldOffset(),shape=new THREE.Shape();shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));shape.closePath();const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);const c=featureCentroid(points),mesh=new THREE.Mesh(geometry,material);mesh.position.y=terrainHeight(c.x,c.z)+yOffset;mesh.receiveShadow=true;return mesh;
  }

  function forestPlacements(points,id,dist){
    const center=featureCentroid(points);let seed=(Number(id)||1)*2654435761;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const radius=Math.min(220,Math.max(40,Math.sqrt(points.length)*28));const target=dist>800?24:dist>450?42:64;const out=[[],[],[]];
    for(let i=0;i<target*3&&out[0].length+out[1].length+out[2].length<target;i++){
      const a=random()*Math.PI*2,r=Math.sqrt(random())*radius,x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r;
      if(!pointInPolygon(x,z,points)||isWaterAt(x,z,6))continue;const nr=nearestRoute(x,z);if(nr&&nr.d<14)continue;
      const variant=Math.floor(random()*3)%3;out[variant].push({x,z,y:terrainHeight(x,z),scale:.42+random()*.28,rot:random()*Math.PI*2});
    }
    return out;
  }

  function makeInstancedForest(points,id,dist){
    const assets=forestAssets?.trees||[];if(!assets.length)return null;const placements=forestPlacements(points,id,dist),offset=getWorldOffset(),group=new THREE.Group();const dummy=new THREE.Object3D();
    for(let v=0;v<Math.min(assets.length,placements.length);v++){
      const list=placements[v];if(!list.length)continue;const def=assets[v];
      const bark=new THREE.InstancedMesh(def.bark,treeTrunkMat,list.length),leaves=new THREE.InstancedMesh(def.leaves,treeMat,list.length);
      bark.userData.sharedForestGeometry=true;leaves.userData.sharedForestGeometry=true;bark.castShadow=dist<650;leaves.castShadow=dist<500;bark.receiveShadow=false;leaves.receiveShadow=false;
      list.forEach((p,i)=>{dummy.position.set(p.x-offset.x,p.y,p.z-offset.z);dummy.rotation.set(0,p.rot,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();bark.setMatrixAt(i,dummy.matrix);leaves.setMatrixAt(i,dummy.matrix);});
      bark.instanceMatrix.needsUpdate=true;leaves.instanceMatrix.needsUpdate=true;group.add(bark,leaves);
    }
    return group;
  }

  function makeFallbackForest(points,id,dist){
    const center=featureCentroid(points),offset=getWorldOffset(),group=new THREE.Group();let seed=(Number(id)||1)*2654435761;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const count=dist>700?12:20;
    for(let i=0;i<count;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*120,x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r;if(!pointInPolygon(x,z,points)||isWaterAt(x,z,6))continue;const nr=nearestRoute(x,z);if(nr&&nr.d<13)continue;const s=.7+random()*.6,y=terrainHeight(x,z),trunk=new THREE.Mesh(new THREE.CylinderGeometry(.10*s,.16*s,1.5*s,5),treeTrunkMat),crown=new THREE.Mesh(new THREE.ConeGeometry(.78*s,3.2*s,6),treeMat);trunk.position.set(x-offset.x,y+.75*s,z-offset.z);crown.position.set(x-offset.x,y+2.25*s,z-offset.z);group.add(trunk,crown);}return group;
  }

  function makeBuildingLOD(points,tags,dist){
    if(dist<520){let height=parseFloat(tags.height||'');if(!Number.isFinite(height)){const levels=parseFloat(tags['building:levels']||'');height=Number.isFinite(levels)?Math.max(3,levels*3.1):6.5;}return makeFootprintMesh(points,Math.min(45,height));}
    const c=featureCentroid(points);let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}const width=Math.max(3,Math.min(35,maxx-minx)),depth=Math.max(3,Math.min(35,maxz-minz)),height=Math.max(4,Math.min(18,parseFloat(tags.height||'')||7)),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),buildingWallMat),offset=getWorldOffset();mesh.position.set(c.x-offset.x,terrainHeight(c.x,c.z)+height/2,c.z-offset.z);mesh.castShadow=dist<750;mesh.receiveShadow=true;return mesh;
  }

  function rebuild(){
    clear();const offset=getWorldOffset(),radius2=1500*1500;let shown=0;
    for(const feature of features){const center=featureCentroid(feature.points),dx=center.x-offset.x,dz=center.z-offset.z,dist2=dx*dx+dz*dz;if(dist2>radius2)continue;const dist=Math.sqrt(dist2),tags=feature.tags||{};let object=null;
      if(tags.building&&dist<1150){object=makeBuildingLOD(feature.points,tags,dist);if(object)buildingGroup.add(object);}
      else if((tags.power==='tower'||tags.power==='pole')&&dist<1400)infrastructureGroup.add(addUtilityTower(center.x,center.z,tags.power==='pole'?.6:1));
      else if(tags.power==='line'||tags.power==='minor_line')infrastructureGroup.add(addPowerLine(feature.points));
      else if(tags.man_made==='dam'||tags.waterway==='dam'){object=addDam(feature.points);if(object)infrastructureGroup.add(object);}
      else if(tags.barrier==='guard_rail')infrastructureGroup.add(addGuardRail(feature.points));
      else if(tags.natural==='bare_rock'||tags.natural==='scree'||tags.natural==='cliff'){object=addLandPatch(feature.points,rockMat,.04);if(object)terrainDetailGroup.add(object);}
      else if(tags.natural==='scrub'||tags.landuse==='meadow'){object=addLandPatch(feature.points,scrubMat,.035);if(object)terrainDetailGroup.add(object);}
      else if((tags.natural==='wood'||tags.landuse==='forest')&&dist<1150){const cluster=makeInstancedForest(feature.points,feature.id,dist)||makeFallbackForest(feature.points,feature.id,dist);if(cluster)forestGroup.add(cluster);}
      shown++;
    }
    if(statusEl)statusEl.textContent=`${shown} objets`;return shown;
  }

  function removeTreesOverWater(){return 0;}

  loadForestWaterAssets().then(asset=>{forestAssets=asset;if(asset?.trees?.length&&!rebuildingFromAsset){rebuildingFromAsset=true;try{rebuild();}finally{rebuildingFromAsset=false;}}});
  return {rebuild,clear,removeTreesOverWater};
}

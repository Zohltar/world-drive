import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';

export function createSceneryRenderer({THREE,statusEl,features,terrainDetailGroup,infrastructureGroup,buildingGroup,forestGroup,materials,featureCentroid,terrainHeight,nearestRoute,isWaterAt,pointInPolygon,getWorldOffset}){
  if(!THREE)throw new Error('Scenery renderer requires THREE');
  const {buildingWallMat,rockMat,scrubMat,towerMat,lineMatPower,railMat,damMat}=materials;
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
    if(points.length<3)return null;
    const offset=getWorldOffset(),shape=new THREE.Shape();
    shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
    geometry.rotateX(-Math.PI/2);
    const c=featureCentroid(points),mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=terrainHeight(c.x,c.z)+.08;mesh.castShadow=true;mesh.receiveShadow=true;
    return mesh;
  }

  function addUtilityTower(x,z,scale=1){
    const offset=getWorldOffset(),group=new THREE.Group(),y=terrainHeight(x,z);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,10*scale,5),towerMat);
      leg.position.set(x-offset.x+sx*.9*scale,y+5*scale,z-offset.z+sz*.7*scale);leg.rotation.z=sx*.06;group.add(leg);
    }
    for(const h of [4,7.2,9.2]){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(5.2*scale,.12,.12),towerMat);
      bar.position.set(x-offset.x,y+h*scale,z-offset.z);group.add(bar);
    }
    return group;
  }

  function addDam(points){
    if(points.length<2)return null;
    const offset=getWorldOffset(),group=new THREE.Group();
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1)continue;
      const h=14,mesh=new THREE.Mesh(new THREE.BoxGeometry(6,h,len),damMat),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      mesh.position.set(mx-offset.x,Math.min(terrainHeight(a.x,a.z),terrainHeight(b.x,b.z))+h/2,mz-offset.z);
      mesh.rotation.y=Math.atan2(dx,dz);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    return group;
  }

  function addGuardRail(points){
    const offset=getWorldOffset(),group=new THREE.Group();
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.5)continue;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),railMat),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      mesh.position.set(mx-offset.x,terrainHeight(mx,mz)+.72,mz-offset.z);mesh.rotation.y=Math.atan2(dx,dz);group.add(mesh);
    }
    return group;
  }

  function addPowerLine(points){
    const group=new THREE.Group();if(points.length<2)return group;
    const offset=getWorldOffset(),vertices=[];
    for(const p of points)vertices.push(p.x-offset.x,terrainHeight(p.x,p.z)+14,p.z-offset.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    group.add(new THREE.Line(geometry,lineMatPower));return group;
  }

  function addLandPatch(points,material,yOffset=.03){
    if(points.length<3)return null;
    const offset=getWorldOffset(),shape=new THREE.Shape();shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));shape.closePath();
    const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
    const c=featureCentroid(points),mesh=new THREE.Mesh(geometry,material);mesh.position.y=terrainHeight(c.x,c.z)+yOffset;mesh.receiveShadow=true;return mesh;
  }

  function seededRandom(seedValue){let seed=(seedValue>>>0)||1;return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

  function terrainSlope(x,z){
    const d=7,hx=terrainHeight(x+d,z)-terrainHeight(x-d,z),hz=terrainHeight(x,z+d)-terrainHeight(x,z-d);
    return Math.hypot(hx,hz)/(d*2);
  }

  function blocksForest(x,z){
    for(const feature of features){
      const tags=feature.tags||{};
      const blocked=tags.building||['residential','commercial','industrial','retail','farmland'].includes(tags.landuse)||['bare_rock','scree'].includes(tags.natural);
      if(!blocked||!Array.isArray(feature.points)||feature.points.length<3)continue;
      if(pointInPolygon(x,z,feature.points))return true;
    }
    return false;
  }

  function validTreePoint(x,z){
    if(isWaterAt(x,z,9))return null;
    const nr=nearestRoute(x,z);
    if(!nr||nr.d<23||nr.d>215)return null;
    if(terrainSlope(x,z)>.62)return null;
    if(blocksForest(x,z))return null;
    return nr;
  }

  function addPlacement(list,x,z,random){
    const nr=validTreePoint(x,z);if(!nr)return false;
    // Spend the visual budget where the driver can actually see it.
    const chance=nr.d<105?.92:nr.d<155?.58:.22;
    if(random()>chance)return false;
    list.push({x,z,y:terrainHeight(x,z),height:8.0+random()*7.0,rot:random()*Math.PI*2});
    return true;
  }

  function collectMappedForest(points,id,list){
    const center=featureCentroid(points),random=seededRandom((Number(id)||1)*2654435761);
    const radius=Math.min(190,Math.max(35,Math.sqrt(points.length)*26));
    let accepted=0;
    for(let i=0;i<360&&accepted<95;i++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*radius,x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
      if(!pointInPolygon(x,z,points))continue;
      if(addPlacement(list,x,z,random))accepted++;
    }
  }

  function collectRoadsideForest(list,hasMappedForest){
    const offset=getWorldOffset();
    const qx=Math.round(offset.x/90),qz=Math.round(offset.z/90);
    const random=seededRandom(((qx*73856093)^(qz*19349663)^0x70696e65)>>>0);
    const target=hasMappedForest?190:275;
    let accepted=0;

    // Only generate the roughly 450 m neighbourhood around the streamed centre.
    // nearestRoute() then clips that area to a 23..215 m roadside corridor.
    for(let i=0;i<target*10&&accepted<target;i++){
      const angle=random()*Math.PI*2;
      const radius=35+Math.sqrt(random())*420;
      const x=offset.x+Math.cos(angle)*radius,z=offset.z+Math.sin(angle)*radius;
      if(addPlacement(list,x,z,random))accepted++;
    }
  }

  function addForestBatch(list){
    const pine=forestAssets?.pine;
    if(!pine?.geometry||!pine?.material||!list.length)return 0;
    const offset=getWorldOffset(),dummy=new THREE.Object3D();
    const mesh=new THREE.InstancedMesh(pine.geometry,pine.material,list.length);
    mesh.userData.sharedForestGeometry=true;
    mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=true;
    list.forEach((p,i)=>{
      dummy.position.set(p.x-offset.x,p.y+.02,p.z-offset.z);
      dummy.rotation.set(0,p.rot,0);
      dummy.scale.setScalar(p.height);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    forestGroup.add(mesh);
    return list.length;
  }

  function makeBuildingLOD(points,tags,dist){
    if(dist<520){
      let height=parseFloat(tags.height||'');if(!Number.isFinite(height)){const levels=parseFloat(tags['building:levels']||'');height=Number.isFinite(levels)?Math.max(3,levels*3.1):6.5;}
      return makeFootprintMesh(points,Math.min(45,height));
    }
    const c=featureCentroid(points);let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}
    const width=Math.max(3,Math.min(35,maxx-minx)),depth=Math.max(3,Math.min(35,maxz-minz)),height=Math.max(4,Math.min(18,parseFloat(tags.height||'')||7));
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),buildingWallMat),offset=getWorldOffset();
    mesh.position.set(c.x-offset.x,terrainHeight(c.x,c.z)+height/2,c.z-offset.z);mesh.castShadow=dist<750;mesh.receiveShadow=true;return mesh;
  }

  function rebuild(){
    clear();
    const offset=getWorldOffset(),radius2=1500*1500,placements=[];
    let shown=0,mappedForestCount=0;
    for(const feature of features){
      const center=featureCentroid(feature.points),dx=center.x-offset.x,dz=center.z-offset.z,dist2=dx*dx+dz*dz;if(dist2>radius2)continue;
      const dist=Math.sqrt(dist2),tags=feature.tags||{};let object=null;
      if(tags.building&&dist<1150){object=makeBuildingLOD(feature.points,tags,dist);if(object)buildingGroup.add(object);}
      else if((tags.power==='tower'||tags.power==='pole')&&dist<1400)infrastructureGroup.add(addUtilityTower(center.x,center.z,tags.power==='pole'?.6:1));
      else if(tags.power==='line'||tags.power==='minor_line')infrastructureGroup.add(addPowerLine(feature.points));
      else if(tags.man_made==='dam'||tags.waterway==='dam'){object=addDam(feature.points);if(object)infrastructureGroup.add(object);}
      else if(tags.barrier==='guard_rail')infrastructureGroup.add(addGuardRail(feature.points));
      else if(tags.natural==='bare_rock'||tags.natural==='scree'||tags.natural==='cliff'){object=addLandPatch(feature.points,rockMat,.04);if(object)terrainDetailGroup.add(object);}
      else if(tags.natural==='scrub'||tags.landuse==='meadow'){object=addLandPatch(feature.points,scrubMat,.035);if(object)terrainDetailGroup.add(object);}
      else if((tags.natural==='wood'||tags.landuse==='forest')&&dist<700){collectMappedForest(feature.points,feature.id,placements);mappedForestCount++;}
      shown++;
    }

    if(forestAssets?.pine){
      collectRoadsideForest(placements,mappedForestCount>0);
      const treeCount=addForestBatch(placements);
      if(statusEl)statusEl.textContent=`${shown} objets · ${treeCount} pins proches`;
    }else if(statusEl)statusEl.textContent=`${shown} objets · pins en chargement`;
    return shown;
  }

  function removeTreesOverWater(){return 0;}

  loadForestWaterAssets().then(asset=>{
    forestAssets=asset;
    if(asset?.pine&&!rebuildingFromAsset){rebuildingFromAsset=true;try{rebuild();}finally{rebuildingFromAsset=false;}}
  });
  return {rebuild,clear,removeTreesOverWater};
}

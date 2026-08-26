import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';
import {createForestChunkStreamer} from './forest-chunk-streamer.js';

export function createSceneryRenderer({
  THREE,statusEl,features,terrainDetailGroup,infrastructureGroup,buildingGroup,
  forestGroup,materials,featureCentroid,terrainHeight,nearestRoute,isWaterAt,
  pointInPolygon,getWorldOffset
}){
  if(!THREE)throw new Error('Scenery renderer requires THREE');

  const {
    buildingWallMat,rockMat,scrubMat,towerMat,lineMatPower,railMat,damMat
  }=materials;

  let forestAssets=getForestWaterAssets();
  let forestAssetsActivated=false;
  let sceneryReadyForForest=false;
  let forestBlockers=[];
  let blockerSignature='';
  let lastShown=0;
  let lastForestStats={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};

  function disposeObject(object){
    object.traverse?.(child=>{
      if(child.userData?.sharedForestGeometry)return;
      child.geometry?.dispose?.();
    });
  }

  function clearGroup(group){
    while(group.children.length){
      const child=group.children.pop();
      disposeObject(child);
    }
  }

  function makeFootprintMesh(points,height=6,material=buildingWallMat){
    if(points.length<3)return null;
    const offset=getWorldOffset();
    const shape=new THREE.Shape();
    const first=points[0];
    shape.moveTo(first.x-offset.x,-(first.z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
    geometry.rotateX(-Math.PI/2);
    const c=featureCentroid(points);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=terrainHeight(c.x,c.z)+.08;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    return mesh;
  }

  function addUtilityTower(x,z,scale=1){
    const offset=getWorldOffset();
    const group=new THREE.Group();
    const y=terrainHeight(x,z);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,10*scale,5),towerMat);
      leg.position.set(x-offset.x+sx*.9*scale,y+5*scale,z-offset.z+sz*.7*scale);
      leg.rotation.z=sx*.06;
      group.add(leg);
    }
    for(const h of [4,7.2,9.2]){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(5.2*scale,.12,.12),towerMat);
      bar.position.set(x-offset.x,y+h*scale,z-offset.z);
      group.add(bar);
    }
    return group;
  }

  function addDam(points){
    if(points.length<2)return null;
    const offset=getWorldOffset();
    const group=new THREE.Group();
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<1)continue;
      const h=14;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(6,h,len),damMat);
      const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      mesh.position.set(
        mx-offset.x,
        Math.min(terrainHeight(a.x,a.z),terrainHeight(b.x,b.z))+h/2,
        mz-offset.z
      );
      mesh.rotation.y=Math.atan2(dx,dz);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      group.add(mesh);
    }
    return group;
  }

  function addGuardRail(points){
    const offset=getWorldOffset();
    const group=new THREE.Group();
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<.5)continue;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),railMat);
      const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      mesh.position.set(mx-offset.x,terrainHeight(mx,mz)+.72,mz-offset.z);
      mesh.rotation.y=Math.atan2(dx,dz);
      group.add(mesh);
    }
    return group;
  }

  function addPowerLine(points){
    const group=new THREE.Group();
    if(points.length<2)return group;
    const offset=getWorldOffset();
    const vertices=[];
    for(const p of points)vertices.push(p.x-offset.x,terrainHeight(p.x,p.z)+14,p.z-offset.z);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    group.add(new THREE.Line(geometry,lineMatPower));
    return group;
  }

  function addLandPatch(points,material,yOffset=.03){
    if(points.length<3)return null;
    const offset=getWorldOffset();
    const shape=new THREE.Shape();
    shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));
    for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));
    shape.closePath();
    const geometry=new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);
    const c=featureCentroid(points);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=terrainHeight(c.x,c.z)+yOffset;
    mesh.receiveShadow=true;
    return mesh;
  }

  function bboxForPoints(points){
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of points){
      minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);
      minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);
    }
    return {minx,maxx,minz,maxz};
  }

  function refreshForestMasks(){
    const next=[];
    for(const feature of features){
      const tags=feature.tags||{};
      const points=feature.points;
      if(!Array.isArray(points)||points.length<3)continue;
      const blocked=
        !!tags.building||
        ['residential','commercial','industrial','retail','farmland','farmyard','meadow','grass','construction','quarry'].includes(tags.landuse)||
        ['bare_rock','scree','sand','beach'].includes(tags.natural);
      if(blocked)next.push({points,bbox:bboxForPoints(points)});
    }
    const signature=next.map(item=>{
      const b=item.bbox;
      return `${Math.round(b.minx/20)},${Math.round(b.minz/20)},${Math.round(b.maxx/20)},${Math.round(b.maxz/20)}`;
    }).join('|');
    const changed=signature!==blockerSignature;
    forestBlockers=next;
    blockerSignature=signature;
    return changed;
  }

  function blocksForest(x,z){
    for(const blocker of forestBlockers){
      const b=blocker.bbox;
      if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
      if(pointInPolygon(x,z,blocker.points))return true;
    }
    return false;
  }

  function updateForestStatus(stats){
    lastForestStats=stats;
    if(statusEl){
      statusEl.textContent=
        `${lastShown} objets · ${stats.trees} arbres · `+
        `${stats.chunks} chunks actifs · cache ${stats.cached}`+
        (stats.queued?` · +${stats.queued}`:'');
    }
  }

  const forestStreamer=createForestChunkStreamer({
    THREE,
    forestGroup,
    getWorldOffset,
    terrainHeight,
    nearestRoute,
    isWaterAt,
    blocksForest,
    onStats:updateForestStatus
  });

  function activateForestAssetsIfReady(){
    if(!sceneryReadyForForest||!forestAssets||forestAssetsActivated)return false;
    forestAssetsActivated=true;
    forestStreamer.setAssets(forestAssets);
    return true;
  }

  function clear(){
    clearGroup(terrainDetailGroup);
    clearGroup(infrastructureGroup);
    clearGroup(buildingGroup);
    // Forest chunks deliberately survive ordinary world/scenery refreshes.
    // The next rebuild invalidates the nearby placement after road/terrain have
    // been rebuilt, so stale startup heights never become permanent cache data.
    refreshForestMasks();
  }

  function clearForestCache(){
    // Route changes are fundamentally different from ordinary floating-origin
    // refreshes: deterministic chunk keys are route/world-space relative, so a
    // cached tree chunk from the previous route must never be reused on the new
    // route. Suspend the streamer until the new route has rebuilt its final
    // road/terrain state, then rebuild from the already-loaded forest asset.
    forestStreamer.setAssets(null);
    forestStreamer.clearAll();
    forestAssetsActivated=false;
    sceneryReadyForForest=false;
    forestBlockers=[];
    blockerSignature='';
    lastForestStats={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};
    return true;
  }

  function makeBuildingLOD(points,tags,dist){
    if(dist<520){
      let height=parseFloat(tags.height||'');
      if(!Number.isFinite(height)){
        const levels=parseFloat(tags['building:levels']||'');
        height=Number.isFinite(levels)?Math.max(3,levels*3.1):6.5;
      }
      return makeFootprintMesh(points,Math.min(45,height));
    }
    const c=featureCentroid(points);
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of points){
      minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);
      minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);
    }
    const width=Math.max(3,Math.min(35,maxx-minx));
    const depth=Math.max(3,Math.min(35,maxz-minz));
    const height=Math.max(4,Math.min(18,parseFloat(tags.height||'')||7));
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),buildingWallMat);
    const offset=getWorldOffset();
    mesh.position.set(c.x-offset.x,terrainHeight(c.x,c.z)+height/2,c.z-offset.z);
    mesh.castShadow=dist<750;
    mesh.receiveShadow=true;
    return mesh;
  }

  function rebuild(){
    clearGroup(terrainDetailGroup);
    clearGroup(infrastructureGroup);
    clearGroup(buildingGroup);

    refreshForestMasks();
    const offset=getWorldOffset();
    const radius2=1500*1500;
    let shown=0;

    for(const feature of features){
      const center=featureCentroid(feature.points);
      const dx=center.x-offset.x,dz=center.z-offset.z;
      const dist2=dx*dx+dz*dz;
      if(dist2>radius2)continue;
      const dist=Math.sqrt(dist2);
      const tags=feature.tags||{};
      let object=null;

      if(tags.building&&dist<1150){
        object=makeBuildingLOD(feature.points,tags,dist);
        if(object)buildingGroup.add(object);
      }else if((tags.power==='tower'||tags.power==='pole')&&dist<1400){
        infrastructureGroup.add(addUtilityTower(center.x,center.z,tags.power==='pole'?.6:1));
      }else if(tags.power==='line'||tags.power==='minor_line'){
        infrastructureGroup.add(addPowerLine(feature.points));
      }else if(tags.man_made==='dam'||tags.waterway==='dam'){
        object=addDam(feature.points);
        if(object)infrastructureGroup.add(object);
      }else if(tags.barrier==='guard_rail'){
        infrastructureGroup.add(addGuardRail(feature.points));
      }else if(tags.natural==='bare_rock'||tags.natural==='scree'||tags.natural==='cliff'){
        object=addLandPatch(feature.points,rockMat,.04);
        if(object)terrainDetailGroup.add(object);
      }else if(tags.natural==='scrub'||tags.landuse==='meadow'){
        object=addLandPatch(feature.points,scrubMat,.035);
        if(object)terrainDetailGroup.add(object);
      }
      shown++;
    }

    lastShown=shown;

    // The first forest build must happen only after local-world-builder has
    // installed the final road profile and synchronously rebuilt the near terrain.
    // Before P9.6, GLB loading could win that race and cache trees against the
    // pre-road terrain forever. Subsequent local rebuilds invalidate ONLY nearby
    // chunks; the expensive distant P9 cache remains intact.
    sceneryReadyForForest=true;
    const activatedNow=activateForestAssetsIfReady();
    if(forestAssetsActivated&&!activatedNow){
      forestStreamer.refreshVisibleHeights();
      forestStreamer.requestUpdate(true);
    }

    if(statusEl){
      if(lastForestStats.trees)updateForestStatus(lastForestStats);
      else statusEl.textContent=`${shown} objets · forêt en chargement`;
    }
    return shown;
  }

  function requestForestRefresh(force=false){
    return forestStreamer.requestUpdate(force);
  }

  function removeTreesOverWater(){return 0;}

  loadForestWaterAssets().then(asset=>{
    forestAssets=asset;
    // Do not let asset-loading timing decide tree heights. If the terrain/road
    // is not ready yet, activation waits for rebuild(); if it is ready, start now.
    activateForestAssetsIfReady();
  }).catch(error=>{
    console.warn('Forest assets failed',error);
  });

  return {
    rebuild,
    clear,
    clearForestCache,
    removeTreesOverWater,
    requestForestRefresh,
    whenInitialForestReady:()=>forestStreamer.whenInitialReady(),
    forestStats:()=>forestStreamer.stats()
  };
}

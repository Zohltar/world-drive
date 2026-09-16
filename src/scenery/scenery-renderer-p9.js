import {loadForestWaterAssets,getForestWaterAssets} from '../forest-water-assets.js';
import {createForestChunkStreamer} from '../forest-chunk-streamer.js';
import {createStaticBoxInstances} from '../rendering/static-box-instances.js';

export {createStaticBoxInstances} from '../rendering/static-box-instances.js';

export function createGuardRailBoxTransforms({
  points=[],terrainHeight,getWorldOffset,maxSpanM=5,overlapM=.14
}={}){
  if(!Array.isArray(points)||points.length<2||typeof terrainHeight!=='function')return [];
  const offset=typeof getWorldOffset==='function'?getWorldOffset():{x:0,z:0};
  const span=Math.max(1,Number(maxSpanM)||5);
  const overlap=Math.max(0,Math.min(.5,Number(overlapM)||0));
  const transforms=[];

  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    const edgeDx=Number(b?.x)-Number(a?.x);
    const edgeDz=Number(b?.z)-Number(a?.z);
    const edgeLength=Math.hypot(edgeDx,edgeDz);
    if(!Number.isFinite(edgeLength)||edgeLength<.5)continue;

    // OSM guard-rail ways can contain long edges. A single horizontal box at
    // their midpoint sinks into rolling terrain and looks like repeated gaps.
    // Short pitched spans sample both endpoints and stay joined over relief.
    const sections=Math.max(1,Math.ceil(edgeLength/span));
    for(let section=0;section<sections;section++){
      const t0=section/sections,t1=(section+1)/sections;
      const x0=a.x+edgeDx*t0,z0=a.z+edgeDz*t0;
      const x1=a.x+edgeDx*t1,z1=a.z+edgeDz*t1;
      const ground0=Number(terrainHeight(x0,z0));
      const ground1=Number(terrainHeight(x1,z1));
      if(!Number.isFinite(ground0)||!Number.isFinite(ground1))continue;
      const y0=ground0+.72,y1=ground1+.72;
      const dx=x1-x0,dy=y1-y0,dz=z1-z0;
      const horizontalLength=Math.hypot(dx,dz);
      const length=Math.hypot(horizontalLength,dy);
      if(!Number.isFinite(length)||length<.25)continue;

      transforms.push({
        x:(x0+x1)/2-(Number(offset?.x)||0),
        y:(y0+y1)/2,
        z:(z0+z1)/2-(Number(offset?.z)||0),
        width:.10,
        height:.18,
        depth:length+overlap,
        pitch:-Math.atan2(dy,horizontalLength),
        yaw:Math.atan2(dx,dz)
      });
    }
  }
  return transforms;
}

// Dense OSM areas can contain hundreds of simple buildings and thousands of
// guard-rail sections. One Mesh per box turns those features into thousands of
// WebGL draw calls even though they all share one material. Keep their exact
// transforms while submitting each homogeneous set as one InstancedMesh.
export function createSceneryRenderer({
  THREE,statusEl,features,terrainDetailGroup,infrastructureGroup,buildingGroup,
  forestGroup,materials,featureCentroid,terrainHeight,nearestRoute,isNearRoute,isWaterAt,
  pointInPolygon,getWorldOffset
}){
  if(!THREE)throw new Error('Scenery renderer requires THREE');

  const {
    buildingWallMat,rockMat,scrubMat,towerMat,lineMatPower,railMat,damMat
  }=materials;

  let forestAssets=getForestWaterAssets();
  let forestAssetsActivated=false;
  let sceneryReadyForForest=false;
  let forestRouteCacheSuspended=false;
  let forestBlockers=[];
  let forestBlockerIndex=new Map();
  let forestGlobalBlockers=[];
  let blockerSignature='';
  let lastShown=0;
  let lastForestStats={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};
  let lastRenderStats={
    shown:0,
    nearBuildingMeshes:0,
    farBuildingInstances:0,
    guardRailInstances:0,
    damInstances:0,
    staticBatches:0
  };

  const FOREST_BLOCKER_CELL_M=240;
  const FOREST_BLOCKER_MAX_INDEX_CELLS=900;

  function forestBlockerKey(cx,cz){return `${cx},${cz}`;}

  function rebuildForestBlockerIndex(blockers){
    forestBlockerIndex=new Map();
    forestGlobalBlockers=[];
    for(const blocker of blockers){
      const b=blocker.bbox;
      const minCx=Math.floor(b.minx/FOREST_BLOCKER_CELL_M);
      const maxCx=Math.floor(b.maxx/FOREST_BLOCKER_CELL_M);
      const minCz=Math.floor(b.minz/FOREST_BLOCKER_CELL_M);
      const maxCz=Math.floor(b.maxz/FOREST_BLOCKER_CELL_M);
      const cells=(maxCx-minCx+1)*(maxCz-minCz+1);
      if(!Number.isFinite(cells)||cells>FOREST_BLOCKER_MAX_INDEX_CELLS){
        forestGlobalBlockers.push(blocker);
        continue;
      }
      for(let cx=minCx;cx<=maxCx;cx++){
        for(let cz=minCz;cz<=maxCz;cz++){
          const key=forestBlockerKey(cx,cz);
          let bucket=forestBlockerIndex.get(key);
          if(!bucket){bucket=[];forestBlockerIndex.set(key,bucket);}
          bucket.push(blocker);
        }
      }
    }
  }

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

  function damBoxTransforms(points){
    if(points.length<2)return [];
    const offset=getWorldOffset();
    const transforms=[];
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<1)continue;
      const h=14;
      const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      transforms.push({
        x:mx-offset.x,
        y:Math.min(terrainHeight(a.x,a.z),terrainHeight(b.x,b.z))+h/2,
        z:mz-offset.z,
        width:6,
        height:h,
        depth:len,
        yaw:Math.atan2(dx,dz)
      });
    }
    return transforms;
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
    rebuildForestBlockerIndex(next);
    blockerSignature=signature;
    return changed;
  }

  function blockedByForestList(list,x,z){
    for(const blocker of list){
      const b=blocker.bbox;
      if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
      if(pointInPolygon(x,z,blocker.points))return true;
    }
    return false;
  }

  function blocksForest(x,z){
    const key=forestBlockerKey(
      Math.floor(x/FOREST_BLOCKER_CELL_M),
      Math.floor(z/FOREST_BLOCKER_CELL_M)
    );
    const candidates=forestBlockerIndex.get(key)||[];
    return blockedByForestList(candidates,x,z)||blockedByForestList(forestGlobalBlockers,x,z);
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
    isNearRoute,
    isWaterAt,
    blocksForest,
    onStats:updateForestStatus
  });

  function suspendForestRouteCache(){
    if(forestRouteCacheSuspended)return false;
    forestRouteCacheSuspended=true;
    forestStreamer.setAssets(null);
    return true;
  }

  // R6 protected ownership contract: keep the dense-forest cache owner narrow.
  function switchForestRouteCache(routeKey){
    return forestStreamer.switchRouteCache(routeKey);
  }

  function resumeForestRouteCache(){
    if(!forestRouteCacheSuspended)return false;
    forestRouteCacheSuspended=false;
    if(sceneryReadyForForest&&forestAssets?.trees?.length){
      forestAssetsActivated=true;
      forestStreamer.setAssets(forestAssets);
    }
    return true;
  }

  function activateForestAssetsIfReady(){
    if(
      !sceneryReadyForForest||!forestAssets||forestAssetsActivated||
      forestRouteCacheSuspended
    )return false;
    forestAssetsActivated=true;
    forestStreamer.setAssets(forestAssets);
    return true;
  }

  function clear(){
    // A route request clears the routing geometry before it clears scenery. Freeze
    // the currently visible route cache at that exact boundary: it may remain on
    // screen while the replacement route is speculative, but it must not poll or
    // rebuild against the replacement route's geometry.
    const center=getWorldOffset?.()||{x:0,z:0};
    let routeAvailable=false;
    try{routeAvailable=!!nearestRoute?.(center.x||0,center.z||0);}catch{}
    if(!routeAvailable)suspendForestRouteCache();

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
    forestRouteCacheSuspended=false;
    forestAssetsActivated=false;
    sceneryReadyForForest=false;
    forestBlockers=[];
    forestBlockerIndex=new Map();
    forestGlobalBlockers=[];
    blockerSignature='';
    lastForestStats={trees:0,near:0,mid:0,far:0,edge:0,chunks:0,cached:0,queued:0};
    lastRenderStats={shown:0,nearBuildingMeshes:0,farBuildingInstances:0,guardRailInstances:0,damInstances:0,staticBatches:0};
    return true;
  }

  function buildingHeight(tags,{near=false}={}){
    let height=parseFloat(tags.height||'');
    if(!Number.isFinite(height)){
      const levels=parseFloat(tags['building:levels']||'');
      height=Number.isFinite(levels)?Math.max(3,levels*3.1):(near?6.5:7);
    }
    return near?Math.min(45,height):Math.max(4,Math.min(18,height));
  }

  function makeNearBuilding(points,tags){
    return makeFootprintMesh(points,buildingHeight(tags,{near:true}));
  }

  function farBuildingBoxTransform(points,tags){
    const c=featureCentroid(points);
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of points){
      minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);
      minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);
    }
    const width=Math.max(3,Math.min(35,maxx-minx));
    const depth=Math.max(3,Math.min(35,maxz-minz));
    const height=buildingHeight(tags);
    const offset=getWorldOffset();
    return {
      x:c.x-offset.x,
      y:terrainHeight(c.x,c.z)+height/2,
      z:c.z-offset.z,
      width,
      height,
      depth,
      yaw:0
    };
  }

  function rebuild(){
    clearGroup(terrainDetailGroup);
    clearGroup(infrastructureGroup);
    clearGroup(buildingGroup);

    refreshForestMasks();
    const offset=getWorldOffset();
    const radius2=1500*1500;
    let shown=0;
    let nearBuildingMeshes=0;
    const farBuildingShadowInstances=[];
    const farBuildingInstances=[];
    const guardRailInstances=[];
    const damInstances=[];

    for(const feature of features){
      const center=featureCentroid(feature.points);
      const dx=center.x-offset.x,dz=center.z-offset.z;
      const dist2=dx*dx+dz*dz;
      if(dist2>radius2)continue;
      const dist=Math.sqrt(dist2);
      const tags=feature.tags||{};
      let object=null;

      if(tags.building&&dist<1150){
        if(dist<520){
          object=makeNearBuilding(feature.points,tags);
          if(object){buildingGroup.add(object);nearBuildingMeshes++;}
        }else{
          const box=farBuildingBoxTransform(feature.points,tags);
          (dist<750?farBuildingShadowInstances:farBuildingInstances).push(box);
        }
      }else if((tags.power==='tower'||tags.power==='pole')&&dist<1400){
        infrastructureGroup.add(addUtilityTower(center.x,center.z,tags.power==='pole'?.6:1));
      }else if(tags.power==='line'||tags.power==='minor_line'){
        infrastructureGroup.add(addPowerLine(feature.points));
      }else if(tags.man_made==='dam'||tags.waterway==='dam'){
        damInstances.push(...damBoxTransforms(feature.points));
      }else if(tags.barrier==='guard_rail'){
        guardRailInstances.push(...createGuardRailBoxTransforms({
          points:feature.points,terrainHeight,getWorldOffset
        }));
      }else if(tags.natural==='bare_rock'||tags.natural==='scree'||tags.natural==='cliff'){
        object=addLandPatch(feature.points,rockMat,.04);
        if(object)terrainDetailGroup.add(object);
      }else if(tags.natural==='scrub'||tags.landuse==='meadow'){
        object=addLandPatch(feature.points,scrubMat,.035);
        if(object)terrainDetailGroup.add(object);
      }
      shown++;
    }

    let staticBatches=0;
    const addBatch=(group,options)=>{
      const mesh=createStaticBoxInstances({THREE,...options});
      if(!mesh)return false;
      group.add(mesh);
      staticBatches++;
      return true;
    };
    addBatch(buildingGroup,{
      material:buildingWallMat,
      transforms:farBuildingShadowInstances,
      name:'osm-buildings-mid',
      kind:'building-mid',
      castShadow:true,
      receiveShadow:true
    });
    addBatch(buildingGroup,{
      material:buildingWallMat,
      transforms:farBuildingInstances,
      name:'osm-buildings-far',
      kind:'building-far',
      receiveShadow:true
    });
    addBatch(infrastructureGroup,{
      material:railMat,
      transforms:guardRailInstances,
      name:'osm-guard-rails',
      kind:'guard-rail'
    });
    addBatch(infrastructureGroup,{
      material:damMat,
      transforms:damInstances,
      name:'osm-dams',
      kind:'dam',
      castShadow:true,
      receiveShadow:true
    });

    lastShown=shown;
    lastRenderStats={
      shown,
      nearBuildingMeshes,
      farBuildingInstances:farBuildingShadowInstances.length+farBuildingInstances.length,
      guardRailInstances:guardRailInstances.length,
      damInstances:damInstances.length,
      staticBatches
    };

    // The first forest build must happen only after local-world-builder has
    // installed the final road profile and synchronously rebuilt the near terrain.
    // Before P9.6, GLB loading could win that race and cache trees against the
    // pre-road terrain forever. Subsequent local rebuilds invalidate ONLY nearby
    // chunks; the expensive distant P9 cache remains intact.
    sceneryReadyForForest=true;
    const activatedNow=activateForestAssetsIfReady();
    if(forestAssetsActivated&&!activatedNow&&!forestRouteCacheSuspended){
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
    suspendForestRouteCache,
    switchForestRouteCache,
    resumeForestRouteCache,
    removeTreesOverWater,
    requestForestRefresh,
    whenInitialForestReady:()=>forestStreamer.whenInitialReady(),
    forestStats:()=>forestStreamer.stats(),
    renderStats:()=>({...lastRenderStats}),
    forestRouteCacheStatus:()=>({suspended:forestRouteCacheSuspended})
  };
}

import {loadForestWaterAssets,getForestWaterAssets} from './forest-water-assets.js';
import {createForestTerrainSampler} from './forest-terrain-sampler.js';
import {
  FOREST_STREAMING_POLICY as FOREST,
  forestHash,
  forestDensityNoise,
  forestKeepProbability,
  forestLodForDistance,
  forestSectorForOffset,
  forestCellRange
} from './forest-streaming-policy.js';

export function createSceneryRenderer({THREE,statusEl,features,terrainDetailGroup,infrastructureGroup,buildingGroup,forestGroup,materials,featureCentroid,terrainHeight,nearestRoute,isWaterAt,pointInPolygon,getWorldOffset}){
  if(!THREE)throw new Error('Scenery renderer requires THREE');
  const {buildingWallMat,rockMat,scrubMat,towerMat,lineMatPower,railMat,damMat}=materials;
  let forestAssets=getForestWaterAssets();
  let forestBlockers=[];
  let forestLastCenter={x:NaN,z:NaN};
  let forestRequestedCenter=null;
  let forestBuildActive=false;
  let forestRequestSerial=0;
  let forestPollTimer=null;
  let lastShown=0;
  let lastForestStats={total:0,near:0,mid:0,far:0,batches:0};

  // P7.1: use the triangles actually rendered by the live 5.6 km terrain mesh.
  // The previous DEM-at-point placement could differ from triangle interpolation
  // by metres on steep relief, making trunks float or disappear into slopes.
  const forestTerrain=createForestTerrainSampler({
    THREE,
    forestGroup,
    getWorldOffset,
    fallbackHeight:terrainHeight
  });
  const forestHeight=(x,z)=>forestTerrain.heightAt(x,z);

  function disposeObject(object){
    object.traverse?.(child=>{if(child.userData?.sharedForestGeometry)return;child.geometry?.dispose?.();});
  }
  function clearGroup(group){while(group.children.length){const child=group.children.pop();disposeObject(child);}}
  function clear(){
    clearGroup(terrainDetailGroup);clearGroup(infrastructureGroup);clearGroup(buildingGroup);
    // Keep the previous streamed forest alive while the replacement is generated.
    // A full world refresh must never expose an empty forest ring.
    forestRequestSerial++;
    refreshForestMasks();
  }

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
    const group=new THREE.Group();if(points.length<2)return group;const offset=getWorldOffset(),vertices=[];for(const p of points)vertices.push(p.x-offset.x,terrainHeight(p.x,p.z)+14,p.z-offset.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));group.add(new THREE.Line(geometry,lineMatPower));return group;
  }
  function addLandPatch(points,material,yOffset=.03){
    if(points.length<3)return null;const offset=getWorldOffset(),shape=new THREE.Shape();shape.moveTo(points[0].x-offset.x,-(points[0].z-offset.z));for(let i=1;i<points.length;i++)shape.lineTo(points[i].x-offset.x,-(points[i].z-offset.z));shape.closePath();const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);const c=featureCentroid(points),mesh=new THREE.Mesh(geometry,material);mesh.position.y=terrainHeight(c.x,c.z)+yOffset;mesh.receiveShadow=true;return mesh;
  }

  function bboxForPoints(points){
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}
    return {minx,maxx,minz,maxz};
  }

  function refreshForestMasks(){
    const next=[];
    for(const feature of features){
      const tags=feature.tags||{},points=feature.points;
      if(!Array.isArray(points)||points.length<3)continue;
      const blocked=
        !!tags.building||
        ['residential','commercial','industrial','retail','farmland','farmyard','meadow','grass','construction','quarry'].includes(tags.landuse)||
        ['bare_rock','scree','sand','beach'].includes(tags.natural);
      if(blocked)next.push({points,bbox:bboxForPoints(points)});
    }
    forestBlockers=next;
  }

  function blocksForest(x,z){
    for(const blocker of forestBlockers){
      const b=blocker.bbox;
      if(x<b.minx||x>b.maxx||z<b.minz||z>b.maxz)continue;
      if(pointInPolygon(x,z,blocker.points))return true;
    }
    return false;
  }

  function distanceToSegment(x,z,segment){
    const vx=segment.bx-segment.ax,vz=segment.bz-segment.az;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,((x-segment.ax)*vx+(z-segment.az)*vz)/vv));
    return Math.hypot(x-(segment.ax+vx*t),z-(segment.az+vz*t));
  }

  function routeSegmentsForCell(cell){
    const first=nearestRoute(cell.x,cell.z);
    if(!first)return [];
    const halfDiagonal=FOREST.cellSize*Math.SQRT2*.5;
    if(first.d>FOREST.roadClearance+halfDiagonal+4)return [];

    const h=FOREST.cellSize*.48;
    const probes=[
      [cell.x,cell.z],
      [cell.x-h,cell.z-h],[cell.x+h,cell.z-h],[cell.x-h,cell.z+h],[cell.x+h,cell.z+h],
      [cell.x-h,cell.z],[cell.x+h,cell.z],[cell.x,cell.z-h],[cell.x,cell.z+h]
    ];
    const unique=new Map();
    for(const [x,z] of probes){
      const nr=nearestRoute(x,z);
      if(nr&&Number.isInteger(nr.i))unique.set(nr.i,nr);
    }
    return [...unique.values()];
  }

  function tooCloseToRoad(x,z,routeSegments){
    for(const segment of routeSegments){if(distanceToSegment(x,z,segment)<FOREST.roadClearance)return true;}
    return false;
  }

  function terrainSlopeCached(cache,x,z){
    const q=FOREST.slopeCacheSize;
    const qx=Math.floor(x/q),qz=Math.floor(z/q),key=`${qx}:${qz}`;
    if(cache.has(key))return cache.get(key);
    const sx=(qx+.5)*q,sz=(qz+.5)*q,d=8;
    // Match slope filtering to the same visible triangle surface used to anchor
    // the tree. This avoids rejecting/accepting based on a different DEM surface.
    const hx=forestHeight(sx+d,sz)-forestHeight(sx-d,sz);
    const hz=forestHeight(sx,sz+d)-forestHeight(sx,sz-d);
    const slope=Math.hypot(hx,hz)/(d*2);
    cache.set(key,slope);
    return slope;
  }

  function variantIndices(){
    const variants=forestAssets?.trees||[];
    const find=name=>variants.findIndex(v=>String(v?.name||'').toLowerCase()===name);
    const authored=find('authored'),ps1=find('ps1'),scene=find('scene');
    const first=variants.length?0:-1;
    return {
      authored:authored>=0?authored:(ps1>=0?ps1:(scene>=0?scene:first)),
      ps1:ps1>=0?ps1:(scene>=0?scene:(authored>=0?authored:first)),
      scene:scene>=0?scene:(ps1>=0?ps1:(authored>=0?authored:first))
    };
  }

  function chooseVariantForLod(lod,r,indices){
    if(lod===2)return indices.scene;
    if(lod===1)return r<.24?indices.ps1:indices.scene;
    if(r<.15)return indices.authored;
    if(r<.62)return indices.ps1;
    return indices.scene;
  }

  function addBatchPlacement(job,lod,sector,variant,placement){
    const key=`${lod}:${sector}:${variant}`;
    let list=job.batches.get(key);
    if(!list){list=[];job.batches.set(key,list);}
    list.push(placement);
    job.counts[lod]++;
  }

  function processForestCell(job,cell){
    const routeSegments=routeSegmentsForCell(cell);
    const baseDensity=forestDensityNoise(cell.x,cell.z);
    for(let i=0;i<FOREST.candidatesPerCell;i++){
      const rx=forestHash(cell.cx,cell.cz,17+i*7919);
      const rz=forestHash(cell.cx,cell.cz,31+i*104729);
      const x=(cell.cx+rx)*FOREST.cellSize;
      const z=(cell.cz+rz)*FOREST.cellSize;
      const dx=x-job.center.x,dz=z-job.center.z,distance=Math.hypot(dx,dz);
      const lod=forestLodForDistance(distance,FOREST);
      if(lod<0)continue;

      let keep=forestKeepProbability(distance,baseDensity,FOREST);
      const slope=terrainSlopeCached(job.slopeCache,x,z);
      if(slope>FOREST.maxSlope)continue;
      if(slope>.82)keep*=.72;
      if(forestHash(cell.cx,cell.cz,(0x51f15e+Math.imul(i,0x9e3779b1))|0)>keep)continue;
      if(routeSegments.length&&tooCloseToRoad(x,z,routeSegments))continue;
      if(isWaterAt(x,z,8))continue;
      if(blocksForest(x,z))continue;

      const variantRandom=forestHash(cell.cx,cell.cz,(0x73a2d1+Math.imul(i,2246822519))|0);
      const variant=chooseVariantForLod(lod,variantRandom,job.indices);
      if(variant<0)continue;
      const height=8.2+forestHash(cell.cx,cell.cz,0x191+i*1013)*9.6;
      const widthScale=.78+forestHash(cell.cx,cell.cz,0x2b7+i*2029)*.42;
      const rot=forestHash(cell.cx,cell.cz,0x391+i*4093)*Math.PI*2;
      const leanScale=lod===0?.052:lod===1?.028:.012;
      const leanX=(forestHash(cell.cx,cell.cz,0x4d1+i*8191)-.5)*leanScale;
      const leanZ=(forestHash(cell.cx,cell.cz,0x5f3+i*12289)-.5)*leanScale;
      const sector=forestSectorForOffset(dx,dz,FOREST.sectors);
      addBatchPlacement(job,lod,sector,variant,{
        x,z,y:forestHeight(x,z),height,widthScale,rot,leanX,leanZ
      });
    }
  }

  function scheduleIdleSlice(callback){
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(callback,{timeout:90});
    }else{
      setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>7}),0);
    }
  }

  function buildForestPlacements(job){
    return new Promise(resolve=>{
      const step=deadline=>{
        if(job.serial!==forestRequestSerial){resolve(false);return;}
        let processed=0;
        while(job.cellIndex<job.cells.length&&processed<FOREST.cellsPerSlice){
          if(processed>=6&&!deadline.didTimeout&&deadline.timeRemaining()<1.5)break;
          processForestCell(job,job.cells[job.cellIndex++]);
          processed++;
        }
        if(job.cellIndex<job.cells.length){scheduleIdleSlice(step);return;}
        resolve(true);
      };
      scheduleIdleSlice(step);
    });
  }

  function makeForestStaging(job){
    const currentOffset=getWorldOffset();
    if(Math.hypot(currentOffset.x-job.center.x,currentOffset.z-job.center.z)>.1)return null;
    if(Math.abs(forestGroup.position.x-job.groupPosition.x)>.1||Math.abs(forestGroup.position.z-job.groupPosition.z)>.1)return null;

    const variants=forestAssets?.trees||[];
    const staging=new THREE.Group(),dummy=new THREE.Object3D();
    let batches=0;
    for(const [key,placements] of job.batches){
      if(!placements.length)continue;
      const [lodText,sectorText,variantText]=key.split(':');
      const variant=variants[Number(variantText)];
      if(!variant?.parts?.length)continue;
      for(const part of variant.parts){
        if(!part?.geometry||!part?.material)continue;
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,placements.length);
        mesh.userData.sharedForestGeometry=true;
        mesh.userData.forestVariant=variant.name||variantText;
        mesh.userData.forestLod=Number(lodText);
        mesh.userData.forestSector=Number(sectorText);
        mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        placements.forEach((p,i)=>{
          dummy.position.set(
            p.x-job.center.x-job.groupPosition.x,
            // Exact triangle anchoring plus a tiny root embed hides sub-pixel
            // cracks caused by the intentional tree lean without burying trunks.
            p.y-.10,
            p.z-job.center.z-job.groupPosition.z
          );
          dummy.rotation.set(p.leanX,p.rot,p.leanZ);
          dummy.scale.set(p.height*p.widthScale,p.height,p.height*p.widthScale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i,dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate=true;
        mesh.computeBoundingSphere();
        mesh.matrixAutoUpdate=false;
        mesh.updateMatrix();
        staging.add(mesh);batches++;
      }
    }
    staging.userData.forestBatches=batches;
    return staging;
  }

  function swapForest(staging,job){
    if(!staging)return false;
    clearGroup(forestGroup);
    while(staging.children.length)forestGroup.add(staging.children[0]);
    forestLastCenter={...job.center};
    lastForestStats={
      total:job.counts[0]+job.counts[1]+job.counts[2],
      near:job.counts[0],mid:job.counts[1],far:job.counts[2],
      batches:staging.userData.forestBatches||0
    };
    if(statusEl)statusEl.textContent=`${lastShown} objets · ${lastForestStats.total} arbres · LOD ${lastForestStats.near}/${lastForestStats.mid}/${lastForestStats.far}`;
    return true;
  }

  async function runForestQueue(){
    if(forestBuildActive||!forestRequestedCenter)return;
    forestBuildActive=true;
    try{
      while(forestRequestedCenter){
        const center=forestRequestedCenter;forestRequestedCenter=null;
        const serial=forestRequestSerial;
        const job={
          serial,center,
          groupPosition:{x:forestGroup.position.x,z:forestGroup.position.z},
          cells:forestCellRange(center.x,center.z,FOREST),cellIndex:0,
          batches:new Map(),counts:[0,0,0],slopeCache:new Map(),indices:variantIndices()
        };
        const complete=await buildForestPlacements(job);
        if(!complete||serial!==forestRequestSerial)continue;
        const staging=makeForestStaging(job);
        if(!staging){
          forestRequestedCenter={...getWorldOffset()};
          forestRequestSerial++;
          continue;
        }
        swapForest(staging,job);
      }
    }catch(error){
      console.warn('Forest streaming rebuild failed',error);
    }finally{
      forestBuildActive=false;
      if(forestRequestedCenter)runForestQueue();
    }
  }

  function requestForestRefresh(force=false){
    if(!forestAssets?.trees?.length)return false;
    const offset=getWorldOffset();
    const center={x:offset.x,z:offset.z};
    if(!force&&Number.isFinite(forestLastCenter.x)){
      if(Math.hypot(center.x-forestLastCenter.x,center.z-forestLastCenter.z)<FOREST.refreshDistance)return false;
    }
    forestRequestedCenter=center;
    forestRequestSerial++;
    runForestQueue();
    return true;
  }

  function ensureForestPolling(){
    if(forestPollTimer||typeof globalThis.setInterval!=='function')return;
    forestPollTimer=globalThis.setInterval(()=>requestForestRefresh(false),FOREST.pollMs);
  }

  function makeBuildingLOD(points,tags,dist){
    if(dist<520){let height=parseFloat(tags.height||'');if(!Number.isFinite(height)){const levels=parseFloat(tags['building:levels']||'');height=Number.isFinite(levels)?Math.max(3,levels*3.1):6.5;}return makeFootprintMesh(points,Math.min(45,height));}
    const c=featureCentroid(points);let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of points){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);}const width=Math.max(3,Math.min(35,maxx-minx)),depth=Math.max(3,Math.min(35,maxz-minz)),height=Math.max(4,Math.min(18,parseFloat(tags.height||'')||7)),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),buildingWallMat),offset=getWorldOffset();mesh.position.set(c.x-offset.x,terrainHeight(c.x,c.z)+height/2,c.z-offset.z);mesh.castShadow=dist<750;mesh.receiveShadow=true;return mesh;
  }

  function rebuild(){
    clear();
    const offset=getWorldOffset(),radius2=1500*1500;
    let shown=0;
    refreshForestMasks();
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
      shown++;
    }
    lastShown=shown;
    requestForestRefresh(true);
    if(statusEl){
      if(lastForestStats.total)statusEl.textContent=`${shown} objets · ${lastForestStats.total} arbres · forêt streaming`;
      else statusEl.textContent=`${shown} objets · forêt en chargement`;
    }
    return shown;
  }

  function removeTreesOverWater(){return 0;}

  ensureForestPolling();
  loadForestWaterAssets().then(asset=>{
    forestAssets=asset;
    ensureForestPolling();
    requestForestRefresh(true);
  });
  return {rebuild,clear,removeTreesOverWater,requestForestRefresh};
}

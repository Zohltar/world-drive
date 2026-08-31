// World Drive V21.25 / Foret P9.30 — road furniture presentation.
// Owns visible road signs and enhanced bridge furniture; route/physics state stays in main.js.
// P9.30 keeps sign appearance unchanged but builds sign geometry/textures off-scene
// one sign per idle slice, then atomically swaps the completed set into signGroup.

export function createRoadFurnitureSystem({
  THREE,
  signGroup,
  infrastructureGroup,
  routePointAtCum,
  bridgeHeightAtCum,
  roadHeightAt,
  terrainAbs,
  nearestRoute,
  resetStaticGroupOrigin,
  clearGroup,
  freezeStaticMatrices,
  addGeographicRoadSigns,
  getState,
  setRoadGuideSign
}){
  if(!THREE)throw new Error('road furniture requires THREE');
  if(!signGroup||!infrastructureGroup)throw new Error('road furniture requires scene groups');
  if(typeof getState!=='function')throw new Error('road furniture requires getState');

  let activeRoadProfile=[];
  let bridgeSpans=[];
  let worldOffset={x:0,z:0};
  let activeRoadMeta={confidence:0,ref:null,name:null};
  let absX=0,absZ=0,routeLength=0;
  let currentRoadGuideSign=null;

  function syncState(){
    const state=getState()||{};
    activeRoadProfile=Array.isArray(state.activeRoadProfile)?state.activeRoadProfile:[];
    bridgeSpans=Array.isArray(state.bridgeSpans)?state.bridgeSpans:[];
    worldOffset=state.worldOffset||worldOffset;
    activeRoadMeta=state.activeRoadMeta||activeRoadMeta;
    absX=Number(state.absX)||0;
    absZ=Number(state.absZ)||0;
    routeLength=Math.max(0,Number(state.routeLength)||0);
  }

  // ---------- V5.1.2 signs + enhanced bridge furniture ----------
  const signPoleMat=new THREE.MeshStandardMaterial({color:0x74787b,roughness:.72,metalness:.45});
  const signBackMat=new THREE.MeshStandardMaterial({color:0x9a9d9f,roughness:.65,metalness:.25});
  const bridgeRailMat=new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:.55,metalness:.55});
  const bridgeConcreteMat=new THREE.MeshStandardMaterial({color:0xa6a49b,roughness:.95});
  const bridgeGirderMat=new THREE.MeshStandardMaterial({color:0x666b70,roughness:.62,metalness:.38});
  const bridgeUndersideMat=new THREE.MeshStandardMaterial({color:0x808287,roughness:.82,metalness:.12});
  const bridgeFasciaMat=new THREE.MeshStandardMaterial({color:0x70757a,roughness:.74,metalness:.22});
  const bridgeBearingMat=new THREE.MeshStandardMaterial({color:0x4d5053,roughness:.58,metalness:.48});

  // P9.30: these shapes never change, so do not regenerate/dispose them on
  // every road metadata/sign response.
  const signPoleGeometry=new THREE.CylinderGeometry(.045,.055,2.15,8);
  const speedSignGeometry=new THREE.CircleGeometry(.46,28);
  const guideSignGeometry=new THREE.PlaneGeometry(1.95,1.02);
  const citySignGeometry=new THREE.PlaneGeometry(2.15,1.02);
  const sharedSignGeometries=new Set([
    signPoleGeometry,speedSignGeometry,guideSignGeometry,citySignGeometry
  ]);

  const SIGN_SLICE_BUDGET_MS=.90;
  const SIGNS_PER_SLICE=1;
  const SIGN_FACE_CACHE_LIMIT=64;
  const signFaceCache=new Map();
  let signCollector=null;
  let signBuildSerial=0;
  const signPerf={
    refreshes:0,
    cancelledBuilds:0,
    slices:0,
    lastSliceMs:0,
    maxSliceMs:0,
    commits:0,
    lastCommitMs:0,
    maxCommitMs:0,
    lastDescriptorCount:0,
    maxDescriptorCount:0,
    pending:false,
    cacheHits:0,
    cacheMisses:0
  };

  function makeSignTexture(text,kind='speed'){
    const c=document.createElement('canvas');c.width=384;c.height=256;
    const x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';
    if(kind==='speed'){
      x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,c.width,c.height);
      x.fillStyle='#fff';x.beginPath();x.arc(192,128,104,0,Math.PI*2);x.fill();
      x.lineWidth=18;x.strokeStyle='#d62828';x.stroke();
      x.fillStyle='#111';x.font='bold 92px Arial';x.fillText(String(text),192,132);
    }else{
      let bg='#176d45',fg='#fff',border='#fff';
      if(kind==='river')bg='#296b9b';
      if(kind==='city'){bg='#fff';fg='#111';border='#111';}
      x.fillStyle=bg;x.fillRect(12,40,360,176);
      x.lineWidth=7;x.strokeStyle=border;x.strokeRect(20,48,344,160);
      x.fillStyle=fg;
      const words=String(text||'').replace(/\|/g,' ').split(/\s+/);
      let lines=[''];
      for(const w of words){
        const k=lines.length-1;
        if((lines[k]+' '+w).trim().length>18&&lines.length<3)lines.push(w);
        else lines[k]=(lines[k]+' '+w).trim();
      }
      x.font=kind==='city'?'bold 43px Arial':'bold 38px Arial';
      const lineH=48,y0=128-(lines.length-1)*lineH/2;
      lines.slice(0,3).forEach((t,i)=>x.fillText(t,192,y0+i*lineH));
    }
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
  }

  function signFaceKey(text,kind){return `${kind}\u0000${String(text)}`;}

  function faceMaterialFor(text,kind){
    const key=signFaceKey(text,kind);
    const cached=signFaceCache.get(key);
    if(cached){
      cached.lastUsed=performance.now();
      signPerf.cacheHits++;
      return {key,material:cached.material};
    }
    const material=new THREE.MeshStandardMaterial({
      map:makeSignTexture(text,kind),
      side:THREE.DoubleSide,
      roughness:.72
    });
    material.userData=material.userData||{};
    material.userData.sharedRoadSignFace=true;
    signFaceCache.set(key,{material,lastUsed:performance.now()});
    signPerf.cacheMisses++;
    return {key,material};
  }

  function geometryForKind(kind){
    if(kind==='speed')return speedSignGeometry;
    if(kind==='city')return citySignGeometry;
    return guideSignGeometry;
  }

  function cloneSignPoint(p){
    return {
      x:Number(p?.x)||0,
      y:Number(p?.y)||0,
      z:Number(p?.z)||0,
      angle:Number.isFinite(p?.angle)?p.angle:0
    };
  }

  function addRoadSignObject(target,p,text,kind='speed',side=1,offset=worldOffset){
    if(!p)return null;
    const ang=p.angle??0,lateral=side*4.45,nx=Math.cos(ang),nz=-Math.sin(ang),g=new THREE.Group();

    const pole=new THREE.Mesh(signPoleGeometry,signPoleMat);
    pole.userData=pole.userData||{};pole.userData.sharedRoadSignGeometry=true;
    pole.position.y=1.18;g.add(pole);

    const geom=geometryForKind(kind);
    const {key,material}=faceMaterialFor(text,kind);
    const face=new THREE.Mesh(geom,material);
    face.userData=face.userData||{};face.userData.sharedRoadSignGeometry=true;face.userData.roadSignFaceKey=key;
    face.position.y=2.28;face.rotation.y=side>0?Math.PI:0;g.add(face);

    const back=new THREE.Mesh(geom,signBackMat);
    back.userData=back.userData||{};back.userData.sharedRoadSignGeometry=true;
    back.position.copy(face.position);back.rotation.y=face.rotation.y+Math.PI;g.add(back);

    g.position.set(p.x+nx*lateral-offset.x,p.y+.02,p.z+nz*lateral-offset.z);
    g.rotation.y=ang;
    target.add(g);
    return g;
  }

  function addRoadSignAt(p,text,kind='speed',side=1){
    if(!p)return;
    if(signCollector){
      signCollector.push({p:cloneSignPoint(p),text,kind,side});
      return;
    }
    return addRoadSignObject(signGroup,p,text,kind,side,worldOffset);
  }

  function disposeSignObject(object){
    object?.traverse?.(child=>{
      if(child.geometry&&!sharedSignGeometries.has(child.geometry))child.geometry.dispose?.();
      const materials=Array.isArray(child.material)?child.material:[child.material];
      for(const material of materials){
        if(!material||material===signPoleMat||material===signBackMat)continue;
        if(material.userData?.sharedRoadSignFace)continue;
        material.map?.dispose?.();
        material.dispose?.();
      }
    });
  }

  function clearSignGroup(){
    while(signGroup.children.length){
      const child=signGroup.children.pop();
      child.parent=null;
      disposeSignObject(child);
    }
  }

  function disposeStaging(staging){
    while(staging.children.length){
      const child=staging.children.pop();
      child.parent=null;
      // Shared geometry/material/cache objects remain intentionally reusable.
      disposeSignObject(child);
    }
  }

  function pruneSignFaceCache(usedKeys){
    if(signFaceCache.size<=SIGN_FACE_CACHE_LIMIT)return;
    const candidates=[...signFaceCache.entries()]
      .filter(([key])=>!usedKeys.has(key))
      .sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
    while(signFaceCache.size>SIGN_FACE_CACHE_LIMIT&&candidates.length){
      const [key,entry]=candidates.shift();
      signFaceCache.delete(key);
      entry.material.map?.dispose?.();
      entry.material.dispose?.();
    }
  }

  function scheduleSignSlice(callback){
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(callback,{timeout:120});
    }else{
      setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>4}),0);
    }
  }

  function sameOffset(a,b){
    return !!a&&!!b&&Math.hypot((a.x||0)-(b.x||0),(a.z||0)-(b.z||0))<.5;
  }

  function startIncrementalSignBuild(descriptors,buildOffset,serial){
    const staging=new THREE.Group();
    staging.name='road-sign-staging-p930';
    let index=0;
    const usedKeys=new Set(descriptors.map(d=>signFaceKey(d.text,d.kind)));
    signPerf.pending=true;

    const step=deadline=>{
      if(serial!==signBuildSerial){
        signPerf.cancelledBuilds++;
        signPerf.pending=false;
        disposeStaging(staging);
        return;
      }
      const liveOffset=(getState()?.worldOffset)||worldOffset;
      if(!sameOffset(liveOffset,buildOffset)){
        signPerf.cancelledBuilds++;
        signPerf.pending=false;
        disposeStaging(staging);
        syncState();
        refreshRoadSignsOnly();
        return;
      }

      const started=performance.now();
      let built=0;
      while(index<descriptors.length&&built<SIGNS_PER_SLICE){
        const descriptor=descriptors[index++];
        addRoadSignObject(
          staging,
          descriptor.p,
          descriptor.text,
          descriptor.kind,
          descriptor.side,
          buildOffset
        );
        built++;
        if(performance.now()-started>=SIGN_SLICE_BUDGET_MS)break;
        if(!deadline.didTimeout&&deadline.timeRemaining?.()<.75)break;
      }
      const sliceMs=performance.now()-started;
      signPerf.slices++;
      signPerf.lastSliceMs=sliceMs;
      signPerf.maxSliceMs=Math.max(signPerf.maxSliceMs,sliceMs);

      if(index<descriptors.length){
        scheduleSignSlice(step);
        return;
      }

      const commitStarted=performance.now();
      resetStaticGroupOrigin(signGroup);
      clearSignGroup();
      for(const child of [...staging.children])signGroup.add(child);
      freezeStaticMatrices(signGroup);
      pruneSignFaceCache(usedKeys);
      const commitMs=performance.now()-commitStarted;
      signPerf.commits++;
      signPerf.lastCommitMs=commitMs;
      signPerf.maxCommitMs=Math.max(signPerf.maxCommitMs,commitMs);
      signPerf.pending=false;
    };

    scheduleSignSlice(step);
  }

  function addBridgeRailFromProfile(a,b,side){
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.4)return;
    const ang=Math.atan2(dx,dz);
    const nx=Math.cos(ang),nz=-Math.sin(ang);
    const off=side*4.15;

    const rail=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,len),bridgeRailMat);
    rail.position.set(
      (a.x+b.x)/2+nx*off-worldOffset.x,
      (a.y+b.y)/2+.48,
      (a.z+b.z)/2+nz*off-worldOffset.z
    );
    rail.rotation.y=ang;
    infrastructureGroup.add(rail);

    const posts=Math.max(1,Math.floor(len/3.2));
    for(let i=0;i<=posts;i++){
      const t=i/posts;
      const px=a.x+(b.x-a.x)*t+nx*off;
      const pz=a.z+(b.z-a.z)*t+nz*off;
      const py=a.y+(b.y-a.y)*t;
      const post=new THREE.Mesh(new THREE.BoxGeometry(.09,.62,.09),bridgeRailMat);
      post.position.set(px-worldOffset.x,py+.20,pz-worldOffset.z);
      infrastructureGroup.add(post);
    }
  }

  function addEnhancedBridgeFurniture(){
    if(!activeRoadProfile?.length||!bridgeSpans?.length)return;

    for(const b of bridgeSpans){
      const pts=activeRoadProfile.filter(p=>p.cum>=b.start&&p.cum<=b.end);
      if(pts.length<2)continue;

      for(let i=0;i<pts.length-1;i++){
        addBridgeRailFromProfile(pts[i],pts[i+1],-1);
        addBridgeRailFromProfile(pts[i],pts[i+1],1);
      }

      for(let i=0;i<pts.length-1;i++){
        const a=pts[i],c=pts[i+1];
        const dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz);
        if(len<.35)continue;

        const ang=Math.atan2(dx,dz);
        const nx=Math.cos(ang),nz=-Math.sin(ang);
        const my=(a.y+c.y)/2;

        const slab=new THREE.Mesh(new THREE.BoxGeometry(8.0,.62,len),bridgeUndersideMat);
        slab.position.set((a.x+c.x)/2-worldOffset.x,my-.64,(a.z+c.z)/2-worldOffset.z);
        slab.rotation.y=ang;
        slab.castShadow=true;slab.receiveShadow=true;
        infrastructureGroup.add(slab);

        for(const side of [-1,1]){
          const off=side*3.72;
          const fascia=new THREE.Mesh(new THREE.BoxGeometry(.34,1.18,len),bridgeFasciaMat);
          fascia.position.set(
            (a.x+c.x)/2+nx*off-worldOffset.x,
            my-.93,
            (a.z+c.z)/2+nz*off-worldOffset.z
          );
          fascia.rotation.y=ang;
          fascia.castShadow=true;
          infrastructureGroup.add(fascia);

          const girder=new THREE.Mesh(new THREE.BoxGeometry(.38,.82,len),bridgeGirderMat);
          girder.position.set(
            (a.x+c.x)/2+nx*(side*2.35)-worldOffset.x,
            my-1.18,
            (a.z+c.z)/2+nz*(side*2.35)-worldOffset.z
          );
          girder.rotation.y=ang;
          girder.castShadow=true;
          infrastructureGroup.add(girder);
        }
      }

      const startCum=pts[0].cum,endCum=pts[pts.length-1].cum;
      const total=Math.max(0,endCum-startCum);
      const crossCount=Math.max(2,Math.floor(total/10));
      for(let i=1;i<crossCount;i++){
        const cum=startCum+total*i/crossCount;
        const p=routePointAtCum(cum);
        const y=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
        const beam=new THREE.Mesh(new THREE.BoxGeometry(7.25,.32,.42),bridgeGirderMat);
        beam.position.set(p.x-worldOffset.x,y-1.18,p.z-worldOffset.z);
        beam.rotation.y=p.angle+Math.PI/2;
        infrastructureGroup.add(beam);
      }

      for(const p of [pts[0],pts[pts.length-1]]){
        const idx=activeRoadProfile.indexOf(p);
        const p0=activeRoadProfile[Math.max(0,idx-1)];
        const p1=activeRoadProfile[Math.min(activeRoadProfile.length-1,idx+1)];
        const ang=Math.atan2(p1.x-p0.x,p1.z-p0.z);

        const ab=new THREE.Mesh(new THREE.BoxGeometry(8.9,1.15,.92),bridgeConcreteMat);
        ab.position.set(p.x-worldOffset.x,p.y-.78,p.z-worldOffset.z);
        ab.rotation.y=ang;
        ab.castShadow=true;ab.receiveShadow=true;
        infrastructureGroup.add(ab);

        for(const side of [-1,1]){
          const nx=Math.cos(ang),nz=-Math.sin(ang);
          const bearing=new THREE.Mesh(new THREE.BoxGeometry(.68,.18,.54),bridgeBearingMat);
          bearing.position.set(
            p.x+nx*(side*2.35)-worldOffset.x,
            p.y-1.03,
            p.z+nz*(side*2.35)-worldOffset.z
          );
          bearing.rotation.y=ang;
          infrastructureGroup.add(bearing);
        }
      }

      if(total>30){
        const pierCount=Math.max(1,Math.min(4,Math.floor(total/38)));
        for(let i=1;i<=pierCount;i++){
          const cum=startCum+total*i/(pierCount+1);
          const p=routePointAtCum(cum);
          const deckY=bridgeHeightAtCum(cum)??roadHeightAt(p.x,p.z);
          const groundY=terrainAbs(p.x,p.z);
          const h=Math.max(1.8,deckY-groundY-1.1);

          const pier=new THREE.Mesh(new THREE.BoxGeometry(1.35,h,.88),bridgeConcreteMat);
          pier.position.set(p.x-worldOffset.x,groundY+h/2,p.z-worldOffset.z);
          pier.rotation.y=p.angle;
          pier.castShadow=true;pier.receiveShadow=true;
          infrastructureGroup.add(pier);

          const cap=new THREE.Mesh(new THREE.BoxGeometry(6.8,.62,1.25),bridgeConcreteMat);
          cap.position.set(p.x-worldOffset.x,deckY-1.52,p.z-worldOffset.z);
          cap.rotation.y=p.angle+Math.PI/2;
          cap.castShadow=true;
          infrastructureGroup.add(cap);

          const footing=new THREE.Mesh(new THREE.BoxGeometry(2.2,.55,1.7),bridgeConcreteMat);
          footing.position.set(p.x-worldOffset.x,groundY+.18,p.z-worldOffset.z);
          footing.rotation.y=p.angle;
          footing.receiveShadow=true;
          infrastructureGroup.add(footing);
        }
      }
    }
  }

  function addCurrentRoadSigns(){
    currentRoadGuideSign=null;
    if(activeRoadMeta.confidence<=.25)return;
    const n=nearestRoute(absX,absZ);if(!n)return;
    const label=activeRoadMeta.ref||activeRoadMeta.name;
    if(label){
      const guideCum=Math.min(routeLength,n.cum+170);
      const p=routePointAtCum(guideCum);p.y=roadHeightAt(p.x,p.z);
      const guideLabel=String(label).slice(0,28);
      addRoadSignAt(p,guideLabel,'guide',1);
      currentRoadGuideSign={
        key:`road-guide:${guideLabel}:${Math.round(guideCum)}`,
        kind:'guide',
        label:guideLabel,
        routeCum:guideCum
      };
    }
  }

  function refreshRoadSignsOnly(){
    const serial=++signBuildSerial;
    signPerf.refreshes++;
    signCollector=[];
    try{
      addCurrentRoadSigns();
      addGeographicRoadSigns();
    }finally{
      const descriptors=signCollector||[];
      signCollector=null;
      signPerf.lastDescriptorCount=descriptors.length;
      signPerf.maxDescriptorCount=Math.max(signPerf.maxDescriptorCount,descriptors.length);
      startIncrementalSignBuild(descriptors,{...worldOffset},serial);
    }
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'p930-incremental-sign-build',
      pending:signPerf.pending,
      refreshes:signPerf.refreshes,
      cancelledBuilds:signPerf.cancelledBuilds,
      descriptors:{last:signPerf.lastDescriptorCount,max:signPerf.maxDescriptorCount},
      slice:{
        count:signPerf.slices,
        lastMs:Number(signPerf.lastSliceMs.toFixed(3)),
        maxMs:Number(signPerf.maxSliceMs.toFixed(3)),
        budgetMs:SIGN_SLICE_BUDGET_MS,
        signsPerSlice:SIGNS_PER_SLICE
      },
      commit:{
        count:signPerf.commits,
        lastMs:Number(signPerf.lastCommitMs.toFixed(3)),
        maxMs:Number(signPerf.maxCommitMs.toFixed(3))
      },
      faceCache:{
        size:signFaceCache.size,
        limit:SIGN_FACE_CACHE_LIMIT,
        hits:signPerf.cacheHits,
        misses:signPerf.cacheMisses
      }
    };
  }

  return Object.freeze({
    addRoadSignAt(...args){
      syncState();
      return addRoadSignAt(...args);
    },
    addEnhancedBridgeFurniture(){
      syncState();
      return addEnhancedBridgeFurniture();
    },
    refreshRoadSignsOnly(){
      syncState();
      const result=refreshRoadSignsOnly();
      setRoadGuideSign?.(currentRoadGuideSign);
      return result;
    },
    diagnostics
  });
}

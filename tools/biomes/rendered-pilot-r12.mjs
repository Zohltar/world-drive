/** Explicit first rendered pilot: geometry-only substitution of existing R4
 * InstancedMeshes. Counts, transforms, instance buffers, bounds, material,
 * exclusions, placement and the certified core scheduler are never changed.
 * Every one of a chunk's 1,744 exact candidates must pass the scoped proof.
 * R16 is a separate opt-in split presentation (two meshes, same original prefix).
 */
import {buildNaturalForestStyle,R17_LOOK} from './natural-forest-look-r17.mjs';
import {buildR18RouteIndex,buildUnderstoryStyle,R18_UNDERSTORY} from './understory-layer-r18.mjs';
import {createMixedForestPresentation,R16_PRESENTATION} from './mixed-forest-presentation-r16.mjs';
import {buildDryClimateStyle,createDryClimatePresentation,R19_PRESENTATION} from './dry-climate-presentation-r19.mjs';
import {buildHumidMontaneStyle,createHumidMontanePresentation,R20_PRESENTATION} from './humid-montane-presentation-r20.mjs';
import {buildBorealDiversityStyle,createBorealDiversityPresentation,R21_PRESENTATION} from './boreal-presentation-r21.mjs';
import {buildEifelTemperateStyle,createEifelTemperatePresentation,R22_PRESENTATION} from './eifel-temperate-presentation-r22.mjs';
import {createBiomeWorkerClient} from '../../src/scenery/biomes/biome-worker-client.js';
import {createBiomeChunkContextBridge} from '../../src/scenery/biomes/chunk-context-bridge.js';
import {createBiomeObserverPlan} from '../../src/scenery/biomes/route-observer-plan.js';
import {FOREST_LAYOUT_ID} from '../../src/scenery/biomes/forest-candidate-adapter.js';
import {snapshotIdentity} from '../../src/scenery/biomes/chunk-context-snapshot.js';
import {buildSeasonalVegetationPrototypes} from './vegetation-seasonal-prototypes.mjs';
import {R12_SOURCE,R12_CATALOG_SHA,R12_LIMITS,R12_PROFILE,R13_PROFILE,R14_PROFILE,R15_PROFILE,renderedProfile,renderedRouteMatches,renderedWindowOptions,r12Season,r12Model,createR12Proof,r12ChunkKey,sameR12Geometry} from './rendered-pilot-policy-r12.mjs';

export function validateR12Config(value){
  const text=JSON.stringify(value);if(!text||text.length>2*1024*1024)throw new RangeError('R12 config bound');
  const safe=JSON.parse(text);const identity=snapshotIdentity(safe?.directory);r12Season(safe.season??'summer');
  const profile=renderedProfile(safe.profile??R12_PROFILE);r12Model(safe.season??'summer',profile.id);
  if(!Object.keys(R12_SOURCE).every(k=>identity.source[k]===R12_SOURCE[k])||identity.catalogSha256!==R12_CATALOG_SHA
    ||identity.revision!==profile.revision||typeof safe.baseUrl!=='string')throw new TypeError('R12 pinned source/configuration');
  if(safe.presentation!==undefined&&safe.presentation!==R16_PRESENTATION&&safe.presentation!==R19_PRESENTATION&&safe.presentation!==R20_PRESENTATION&&safe.presentation!==R21_PRESENTATION&&safe.presentation!==R22_PRESENTATION)throw new TypeError('Unknown forest presentation');
  if(safe.presentation===R16_PRESENTATION&&profile.id!==R12_PROFILE)throw new TypeError('R16 mixed presentation is Nord only');
  if(safe.presentation===R19_PRESENTATION&&profile.id!==R14_PROFILE)throw new TypeError('R19 dry presentation is Laguna only');
  if(safe.presentation===R20_PRESENTATION&&profile.id!==R15_PROFILE)throw new TypeError('R20 humid-montane presentation is Yungas only');
  if(safe.presentation===R21_PRESENTATION&&profile.id!==R13_PROFILE)throw new TypeError('R21 boreal diversity presentation is Manic only');
  if(safe.presentation===R22_PRESENTATION&&profile.id!==R12_PROFILE)throw new TypeError('R22 Eifel presentation is Nord only');
  if(safe.appearance!==undefined&&(safe.appearance!==R17_LOOK||safe.presentation!==R16_PRESENTATION||profile.id!==R12_PROFILE))
    throw new TypeError('R17 natural appearance requires the mixed Nord presentation');
  if(safe.understory!==undefined&&(safe.understory!==R18_UNDERSTORY||profile.id!==R12_PROFILE
    ||!((safe.presentation===R16_PRESENTATION&&safe.appearance===R17_LOOK)||safe.presentation===R22_PRESENTATION)))
    throw new TypeError('R18 understory requires an approved Nord presentation');
  return safe;
}
export function scheduleR12(callback,delay=0){
  let cancelled=false,id=null;
  const timer=setTimeout(()=>{
    if(cancelled)return;
    if(typeof globalThis.requestIdleCallback==='function')id=requestIdleCallback(d=>{
      if(!cancelled)callback(d.timeRemaining()>=1);
    },{timeout:1000});
    else callback(true);
  },delay);
  return ()=>{cancelled=true;clearTimeout(timer);if(id!==null)globalThis.cancelIdleCallback?.(id);};
}
export function createRenderedBiomePilot({THREE,forestGroup,getState,getGeneration,getRoute,
  isRouteReady=()=>true,clientFactory=createBiomeWorkerClient,bridgeFactory=createBiomeChunkContextBridge,
  assetFactory=buildSeasonalVegetationPrototypes,schedule=scheduleR12,now=()=>performance.now()}={}){
  for(const f of [getState,getGeneration,getRoute,isRouteReady,clientFactory,bridgeFactory,assetFactory,schedule,now])
    if(typeof f!=='function')throw new TypeError('R12 owner required');
  if(!forestGroup?.addEventListener)throw new TypeError('R12 forest scene required');
  const records=new Map(),proofs=new Map(),rejected=new Map(),groups=new Map();
  let enabled=false,token=0,cancel=null,busy=false,kit=null,client=null,bridge=null,plan=null;
  let config=null,origin=null,generation=null,season='summer',phase='disabled',error=null,worker=null;
  let previousPosition=null,windowSignature=null,knownGeometry=new WeakMap(),parentListening=false;
  let profileId=R12_PROFILE,presentation=null,appearance=null,understory=null,naturalStyle=null,understoryStyle=null,dryStyle=null,humidStyle=null,borealStyle=null,eifelStyle=null,routeIndex=null;
  const waiters=new Set();
  const stats={polls:0,deferrals:0,proofsCompleted:0,proofsRefused:0,proofCandidates:0,swaps:0,restores:0,
    cancelledProofs:0,failures:0,foreignGeometry:0,ownerConflicts:0,proofEvictions:0,
    peakProofs:0,peakMeshes:0,peakGroups:0,maxProofSliceMs:0,maxSceneScanMs:0,maxSwapMs:0,windowUpdates:0};
  function current(t=token){
    if(!enabled||t!==token||!isRouteReady()||getGeneration()!==generation)return false;
    const s=getState();return !!s.gameStarted&&s.origin?.lat===origin?.lat&&s.origin?.lon===origin?.lon;
  }
  function restore(mesh){
    const r=records.get(mesh);if(!r)return;
    if(r.mixed){if(r.mixed.restore())stats.restores++;records.delete(mesh);return;}
    if(mesh.geometry===r.replacement){mesh.geometry=r.original;stats.restores++;}
    else stats.ownerConflicts++;
    records.delete(mesh);
  }
  function stop(){
    enabled=false;token++;cancel?.();cancel=null;busy=false;
    for(const w of [...waiters])w();waiters.clear();
    if(parentListening){forestGroup.removeEventListener('childadded',parentAdded);forestGroup.removeEventListener('childremoved',parentRemoved);parentListening=false;}
    for(const [g,h] of groups){g.removeEventListener('childadded',h.add);g.removeEventListener('childremoved',h.remove);}
    groups.clear();for(const m of [...records.keys()])restore(m);
    bridge?.dispose();client?.dispose();bridge=null;client=null;plan=null;
    understoryStyle?.dispose();understoryStyle=null;routeIndex=null;naturalStyle?.dispose();naturalStyle=null;dryStyle?.dispose();dryStyle=null;humidStyle?.dispose();humidStyle=null;borealStyle?.dispose();borealStyle=null;eifelStyle?.dispose();eifelStyle=null;kit?.dispose();kit=null;
    proofs.clear();rejected.clear();config=null;origin=null;generation=null;worker=null;
    previousPosition=null;windowSignature=null;knownGeometry=new WeakMap();phase='disabled';
  }
  function variant(){return kit.assets.find(a=>a.id===r12Model(season,profileId));}
  function apply(group,proof){
    if(!proof||!current()||proof.profileId!==profileId||proof.projectionId!==plan.adapter.projectionId)return;
    // A hidden cached route may reuse numeric chunk addresses with a different
    // geographic origin. Current-route proof must never paint that other owner.
    const routeOwner=group?.parent;
    if(!groups.has(routeOwner)||routeOwner.visible===false||!forestGroup.children.includes(routeOwner))return;
    const c=r12ChunkKey(group);if(!c||c.key!==proof.key)return;
    // Only the sole canonical R4 mesh. Other scenery is not a presentation target.
    const mesh=group.children?.[0];if(!mesh)return;
    const old=records.get(mesh);
    if(group.children.length!==1&&!old?.mixed)return;
    if(old?.mixed){if(!old.mixed.setSeason(season)){restore(mesh);stats.ownerConflicts++;}return;}
    if(mesh.isInstancedMesh!==true||mesh.userData?.sharedForestGeometry!==true||mesh.userData.forestChunk!==c.key
      ||!mesh.instanceMatrix?.array||mesh.instanceMatrix.array.length>1744*16||!Number.isInteger(mesh.count)
      ||mesh.count<0||mesh.count>1744)return;
    if(!old&&records.size>=R12_LIMITS.meshes)return;
    if(old&&mesh.geometry!==old.replacement){stats.ownerConflicts++;return;}
    const original=old?.original??mesh.geometry;
    let valid=knownGeometry.get(original);
    if(valid===undefined){valid=sameR12Geometry(original,kit.summerAssets[0].parts[0].geometry);knownGeometry.set(original,valid);}
    if(!valid){stats.foreignGeometry++;return;}
    if(presentation===R16_PRESENTATION||presentation===R19_PRESENTATION||presentation===R20_PRESENTATION||presentation===R21_PRESENTATION||presentation===R22_PRESENTATION){
      const t=now();let mixed,id;
      if(presentation===R16_PRESENTATION){mixed=createMixedForestPresentation({THREE,group,source:mesh,kit,proof,season,style:naturalStyle,understory:understoryStyle,routeIndex,now});id='mixed';}
      else if(presentation===R19_PRESENTATION){mixed=createDryClimatePresentation({THREE,group,source:mesh,proof,style:dryStyle,now});id='dry';}
      else if(presentation===R20_PRESENTATION){mixed=createHumidMontanePresentation({THREE,group,source:mesh,proof,style:humidStyle,now});id='humid-montane';}
      else if(presentation===R21_PRESENTATION){mixed=createBorealDiversityPresentation({THREE,group,source:mesh,proof,style:borealStyle,season,now});id='boreal-diversity';}
      else{mixed=createEifelTemperatePresentation({THREE,group,source:mesh,proof,style:eifelStyle,season,understory:understoryStyle,routeIndex,now});id='eifel-temperate';}
      records.set(mesh,{original,replacement:original,id,key:c.key,group,proof,mixed});stats.swaps++;
      stats.maxSwapMs=Math.max(stats.maxSwapMs,now()-t);stats.peakMeshes=Math.max(stats.peakMeshes,records.size);return;
    }
    const asset=variant(),replacement=asset.parts[0].geometry;
    if(mesh.geometry===replacement)return;
    const t=now();mesh.geometry=replacement;
    records.set(mesh,{original,replacement,id:asset.id,key:c.key,group,proof});stats.swaps++;
    stats.maxSwapMs=Math.max(stats.maxSwapMs,now()-t);stats.peakMeshes=Math.max(stats.peakMeshes,records.size);
  }
  function removedChunk(group){for(const m of group?.children??[])restore(m);}
  function watch(group){
    if(!/^forest-route-cache-/.test(group?.name??'')||groups.has(group)||groups.size>=R12_LIMITS.groups)return;
    const add=e=>{if(current()){const c=r12ChunkKey(e.child);if(c)apply(e.child,proofs.get(c.key));}};
    const remove=e=>removedChunk(e.child);
    group.addEventListener('childadded',add);group.addEventListener('childremoved',remove);groups.set(group,{add,remove});
    stats.peakGroups=Math.max(stats.peakGroups,groups.size);
  }
  function parentAdded(e){watch(e.child);}
  function parentRemoved(e){
    const h=groups.get(e.child);if(h){e.child.removeEventListener('childadded',h.add);e.child.removeEventListener('childremoved',h.remove);groups.delete(e.child);}
    for(const c of e.child?.children??[])removedChunk(c);
  }
  function scan(){
    const t=now(),s=getState(),out=[];
    // Some legacy clears remove children directly instead of dispatching events.
    for(const g of [...groups.keys()])if(!forestGroup.children.includes(g))parentRemoved({child:g});
    for(const g of forestGroup.children.slice(0,R12_LIMITS.groups)){
      watch(g);if(g.visible===false)continue;
      for(const c of g.children.slice(0,R12_LIMITS.meshes)){
        const d=r12ChunkKey(c);if(!d)continue;
        if(out.length>=R12_LIMITS.meshes)break;
        const proof=proofs.get(d.key);if(proof)apply(c,proof);
        out.push({...d,group:c,distance:Math.hypot((d.cx+.5)*480-s.absX,(d.cz+.5)*480-s.absZ)});
      }
    }
    for(const [m,r] of records)if(!groups.has(r.group.parent)||!forestGroup.children.includes(r.group.parent)||!r.group.parent.children.includes(r.group))restore(m);
    out.sort((a,b)=>a.distance-b.distance||a.cz-b.cz||a.cx-b.cx);
    stats.maxSceneScanMs=Math.max(stats.maxSceneScanMs,now()-t);return out;
  }
  function yieldIdle(t){
    return new Promise(resolve=>{
      let cancelWait=null,done=false;
      const finish=ok=>{if(done)return;done=true;cancelWait?.();waiters.delete(abort);resolve(ok);};
      const abort=()=>finish(false);waiters.add(abort);
      const arm=()=>{cancelWait=schedule(ok=>{if(!current(t))finish(false);else if(ok)finish(true);else{stats.deferrals++;arm();}},0);};
      arm();
    });
  }
  async function certify(snapshot,c,t){
    const proof=createR12Proof(snapshot,plan.adapter,c.cx,c.cz,profileId);let done=false;
    while(!done){
      if(!await yieldIdle(t)){stats.cancelledProofs++;return null;}
      const begin=now();let n=0;
      while(n<R12_LIMITS.checksPerSlice&&now()-begin<R12_LIMITS.proofSliceMs){
        const row=proof.step(1);n+=row.checked;if(row.done){done=true;break;}
      }
      stats.proofCandidates+=n;stats.maxProofSliceMs=Math.max(stats.maxProofSliceMs,now()-begin);
    }
    return proof.result();
  }
  function remember(proof){
    if(proofs.has(proof.key))proofs.delete(proof.key);
    while(proofs.size>=R12_LIMITS.proofs){proofs.delete(proofs.keys().next().value);stats.proofEvictions++;}
    proofs.set(proof.key,proof);stats.peakProofs=Math.max(stats.peakProofs,proofs.size);
  }
  async function poll(t){
    stats.polls++;
    if(!plan){
      const s=getState();
      if(!s.gameStarted||!isRouteReady()){phase='waiting-route';return;}
      generation=getGeneration();origin={lat:s.origin?.lat,lon:s.origin?.lon};
      if(!Number.isSafeInteger(generation))throw new TypeError('R12 route generation');
      plan=createBiomeObserverPlan(getRoute(),{origin,routeId:`visual-${generation}`});
      // Route admission happens before model/Worker construction. Fine source
      // proof remains independent: no regional class is guessed from this envelope.
      if(!renderedRouteMatches(profileId,plan,origin))
        throw new Error('Pilote visuel : choisir '+renderedProfile(profileId).routeLabel+' avant de démarrer');
      kit=assetFactory(THREE);if(appearance===R17_LOOK)naturalStyle=buildNaturalForestStyle(THREE,kit);
      if(presentation===R19_PRESENTATION)dryStyle=buildDryClimateStyle(THREE);
      if(presentation===R20_PRESENTATION)humidStyle=buildHumidMontaneStyle(THREE);
      if(presentation===R21_PRESENTATION)borealStyle=buildBorealDiversityStyle(THREE);
      if(presentation===R22_PRESENTATION)eifelStyle=buildEifelTemperateStyle(THREE,kit);
      if(understory===R18_UNDERSTORY){routeIndex=buildR18RouteIndex({coordinates:plan.coordinates,origin:plan.adapter.origin});understoryStyle=buildUnderstoryStyle(THREE);}
      client=clientFactory();phase='initializing';
      const ownClient=client;await ownClient.initialize(config);if(!current(t))return;
      bridge=bridgeFactory({client:ownClient,identity:config.directory,layoutId:FOREST_LAYOUT_ID,maxChunks:R12_LIMITS.snapshotChunks});
      const r=await bridge.setRoute(plan.coordinates,{projectionId:plan.adapter.projectionId});if(!current(t))return;
      if(r.status!=='route-ready')throw new Error(r.reason||r.status);
      for(const g of forestGroup.children.slice(0,R12_LIMITS.groups))watch(g);
      forestGroup.addEventListener('childadded',parentAdded);forestGroup.addEventListener('childremoved',parentRemoved);parentListening=true;
    }
    if(!current(t)){stop();return;}
    const s=getState(),position=plan.locate(s.absX,s.absZ);
    if(previousPosition&&Math.hypot(s.absX-previousPosition.x,s.absZ-previousPosition.z)>960){
      // Coordinates remain absolute and proofs are source/route-scoped. A teleport
      // requires a fresh window; it does not turn an old region into a new biome.
      windowSignature=null;rejected.clear();
    }
    previousPosition={x:s.absX,z:s.absZ};
    const todo=scan().filter(c=>!proofs.has(c.key)&&rejected.get(c.key)!==position.signature).slice(0,R12_LIMITS.chunksPerPoll);
    if(!todo.length){phase=records.size?'ready':'waiting-forest';return;}
    if(windowSignature!==position.signature){
      const ready=await bridge.update(position.progress,renderedWindowOptions(profileId,position.direction));
      if(!current(t))return;stats.windowUpdates++;
      if(ready.status!=='ready'){phase='missing-coverage';error=ready.reason??ready.status;return;}
      windowSignature=position.signature;rejected.clear();
    }
    phase='preparing';error=null;
    for(const c of todo){
      if(!current(t))return;
      const result=await bridge.prepareForestChunk({cx:c.cx,cz:c.cz,origin,routeId:plan.adapter.routeId,refresh:!!bridge.get(c.cx,c.cz)?.counts.unavailable});
      if(!current(t))return;
      const proof=result.status==='prepared'?await certify(result.snapshot,c,t):null;
      if(!current(t))return;
      if(proof){remember(proof);stats.proofsCompleted++;for(const g of groups.keys())for(const child of g.children)if(r12ChunkKey(child)?.key===c.key)apply(child,proof);}
      else{stats.proofsRefused++;if(rejected.size>=R12_LIMITS.proofs)rejected.delete(rejected.keys().next().value);rejected.set(c.key,position.signature);}
    }
    const d=await client.diagnostics();if(!current(t))return;
    worker={ready:d.ready,transport:d.transport,source:d.source,handoffs:d.handoffs};
    phase=records.size?'ready':'waiting-eligible-chunks';
  }
  function arm(){
    if(!enabled||busy||cancel||phase==='fault')return;
    cancel=schedule(async admitted=>{
      cancel=null;if(!enabled)return;if(!admitted){stats.deferrals++;arm();return;}
      const t=token;busy=true;
      try{await poll(t);}catch(e){if(t===token){stats.failures++;stop();phase='fault';error=String(e?.message??e).slice(0,200);}}
      finally{if(t===token){busy=false;arm();}}
    },R12_LIMITS.pollMs);
  }
  function pilotId(){return presentation===R22_PRESENTATION?'r22-nord-eifel':presentation===R21_PRESENTATION?'r21-manic-boreal-diversity':presentation===R20_PRESENTATION?'r20-yungas-humid-montane':presentation===R19_PRESENTATION?'r19-laguna-dry':understory===R18_UNDERSTORY?'r18-nord-understory':appearance===R17_LOOK?'r17-nord-natural':presentation===R16_PRESENTATION?'r16-nord-mixed':profileId;}
  function start(value){
    const safe=validateR12Config(value);
    stop();profileId=safe.profile??R12_PROFILE;presentation=safe.presentation??null;appearance=safe.appearance??null;understory=safe.understory??null;
    config={directory:safe.directory,baseUrl:safe.baseUrl};season=safe.season??'summer';enabled=true;phase='waiting-route';error=null;arm();
    return Object.freeze({status:'enabled',pilot:pilotId(),season,placementAuthority:false});
  }
  function setSeason(value){
    r12Model(value,profileId);if(!enabled)throw new Error('Pilote visuel arrêté');season=value;
    for(const r of [...records.values()])apply(r.group,r.proof);
    return {season,modifiedChunks:records.size};
  }
  function diagnostics(){
    let instances=0,understoryInstances=0,understoryChunks=0,potentialAdditionalDrawCalls=0,presentationBytes=0,maxPresentationSyncMs=0;const models={};
    for(const [m,r] of records){
      if(r.mixed){const d=r.mixed.diagnostics();presentationBytes+=d.accountedBytes;maxPresentationSyncMs=Math.max(maxPresentationSyncMs,d.maxSyncMs,d.understory?.maxSyncMs??0);
        if(r.group.parent?.visible===false)continue;instances+=d.instances;potentialAdditionalDrawCalls+=d.potentialAdditionalDrawCalls;
        if(d.understory?.instances){understoryInstances+=d.understory.instances;understoryChunks++;}
        for(const [id,n] of Object.entries(d.models))models[id]=(models[id]??0)+n;
      }else{if(r.group.parent?.visible===false)continue;instances+=m.count;models[r.id]=(models[r.id]??0)+m.count;}
    }
    return {enabled,pilot:pilotId(),sourceProfile:profileId,presentation,appearance,understory,
      appearanceAssets:naturalStyle?.diagnostics()??null,understoryAssets:understoryStyle?.diagnostics()??null,dryClimateAssets:dryStyle?.diagnostics()??null,humidMontaneAssets:humidStyle?.diagnostics()??null,borealAssets:borealStyle?.diagnostics()??null,eifelAssets:eifelStyle?.diagnostics()??null,routeIndex:routeIndex?.diagnostics()??null,
      understoryInstances,understoryChunks,potentialAdditionalDrawCalls,presentationBytes,maxPresentationSyncMs,diagnosticOnly:false,placementAuthority:false,geometrySubstitution:true,
      phase,error,season,...stats,modifiedChunks:records.size,modifiedInstances:instances,models,proofCache:proofs.size,
      limits:R12_LIMITS,worker,bridge:bridge?.diagnostics()??null,
      scope:renderedProfile(profileId).scope,
      seasonScope:presentation===R22_PRESENTATION?'Eifel temperate tree-family presentation + accepted R18 roadside understory; R4 roots, terrain, road, grip, weather and automatic seasons unchanged':presentation===R21_PRESENTATION?'Boreal Manic tree-family presentation only; roots, terrain, road, grip, weather and automatic seasons unchanged':presentation===R20_PRESENTATION?'Humid montane Yungas vegetation presentation only; no altitude zonation, terrain, road, grip, weather or automatic seasons changed':presentation===R19_PRESENTATION?'Dry chaparral vegetation presentation only; terrain, road, grip, weather and automatic seasons unchanged':understory===R18_UNDERSTORY?'Tree models + explicit roadside understory only; terrain, road, grip, weather and automatic seasons unchanged':'Tree models only; terrain, road, grip, weather and automatic seasons unchanged'};
  }
  function audit(){
    // Explicit test/console call, never a frame. No engine references escape.
    const hash=a=>{let h=2166136261;const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h.toString(16);};
    return {enabled,meshes:[...records].map(([m,r])=>({key:r.key,model:r.id,count:m.count,
      matrixBytes:m.instanceMatrix.array.byteLength,matrixHash:hash(m.instanceMatrix.array),
      baseTriangles:(r.original.index?.count??r.original.attributes.position.count)/3,
      triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3,
      geometryOnly:!r.mixed&&m.geometry===r.replacement,...(r.mixed?{mixed:r.mixed.audit()}:{}),proofCandidates:r.proof.count,ecoregion:r.proof.ecoregionId}))};
  }
  return Object.freeze({start,stop,season:setSeason,refresh(){windowSignature=null;rejected.clear();arm();},diagnostics,audit});
}

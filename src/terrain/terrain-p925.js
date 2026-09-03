// R8.5 terrain bridge — P9.25 implementation remains at the stable root owner.
// Issue #4 candidate: suppress road-transition triangles that merely duplicate
// untouched DEM terrain. The permanent P9.25/P9.27 owners remain unchanged
// until the human A/B proves this is the causal visual defect.
import { createTerrainService as createTerrainServiceP925 } from '../terrain-p925.js';

const ISSUE4_NATURAL_COPY_EPSILON_M=0.03;
const ISSUE4_PARENT_FILTER=Symbol.for('world-drive.issue4.transition-natural-copy-filter');

export function filterNaturalCopyTransitionTriangles(group,{
  heightAt,
  getWorldOffset,
  epsilon=ISSUE4_NATURAL_COPY_EPSILON_M
}={}){
  const stats={meshes:0,trianglesBefore:0,trianglesAfter:0,trianglesRemoved:0};
  if(
    group?.name!=='road-terrain-transition'||
    typeof heightAt!=='function'||
    typeof getWorldOffset!=='function'
  )return stats;

  const offset=getWorldOffset()||{x:0,z:0};
  const ox=Number(offset.x)||0;
  const oz=Number(offset.z)||0;
  const threshold=Math.max(0,Number(epsilon)||0);

  group.traverse?.(child=>{
    if(!child?.isMesh)return;
    const geometry=child.geometry;
    const positions=geometry?.getAttribute?.('position');
    const index=geometry?.getIndex?.()||geometry?.index;
    const source=index?.array;
    if(!positions||!source?.length||typeof geometry?.setIndex!=='function')return;

    stats.meshes++;
    stats.trianglesBefore+=Math.floor(source.length/3);
    const changed=new Uint8Array(positions.count||0);
    const changesTerrain=i=>{
      const cached=changed[i];
      if(cached)return cached===2;
      const wx=positions.getX(i)+ox;
      const wz=positions.getZ(i)+oz;
      const natural=heightAt(wx,wz);
      const rendered=positions.getY(i);
      const active=Number.isFinite(natural)&&Number.isFinite(rendered)&&natural-rendered>threshold;
      changed[i]=active?2:1;
      return active;
    };

    const kept=[];
    for(let i=0;i+2<source.length;i+=3){
      const a=source[i],b=source[i+1],c=source[i+2];
      // Keep every triangle that contributes to an actual terrain cut. Drop
      // only triangles whose three vertices sit on the untouched DEM surface.
      if(changesTerrain(a)||changesTerrain(b)||changesTerrain(c)){
        kept.push(a,b,c);
      }
    }

    const after=Math.floor(kept.length/3);
    stats.trianglesAfter+=after;
    stats.trianglesRemoved+=Math.floor(source.length/3)-after;
    if(kept.length!==source.length){
      geometry.setIndex(kept);
      if(geometry.index)geometry.index.needsUpdate=true;
      child.userData={
        ...(child.userData||{}),
        issue4NaturalCopyFiltered:true
      };
    }
  });

  group.userData={
    ...(group.userData||{}),
    issue4NaturalCopyFilter:{...stats,epsilon:threshold}
  };
  return stats;
}

function installTransitionAddFilter(parent,filter){
  if(!parent||typeof parent.add!=='function')return false;
  const existing=parent[ISSUE4_PARENT_FILTER];
  if(existing){
    existing.filter=filter;
    return true;
  }

  const state={filter};
  const originalAdd=parent.add;
  Object.defineProperty(parent,ISSUE4_PARENT_FILTER,{
    value:state,
    configurable:true
  });
  parent.add=function(...objects){
    for(const object of objects){
      if(object?.name==='road-terrain-transition')state.filter?.(object);
    }
    return originalAdd.apply(this,objects);
  };
  return true;
}

export function createTerrainService(options={}){
  const base=createTerrainServiceP925(options);
  const {ground,getWorldOffset}=options;
  const filter=group=>filterNaturalCopyTransitionTriangles(group,{
    heightAt:base.heightAt,
    getWorldOffset
  });
  const ensureFilter=()=>installTransitionAddFilter(ground?.parent,filter);

  ensureFilter();
  return {
    ...base,
    setRoadBed(...args){
      // P9.25 sync creation adds the group inside this call; P9.27 incremental
      // creation later uses the same terrain parent, so one narrow add hook
      // exercises both paths without changing either frozen owner.
      ensureFilter();
      return base.setRoadBed(...args);
    }
  };
}

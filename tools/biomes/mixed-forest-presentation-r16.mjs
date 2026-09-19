/** R16 opt-in temperate mixture. R4 keeps ownership of placement, height and
 * visible prefix. Two compact presentation meshes partition that SAME prefix.
 * Neither source matrices nor source counts/material/bounds are ever written.
 * The 3:1 art weight is not a measured local species composition.
 */
import {seasonalVegetationId} from './vegetation-winter-data.mjs';
export const R16_PRESENTATION='mixed-r16';
export const R16_MODELS=Object.freeze(['preview-temperate','preview-conifer']);
export const R16_MAX_INSTANCES=1744;
export function r16Family(cx,cz,x,z){
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz)||!Number.isFinite(x)||!Number.isFinite(z)
    ||Math.abs(x)>10000||Math.abs(z)>10000)throw new TypeError('R16 finite chunk coordinates required');
  let h=2166136261;
  for(const v of [cx,cz,Math.round(x*1000),Math.round(z*1000),0x523136])h=Math.imul(h^v,16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)%4===0?1:0;
}
export function partitionR16(array,cx,cz){
  if(!(array instanceof Float32Array)||array.length%16||array.length<16||array.length>R16_MAX_INSTANCES*16)
    throw new RangeError('R16 matrix capacity bound');
  const n=array.length/16,indices=[[],[]],prefix=[new Uint16Array(n+1),new Uint16Array(n+1)];
  for(let i=0;i<n;i++){
    for(let j=0;j<16;j++)if(!Number.isFinite(array[i*16+j]))throw new TypeError('R16 non-finite matrix');
    const family=r16Family(cx,cz,array[i*16+12],array[i*16+14]);indices[family].push(i);
    prefix[0][i+1]=prefix[0][i]+(family===0?1:0);prefix[1][i+1]=prefix[1][i]+(family===1?1:0);
  }
  return {capacity:n,indices:indices.map(a=>Uint16Array.from(a)),prefix};
}
const hash=array=>{let h=2166136261;const b=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h.toString(16);};
export function createMixedForestPresentation({THREE,group,source,kit,proof,season,style=null,now=()=>performance.now()}){
  if(proof?.profileId!=='r12-nord-rendered'||proof.ecoregionId!==686||proof.count!==1744)
    throw new TypeError('R16 requires complete accepted temperate source proof');
  if(group.children?.length!==1||group.children[0]!==source||source.visible!==true||source.instanceColor
    ||source.morphTexture||source.matrixAutoUpdate!==false||!source.boundingSphere||!source.matrix)
    throw new TypeError('R16 canonical source mesh required');
  const attribute=source.instanceMatrix,array=attribute.array,geometry=source.geometry,material=source.material,matrix=source.matrix;
  const parts=[],map=partitionR16(array,proof.cx,proof.cz);let disposed=false,failed=false,version=-1,installed=false;
  let builds=0,syncs=0,maxSyncMs=0,callbacks=0,currentSeason=season;
  function asset(family,value){if(style)return style.asset(family,value);const id=seasonalVegetationId(R16_MODELS[family],value);
    const result=kit.assets.find(a=>a.id===id);if(!result?.parts?.[0]?.geometry)throw new TypeError('R16 seasonal asset missing');
    return {id,geometry:result.parts[0].geometry};}
  // Resolve both seasons before changing the scene, including a future switch.
  for(const s of ['summer','winter'])for(const f of [0,1])asset(f,s);
  for(const f of [0,1])asset(f,season);
  function sourceValid(){return source.parent===group&&source.instanceMatrix===attribute&&attribute.array===array
    &&source.geometry===geometry&&source.material===material&&source.matrix===matrix&&!source.instanceColor&&!source.morphTexture&&source.visible===false
    &&source.matrixAutoUpdate===false&&group.children[0]===source
    &&group.children.length===(installed?parts.length+1:1)&&(!installed||(group.children[1]===parts[0]?.mesh&&(parts.length<2||group.children[2]===parts[1].mesh)))
    &&Number.isInteger(source.count)&&source.count>=0&&source.count<=map.capacity;}
  function restore(){
    if(disposed)return false;disposed=true;
    for(const p of parts){p.mesh.onBeforeRender=()=>{};p.mesh.updateMatrixWorld=THREE.InstancedMesh.prototype.updateMatrixWorld;p.mesh.parent?.remove(p.mesh);p.mesh.dispose();}
    if(source.visible===false)source.visible=true;
    return true;
  }
  function sync(){
    if(disposed||failed)return false;
    if(!sourceValid()){
      failed=true;for(const p of parts)p.mesh.count=0;
      // Never restore a stale geometry/material. Only release our visibility mask.
      if(source.visible===false)source.visible=true;
      return false;
    }
    if(version!==attribute.version){
      const begin=now();
      // R4 changes matrix heights on terrain refresh, not horizontal placement.
      // Refuse a changed horizontal assignment instead of displaying stale trees.
      for(const p of parts)for(let j=0;j<p.indices.length;j++){
        const i=p.indices[j],s=i*16,d=j*16;
        for(let k=0;k<16;k++)if(!Number.isFinite(array[s+k])){failed=true;break;}
        if(failed)break;
        if(version!==-1&&(array[s+12]!==p.mesh.instanceMatrix.array[d+12]||array[s+14]!==p.mesh.instanceMatrix.array[d+14])){failed=true;break;}
        for(let k=0;k<16;k++)p.mesh.instanceMatrix.array[d+k]=array[s+k];
      }
      if(failed){for(const p of parts)p.mesh.count=0;source.visible=true;return false;}
      for(const p of parts)p.mesh.instanceMatrix.needsUpdate=true;
      version=attribute.version;syncs++;maxSyncMs=Math.max(maxSyncMs,now()-begin);
    }
    for(const p of parts){
      p.mesh.count=map.prefix[p.family][source.count];
      p.mesh.boundingSphere=source.boundingSphere;p.mesh.boundingBox=source.boundingBox;
    }
    return true;
  }
  try{
    for(const family of [0,1]){
      if(!map.indices[family].length)continue;
      const a=asset(family,season),mesh=new THREE.InstancedMesh(a.geometry,a.material??material,map.indices[family].length);
      mesh.name=`r16-${proof.key}-${family}`;mesh.matrixAutoUpdate=false;mesh.matrix=source.matrix;
      mesh.layers.mask=source.layers.mask;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.frustumCulled=source.frustumCulled;mesh.renderOrder=source.renderOrder;
      mesh.boundingSphere=source.boundingSphere;mesh.boundingBox=source.boundingBox;
      mesh.userData={sharedForestGeometry:true,forestChunk:proof.key,r16Presentation:true};
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      const part={family,id:a.id,mesh,indices:map.indices[family],summerColors:null};parts.push(part);
      if(style){
        part.summerColors=new Float32Array(part.indices.length*3);
        for(let j=0;j<part.indices.length;j++){
          const i=part.indices[j]*16,tint=style.tint(proof.cx,proof.cz,array[i+12],array[i+14]);
          part.summerColors.set(tint,j*3);
        }
        mesh.instanceColor=new THREE.InstancedBufferAttribute(part.summerColors.slice(),3);
        if(season==='winter')mesh.instanceColor.array.fill(1);
        mesh.instanceColor.needsUpdate=true;
      }
      // Synchronize BEFORE WebGLObjects uploads instance attributes (render-list
      // construction), not only onBeforeRender, which would be one upload late.
      mesh.updateMatrixWorld=function(force){callbacks++;sync();return THREE.InstancedMesh.prototype.updateMatrixWorld.call(this,force);};
      mesh.onBeforeRender=()=>{if(!sourceValid()){for(const p of parts)p.mesh.count=0;}};
    }
    source.visible=false;
    if(!sync())throw new TypeError('R16 source changed during construction');
    for(const p of parts)group.add(p.mesh);installed=true;
    if(!sourceValid())throw new TypeError('R16 group ownership changed');builds++;
  }catch(error){restore();throw error;}
  function setSeason(value){
    if(value===currentSeason)return sync();
    const assets=parts.map(p=>asset(p.family,value));
    if(disposed||!sync())return false;
    parts.forEach((p,i)=>{p.id=assets[i].id;p.mesh.geometry=assets[i].geometry;
      p.mesh.material=assets[i].material??material;
      if(p.summerColors){if(value==='summer')p.mesh.instanceColor.array.set(p.summerColors);else p.mesh.instanceColor.array.fill(1);p.mesh.instanceColor.needsUpdate=true;}
    });currentSeason=value;return true;
  }
  function diagnostics(){
    const valid=!disposed&&!failed&&sourceValid(),count=valid?source.count:0,models={};
    for(const p of parts)models[p.id]=valid?map.prefix[p.family][count]:0;
    return {models,instances:count,parts:parts.length,potentialAdditionalDrawCalls:Math.max(0,Object.values(models).filter(n=>n>0).length-1),
      accountedBytes:parts.reduce((n,p)=>n+p.mesh.instanceMatrix.array.byteLength+p.indices.byteLength+(p.summerColors?.byteLength??0)+(p.mesh.instanceColor?.array.byteLength??0),0)
        +map.prefix.reduce((n,p)=>n+p.byteLength,0),builds,syncs,callbacks,maxSyncMs,failed,disposed,season:currentSeason,appearance:style?.id??null};
  }
  function audit(){
    sync();const d=diagnostics(),n=d.instances;let exact=!disposed&&!failed,checked=0;
    const visible=parts.map(p=>{
      const count=map.prefix[p.family][n],a=p.mesh.instanceMatrix.array;
      for(let j=0;j<count;j++){const i=p.indices[j];if(i>=n)exact=false;
        for(let k=0;k<16;k++)if(!Object.is(a[j*16+k],array[i*16+k]))exact=false;checked++;}
      return {model:p.id,count,matrixHash:hash(a.subarray(0,count*16)),...(style?{textured:!!p.mesh.material.map,alphaTest:p.mesh.material.alphaTest,colorHash:hash(p.mesh.instanceColor.array)}:{}),triangles:(p.mesh.geometry.index?.count??p.mesh.geometry.attributes.position.count)/3};
    });
    return {...d,parts:visible,sourcePrefixExact:exact&&checked===n,sourceHidden:source.visible===false,
      sourceGeometryUnchanged:source.geometry===geometry,sourceAttributeUnchanged:source.instanceMatrix===attribute,
      sourceMaterialUnchanged:source.material===material,sourceMatrixHash:hash(array),sourceCount:source.count};
  }
  return Object.freeze({setSeason,sync,restore,diagnostics,audit});
}

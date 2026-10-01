/** R19: research-calibrated Fort Ord/Laguna Mediterranean presentation.
 * R4 keeps root placement and visible-prefix ownership. Existing accepted roots
 * are repartitioned into coast-live-oak-like woodland, maritime chaparral scrub
 * and dry grass. Visual weights are not habitat-area or species percentages.
 */
import {buildVegetationPrototypeData} from './vegetation-prototype-data.mjs';

export const R19_PRESENTATION='dry-r19';
export const R19_MODELS=Object.freeze(['coast-live-oak','maritime-chaparral','dry-grass']);
export const R19_MAX_INSTANCES=1744;
const TAU=Math.PI*2;

function finite(v,name){if(!Number.isFinite(v))throw new TypeError('R19 '+name);return v;}
function hash32(cx,cz,x,z,salt=0){
  let h=2166136261;
  for(const v of [cx,cz,Math.round(x*1000),Math.round(z*1000),salt])h=Math.imul(h^v,16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return h>>>0;
}
export function r19Family(cx,cz,x,z){
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new TypeError('R19 chunk coordinates');
  finite(x,'x');finite(z,'z');
  const n=hash32(cx,cz,x,z,0x523139)%100;
  return n<18?0:n<80?1:2; // 18% oak /62% chaparral /20% dry-grass visual allocation; not measured cover.
}
export function r19Transform(family,cx,cz,x,z){
  if(family!==1&&family!==2)throw new TypeError('R19 low family');
  const a=hash32(cx,cz,x,z,0x19a),b=hash32(cx,cz,x,z,0x19b),c=hash32(cx,cz,x,z,0x19c);
  const u=a/4294967296,v=b/4294967296,w=c/4294967296;
  if(family===1)return Object.freeze({yaw:u*TAU,sx:1.45+v*.80,sy:1.20+w*.60,sz:1.40+(1-v)*.75});
  return Object.freeze({yaw:u*TAU,sx:1.45+v*.80,sy:.72+w*.48,sz:1.40+(1-v)*.75});
}
export function partitionR19(array,cx,cz){
  if(!(array instanceof Float32Array)||array.length%16||array.length<16||array.length>R19_MAX_INSTANCES*16)
    throw new RangeError('R19 matrix capacity bound');
  const n=array.length/16,indices=[[],[],[]],prefix=[new Uint16Array(n+1),new Uint16Array(n+1),new Uint16Array(n+1)];
  for(let i=0;i<n;i++){
    for(let j=0;j<16;j++)if(!Number.isFinite(array[i*16+j]))throw new TypeError('R19 non-finite matrix');
    const family=r19Family(cx,cz,array[i*16+12],array[i*16+14]);indices[family].push(i);
    for(let f=0;f<3;f++)prefix[f][i+1]=prefix[f][i]+(family===f?1:0);
  }
  return {capacity:n,indices:indices.map(a=>Uint16Array.from(a)),prefix};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};

function coastLiveOakData(){
  // A broad, low-branching evergreen oak silhouette rather than the old flat
  // woodland disks. It is a regional physiognomy cue, not a species mesh claim.
  const p=[],n=[],c=[],bark=[.105,.070,.038],leaf=[.070,.145,.047];
  function tri(a,b,d,color,normal=null){
    const no=normal??norm(cross(b.map((v,i)=>v-a[i]),d.map((v,i)=>v-a[i])));
    for(const q of [a,b,d]){p.push(...q);n.push(...no);c.push(...color);}
  }
  function branch(a,b,r0,r1){
    const axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.92?[1,0,0]:[0,1,0])),v=cross(axis,u),sides=5;
    const ring=(point,r,i)=>{const t=i*TAU/sides,no=norm(u.map((x,j)=>x*Math.cos(t)+v[j]*Math.sin(t)));return {q:point.map((x,j)=>x+no[j]*r),no};};
    for(let i=0;i<sides;i++){
      const j=(i+1)%sides,A=ring(a,r0,i),B=ring(a,r0,j),C=ring(b,r1,i),D=ring(b,r1,j);
      tri(A.q,C.q,B.q,bark,A.no);tri(B.q,C.q,D.q,bark,D.no);
    }
  }
  function lobe(cx,cy,cz,rx,ry,rz,phase,shade){
    const sides=8,top=[cx,cy+ry,cz],bottom=[cx,cy-ry*.72,cz],ring=[];
    for(let i=0;i<sides;i++){
      const a=i*TAU/sides+phase,w=1+.08*Math.sin(i*2.17+phase*3);
      ring.push([cx+Math.cos(a)*rx*w,cy+Math.sin(i*1.71+phase)*ry*.10,cz+Math.sin(a)*rz*w]);
    }
    const color=leaf.map(v=>v*shade);
    for(let i=0;i<sides;i++){
      const j=(i+1)%sides;
      const noTop=norm([(ring[i][0]-cx)/rx,.72,(ring[i][2]-cz)/rz]);
      const noBottom=norm([(ring[i][0]-cx)/rx,-.42,(ring[i][2]-cz)/rz]);
      tri(ring[i],top,ring[j],color,noTop);tri(ring[j],bottom,ring[i],color,noBottom);
    }
  }
  branch([0,0,0],[.012,.46,-.010],.050,.035);
  branch([.008,.34,-.006],[-.31,.61,.045],.034,.016);
  branch([.008,.36,-.005],[.33,.60,-.030],.032,.015);
  branch([.010,.45,-.008],[-.16,.76,-.20],.027,.012);
  branch([.012,.46,-.008],[.18,.77,.21],.026,.012);
  branch([-.12,.55,.025],[-.43,.68,.13],.017,.007);
  const lobes=[
    [-.36,.69,.10,.30,.18,.28,.20,.94],[-.13,.77,-.18,.31,.20,.29,.65,1.00],
    [.14,.78,.17,.32,.20,.30,1.15,.97],[.38,.68,-.08,.29,.17,.27,1.70,.92],
    [-.27,.86,-.08,.27,.18,.26,2.05,1.04],[.02,.91,-.04,.32,.20,.30,2.55,.98],
    [.29,.86,.09,.26,.17,.25,3.10,1.03],[-.06,.65,.14,.34,.19,.31,3.65,.91],
    [.10,.68,-.20,.31,.18,.29,4.20,.95],[-.43,.76,-.09,.23,.15,.22,4.80,.96]
  ];
  for(const x of lobes)lobe(...x);
  const reference=buildVegetationPrototypeData('preview-woodland').positions;
  let referenceTop=0,top=0;
  for(let i=1;i<reference.length;i+=3)referenceTop=Math.max(referenceTop,reference[i]);
  for(let i=1;i<p.length;i+=3)top=Math.max(top,p[i]);
  const fit=referenceTop/top;
  for(let i=0;i<p.length;i++)p[i]*=fit;
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),triangles:p.length/9};
}
function maritimeChaparralData(){
  const p=[],n=[],c=[];
  function tri(a,b,d,color,normal=null){const no=normal??norm(cross(b.map((v,i)=>v-a[i]),d.map((v,i)=>v-a[i])));
    for(const q of [a,b,d]){p.push(...q);n.push(...no);c.push(...color);}}
  function strip(a,b,width,color){
    const axis=norm(b.map((v,i)=>v-a[i])),side=norm(cross(axis,Math.abs(axis[1])>.92?[1,0,0]:[0,1,0])).map(v=>v*width);
    const p0=a.map((v,i)=>v+side[i]),p1=a.map((v,i)=>v-side[i]),p2=b.map((v,i)=>v+side[i]),p3=b.map((v,i)=>v-side[i]);
    tri(p0,p2,p1,color);tri(p1,p2,p3,color);
  }
  for(let i=0;i<14;i++){
    const a=i/14*TAU+i*.31,r=.10+(i%5)*.065,height=.34+(i%6)*.075;
    strip([Math.cos(a)*r*.25,0,Math.sin(a)*r*.25],[Math.cos(a)*r,height,Math.sin(a)*r],.010+(i%3)*.003,[.28,.19,.095]);
  }
  for(let i=0;i<18;i++){
    const a=i/18*TAU+i*.17,r=.18+(i%6)*.07,h=.22+(i%7)*.055,w=.028+(i%4)*.009;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,side=[-Math.sin(a)*w,0,Math.cos(a)*w];
    const base=[x,0,z],top=[x*.94,h,z*.94],p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=top.map((v,j)=>v+side[j]),p3=top.map((v,j)=>v-side[j]);
    const col=i%3===0?[.12,.205,.060]:[.085,.165,.050];tri(p0,p1,p2,col,[Math.cos(a),.12,Math.sin(a)]);tri(p0,p2,p3,col,[Math.cos(a),.12,Math.sin(a)]);
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),triangles:p.length/9};
}
function dryGrassData(){
  const p=[],n=[],c=[];
  function tri(a,b,d,color,normal){for(const q of [a,b,d]){p.push(...q);n.push(...normal);c.push(...color);}}
  for(let i=0;i<25;i++){
    const a=i/25*TAU+i*.41,r=.12+(i%6)*.065,h=.24+(i%8)*.040,w=.010+(i%4)*.004,lean=.025+(i%5)*.010;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,side=[-Math.sin(a)*w,0,Math.cos(a)*w];
    const base=[x,0,z],top=[x+Math.cos(a)*lean,h,z+Math.sin(a)*lean];
    const p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=top.map((v,j)=>v+side[j]),p3=top.map((v,j)=>v-side[j]);
    const col=i%3===0?[.46,.345,.135]:i%3===1?[.38,.285,.105]:[.50,.405,.175],normal=norm([Math.cos(a),.08,Math.sin(a)]);
    tri(p0,p1,p2,col,normal);tri(p0,p2,p3,col,normal);
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),triangles:p.length/9};
}
function geometry(THREE,data,name){
  const g=new THREE.BufferGeometry();g.name=name;
  g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function buildDryClimateStyle(THREE){
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,fog:true,dithering:true});
  material.name='r19-dry-climate-vertex';
  const owned=[],data=[coastLiveOakData(),maritimeChaparralData(),dryGrassData()];
  const assets=data.map((d,i)=>{const g=geometry(THREE,d,'r19-'+R19_MODELS[i]);owned.push(g);return Object.freeze({id:R19_MODELS[i],geometry:g,material,triangles:d.triangles});});
  let disposed=false;
  return Object.freeze({id:R19_PRESENTATION,
    asset(family){if(disposed)throw new Error('R19 style disposed');if(!Number.isInteger(family)||family<0||family>2)throw new TypeError('R19 family');return assets[family];},
    transform:r19Transform,
    dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();material.dispose();},
    diagnostics:()=>({id:R19_PRESENTATION,models:[...R19_MODELS],triangles:assets.map(a=>a.triangles),sharedMaterials:1,transparent:false,disposed,
      mix:{oakVisualWeight:18,chaparralVisualWeight:62,dryGrassVisualWeight:20,measuredHabitatPercent:false},
      scope:'Laguna R14 / Fort Ord-compatible coast live oak + maritime chaparral + dry grass; R4 roots unchanged'})
  });
}
const hash=array=>{let h=2166136261;const b=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h.toString(16);};

export function createDryClimatePresentation({THREE,group,source,proof,style,now=()=>performance.now()}){
  if(proof?.profileId!=='r14-laguna-woodland'||proof.ecoregionId!==423||proof.count!==1744)
    throw new TypeError('R19 requires complete accepted Laguna source proof');
  if(!style?.asset||!style?.transform)throw new TypeError('R19 dry style required');
  if(group.children?.length!==1||group.children[0]!==source||source.visible!==true||source.instanceColor
    ||source.morphTexture||source.matrixAutoUpdate!==false||!source.boundingSphere||!source.matrix)
    throw new TypeError('R19 canonical source mesh required');
  const attribute=source.instanceMatrix,array=attribute.array,geometry0=source.geometry,material0=source.material,matrix=source.matrix;
  const map=partitionR19(array,proof.cx,proof.cz),parts=[];let disposed=false,failed=false,version=-1,installed=false,syncs=0,maxSyncMs=0,currentSeason='summer';
  function sourceValid(){
    return source.parent===group&&source.instanceMatrix===attribute&&attribute.array===array&&source.geometry===geometry0&&source.material===material0
      &&source.matrix===matrix&&!source.instanceColor&&!source.morphTexture&&source.visible===false&&source.matrixAutoUpdate===false
      &&group.children[0]===source&&group.children.length===(installed?1+parts.length:1)
      &&(!installed||parts.every((p,i)=>group.children[i+1]===p.mesh))
      &&Number.isInteger(source.count)&&source.count>=0&&source.count<=map.capacity;
  }
  function restore(){
    if(disposed)return false;disposed=true;
    for(const p of parts){p.mesh.onBeforeRender=()=>{};p.mesh.updateMatrixWorld=THREE.InstancedMesh.prototype.updateMatrixWorld;p.mesh.parent?.remove(p.mesh);p.mesh.dispose();}
    if(source.visible===false)source.visible=true;return true;
  }
  function sync(){
    if(disposed||failed)return false;
    if(!sourceValid()){failed=true;for(const p of parts)p.mesh.count=0;if(source.visible===false)source.visible=true;return false;}
    if(version!==attribute.version){
      const begin=now();
      for(const p of parts){
        const dst=p.mesh.instanceMatrix.array;
        for(let j=0;j<p.indices.length;j++){
          const i=p.indices[j],s=i*16,d=j*16,x=array[s+12],y=array[s+13],z=array[s+14];
          for(let k=0;k<16;k++)if(!Number.isFinite(array[s+k])){failed=true;break;}
          if(failed)break;
          if(version!==-1&&(x!==dst[d+12]||z!==dst[d+14])){failed=true;break;}
          if(p.family===0){for(let k=0;k<16;k++)dst[d+k]=array[s+k];}
          else{
            const m=j*4,yaw=p.meta[m],sx=p.meta[m+1],sy=p.meta[m+2],sz=p.meta[m+3],co=Math.cos(yaw),si=Math.sin(yaw);
            dst[d]=co*sx;dst[d+1]=0;dst[d+2]=-si*sx;dst[d+3]=0;
            dst[d+4]=0;dst[d+5]=sy;dst[d+6]=0;dst[d+7]=0;
            dst[d+8]=si*sz;dst[d+9]=0;dst[d+10]=co*sz;dst[d+11]=0;
            dst[d+12]=x;dst[d+13]=y+.28;dst[d+14]=z;dst[d+15]=1;
          }
        }
        if(failed)break;p.mesh.instanceMatrix.needsUpdate=true;
      }
      if(failed){for(const p of parts)p.mesh.count=0;source.visible=true;return false;}
      version=attribute.version;syncs++;maxSyncMs=Math.max(maxSyncMs,now()-begin);
    }
    for(const p of parts){p.mesh.count=map.prefix[p.family][source.count];p.mesh.boundingSphere=source.boundingSphere;p.mesh.boundingBox=source.boundingBox;}
    return true;
  }
  try{
    for(let family=0;family<3;family++){
      if(!map.indices[family].length)continue;
      const a=style.asset(family),mesh=new THREE.InstancedMesh(a.geometry,a.material,map.indices[family].length);
      mesh.name='r19-'+proof.key+'-'+R19_MODELS[family];mesh.matrixAutoUpdate=false;mesh.matrix=source.matrix;
      mesh.layers.mask=source.layers.mask;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.frustumCulled=source.frustumCulled;mesh.renderOrder=source.renderOrder;mesh.boundingSphere=source.boundingSphere;mesh.boundingBox=source.boundingBox;
      mesh.userData={sharedForestGeometry:true,forestChunk:proof.key,r19Presentation:true,r19Family:R19_MODELS[family]};
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      const meta=[];
      if(family!==0)for(const i of map.indices[family]){const s=i*16,t=style.transform(family,proof.cx,proof.cz,array[s+12],array[s+14]);meta.push(t.yaw,t.sx,t.sy,t.sz);}
      const part={family,id:a.id,mesh,indices:map.indices[family],meta:Float32Array.from(meta),triangles:a.triangles};parts.push(part);
      mesh.updateMatrixWorld=function(force){sync();return THREE.InstancedMesh.prototype.updateMatrixWorld.call(this,force);};
      mesh.onBeforeRender=()=>{if(!sourceValid())for(const p of parts)p.mesh.count=0;};
    }
    for(const p of parts)group.add(p.mesh);source.visible=false;installed=true;if(!sync())throw new Error('R19 initial sync failed');
  }catch(error){restore();throw error;}
  function setSeason(value){if(value!=='summer')return false;currentSeason=value;return sync();}
  function diagnostics(){
    const models={},instances=parts.reduce((sum,p)=>{models[p.id]=p.mesh.count;return sum+p.mesh.count;},0);
    const accountedBytes=parts.reduce((sum,p)=>sum+p.mesh.instanceMatrix.array.byteLength+p.indices.byteLength+p.meta.byteLength+map.prefix[p.family].byteLength,0);
    return {id:R19_PRESENTATION,season:currentSeason,instances,models,parts:parts.length,potentialAdditionalDrawCalls:Math.max(0,parts.length-1),
      accountedBytes,syncs,maxSyncMs,sourceHidden:source.visible===false,failed};
  }
  function audit(){
    let exact=true;const list=[];
    for(const p of parts){
      const dst=p.mesh.instanceMatrix.array,count=p.mesh.count;
      if(count!==map.prefix[p.family][source.count])exact=false;
      for(let j=0;j<count;j++){const i=p.indices[j],s=i*16,d=j*16;if(dst[d+12]!==array[s+12]||dst[d+14]!==array[s+14]){exact=false;break;}}
      list.push({id:p.id,family:p.family,count,capacity:p.indices.length,triangles:p.triangles,matrixHash:hash(dst),rootXZHash:hash(Float32Array.from(Array.from({length:p.indices.length},(_,j)=>[dst[j*16+12],dst[j*16+14]]).flat()))});
    }
    return {sourcePrefixExact:exact,sourceHidden:source.visible===false,parts:list,models:Object.fromEntries(list.map(p=>[p.id,p.count])),instances:list.reduce((s,p)=>s+p.count,0)};
  }
  return Object.freeze({restore,setSeason,diagnostics,audit});
}

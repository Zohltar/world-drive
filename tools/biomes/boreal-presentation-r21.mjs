/** R21: research-calibrated Eastern Canadian boreal presentation for Manic.
 * R4 retains placement, exclusions, density, transforms and visible-prefix
 * ownership. Existing accepted roots are repartitioned into boreal physiognomy
 * families supported by Quebec/Canadian vegetation references. Visual weights
 * are artistic, not measured local species or habitat percentages.
 */

export const R21_PRESENTATION='boreal-diversity-r21';
export const R21_MODELS=Object.freeze(['black-spruce','balsam-fir','paper-birch','trembling-aspen']);
export const R21_MAX_INSTANCES=1744;
const TAU=Math.PI*2;

function finite(v,name){if(!Number.isFinite(v))throw new TypeError('R21 '+name);return v;}
function hash32(cx,cz,x,z,salt=0){
  let h=2166136261;
  for(const v of [cx,cz,Math.round(x*1000),Math.round(z*1000),salt])h=Math.imul(h^v,16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return h>>>0;
}
export function r21Family(cx,cz,x,z){
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new TypeError('R21 chunk coordinates');
  finite(x,'x');finite(z,'z');
  const n=hash32(cx,cz,x,z,0x523231)%100;
  return n<46?0:n<80?1:n<94?2:3; // 46/34/14/6 visual allocation; not measured cover.
}
export function partitionR21(array,cx,cz){
  if(!(array instanceof Float32Array)||array.length%16||array.length<16||array.length>R21_MAX_INSTANCES*16)
    throw new RangeError('R21 matrix capacity bound');
  const n=array.length/16,indices=[[],[],[],[]],prefix=[new Uint16Array(n+1),new Uint16Array(n+1),new Uint16Array(n+1),new Uint16Array(n+1)];
  for(let i=0;i<n;i++){
    for(let j=0;j<16;j++)if(!Number.isFinite(array[i*16+j]))throw new TypeError('R21 non-finite matrix');
    const family=r21Family(cx,cz,array[i*16+12],array[i*16+14]);indices[family].push(i);
    for(let f=0;f<4;f++)prefix[f][i+1]=prefix[f][i]+(family===f?1:0);
  }
  return {capacity:n,indices:indices.map(a=>Uint16Array.from(a)),prefix};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
function meshBuilder(){
  const p=[],n=[],c=[];
  const tri=(a,b,d,color,normal=null)=>{const no=normal??norm(cross(b.map((v,i)=>v-a[i]),d.map((v,i)=>v-a[i])));for(const q of [a,b,d]){p.push(...q);n.push(...no);c.push(...color);}};
  const branch=(a,b,r0,r1,color=[.13,.085,.045],sides=5)=>{
    const axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.92?[1,0,0]:[0,1,0])),v=cross(axis,u);
    const ring=(point,r,i)=>{const t=i*TAU/sides,no=norm(u.map((x,j)=>x*Math.cos(t)+v[j]*Math.sin(t)));return {q:point.map((x,j)=>x+no[j]*r),no};};
    for(let i=0;i<sides;i++){const j=(i+1)%sides,A=ring(a,r0,i),B=ring(a,r0,j),C=ring(b,r1,i),D=ring(b,r1,j);tri(A.q,C.q,B.q,color,A.no);tri(B.q,C.q,D.q,color,D.no);}
  };
  return {p,n,c,tri,branch,data:()=>({positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),triangles:p.length/9})};
}
function quad(b,base,tip,width,color,normal){
  const axis=norm(tip.map((v,i)=>v-base[i])),side=norm(cross(axis,[0,1,0])).map(v=>v*width);
  const p0=base.map((v,i)=>v-side[i]),p1=base.map((v,i)=>v+side[i]),p2=tip.map((v,i)=>v+side[i]),p3=tip.map((v,i)=>v-side[i]);
  b.tri(p0,p1,p2,color,normal);b.tri(p0,p2,p3,color,normal);
}
function coniferData(kind,winter=false){
  const b=meshBuilder(),spruce=kind==='black-spruce',bark=spruce?[.105,.073,.045]:[.125,.082,.042];
  b.branch([0,0,0],[0,.96,0],.038,.010,bark,6);
  const tiers=spruce?9:8,branches=spruce?6:8,green=spruce?[.032,.105,.055]:[.045,.145,.060];
  for(let t=0;t<tiers;t++){
    const q=t/(tiers-1),y=.17+q*.68,rad=(spruce?.31:.37)*Math.pow(1-q,spruce?.83:.66)+.035;
    for(let i=0;i<branches;i++){
      const a=i/branches*TAU+t*.29,drop=spruce?.055+.025*(1-q):.020+.018*(1-q),len=rad*(.88+((i+t)%3)*.06);
      const base=[0,y,0],tip=[Math.cos(a)*len,y-drop,Math.sin(a)*len],no=norm([Math.cos(a),.35,Math.sin(a)]);
      quad(b,base,tip,.027+(1-q)*.018,green,no);
      const sideA=a+.55,sideTip=[Math.cos(sideA)*len*.58,y+.018,Math.sin(sideA)*len*.58];quad(b,[Math.cos(a)*len*.35,y-drop*.35,Math.sin(a)*len*.35],sideTip,.018,green,no);
      if(winter){const snow=[.82,.86,.90],sb=[Math.cos(a)*len*.18,y+.010,Math.sin(a)*len*.18],st=[Math.cos(a)*len*.82,y-drop*.72+.015,Math.sin(a)*len*.82];quad(b,sb,st,.020+(1-q)*.014,snow,[0,1,0]);}
    }
  }
  return b.data();
}
function crownLobe(b,cx,cy,cz,rx,ry,rz,phase,color){
  const sides=7,top=[cx,cy+ry,cz],bottom=[cx,cy-ry*.70,cz],ring=[];
  for(let i=0;i<sides;i++){const a=i*TAU/sides+phase,w=1+.10*Math.sin(i*1.9+phase*2.2);ring.push([cx+Math.cos(a)*rx*w,cy+Math.sin(i*1.47+phase)*ry*.08,cz+Math.sin(a)*rz*w]);}
  for(let i=0;i<sides;i++){const j=(i+1)%sides;b.tri(ring[i],top,ring[j],color,norm([(ring[i][0]-cx)/rx,.7,(ring[i][2]-cz)/rz]));b.tri(ring[j],bottom,ring[i],color,norm([(ring[i][0]-cx)/rx,-.35,(ring[i][2]-cz)/rz]));}
}
function deciduousData(kind,winter=false){
  const b=meshBuilder(),birch=kind==='paper-birch',bark=birch?[.74,.72,.64]:[.46,.48,.42];
  b.branch([0,0,0],[0,.58,0],.045,.025,bark,6);
  const branches=[[-.24,.75,.06],[.24,.73,-.05],[-.13,.86,-.19],[.15,.88,.18],[-.31,.65,-.08],[.30,.66,.10]];
  for(const end of branches)b.branch([0,.42,0],end,.021,.008,bark,5);
  if(!winter){
    const leaf=birch?[.105,.31,.085]:[.12,.34,.09],leaf2=birch?[.085,.25,.07]:[.095,.28,.075];
    const lobes=[[-.25,.78,.06,.23,.16,.22,.2,leaf],[.24,.77,-.05,.24,.16,.23,.8,leaf2],[-.10,.89,-.18,.21,.15,.20,1.3,leaf],[.13,.90,.18,.22,.15,.21,1.8,leaf2],[-.29,.69,-.07,.20,.14,.19,2.4,leaf2],[.28,.70,.09,.20,.14,.19,3.0,leaf],[0,.82,.02,.26,.17,.24,3.6,leaf]];
    for(const x of lobes)crownLobe(b,...x);
  }else{
    const snow=[.84,.87,.90];
    for(let i=0;i<branches.length;i++)if(i%2===0){const e=branches[i],base=[e[0]*.45,.52,e[2]*.45],tip=[e[0]*.78,e[1]-.015,e[2]*.78];quad(b,base,tip,.020,snow,[0,1,0]);}
  }
  return b.data();
}
function geometry(THREE,data,name){const g=new THREE.BufferGeometry();g.name=name;g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));g.computeBoundingBox();g.computeBoundingSphere();return g;}
export function buildBorealDiversityStyle(THREE){
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,fog:true,dithering:true});material.name='r21-manic-boreal-diversity';
  const summer=[coniferData('black-spruce'),coniferData('balsam-fir'),deciduousData('paper-birch'),deciduousData('trembling-aspen')];
  const winter=[coniferData('black-spruce',true),coniferData('balsam-fir',true),deciduousData('paper-birch',true),deciduousData('trembling-aspen',true)];
  const owned=[],assets=[summer,winter].map((set,season)=>set.map((d,i)=>{const s=season?'winter':'summer',g=geometry(THREE,d,`r21-${R21_MODELS[i]}-${s}`);owned.push(g);return Object.freeze({id:R21_MODELS[i],season:s,geometry:g,material,triangles:d.triangles});}));
  let disposed=false;
  return Object.freeze({id:R21_PRESENTATION,asset(family,season='summer'){if(disposed)throw new Error('R21 style disposed');if(!Number.isInteger(family)||family<0||family>3)throw new TypeError('R21 family');if(season!=='summer'&&season!=='winter')throw new TypeError('R21 season');return assets[season==='winter'?1:0][family];},
    dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();material.dispose();},
    diagnostics:()=>({id:R21_PRESENTATION,models:[...R21_MODELS],summerTriangles:assets[0].map(a=>a.triangles),winterTriangles:assets[1].map(a=>a.triangles),sharedMaterials:1,transparent:false,disposed,
      mix:{blackSpruceVisualWeight:46,balsamFirVisualWeight:34,paperBirchVisualWeight:14,tremblingAspenVisualWeight:6,measuredHabitatPercent:false},
      scope:'Eastern Canadian boreal Manic cues: black spruce + balsam fir dominant, paper birch/aspen associates; existing R4 roots unchanged'})});
}
const hash=array=>{let h=2166136261;const b=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h.toString(16);};
export function createBorealDiversityPresentation({THREE,group,source,proof,style,season='summer',now=()=>performance.now()}){
  if(proof?.profileId!=='r13-manic-boreal'||proof.ecoregionId!==373||proof.count!==1744)throw new TypeError('R21 requires complete accepted Manic source proof');
  if(!style?.asset)throw new TypeError('R21 boreal style required');
  if(season!=='summer'&&season!=='winter')throw new TypeError('R21 season');
  if(group.children?.length!==1||group.children[0]!==source||source.visible!==true||source.instanceColor||source.morphTexture||source.matrixAutoUpdate!==false||!source.boundingSphere||!source.matrix)
    throw new TypeError('R21 canonical source mesh required');
  const attribute=source.instanceMatrix,array=attribute.array,geometry0=source.geometry,material0=source.material,matrix=source.matrix;
  const map=partitionR21(array,proof.cx,proof.cz),parts=[];let disposed=false,failed=false,version=-1,installed=false,syncs=0,maxSyncMs=0,currentSeason=season;
  function sourceValid(){return source.parent===group&&source.instanceMatrix===attribute&&attribute.array===array&&source.geometry===geometry0&&source.material===material0&&source.matrix===matrix&&!source.instanceColor&&!source.morphTexture&&source.visible===false&&source.matrixAutoUpdate===false&&group.children[0]===source&&group.children.length===(installed?1+parts.length:1)&&(!installed||parts.every((p,i)=>group.children[i+1]===p.mesh))&&Number.isInteger(source.count)&&source.count>=0&&source.count<=map.capacity;}
  function restore(){if(disposed)return false;disposed=true;for(const p of parts){p.mesh.onBeforeRender=()=>{};p.mesh.updateMatrixWorld=THREE.InstancedMesh.prototype.updateMatrixWorld;p.mesh.parent?.remove(p.mesh);p.mesh.dispose();}if(source.visible===false)source.visible=true;return true;}
  function sync(){
    if(disposed||failed)return false;if(!sourceValid()){failed=true;for(const p of parts)p.mesh.count=0;if(source.visible===false)source.visible=true;return false;}
    if(version!==attribute.version){const begin=now();for(const p of parts){const dst=p.mesh.instanceMatrix.array;for(let j=0;j<p.indices.length;j++){const i=p.indices[j],s=i*16,d=j*16;for(let k=0;k<16;k++){const v=array[s+k];if(!Number.isFinite(v)){failed=true;break;}dst[d+k]=v;}if(failed)break;}if(failed)break;p.mesh.instanceMatrix.needsUpdate=true;}if(failed){for(const p of parts)p.mesh.count=0;source.visible=true;return false;}version=attribute.version;syncs++;maxSyncMs=Math.max(maxSyncMs,now()-begin);}
    for(const p of parts){p.mesh.count=map.prefix[p.family][source.count];p.mesh.boundingSphere=source.boundingSphere;p.mesh.boundingBox=source.boundingBox;}return true;
  }
  try{
    for(let family=0;family<4;family++){
      if(!map.indices[family].length)continue;const a=style.asset(family,currentSeason),mesh=new THREE.InstancedMesh(a.geometry,a.material,map.indices[family].length);
      mesh.name='r21-'+proof.key+'-'+R21_MODELS[family];mesh.matrixAutoUpdate=false;mesh.matrix=source.matrix;mesh.layers.mask=source.layers.mask;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.frustumCulled=source.frustumCulled;mesh.renderOrder=source.renderOrder;mesh.boundingSphere=source.boundingSphere;mesh.boundingBox=source.boundingBox;
      mesh.userData={sharedForestGeometry:true,forestChunk:proof.key,r21Presentation:true,r21Family:R21_MODELS[family]};mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      const part={family,id:a.id,mesh,indices:map.indices[family],triangles:a.triangles};parts.push(part);mesh.updateMatrixWorld=function(force){sync();return THREE.InstancedMesh.prototype.updateMatrixWorld.call(this,force);};mesh.onBeforeRender=()=>{if(!sourceValid())for(const p of parts)p.mesh.count=0;};
    }
    for(const p of parts)group.add(p.mesh);source.visible=false;installed=true;if(!sync())throw new Error('R21 initial sync failed');
  }catch(error){restore();throw error;}
  function setSeason(value){
    if(value!=='summer'&&value!=='winter')return false;if(disposed||failed)return false;
    currentSeason=value;for(const p of parts){const a=style.asset(p.family,currentSeason);p.mesh.geometry=a.geometry;p.triangles=a.triangles;}return sync();
  }
  function diagnostics(){const models={},instances=parts.reduce((sum,p)=>{models[p.id]=p.mesh.count;return sum+p.mesh.count;},0),accountedBytes=parts.reduce((sum,p)=>sum+p.mesh.instanceMatrix.array.byteLength+p.indices.byteLength+map.prefix[p.family].byteLength,0);return {id:R21_PRESENTATION,season:currentSeason,instances,models,parts:parts.length,potentialAdditionalDrawCalls:Math.max(0,parts.length-1),accountedBytes,syncs,maxSyncMs,sourceHidden:source.visible===false,failed};}
  function audit(){let exact=true;const list=[];for(const p of parts){const dst=p.mesh.instanceMatrix.array,count=p.mesh.count;if(count!==map.prefix[p.family][source.count])exact=false;for(let j=0;j<count;j++){const i=p.indices[j],s=i*16,d=j*16;for(let k=0;k<16;k++)if(dst[d+k]!==array[s+k]){exact=false;break;}if(!exact)break;}list.push({id:p.id,family:p.family,count,capacity:p.indices.length,triangles:p.triangles,matrixHash:hash(dst)});}return {sourcePrefixExact:exact,sourceHidden:source.visible===false,season:currentSeason,parts:list,models:Object.fromEntries(list.map(p=>[p.id,p.count])),instances:list.reduce((s,p)=>s+p.count,0)};}
  return Object.freeze({restore,setSeason,diagnostics,audit});
}

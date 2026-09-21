/** R20: research-calibrated Bolivian Yungas humid-montane presentation.
 * R4 retains all root placement, exclusions, density, transforms and visible-prefix
 * ownership. Existing accepted roots are repartitioned into regional physiognomy
 * families. Visual weights are not measured habitat or species percentages and
 * this first pass deliberately does not invent altitude zonation.
 */

export const R20_PRESENTATION='humid-montane-r20';
export const R20_MODELS=Object.freeze(['humid-montane-broadleaf','epiphyte-cloud-tree','tree-fern','bamboo-clump']);
export const R20_MAX_INSTANCES=1744;
const TAU=Math.PI*2;

function finite(v,name){if(!Number.isFinite(v))throw new TypeError('R20 '+name);return v;}
function hash32(cx,cz,x,z,salt=0){
  let h=2166136261;
  for(const v of [cx,cz,Math.round(x*1000),Math.round(z*1000),salt])h=Math.imul(h^v,16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return h>>>0;
}
export function r20Family(cx,cz,x,z){
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new TypeError('R20 chunk coordinates');
  finite(x,'x');finite(z,'z');
  const n=hash32(cx,cz,x,z,0x523230)%100;
  return n<48?0:n<70?1:n<90?2:3; // 48/22/20/10 visual allocation; not measured cover.
}
export function partitionR20(array,cx,cz){
  if(!(array instanceof Float32Array)||array.length%16||array.length<16||array.length>R20_MAX_INSTANCES*16)
    throw new RangeError('R20 matrix capacity bound');
  const n=array.length/16,indices=[[],[],[],[]],prefix=[new Uint16Array(n+1),new Uint16Array(n+1),new Uint16Array(n+1),new Uint16Array(n+1)];
  for(let i=0;i<n;i++){
    for(let j=0;j<16;j++)if(!Number.isFinite(array[i*16+j]))throw new TypeError('R20 non-finite matrix');
    const family=r20Family(cx,cz,array[i*16+12],array[i*16+14]);indices[family].push(i);
    for(let f=0;f<4;f++)prefix[f][i+1]=prefix[f][i]+(family===f?1:0);
  }
  return {capacity:n,indices:indices.map(a=>Uint16Array.from(a)),prefix};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
function meshBuilder(){
  const p=[],n=[],c=[];
  const tri=(a,b,d,color,normal=null)=>{const no=normal??norm(cross(b.map((v,i)=>v-a[i]),d.map((v,i)=>v-a[i])));for(const q of [a,b,d]){p.push(...q);n.push(...no);c.push(...color);}};
  const branch=(a,b,r0,r1,color=[.12,.075,.035],sides=5)=>{
    const axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.92?[1,0,0]:[0,1,0])),v=cross(axis,u);
    const ring=(point,r,i)=>{const t=i*TAU/sides,no=norm(u.map((x,j)=>x*Math.cos(t)+v[j]*Math.sin(t)));return {q:point.map((x,j)=>x+no[j]*r),no};};
    for(let i=0;i<sides;i++){const j=(i+1)%sides,A=ring(a,r0,i),B=ring(a,r0,j),C=ring(b,r1,i),D=ring(b,r1,j);tri(A.q,C.q,B.q,color,A.no);tri(B.q,C.q,D.q,color,D.no);}
  };
  return {p,n,c,tri,branch,data:()=>({positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),triangles:p.length/9})};
}
function lobe(b,cx,cy,cz,rx,ry,rz,phase,color){
  const sides=8,top=[cx,cy+ry,cz],bottom=[cx,cy-ry*.72,cz],ring=[];
  for(let i=0;i<sides;i++){const a=i*TAU/sides+phase,w=1+.10*Math.sin(i*2.11+phase*2.7);ring.push([cx+Math.cos(a)*rx*w,cy+Math.sin(i*1.73+phase)*ry*.10,cz+Math.sin(a)*rz*w]);}
  for(let i=0;i<sides;i++){const j=(i+1)%sides;b.tri(ring[i],top,ring[j],color,norm([(ring[i][0]-cx)/rx,.70,(ring[i][2]-cz)/rz]));b.tri(ring[j],bottom,ring[i],color,norm([(ring[i][0]-cx)/rx,-.40,(ring[i][2]-cz)/rz]));}
}
function humidBroadleafData(epiphytes=false){
  const b=meshBuilder(),bark=[.105,.062,.030];
  b.branch([0,0,0],[0,.48,0],.052,.032,bark,6);
  b.branch([0,.33,0],[-.25,.63,.09],.030,.013,bark);b.branch([0,.36,0],[.28,.66,-.08],.030,.013,bark);
  b.branch([0,.43,0],[-.12,.78,-.22],.024,.010,bark);b.branch([0,.44,0],[.15,.79,.21],.024,.010,bark);
  const leaf1=[.055,.19,.075],leaf2=[.07,.24,.09],leaf3=[.045,.155,.065];
  const lobes=[[-.27,.70,.08,.28,.18,.27,.1,leaf2],[-.09,.82,-.19,.30,.19,.29,.6,leaf1],[.17,.80,.16,.31,.19,.30,1.1,leaf2],[.32,.68,-.08,.27,.17,.26,1.6,leaf3],[-.30,.86,-.07,.24,.16,.23,2.0,leaf1],[0,.91,-.02,.30,.19,.29,2.5,leaf2],[.27,.87,.08,.24,.16,.23,3.0,leaf1],[-.05,.66,.18,.31,.18,.30,3.6,leaf3],[.08,.68,-.20,.29,.17,.28,4.2,leaf1]];
  for(const x of lobes)lobe(b,...x);
  if(epiphytes){
    // Visible bromeliad/fern-like rosettes attached to trunks and lower branches.
    const centres=[[-.05,.49,.045],[.13,.58,-.02],[-.18,.60,.07],[.05,.72,.10]];
    for(let q=0;q<centres.length;q++){
      const [cx,cy,cz]=centres[q];
      for(let i=0;i<7;i++){
        const a=i/7*TAU+q*.37,len=.10+(i%3)*.025,w=.014;
        const side=[-Math.sin(a)*w,0,Math.cos(a)*w],base=[cx,cy,cz],tip=[cx+Math.cos(a)*len,cy+.025+(i%2)*.015,cz+Math.sin(a)*len];
        const p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=tip.map((v,j)=>v+side[j]),p3=tip.map((v,j)=>v-side[j]);
        const col=i%2?[.15,.34,.10]:[.10,.28,.075],no=norm([Math.cos(a),.25,Math.sin(a)]);b.tri(p0,p1,p2,col,no);b.tri(p0,p2,p3,col,no);
      }
    }
  }
  return b.data();
}
function treeFernData(){
  // Deliberately legible from the road: a tall slender trunk and a wide radial
  // crown. This is still geometry-only substitution on an existing R4 root.
  const b=meshBuilder(),bark=[.16,.105,.050],crownY=.86;
  b.branch([0,0,0],[0,crownY,0],.043,.022,bark,7);
  for(let i=0;i<14;i++){
    const a=i/14*TAU+(i%2)*.055,len=.62+(i%3)*.035,base=[0,crownY-.01,0];
    const bend=[Math.cos(a)*len*.44,crownY+.035+(i%2)*.018,Math.sin(a)*len*.44];
    const tip=[Math.cos(a)*len,crownY-.16-(i%3)*.018,Math.sin(a)*len];
    const side=norm([-Math.sin(a),0,Math.cos(a)]).map(v=>v*.035),col=i%2?[.070,.285,.090]:[.090,.360,.115];
    const p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=bend.map((v,j)=>v+side[j]),p3=bend.map((v,j)=>v-side[j]),p4=tip.map((v,j)=>v+side[j]),p5=tip.map((v,j)=>v-side[j]),no=norm([Math.cos(a),.30,Math.sin(a)]);
    b.tri(p0,p1,p2,col,no);b.tri(p0,p2,p3,col,no);b.tri(p3,p2,p4,col,no);b.tri(p3,p4,p5,col,no);
    for(const at of [.30,.44,.58,.72,.86]){
      const cx=Math.cos(a)*len*at,cy=crownY+(tip[1]-crownY)*at+.11*Math.sin(Math.PI*at),cz=Math.sin(a)*len*at;
      const leaf=.105*(1-Math.abs(at-.58)*.55),tangent=norm([-Math.sin(a),0,Math.cos(a)]),s=tangent.map(v=>v*leaf);
      const front=[cx+Math.cos(a)*.045,cy+.014,cz+Math.sin(a)*.045],back=[cx-Math.cos(a)*.032,cy-.008,cz-Math.sin(a)*.032];
      b.tri(back.map((v,j)=>v-s[j]),back.map((v,j)=>v+s[j]),front.map((v,j)=>v+s[j]),col,no);b.tri(back.map((v,j)=>v-s[j]),front.map((v,j)=>v+s[j]),front.map((v,j)=>v-s[j]),col,no);
    }
  }
  // Young upright fronds make the crown read as a tree fern rather than a flat shrub.
  for(let i=0;i<5;i++){
    const a=i/5*TAU+.31,base=[0,crownY-.01,0],tip=[Math.cos(a)*.24,1.02,Math.sin(a)*.24],w=.024;
    const side=[-Math.sin(a)*w,0,Math.cos(a)*w],col=[.105,.335,.105],no=norm([Math.cos(a),.45,Math.sin(a)]);
    const p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=tip.map((v,j)=>v+side[j]),p3=tip.map((v,j)=>v-side[j]);
    b.tri(p0,p1,p2,col,no);b.tri(p0,p2,p3,col,no);
  }
  return b.data();
}
function bambooData(){
  const b=meshBuilder(),culm=[.20,.34,.10],leaf=[.055,.22,.065];
  const offsets=[[-.14,-.05],[-.06,.10],[.03,-.10],[.10,.06],[.16,-.02],[-.01,.02]];
  for(let k=0;k<offsets.length;k++){
    const [ox,oz]=offsets[k],h=.72+(k%3)*.09,top=[ox+(k%2?.035:-.025),h,oz+(k%3-.8)*.018];b.branch([ox,0,oz],top,.018,.010,culm,5);
    for(let q=0;q<3;q++){
      const y=.38+q*.15,a=(k*1.7+q*.9)%TAU,len=.15+q*.02,w=.025,base=[ox,y,oz],tip=[ox+Math.cos(a)*len,y+.035,oz+Math.sin(a)*len],side=[-Math.sin(a)*w,0,Math.cos(a)*w],no=norm([Math.cos(a),.2,Math.sin(a)]);
      const p0=base.map((v,j)=>v-side[j]),p1=base.map((v,j)=>v+side[j]),p2=tip.map((v,j)=>v+side[j]),p3=tip.map((v,j)=>v-side[j]);b.tri(p0,p1,p2,leaf,no);b.tri(p0,p2,p3,leaf,no);
    }
  }
  return b.data();
}
function geometry(THREE,data,name){const g=new THREE.BufferGeometry();g.name=name;g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));g.computeBoundingBox();g.computeBoundingSphere();return g;}
export function buildHumidMontaneStyle(THREE){
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,fog:true,dithering:true});material.name='r20-yungas-humid-montane';
  const data=[humidBroadleafData(false),humidBroadleafData(true),treeFernData(),bambooData()],owned=[];
  const assets=data.map((d,i)=>{const g=geometry(THREE,d,'r20-'+R20_MODELS[i]);owned.push(g);return Object.freeze({id:R20_MODELS[i],geometry:g,material,triangles:d.triangles});});
  let disposed=false;
  return Object.freeze({id:R20_PRESENTATION,asset(family){if(disposed)throw new Error('R20 style disposed');if(!Number.isInteger(family)||family<0||family>3)throw new TypeError('R20 family');return assets[family];},
    dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();material.dispose();},
    diagnostics:()=>{const box=assets[2].geometry.boundingBox;return {id:R20_PRESENTATION,models:[...R20_MODELS],triangles:assets.map(a=>a.triangles),sharedMaterials:1,transparent:false,disposed,treeFernSilhouette:{height:box.max.y-box.min.y,diameterX:box.max.x-box.min.x,diameterZ:box.max.z-box.min.z},
      mix:{humidBroadleafVisualWeight:48,epiphyteCloudTreeVisualWeight:22,treeFernVisualWeight:20,bambooVisualWeight:10,measuredHabitatPercent:false,altitudeZonation:false},
      scope:'Bolivian Yungas humid montane/cloud forest cues: evergreen broadleaf, epiphytes, prominent tree ferns and bamboo; existing R4 roots unchanged'}};}
}
const hash=array=>{let h=2166136261;const b=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h.toString(16);};
export function createHumidMontanePresentation({THREE,group,source,proof,style,now=()=>performance.now()}){
  if(proof?.profileId!=='r15-yungas-tropical'||proof.ecoregionId!==444||proof.count!==1744)throw new TypeError('R20 requires complete accepted Yungas source proof');
  if(!style?.asset)throw new TypeError('R20 humid style required');
  if(group.children?.length!==1||group.children[0]!==source||source.visible!==true||source.instanceColor||source.morphTexture||source.matrixAutoUpdate!==false||!source.boundingSphere||!source.matrix)
    throw new TypeError('R20 canonical source mesh required');
  const attribute=source.instanceMatrix,array=attribute.array,geometry0=source.geometry,material0=source.material,matrix=source.matrix;
  const map=partitionR20(array,proof.cx,proof.cz),parts=[];let disposed=false,failed=false,version=-1,installed=false,syncs=0,maxSyncMs=0,currentSeason='summer';
  function sourceValid(){return source.parent===group&&source.instanceMatrix===attribute&&attribute.array===array&&source.geometry===geometry0&&source.material===material0&&source.matrix===matrix&&!source.instanceColor&&!source.morphTexture&&source.visible===false&&source.matrixAutoUpdate===false&&group.children[0]===source&&group.children.length===(installed?1+parts.length:1)&&(!installed||parts.every((p,i)=>group.children[i+1]===p.mesh))&&Number.isInteger(source.count)&&source.count>=0&&source.count<=map.capacity;}
  function restore(){if(disposed)return false;disposed=true;for(const p of parts){p.mesh.onBeforeRender=()=>{};p.mesh.updateMatrixWorld=THREE.InstancedMesh.prototype.updateMatrixWorld;p.mesh.parent?.remove(p.mesh);p.mesh.dispose();}if(source.visible===false)source.visible=true;return true;}
  function sync(){
    if(disposed||failed)return false;if(!sourceValid()){failed=true;for(const p of parts)p.mesh.count=0;if(source.visible===false)source.visible=true;return false;}
    if(version!==attribute.version){const begin=now();for(const p of parts){const dst=p.mesh.instanceMatrix.array;for(let j=0;j<p.indices.length;j++){const i=p.indices[j],s=i*16,d=j*16;for(let k=0;k<16;k++){const v=array[s+k];if(!Number.isFinite(v)){failed=true;break;}dst[d+k]=v;}if(failed)break;}if(failed)break;p.mesh.instanceMatrix.needsUpdate=true;}if(failed){for(const p of parts)p.mesh.count=0;source.visible=true;return false;}version=attribute.version;syncs++;maxSyncMs=Math.max(maxSyncMs,now()-begin);}
    for(const p of parts){p.mesh.count=map.prefix[p.family][source.count];p.mesh.boundingSphere=source.boundingSphere;p.mesh.boundingBox=source.boundingBox;}return true;
  }
  try{
    for(let family=0;family<4;family++){
      if(!map.indices[family].length)continue;const a=style.asset(family),mesh=new THREE.InstancedMesh(a.geometry,a.material,map.indices[family].length);
      mesh.name='r20-'+proof.key+'-'+R20_MODELS[family];mesh.matrixAutoUpdate=false;mesh.matrix=source.matrix;mesh.layers.mask=source.layers.mask;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.frustumCulled=source.frustumCulled;mesh.renderOrder=source.renderOrder;mesh.boundingSphere=source.boundingSphere;mesh.boundingBox=source.boundingBox;
      mesh.userData={sharedForestGeometry:true,forestChunk:proof.key,r20Presentation:true,r20Family:R20_MODELS[family]};mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      const part={family,id:a.id,mesh,indices:map.indices[family],triangles:a.triangles};parts.push(part);mesh.updateMatrixWorld=function(force){sync();return THREE.InstancedMesh.prototype.updateMatrixWorld.call(this,force);};mesh.onBeforeRender=()=>{if(!sourceValid())for(const p of parts)p.mesh.count=0;};
    }
    for(const p of parts)group.add(p.mesh);source.visible=false;installed=true;if(!sync())throw new Error('R20 initial sync failed');
  }catch(error){restore();throw error;}
  function setSeason(value){if(value!=='summer')return false;currentSeason=value;return sync();}
  function diagnostics(){const models={},instances=parts.reduce((sum,p)=>{models[p.id]=p.mesh.count;return sum+p.mesh.count;},0),accountedBytes=parts.reduce((sum,p)=>sum+p.mesh.instanceMatrix.array.byteLength+p.indices.byteLength+map.prefix[p.family].byteLength,0);return {id:R20_PRESENTATION,season:currentSeason,instances,models,parts:parts.length,potentialAdditionalDrawCalls:Math.max(0,parts.length-1),accountedBytes,syncs,maxSyncMs,sourceHidden:source.visible===false,failed};}
  function audit(){let exact=true;const list=[];for(const p of parts){const dst=p.mesh.instanceMatrix.array,count=p.mesh.count;if(count!==map.prefix[p.family][source.count])exact=false;for(let j=0;j<count;j++){const i=p.indices[j],s=i*16,d=j*16;for(let k=0;k<16;k++)if(dst[d+k]!==array[s+k]){exact=false;break;}if(!exact)break;}list.push({id:p.id,family:p.family,count,capacity:p.indices.length,triangles:p.triangles,matrixHash:hash(dst)});}return {sourcePrefixExact:exact,sourceHidden:source.visible===false,parts:list,models:Object.fromEntries(list.map(p=>[p.id,p.count])),instances:list.reduce((s,p)=>s+p.count,0)};}
  return Object.freeze({restore,setSeason,diagnostics,audit});
}

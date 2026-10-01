/** R17: the user's photographic reference is an art direction, not a texture.
 * Original procedural foliage cutouts + branched silhouettes for the mixed pilot.
 * No network/canvas/image generation; no changes to R4, approved assets or lights.
 */
import {FOREST_STREAMING_POLICY as FOREST} from '../../src/forest-streaming-policy.js';
export const R17_LOOK='natural-r17';
export const R17_ATLAS_SIZE=256;
const TAU=Math.PI*2;
function random(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,t)=>a.map(v=>v*t);
/** Two distinct 120px foliage tiles, padded to prevent mip/atlas bleeding.
 * A separate solid swatch serves bark. RGB is neutral, vertex colors carry hue.
 */
export function buildR17Atlas(){
  const size=R17_ATLAS_SIZE,data=new Uint8Array(size*size*4);
  // White transparent gutters avoid black halos when filtering the alpha cutout.
  for(let i=0;i<data.length;i+=4)data.set([225,230,217,0],i);
  function ellipse(cx,cy,rx,ry,angle,shade){
    const c=Math.cos(angle),s=Math.sin(angle),r=Math.max(rx,ry)+1;
    for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(size-1,Math.ceil(cy+r));y++)
      for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(size-1,Math.ceil(cx+r));x++){
        const dx=x+.5-cx,dy=y+.5-cy,u=(dx*c+dy*s)/rx,v=(-dx*s+dy*c)/ry,q=u*u+v*v;
        if(q>=1.12)continue;
        const alpha=Math.round(Math.max(0,Math.min(1,(1.12-q)*5))*255),i=(y*size+x)*4;
        if(alpha<data[i+3])continue;
        const light=Math.round(shade*(.91+.09*Math.abs(u)));
        data.set([light,Math.min(255,light+5),Math.max(0,light-5),alpha],i);
      }
  }
  const rng=random(0x17f012);
  // Irregular sub-clusters, not one uniformly filled circular billboard.
  const centres=[[0,0],[-.34,-.08],[.28,.15],[-.04,.40],[.22,-.38],[-.26,-.36],[.42,-.16]];
  for(let cluster=0;cluster<centres.length;cluster++)for(let i=0;i<65;i++){
    const a=rng()*TAU,r=Math.sqrt(rng())*.30,c=centres[cluster];
    const x=64+(c[0]+Math.cos(a)*r)*66,y=64+(c[1]+Math.sin(a)*r)*66;
    ellipse(x,y,2.1+rng()*2.5,1.1+rng()*1.5,rng()*TAU,155+rng()*98);
  }
  // Narrow branching sprays for the conifer: no solid triangular skirts.
  for(let spray=0;spray<15;spray++){
    const a=rng()*TAU,reach=25+rng()*28,ex=192+Math.cos(a)*reach,ey=64+Math.sin(a)*reach;
    for(let step=0;step<20;step++){
      const t=step/20,x=192+(ex-192)*t,y=64+(ey-64)*t;
      ellipse(x,y,1.3,1.0,a,150+rng()*50);
      for(const side of [-1,1]){
        const n=a+side*.80,len=3+(1-t)*5;
        ellipse(x+Math.cos(n)*len*.5,y+Math.sin(n)*len*.5,len,1.0+rng()*.55,n,160+rng()*90);
      }
    }
  }
  for(let y=176;y<240;y++)for(let x=16;x<80;x++)data.set([255,255,255,255],(y*size+x)*4);
  return {data,width:size,height:size};
}
/** Small planes have volumetric normals; branching cylinders remain opaque.
 * The global normalized envelope is bounded, with no per-instance relocation.
 */
export function buildR17TreeData(family){
  if(family!==0&&family!==1)throw new TypeError('R17 family must be 0 or 1');
  const p=[],n=[],c=[],uv=[],rng=random(family===0?0x17dec1:0x17c0f1);
  const scale=Math.max(.1,Number(FOREST.treeScale)||1);
  const bark=[.070,.049,.030];
  function vertex(pos,normal,color,tex){p.push(pos[0]*scale,Math.max(0,pos[1])*scale,pos[2]*scale);n.push(...normal);c.push(...color);uv.push(...tex);}
  function branch(a,b,r0,r1){
    const axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u),sides=5;
    for(let i=0;i<sides;i++){
      const normal=t=>add(mul(u,Math.cos(t)),mul(v,Math.sin(t))),na=normal(i*TAU/sides),nb=normal((i+1)*TAU/sides);
      const aa=add(a,mul(na,r0)),ab=add(a,mul(nb,r0)),ba=add(b,mul(na,r1)),bb=add(b,mul(nb,r1));
      for(const [pos,no] of [[aa,na],[ba,na],[ab,nb],[ab,nb],[ba,na],[bb,nb]])vertex(pos,no,bark,[.1875,.8125]);
    }
  }
  function cloud(centre,radii,phase,tile,color,planes=3){
    // Three differently tilted cards per lobe; no camera-following animation.
    for(let j=0;j<planes;j++){
      const angle=phase+j*Math.PI/planes;
      const u=[Math.cos(angle)*radii[0],Math.sin(j*1.8)*radii[1]*.13,Math.sin(angle)*radii[2]];
      const v=[Math.sin(angle)*radii[0]*.17,radii[1],-Math.cos(angle)*radii[2]*.17];
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]],coords=[];
      for(const [x,y] of points){
        const offset=add(mul(u,x),mul(v,y));
        const no=norm([offset[0]/radii[0],.70+offset[1]/radii[1]*.42,offset[2]/radii[2]]);
        const tex=[(tile*128+5+(x+1)*59)/256,(5+(y+1)*59)/256];
        coords.push({pos:add(centre,offset),no,tex});
      }
      for(const i of [0,1,2,0,2,3])vertex(coords[i].pos,coords[i].no,color,coords[i].tex);
    }
  }
  if(family===0){
    const trunk=[[0,0,0],[.010,.25,-.007],[-.014,.48,.008],[.025,.75,-.018]];
    for(let i=0;i<3;i++)branch(trunk[i],trunk[i+1],.018-i*.004,.014-i*.004);
    // Asymmetric overlapping canopy lobes, with low side growth hiding bare poles.
    const lobes=[[-.06,.76,.02,.20,.20,.18],[.08,.83,-.06,.19,.16,.19],[-.03,.61,.03,.21,.22,.20]];
    for(const [height,radius,count] of [[.43,.18,5],[.62,.215,7],[.78,.15,5]]){
      for(let i=0;i<count;i++){
        const a=i*TAU/count+rng()*.8,r=radius*(.82+rng()*.22),x=Math.cos(a)*r,z=Math.sin(a)*r;
        const y=height+(rng()-.5)*.075;
        const rx=.115+rng()*.04,ry=.13+rng()*.065,rz=.115+rng()*.04;
        lobes.push([x,y,z,rx,ry,rz]);
        if(i%2===0)branch([0,Math.max(.19,y-.22),0],[x*.82,y,z*.82],.0065,.0018);
      }
    }
    for(const [x,y,z,rx,ry,rz] of lobes){
      const f=.87+rng()*.27;
      cloud([x,y,z],[rx,ry,rz],rng()*TAU,0,[.075*f,.128*f,.044*f]);
    }
  }else{
    branch([0,0,0],[.005,.94,-.003],.014,.002);
    for(let layer=0;layer<10;layer++){
      const t=layer/10,y=.19+t*.74,r=.215*Math.pow(1-t,.83),count=layer<6?5:4;
      for(let i=0;i<count;i++){
        const a=i*TAU/count+layer*1.73+(rng()-.5)*.40,reach=r*(.80+rng()*.30);
        const centre=[Math.cos(a)*reach*.70,y+(rng()-.5)*.055,Math.sin(a)*reach*.70];
        if(layer<6&&i%2===0)branch([0,y+.05,0],centre,.0035,.001);
        const f=.86+rng()*.22;
        cloud(centre,[Math.max(.03,r*.48),.062+(1-t)*.025,Math.max(.03,r*.48)],a,1,[.039*f,.077*f,.041*f],2);
      }
    }
    cloud([.005,.936,-.003],[.040,.043,.04],.7,1,[.046,.085,.042],3);
  }
  // Exact height of the accepted silhouettes; preserve a small, tested envelope.
  let top=0;for(let i=1;i<p.length;i+=3)top=Math.max(top,p[i]);
  const fit=.9792*scale/top;for(let i=0;i<p.length;i++)p[i]*=fit;
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),uvs:new Float32Array(uv),triangles:p.length/9};
}
export function r17Tint(cx,cz,x,z){
  let h=Math.imul(cx^0x17171717,73856093)^Math.imul(cz,19349663)^Math.imul(Math.round(x*1000),83492791)^Math.round(z*1000);
  h=Math.imul(h^(h>>>16),0x45d9f3b);h^=h>>>16;
  const v=(h>>>0)/4294967296,shade=.82+v*.25;
  return [shade*(.97+.10*v),shade,shade*(.90+.12*(1-v))];
}
export function buildNaturalForestStyle(THREE,kit){
  const owned=[],atlas=buildR17Atlas();let disposed=false;
  const texture=new THREE.DataTexture(atlas.data,atlas.width,atlas.height,THREE.RGBAFormat);
  texture.name='r17-original-foliage-atlas';texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:texture,
    side:THREE.DoubleSide,alphaTest:.34,transparent:false,depthWrite:true,fog:true,dithering:true});
  material.name='r17-opaque-cutout-foliage';
  function dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();material.dispose();texture.dispose();}
  try{
    const summer=[0,1].map(f=>{
      const d=buildR17TreeData(f),g=new THREE.BufferGeometry();owned.push(g);
      for(const [key,array,size] of [['position',d.positions,3],['normal',d.normals,3],['color',d.colors,3],['uv',d.uvs,2]])g.setAttribute(key,new THREE.Float32BufferAttribute(array,size));
      g.computeBoundingBox();g.computeBoundingSphere();
      return {id:f===0?'preview-temperate':'preview-conifer',geometry:g,material};
    });
    return Object.freeze({id:R17_LOOK,tint:r17Tint,dispose,
      asset(f,season){
        if(disposed)throw new Error('R17 style disposed');
        if(f!==0&&f!==1)throw new TypeError('R17 family');
        if(season==='summer')return summer[f];
        if(season!=='winter')throw new TypeError('R17 season');
        const id=(f===0?'preview-temperate':'preview-conifer')+'-winter',a=kit.assets.find(a=>a.id===id);
        if(!a)throw new Error('Approved winter asset missing');
        return {id,geometry:a.parts[0].geometry,material:null};
      },
      diagnostics:()=>({id:R17_LOOK,summerTriangles:summer.map(a=>a.geometry.attributes.position.count/3),
        atlasBytes:atlas.data.byteLength,atlasSize:R17_ATLAS_SIZE,sharedMaterials:1,alphaTest:material.alphaTest,
        transparent:material.transparent,disposed,scope:'Mixed Nord summer appearance only; approved winter silhouettes retained'})});
  }catch(error){dispose();throw error;}
}

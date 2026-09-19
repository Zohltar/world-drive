/** R18: explicit roadside understory for the opt-in mixed Nord forest.
 * It never owns tree placement. Every clump is rooted at an accepted R4 tree
 * translation and only appears for roots 36-76 m from the loaded route.
 */
import {buildR17Atlas,R17_ATLAS_SIZE} from './natural-forest-look-r17.mjs';
import {FOREST_STREAMING_POLICY as FOREST} from '../../src/forest-streaming-policy.js';

export const R18_UNDERSTORY='edge-r18';
export const R18_MIN_ROUTE_M=36;
export const R18_MAX_ROUTE_M=76;
export const R18_ROUTE_CELL_M=120;
export const R18_MAX_ROUTE_POINTS=20000;
export const R18_MAX_ROUTE_CELLS=8192;
export const R18_MAX_ROUTE_REFS=131072;
export const R18_MAX_SEGMENT_M=2000;
export const R18_MAX_EXTENT_M=100000;
export const R18_ATLAS_SIZE=R17_ATLAS_SIZE;
export const R18_CHUNK_SIZE=FOREST.cellSize*FOREST.chunkCells;
const TAU=Math.PI*2;

function finite(v,name){if(!Number.isFinite(v))throw new TypeError(`R18 ${name}`);return v;}
function hash32(cx,cz,x,z,salt=0){
  let h=2166136261;
  for(const v of [cx,cz,Math.round(x*1000),Math.round(z*1000),salt])h=Math.imul(h^v,16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return h>>>0;
}
function projectRoute(coordinates,origin){
  if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>R18_MAX_ROUTE_POINTS)throw new RangeError('R18 route point bound');
  if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon)||Math.abs(origin.lat)>=90||Math.abs(origin.lon)>180)
    throw new TypeError('R18 route origin');
  const xy=new Float64Array(coordinates.length*2),scale=Math.PI/180*6378137,cos=Math.cos(origin.lat*Math.PI/180);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<coordinates.length;i++){
    const row=coordinates[i];if(!Array.isArray(row)||row.length<2)throw new TypeError('R18 route coordinate');
    const lon=finite(row[0],'route longitude'),lat=finite(row[1],'route latitude');
    if(Math.abs(lon)>180||Math.abs(lat)>90)throw new RangeError('R18 route coordinate domain');
    if(i&&Math.abs(lon-coordinates[i-1][0])>=180)throw new RangeError('R18 route projection seam');
    const x=(lon-origin.lon)*scale*cos,z=-(lat-origin.lat)*scale;xy[i*2]=x;xy[i*2+1]=z;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  if(maxX-minX>R18_MAX_EXTENT_M||maxZ-minZ>R18_MAX_EXTENT_M)throw new RangeError('R18 route extent bound');
  return {xy,minX,maxX,minZ,maxZ};
}
function segmentDistance(x,z,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,den=dx*dx+dz*dz;
  const t=den?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/den)):0;
  return Math.hypot(x-(ax+dx*t),z-(az+dz*t));
}
export function buildR18RouteIndex({coordinates,origin}={}){
  const {xy,minX,maxX,minZ,maxZ}=projectRoute(coordinates,origin),cells=new Map();let refs=0,maxSegment=0;
  const key=(ix,iz)=>`${ix}:${iz}`;
  for(let i=0;i<coordinates.length-1;i++){
    const ax=xy[i*2],az=xy[i*2+1],bx=xy[i*2+2],bz=xy[i*2+3],length=Math.hypot(bx-ax,bz-az);
    if(length>R18_MAX_SEGMENT_M)throw new RangeError('R18 route segment bound');maxSegment=Math.max(maxSegment,length);
    const x0=Math.floor((Math.min(ax,bx)-R18_MAX_ROUTE_M)/R18_ROUTE_CELL_M),x1=Math.floor((Math.max(ax,bx)+R18_MAX_ROUTE_M)/R18_ROUTE_CELL_M);
    const z0=Math.floor((Math.min(az,bz)-R18_MAX_ROUTE_M)/R18_ROUTE_CELL_M),z1=Math.floor((Math.max(az,bz)+R18_MAX_ROUTE_M)/R18_ROUTE_CELL_M);
    for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){
      const k=key(ix,iz);let list=cells.get(k);if(!list){if(cells.size>=R18_MAX_ROUTE_CELLS)throw new RangeError('R18 route cell bound');cells.set(k,list=[]);}
      list.push(i);if(++refs>R18_MAX_ROUTE_REFS)throw new RangeError('R18 route reference bound');
    }
  }
  return Object.freeze({
    distance(x,z){finite(x,'root x');finite(z,'root z');const list=cells.get(key(Math.floor(x/R18_ROUTE_CELL_M),Math.floor(z/R18_ROUTE_CELL_M)));if(!list)return R18_MAX_ROUTE_M+1;
      let best=Infinity;for(const i of list)best=Math.min(best,segmentDistance(x,z,xy[i*2],xy[i*2+1],xy[i*2+2],xy[i*2+3]));return best;},
    diagnostics:()=>({points:coordinates.length,segments:coordinates.length-1,cells:cells.size,references:refs,maxSegmentM:maxSegment,
      extentM:{x:maxX-minX,z:maxZ-minZ},cellM:R18_ROUTE_CELL_M,bandM:[R18_MIN_ROUTE_M,R18_MAX_ROUTE_M]})
  });
}

export function r18Admission(cx,cz,x,z,distance){
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new TypeError('R18 chunk coordinates');
  for(const [v,n] of [[x,'x'],[z,'z'],[distance,'distance']])finite(v,n);
  if(distance<R18_MIN_ROUTE_M||distance>R18_MAX_ROUTE_M)return false;
  const h=hash32(cx,cz,x,z,0x523138);
  if(distance<58)return h%4!==0;      // 75% inner roadside band
  if(distance<68)return h%2===0;      // 50% transition band
  return h%4===0;                     // 25% sparse outer band
}
export function r18Transform(cx,cz,x,z){
  const a=hash32(cx,cz,x,z,0x18a),b=hash32(cx,cz,x,z,0x18b),c=hash32(cx,cz,x,z,0x18c);
  const u=a/4294967296,v=b/4294967296,w=c/4294967296;
  return Object.freeze({yaw:u*TAU,sx:1.55+v*.70,sy:1.15+w*.70,sz:1.45+(1-v)*.65});
}

function atlasFern(data,size){
  const cx=192,cy=192;
  function put(x,y,r,g,b,a){if(x<128||y<128||x>=size||y>=size)return;const i=(y*size+x)*4;if(a>=data[i+3])data.set([r,g,b,a],i);}
  for(let frond=0;frond<14;frond++){
    const a=-Math.PI*.45+frond/13*Math.PI*.9,ca=Math.cos(a),sa=Math.sin(a);
    for(let step=4;step<58;step++){
      const x=Math.round(cx+ca*step),y=Math.round(cy+sa*step*.72);put(x,y,178,188,163,255);
      if(step%4)continue;
      for(const side of [-1,1])for(let q=0;q<7;q++){
        const px=Math.round(x+(-sa*side)*q+ca*q*.20),py=Math.round(y+(ca*side)*q*.72+sa*q*.12);
        put(px,py,190,199,176,Math.max(70,245-q*18));
      }
    }
  }
}
export function buildR18Atlas(){
  const base=buildR17Atlas();if(base.width!==R18_ATLAS_SIZE||base.height!==R18_ATLAS_SIZE)throw new Error('R18 expects R17 atlas size');
  const data=base.data.slice();atlasFern(data,base.width);return {data,width:base.width,height:base.height};
}

function geometryData(season){
  if(season!=='summer'&&season!=='winter')throw new TypeError('R18 season');
  const p=[],n=[],c=[],uv=[];let quads=0;
  const leaf=[5/256,5/256,123/256,123/256],fern=[130/256,130/256,254/256,254/256],bark=[17/256,177/256,79/256,239/256];
  function quad(center,u,v,rect,color){
    const nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0],len=Math.hypot(nx,ny,nz)||1,normal=[nx/len,ny/len,nz/len];
    const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[center[0]+u[0]*a+v[0]*b,center[1]+u[1]*a+v[1]*b,center[2]+u[2]*a+v[2]*b]);
    const tex=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
    for(const i of [0,1,2,0,2,3]){p.push(...pts[i]);n.push(...normal);c.push(...color);uv.push(...tex[i]);}quads++;
  }
  function card(angle,r,y,w,h,rect,color,tilt=0){const ca=Math.cos(angle),sa=Math.sin(angle),center=[ca*r,y,sa*r],u=[-sa*w,tilt*w,ca*w],v=[0,h,0];quad(center,u,v,rect,color);}
  if(season==='summer'){
    for(let i=0;i<96;i++){const a=(i*.61803398875%1)*TAU,r=.15+(i%11)/10*.62,y=.24+(i%13)/12*.58,w=.09+(i%5)*.017,h=.11+(i%7)*.012;card(a,r,y,w,h,leaf,[.20+(i%4)*.018,.34+(i%5)*.015,.12+(i%3)*.014],(i%3-1)*.12);}
    for(let i=0;i<32;i++){const a=i/32*TAU,r=.06+(i%5)*.055,y=.12+(i%8)*.075;card(a,r,y,.022,.20,bark,[.22,.15,.08],.05);}
    for(let rosette=0;rosette<4;rosette++)for(let i=0;i<10;i++){const a=(i/10+rosette*.17)*TAU,r=.65+(rosette%2)*.30,h=.60+(i%3)*.020;card(a,r,h,.17,h,fern,[.18,.31,.11],-.72);}
  }else{
    for(let i=0;i<160;i++){const a=(i*.754877666%1)*TAU,r=.08+(i%17)/16*.66,y=.12+(i%19)/18*.72;card(a,r,y,.014+(i%3)*.004,.18+(i%5)*.03,bark,[.22,.16,.105],(i%5-2)*.10);}
    for(let i=0;i<48;i++){const a=i/48*TAU,r=.20+(i%9)*.055,y=.15+(i%7)*.065;card(a,r,y,.020,.24,bark,[.28,.22,.13],(i%3-1)*.15);}
    for(let rosette=0;rosette<4;rosette++)for(let i=0;i<10;i++){const a=(i/10+rosette*.13)*TAU,r=.62+(rosette%2)*.28,h=.46+(i%3)*.016;card(a,r,h*.72,.16,h,fern,[.28,.22,.13],-.93);}
    for(let i=0;i<40;i++){const a=i/40*TAU,r=.12+(i%8)*.075,y=.42+(i%6)*.06;card(a,r,y,.08,.035,leaf,[.88,.90,.91],-.18);}
  }
  const expected=season==='summer'?168:288;if(quads!==expected)throw new Error(`R18 geometry quad count ${quads}`);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),uvs:new Float32Array(uv),triangles:quads*2};
}

export function buildUnderstoryStyle(THREE){
  const atlas=buildR18Atlas(),owned=[];let disposed=false,maxXZ=0;
  const texture=new THREE.DataTexture(atlas.data,atlas.width,atlas.height,THREE.RGBAFormat);
  texture.name='r18-understory-atlas';texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:texture,side:THREE.DoubleSide,
    alphaTest:.34,transparent:false,depthWrite:true,fog:true,dithering:true});material.name='r18-understory-cutout';
  function make(season){const d=geometryData(season),g=new THREE.BufferGeometry();owned.push(g);
    for(const [key,array,size] of [['position',d.positions,3],['normal',d.normals,3],['color',d.colors,3],['uv',d.uvs,2]])g.setAttribute(key,new THREE.Float32BufferAttribute(array,size));
    for(let i=0;i<d.positions.length;i+=3)maxXZ=Math.max(maxXZ,Math.hypot(d.positions[i],d.positions[i+2]));g.computeBoundingBox();g.computeBoundingSphere();
    return {id:`r18-understory-${season}`,geometry:g,material,triangles:d.triangles};}
  const assets={summer:make('summer'),winter:make('winter')};
  function dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();material.dispose();texture.dispose();}
  return Object.freeze({id:R18_UNDERSTORY,chunkSize:R18_CHUNK_SIZE,admit:r18Admission,transform:r18Transform,
    asset(season){if(disposed)throw new Error('R18 style disposed');const a=assets[season];if(!a)throw new TypeError('R18 season');return a;},dispose,
    diagnostics:()=>({id:R18_UNDERSTORY,summerTriangles:assets.summer.triangles,winterTriangles:assets.winter.triangles,atlasBytes:atlas.data.byteLength,
      atlasSize:R18_ATLAS_SIZE,sharedMaterials:1,alphaTest:material.alphaTest,transparent:material.transparent,maxBaseFootprintRadius:maxXZ,
      maxScaledFootprintRadius:maxXZ*2.25,routeBandM:[R18_MIN_ROUTE_M,R18_MAX_ROUTE_M],disposed})});
}

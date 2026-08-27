import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

const GLB='src/assets/2006_hyundai_sonata.glb';

function parseGlb(path){
  const data=fs.readFileSync(path);
  assert.equal(data.toString('ascii',0,4),'glTF',`${path}: invalid GLB magic`);
  let offset=12,json=null,bin=null;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),start=offset+8,end=start+length;
    if(type===0x4e4f534a)json=JSON.parse(data.subarray(start,end).toString('utf8').replace(/\0+$/,''));
    else if(type===0x004e4942)bin=data.subarray(start,end);
    offset=end;
  }
  assert(json,'GLB JSON chunk missing');
  assert(bin,'GLB BIN chunk missing');
  return {json,bin};
}

const COMPONENTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const COMPONENT_BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function readComponent(buffer,offset,type){
  switch(type){
    case 5120:return buffer.readInt8(offset);
    case 5121:return buffer.readUInt8(offset);
    case 5122:return buffer.readInt16LE(offset);
    case 5123:return buffer.readUInt16LE(offset);
    case 5125:return buffer.readUInt32LE(offset);
    case 5126:return buffer.readFloatLE(offset);
    default:throw new Error(`Unsupported componentType ${type}`);
  }
}
function normalizeComponent(value,type){
  switch(type){
    case 5120:return Math.max(-1,value/127);
    case 5121:return value/255;
    case 5122:return Math.max(-1,value/32767);
    case 5123:return value/65535;
    default:return value;
  }
}
function readAccessor(json,bin,index){
  const accessor=json.accessors?.[index];
  assert(accessor,`accessor ${index} missing`);
  const view=json.bufferViews?.[accessor.bufferView];
  assert(view,`bufferView ${accessor.bufferView} missing`);
  assert((view.buffer??0)===0,'only embedded buffer 0 is supported');
  const components=COMPONENTS[accessor.type];
  const componentBytes=COMPONENT_BYTES[accessor.componentType];
  assert(components&&componentBytes,`unsupported accessor layout ${accessor.type}/${accessor.componentType}`);
  const packed=components*componentBytes;
  const stride=view.byteStride||packed;
  const base=(view.byteOffset||0)+(accessor.byteOffset||0);
  const rows=[];
  for(let i=0;i<accessor.count;i++){
    const row=[];
    for(let c=0;c<components;c++){
      let value=readComponent(bin,base+i*stride+c*componentBytes,accessor.componentType);
      if(accessor.normalized)value=normalizeComponent(value,accessor.componentType);
      row.push(value);
    }
    rows.push(row);
  }
  return rows;
}

function nodePrimitives(json,bin,nodeName){
  const nodeIndex=(json.nodes||[]).findIndex(node=>node.name===nodeName);
  assert(nodeIndex>=0,`${nodeName}: node missing`);
  const node=json.nodes[nodeIndex];
  const mesh=json.meshes?.[node.mesh];
  assert(mesh,`${nodeName}: mesh missing`);
  return (mesh.primitives||[]).map((primitive,index)=>{
    const uvAccessor=primitive.attributes?.TEXCOORD_0;
    if(!Number.isInteger(uvAccessor))return null;
    const uvs=readAccessor(json,bin,uvAccessor);
    const indices=Number.isInteger(primitive.indices)
      ?readAccessor(json,bin,primitive.indices).map(row=>row[0])
      :uvs.map((_,i)=>i);
    let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
    for(const [u,v] of uvs){minU=Math.min(minU,u);minV=Math.min(minV,v);maxU=Math.max(maxU,u);maxV=Math.max(maxV,v);}
    return {primitive:index,accessor:uvAccessor,count:uvs.length,minU,minV,maxU,maxV,uvs,indices,material:primitive.material};
  }).filter(Boolean);
}

function countRegion(rows,{min,max}){
  let total=0,inside=0;
  for(const row of rows){
    for(const [u,v] of row.uvs){
      total++;
      if(u>=min[0]&&u<=max[0]&&v>=min[1]&&v<=max[1])inside++;
    }
  }
  return {inside,total,ratio:total?inside/total:0};
}

function textureInfo(json,rows){
  const materialIndex=rows.find(row=>Number.isInteger(row.material))?.material;
  const material=json.materials?.[materialIndex];
  const textureInfo=material?.pbrMetallicRoughness?.baseColorTexture;
  const textureIndex=textureInfo?.index;
  const texture=json.textures?.[textureIndex];
  const sourceIndex=texture?.source;
  const image=json.images?.[sourceIndex];
  return {
    materialIndex:materialIndex??null,
    materialName:material?.name||null,
    textureIndex:textureIndex??null,
    sourceIndex:sourceIndex??null,
    mimeType:image?.mimeType||null,
    imageBufferView:image?.bufferView??null,
    transform:textureInfo?.extensions?.KHR_texture_transform||null
  };
}

function embeddedImageBytes(json,bin,imageIndex){
  const image=json.images?.[imageIndex];
  assert(image&&Number.isInteger(image.bufferView),`embedded image ${imageIndex} missing bufferView`);
  const view=json.bufferViews?.[image.bufferView];
  assert(view,`image bufferView ${image.bufferView} missing`);
  return bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
}

function paeth(a,b,c){
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}

function decodePng(bytes){
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a','embedded texture is not PNG');
  let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0,palette=null,transparency=null;
  const idat=[];
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),start=offset+8,end=start+length;
    const data=bytes.subarray(start,end);
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];
    }else if(type==='PLTE')palette=Buffer.from(data);
    else if(type==='tRNS')transparency=Buffer.from(data);
    else if(type==='IDAT')idat.push(data);
    else if(type==='IEND')break;
    offset=end+4;
  }
  assert(width>0&&height>0,'PNG missing IHDR');
  assert.equal(bitDepth,8,'QA PNG decoder currently requires 8-bit texture');
  assert.equal(interlace,0,'QA PNG decoder currently requires non-interlaced texture');
  const channels={0:1,2:3,3:1,4:2,6:4}[colorType];
  assert(channels,`unsupported PNG color type ${colorType}`);
  const stride=width*channels,bpp=channels;
  const raw=zlib.inflateSync(Buffer.concat(idat));
  assert.equal(raw.length,(stride+1)*height,'unexpected PNG inflate length');
  const scan=Buffer.alloc(stride*height);
  let src=0;
  for(let y=0;y<height;y++){
    const filter=raw[src++],row=y*stride,prev=(y-1)*stride;
    for(let x=0;x<stride;x++){
      const value=raw[src++];
      const left=x>=bpp?scan[row+x-bpp]:0;
      const up=y>0?scan[prev+x]:0;
      const upLeft=y>0&&x>=bpp?scan[prev+x-bpp]:0;
      let out;
      if(filter===0)out=value;
      else if(filter===1)out=(value+left)&255;
      else if(filter===2)out=(value+up)&255;
      else if(filter===3)out=(value+Math.floor((left+up)/2))&255;
      else if(filter===4)out=(value+paeth(left,up,upLeft))&255;
      else throw new Error(`unsupported PNG filter ${filter}`);
      scan[row+x]=out;
    }
  }
  function rgbaAt(x,y){
    x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));
    const i=(y*width+x)*channels;
    if(colorType===6)return [scan[i],scan[i+1],scan[i+2],scan[i+3]];
    if(colorType===2)return [scan[i],scan[i+1],scan[i+2],255];
    if(colorType===0)return [scan[i],scan[i],scan[i],255];
    if(colorType===4)return [scan[i],scan[i],scan[i],scan[i+1]];
    const pi=scan[i]*3;
    return [palette?.[pi]??0,palette?.[pi+1]??0,palette?.[pi+2]??0,transparency?.[scan[i]]??255];
  }
  return {width,height,bitDepth,colorType,rgbaAt};
}

function smoothstep(a,b,x){
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
}
function whiteMaskOf(rgb){
  const [r,g,b]=rgb.map(v=>v/255);
  const lum=r*.2126+g*.7152+b*.0722;
  const spread=Math.max(r,g,b)-Math.min(r,g,b);
  return smoothstep(.12,.32,lum)*(1-smoothstep(.38,.70,spread));
}
function transformUv(uv,transform){
  if(!transform)return uv;
  const [u,v]=uv;
  const offset=transform.offset||[0,0],scale=transform.scale||[1,1],rotation=Number(transform.rotation)||0;
  const su=u*scale[0],sv=v*scale[1],c=Math.cos(rotation),s=Math.sin(rotation);
  return [c*su-s*sv+offset[0],s*su+c*sv+offset[1]];
}
function sampleTexture(texture,uv,flipV=false){
  let [u,v]=uv;
  u=u-Math.floor(u);v=v-Math.floor(v);
  if(flipV)v=1-v;
  const x=Math.min(texture.width-1,Math.max(0,Math.floor(u*texture.width)));
  const y=Math.min(texture.height-1,Math.max(0,Math.floor(v*texture.height)));
  return texture.rgbaAt(x,y);
}
function insideRegion([u,v],region){return u>=region.min[0]&&u<=region.max[0]&&v>=region.min[1]&&v<=region.max[1];}

function shaderSampleStats(rows,texture,region,transform,flipV=false){
  const samples=[];
  const add=uv=>{
    const transformed=transformUv(uv,transform);
    if(!insideRegion(transformed,region))return;
    const rgba=sampleTexture(texture,transformed,flipV);
    samples.push({uv:transformed,rgba,mask:whiteMaskOf(rgba.slice(0,3))});
  };
  for(const row of rows){
    for(const uv of row.uvs)add(uv);
    for(let i=0;i+2<row.indices.length;i+=3){
      const a=row.uvs[row.indices[i]],b=row.uvs[row.indices[i+1]],c=row.uvs[row.indices[i+2]];
      if(!a||!b||!c)continue;
      add([(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3]);
      add([(a[0]+b[0])/2,(a[1]+b[1])/2]);
      add([(b[0]+c[0])/2,(b[1]+c[1])/2]);
      add([(c[0]+a[0])/2,(c[1]+a[1])/2]);
    }
  }
  const active=samples.filter(s=>s.mask>.01),strong=samples.filter(s=>s.mask>.25);
  const avg=samples.length?samples.reduce((sum,s)=>sum+s.mask,0)/samples.length:0;
  const max=samples.reduce((m,s)=>Math.max(m,s.mask),0);
  const brightest=[...samples].sort((a,b)=>b.mask-a.mask).slice(0,8).map(s=>({uv:s.uv.map(v=>+v.toFixed(4)),rgb:s.rgba.slice(0,3),mask:+s.mask.toFixed(4)}));
  return {samples:samples.length,active:active.length,strong:strong.length,activeRatio:samples.length?active.length/samples.length:0,strongRatio:samples.length?strong.length/samples.length:0,averageMask:avg,maxMask:max,brightest};
}

const {json,bin}=parseGlb(GLB);
const object46=nodePrimitives(json,bin,'Object_46');
const object33=nodePrimitives(json,bin,'Object_33');

const reverseRegion={min:[0.04,0.00],max:[0.54,0.842]};
const retiredInnerRedRegion={min:[0.04,0.842],max:[0.54,1.00]};
const retiredOuterRedRegion={min:[0.44,0.842],max:[0.96,1.00]};
const reverseCoverage=countRegion(object46,reverseRegion);
const innerRedCoverage=countRegion(object46,retiredInnerRedRegion);
const outerRedCoverage=countRegion(object33,retiredOuterRedRegion);
const texInfo=textureInfo(json,object46);
assert.equal(texInfo.mimeType,'image/png','Sonata Object_46 base texture must be embedded PNG for pixel QA');
const texture=decodePng(embeddedImageBytes(json,bin,texInfo.sourceIndex));
const shaderDirect=shaderSampleStats(object46,texture,reverseRegion,texInfo.transform,false);
const shaderFlipped=shaderSampleStats(object46,texture,reverseRegion,texInfo.transform,true);

const compact=rows=>rows.map(({primitive,accessor,count,minU,minV,maxU,maxV,material})=>({primitive,accessor,count,material,minU:+minU.toFixed(5),minV:+minV.toFixed(5),maxU:+maxU.toFixed(5),maxV:+maxV.toFixed(5)}));
const report={
  object46:compact(object46),
  object33:compact(object33),
  object46Texture:texInfo,
  png:{width:texture.width,height:texture.height,bitDepth:texture.bitDepth,colorType:texture.colorType},
  reverseRegion,
  reverseCoverage,
  shaderDirect,
  shaderFlipped,
  retiredInnerRedCoverage:innerRedCoverage,
  retiredOuterRedCoverage:outerRedCoverage
};
console.log('SONATA AUTHORED LAMP PIXEL REPORT',JSON.stringify(report,null,2));

assert(reverseCoverage.inside>0,'Sonata Object_46 reverse UV region contains zero authored vertices');
assert(reverseCoverage.ratio>.05,'Sonata Object_46 reverse UV region covers too little authored geometry to be reliable');

console.log('V21.31 SONATA AUTHORED LAMP PIXEL QA: PASS',report);

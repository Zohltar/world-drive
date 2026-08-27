import assert from 'node:assert/strict';
import fs from 'node:fs';

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

function uvStats(json,bin,nodeName){
  const nodeIndex=(json.nodes||[]).findIndex(node=>node.name===nodeName);
  assert(nodeIndex>=0,`${nodeName}: node missing`);
  const node=json.nodes[nodeIndex];
  const mesh=json.meshes?.[node.mesh];
  assert(mesh,`${nodeName}: mesh missing`);
  const rows=[];
  for(let p=0;p<(mesh.primitives||[]).length;p++){
    const primitive=mesh.primitives[p];
    const uvAccessor=primitive.attributes?.TEXCOORD_0;
    if(!Number.isInteger(uvAccessor))continue;
    const uvs=readAccessor(json,bin,uvAccessor);
    let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
    for(const [u,v] of uvs){minU=Math.min(minU,u);minV=Math.min(minV,v);maxU=Math.max(maxU,u);maxV=Math.max(maxV,v);}
    rows.push({primitive:p,accessor:uvAccessor,count:uvs.length,minU,minV,maxU,maxV,uvs});
  }
  assert(rows.length>0,`${nodeName}: no TEXCOORD_0 accessor`);
  return rows;
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

const {json,bin}=parseGlb(GLB);
const object46=uvStats(json,bin,'Object_46');
const object33=uvStats(json,bin,'Object_33');

const reverseRegion={min:[0.04,0.00],max:[0.54,0.842]};
const innerRedRegion={min:[0.04,0.842],max:[0.54,1.00]};
const outerRedRegion={min:[0.44,0.842],max:[0.96,1.00]};
const reverseCoverage=countRegion(object46,reverseRegion);
const innerRedCoverage=countRegion(object46,innerRedRegion);
const outerRedCoverage=countRegion(object33,outerRedRegion);

const compact=rows=>rows.map(({primitive,accessor,count,minU,minV,maxU,maxV})=>({primitive,accessor,count,minU:+minU.toFixed(5),minV:+minV.toFixed(5),maxU:+maxU.toFixed(5),maxV:+maxV.toFixed(5)}));

assert(reverseCoverage.inside>0,'Sonata Object_46 reverse UV region contains zero authored vertices');
assert(innerRedCoverage.inside>0,'Sonata Object_46 red UV region contains zero authored vertices');
assert(outerRedCoverage.inside>0,'Sonata Object_33 red UV region contains zero authored vertices');

console.log('V21.31 SONATA AUTHORED LAMP UV QA: PASS',{
  object46:compact(object46),
  object33:compact(object33),
  reverseRegion,
  reverseCoverage,
  innerRedCoverage,
  outerRedCoverage
});

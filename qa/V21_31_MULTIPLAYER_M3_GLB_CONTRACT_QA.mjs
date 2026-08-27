import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getMultiplayerVehicleSpec,listMultiplayerVehicleSpecs} from '../src/multiplayer-vehicle-registry.js';

function parseGlb(path){
  const data=fs.readFileSync(path);
  assert.equal(data.toString('ascii',0,4),'glTF',`${path}: invalid GLB`);
  let offset=12,json=null;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),start=offset+8;
    if(type===0x4e4f534a){json=JSON.parse(data.subarray(start,start+length).toString('utf8').replace(/\0+$/,''));break;}
    offset=start+length;
  }
  assert(json,`${path}: missing JSON chunk`);return json;
}
function indexAsset(json){
  const nodes=json.nodes||[],materials=json.materials||[],meshes=json.meshes||[],parents=new Array(nodes.length).fill(-1);
  for(let i=0;i<nodes.length;i++)for(const child of nodes[i].children||[])parents[child]=i;
  const pathFor=index=>{const names=[];let i=index,guard=0;while(i>=0&&guard++<nodes.length+2){names.unshift(nodes[i]?.name||`node_${i}`);i=parents[i];}return names.join('/').toLowerCase();};
  const paths=nodes.map((_,i)=>pathFor(i));
  const nodeNames=new Set(nodes.map(n=>String(n.name||'').toLowerCase()));
  const materialNames=new Set(materials.map(m=>String(m.name||'').toLowerCase()));
  const meshMaterialNames=new Map();
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i];if(!Number.isInteger(node.mesh))continue;
    const names=(meshes[node.mesh]?.primitives||[]).map(p=>Number.isInteger(p.material)?String(materials[p.material]?.name||'').toLowerCase():'').filter(Boolean);
    meshMaterialNames.set(String(node.name||'').toLowerCase(),names);
  }
  return {json,nodes,materials,paths,nodeNames,materialNames,meshMaterialNames};
}
function includesPath(asset,selector){
  const term=String(selector).toLowerCase();return asset.paths.some(path=>path.includes(term));
}

const reports=[];
for(const spec of listMultiplayerVehicleSpecs().filter(spec=>spec.hd.enabled)){
  const path=`src/assets/${spec.hd.asset}`;
  assert(fs.existsSync(path),`${spec.id}: registered GLB missing: ${path}`);
  const asset=indexAsset(parseGlb(path));
  const contract=spec.lighting;
  const missing=[];

  for(const selector of contract.brakePaths||[])if(!includesPath(asset,selector))missing.push(`brakePath:${selector}`);
  for(const selector of contract.reversePaths||[])if(!includesPath(asset,selector))missing.push(`reversePath:${selector}`);
  for(const selector of contract.headlightPaths||[])if(!includesPath(asset,selector))missing.push(`headlightPath:${selector}`);
  for(const selector of contract.leftSignalPaths||[])if(!includesPath(asset,selector))missing.push(`leftSignalPath:${selector}`);
  for(const selector of contract.rightSignalPaths||[])if(!includesPath(asset,selector))missing.push(`rightSignalPath:${selector}`);
  for(const name of contract.exactNodes||[])if(!asset.nodeNames.has(String(name).toLowerCase()))missing.push(`node:${name}`);
  for(const name of contract.materials||[])if(!asset.materialNames.has(String(name).toLowerCase()))missing.push(`material:${name}`);

  if(contract.texturedNodes){
    for(const name of contract.exactNodes||[]){
      const nodeIndex=asset.nodes.findIndex(n=>String(n.name||'').toLowerCase()===String(name).toLowerCase());
      const node=asset.nodes[nodeIndex],mesh=asset.json.meshes?.[node?.mesh],primitive=mesh?.primitives?.[0],material=asset.materials[primitive?.material];
      if(!Number.isInteger(material?.pbrMetallicRoughness?.baseColorTexture?.index))missing.push(`texturedNode:${name}`);
    }
  }

  // High-value regression checks discovered by the binary audit.
  if(spec.id==='wrx'){
    assert(includesPath(asset,'fh_reverse_material'),'WRX real reverse node path must exist');
    const reverseNode=asset.nodes.findIndex((_,i)=>asset.paths[i].includes('fh_reverse_material'));
    const reverseMaterials=asset.meshMaterialNames.get(String(asset.nodes[reverseNode]?.name||'').toLowerCase())||[];
    assert(reverseMaterials.includes('eblems'),'WRX audit regression: reverse node deliberately has misleading Eblems material; path binding is required');
  }
  if(spec.id==='sonata'){
    const rearInner=asset.nodeNames.has('object_46'),rearOuter=asset.nodeNames.has('object_33'),front=asset.nodeNames.has('object_7');
    assert(rearInner&&rearOuter&&front,'Sonata exact authored lens nodes must remain present');
  }

  assert.deepEqual(missing,[],`${spec.id}: GLB lighting contract drift: ${missing.join(', ')}`);
  reports.push({id:spec.id,strategy:contract.strategy,required:[...(contract.requiredFamilies||[])],nodes:asset.nodes.length,materials:asset.materials.length});
}

assert.equal(reports.length,7,'all seven authored passenger GLBs must be contract-audited');
console.log('V21.31 MULTIPLAYER M3 GLB CONTRACT QA: PASS',{audited:reports});

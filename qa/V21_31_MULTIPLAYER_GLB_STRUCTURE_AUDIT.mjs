import fs from 'node:fs';

const ASSETS={
  wrx:'src/assets/subaru_wrx_vb.glb',
  id4:'src/assets/id4_2021_detailed.glb',
  civic:'src/assets/2006_honda_civic_si.glb',
  sonata:'src/assets/2006_hyundai_sonata.glb',
  i3_2017:'src/assets/2017_bmw_i3.glb',
  f1_2010:'src/assets/f1_2010_ferrari.glb',
  countach_80:'src/assets/countach_80.glb'
};

function parseGlb(path){
  const data=fs.readFileSync(path);
  if(data.toString('ascii',0,4)!=='glTF')throw new Error(`${path}: invalid GLB magic`);
  let offset=12;
  let json=null;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset);
    const type=data.readUInt32LE(offset+4);
    const start=offset+8;
    if(type===0x4e4f534a){
      json=JSON.parse(data.subarray(start,start+length).toString('utf8').replace(/\0+$/,''));
      break;
    }
    offset=start+length;
  }
  if(!json)throw new Error(`${path}: JSON chunk missing`);
  return json;
}

function nodePaths(json){
  const nodes=json.nodes||[];
  const parents=new Array(nodes.length).fill(-1);
  for(let i=0;i<nodes.length;i++)for(const child of nodes[i].children||[])parents[child]=i;
  const pathFor=index=>{
    const names=[];
    let i=index;
    const seen=new Set();
    while(i>=0&&!seen.has(i)){
      seen.add(i);
      names.unshift(nodes[i]?.name||`node_${i}`);
      i=parents[i];
    }
    return names.join('/');
  };
  return {parents,pathFor};
}

const LIGHT_RE=/(light|lamp|signal|turn|indicator|amber|orange|red|led|glass|reflect|reverse|brake|tail|head)/i;

for(const [vehicleId,path] of Object.entries(ASSETS)){
  const json=parseGlb(path);
  const materials=json.materials||[];
  const meshes=json.meshes||[];
  const nodes=json.nodes||[];
  const {pathFor}=nodePaths(json);
  const rows=[];

  for(let i=0;i<nodes.length;i++){
    const node=nodes[i];
    if(!Number.isInteger(node.mesh))continue;
    const mesh=meshes[node.mesh];
    const materialNames=[...new Set((mesh?.primitives||[])
      .map(p=>Number.isInteger(p.material)?(materials[p.material]?.name||`material_${p.material}`):'')
      .filter(Boolean))];
    const text=`${node.name||''} ${mesh?.name||''} ${materialNames.join(' ')}`;
    if(!LIGHT_RE.test(text))continue;
    rows.push({
      node:i,
      nodeName:node.name||'',
      meshName:mesh?.name||'',
      materials:materialNames.join(' | '),
      path:pathFor(i)
    });
  }

  console.log(`\n=== MULTIPLAYER GLB LIGHT AUDIT: ${vehicleId} ===`);
  console.log(JSON.stringify({
    vehicleId,
    path,
    nodes:nodes.length,
    meshes:meshes.length,
    materials:materials.length,
    matchingRows:rows.length,
    exactSonataNodes:vehicleId==='sonata'?['Object_46','Object_33','Object_7'].map(name=>({name,found:nodes.some(n=>n.name===name)})):undefined,
    materialNames:materials.map(m=>m.name||'').filter(name=>LIGHT_RE.test(name)),
    rows
  },null,2));
}

console.log('\nV21.31 MULTIPLAYER GLB STRUCTURE AUDIT: COMPLETE');

import fs from 'node:fs';
import crypto from 'node:crypto';

function parseGlb(path){
  const data=fs.readFileSync(path);
  if(data.toString('ascii',0,4)!=='glTF')throw new Error(`${path}: invalid GLB magic`);
  const version=data.readUInt32LE(4);
  const declaredLength=data.readUInt32LE(8);
  let offset=12;
  let json=null;
  let binOffset=-1;
  let binLength=0;
  while(offset+8<=data.length){
    const length=data.readUInt32LE(offset);
    const type=data.readUInt32LE(offset+4);
    const start=offset+8;
    if(type===0x4e4f534a)json=JSON.parse(data.subarray(start,start+length).toString('utf8').replace(/\0+$/,''));
    if(type===0x004e4942){binOffset=start;binLength=length;}
    offset=start+length;
  }
  if(!json)throw new Error(`${path}: JSON chunk missing`);
  return {path,data,json,version,declaredLength,binOffset,binLength};
}

function audit(path,label){
  const glb=parseGlb(path);
  const j=glb.json;
  const views=j.bufferViews||[];
  const imageViews=new Set();
  const imageRows=[];
  const hashes=new Map();
  for(let i=0;i<(j.images||[]).length;i++){
    const image=j.images[i];
    if(!Number.isInteger(image.bufferView))continue;
    const view=views[image.bufferView];
    if(!view)continue;
    imageViews.add(image.bufferView);
    const bytes=Number(view.byteLength)||0;
    let hash='';
    if(glb.binOffset>=0){
      const start=glb.binOffset+(Number(view.byteOffset)||0);
      const payload=glb.data.subarray(start,start+bytes);
      hash=crypto.createHash('sha256').update(payload).digest('hex');
      if(!hashes.has(hash))hashes.set(hash,[]);
      hashes.get(hash).push(i);
    }
    imageRows.push({index:i,mime:image.mimeType||'',mb:+(bytes/1048576).toFixed(2),hash});
  }

  const accessorViews=new Set();
  for(const accessor of j.accessors||[]){
    if(Number.isInteger(accessor.bufferView))accessorViews.add(accessor.bufferView);
    if(Number.isInteger(accessor.sparse?.indices?.bufferView))accessorViews.add(accessor.sparse.indices.bufferView);
    if(Number.isInteger(accessor.sparse?.values?.bufferView))accessorViews.add(accessor.sparse.values.bufferView);
  }
  const sumViews=set=>[...set].reduce((sum,index)=>sum+(Number(views[index]?.byteLength)||0),0);
  const duplicateGroups=[...hashes.values()].filter(group=>group.length>1);
  let duplicateImageBytes=0;
  for(const group of duplicateGroups){
    const row=imageRows.find(r=>r.index===group[0]);
    duplicateImageBytes+=(row?.mb||0)*1048576*(group.length-1);
  }
  const primitives=(j.meshes||[]).reduce((sum,m)=>sum+(m.primitives?.length||0),0);
  const extensions=[...(j.extensionsUsed||[])];
  const largest=[...imageRows].sort((a,b)=>b.mb-a.mb).slice(0,12).map(({hash,...row})=>row);
  const report={
    asset:label,
    total_mb:+(glb.data.length/1048576).toFixed(2),
    bin_mb:+(glb.binLength/1048576).toFixed(2),
    embedded_image_mb:+(sumViews(imageViews)/1048576).toFixed(2),
    accessor_buffer_mb:+(sumViews(accessorViews)/1048576).toFixed(2),
    images:(j.images||[]).length,
    textures:(j.textures||[]).length,
    materials:(j.materials||[]).length,
    meshes:(j.meshes||[]).length,
    primitives,
    nodes:(j.nodes||[]).length,
    accessors:(j.accessors||[]).length,
    duplicate_image_groups:duplicateGroups.length,
    exact_duplicate_image_mb:+(duplicateImageBytes/1048576).toFixed(2),
    extensions:extensions.join(', ')||'none'
  };
  console.log(`\n=== ${label} ===`);
  console.table([report]);
  console.log('Largest embedded images:');
  console.table(largest);
  if(duplicateGroups.length)console.log('Exact duplicate image indexes:',duplicateGroups);
  return report;
}

const reports=[
  audit('src/assets/2017_bmw_i3.glb','BMW i3 2017'),
  audit('src/assets/saia_ltl_freight_truck_half_trailer.glb','Saia tractor + half trailer')
];

console.log('\nV21.31 GLB PAYLOAD AUDIT COMPLETE');
console.table(reports);

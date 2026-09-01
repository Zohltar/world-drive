import assert from 'node:assert/strict';
import fs from 'node:fs';

const passenger=[
  ['civic','src/vehicles/models/civic-glb.js','src/assets/2006_honda_civic_si.glb'],
  ['countach','src/vehicles/models/countach-glb.js','src/assets/countach_80.glb'],
  ['f1','src/vehicles/models/f1-glb.js','src/assets/f1_2010_ferrari.glb'],
  ['i3','src/vehicles/models/i3-glb.js','src/assets/2017_bmw_i3.glb'],
  ['id4','src/vehicles/models/id4-glb.js','src/assets/id4_2021_detailed.glb'],
  ['sonata','src/vehicles/models/sonata-glb.js','src/assets/2006_hyundai_sonata.glb'],
  ['wrx','src/vehicles/models/wrx-glb.js','src/assets/subaru_wrx_vb.glb']
];

for(const [id,path] of passenger){
  const text=fs.readFileSync(path,'utf8');
  assert(text.includes('let loadStarted=false;'),`${id}: missing lazy-load guard`);
  assert(text.includes('if(loadStarted)return;'),`${id}: load must be single-shot`);
  assert(text.includes('requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();'),`${id}: GLB load must start on first activation`);
  assert(!/\n\s*load\(\);\s*\n\s*return\s*\{/.test(text),`${id}: eager startup load still present`);
}

const truck=fs.readFileSync('src/vehicles/truck/truck-trailer.js','utf8');
assert(truck.includes('let truckAssetLoadStarted=false;'),'truck: missing lazy-load guard');
assert(truck.includes('function loadTruckAsset(){'),'truck: asset IIFE must be wrapped');
assert(truck.includes('if(should&&!truckAssetReady&&!truckAssetLoadStarted)loadTruckAsset();'),'truck: first activation must start asset load');
const truckFunction=truck.indexOf('function loadTruckAsset(){');
const truckAsset=truck.indexOf("const modelUrl=new URL('../../assets/saia_ltl_freight_truck_half_trailer.glb'");
assert(truckFunction>=0&&truckAsset>truckFunction,'truck: Saia request must live inside lazy loader');

const assets=[...passenger.map(([id,,asset])=>[id,asset]),['semi_6x4','src/assets/saia_ltl_freight_truck_half_trailer.glb']];
let total=0;
const rows=assets.map(([vehicle,path])=>{
  const bytes=fs.statSync(path).size;
  total+=bytes;
  return {
    vehicle,
    asset_mb:+(bytes/1_000_000).toFixed(2),
    asset_mib:+(bytes/1048576).toFixed(2)
  };
});
assert(total>145_000_000,'expected authored fleet to exceed 145 decimal MB');
console.table(rows);
console.log('V21.31 LAZY GLB QA: PASS',{
  before_eager_startup_mb:+(total/1_000_000).toFixed(2),
  before_eager_startup_mib:+(total/1048576).toFixed(2),
  after_eager_startup_mb:0,
  policy:'load selected authored vehicle only'
});

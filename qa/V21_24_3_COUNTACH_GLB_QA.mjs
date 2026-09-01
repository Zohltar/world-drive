import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const mod=fs.readFileSync(new URL('../src/vehicles/models/countach-glb.js',import.meta.url),'utf8');
const attrib=fs.readFileSync(new URL('../src/assets/ATTRIBUTION_COUNTACH.md',import.meta.url),'utf8');
const asset=new URL('../src/assets/countach_80.glb',import.meta.url);
const checks=[
  ['main imports countach GLB system',main.includes("createCountachGlbSystem")],
  ['selection activates countach GLB',main.includes("countachGlbSystem.setActive(id==='countach_80')")],
  ['frame updates GLB wheels',main.includes('countachGlbSystem.update(')],
  ['real asset exists',fs.existsSync(asset)&&fs.statSync(asset).size>3_000_000],
  ['procedural pivots hidden',mod.includes('pivot.visible=false')],
  ['front GLB wheel bones',mod.includes("lFrontTire_05")&&mod.includes("rFrontTire_08")],
  ['rear GLB wheel bone',mod.includes("RearTires_07")],
  ['author attribution',attrib.includes('SINNIK')&&attrib.includes('CC BY 4.0')]
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}
if(fail)process.exit(1);
console.log('V21.24.3 COUNTACH GLB QA: PASS');

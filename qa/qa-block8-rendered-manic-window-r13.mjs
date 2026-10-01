/** Real finite-package window admission, separate from browser/GPU certification.
 * Exercises the actual batch source, transport and preparation session with
 * local byte responses; no live network, fabricated manifest or skipped checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBiomeBatchSource} from '../src/scenery/biomes/batch-source.js';
import {createBiomeTileTransport} from '../src/scenery/biomes/tile-transport.js';
import {createBiomeBatchRouteSession} from '../src/scenery/biomes/batch-route-session.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {createForestCandidateAdapter} from '../src/scenery/biomes/forest-candidate-adapter.js';
import {R12_PROFILE,R13_PROFILE,renderedWindowOptions} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
import {readManicFixture} from '../tools/biomes/long-road-plan-r10.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),pilot=args[0];
if(!pilot)throw new Error('Use: node qa-block8-rendered-manic-window-r13.mjs PILOT_DIR [REPORT]');
const data=path.resolve(pilot,'public/local-data/biomes/pilot-r13');
const directory=JSON.parse(fs.readFileSync(path.join(data,'directory.json')));
const baseUrl='http://127.0.0.1/r13-window-test/';
const fetchImpl=async url=>{
  const u=new URL(url),name=u.pathname.slice('/r13-window-test/'.length);
  assert.equal(u.origin,'http://127.0.0.1');
  assert.ok(/^(?:batch-\d+-\d+\.json|\d+-\d+\.json\.gz)$/.test(name));
  const raw=fs.readFileSync(path.join(data,name));
  return new Response(raw,{status:200,headers:{'content-length':String(raw.byteLength)}});
};
const {coordinates}=readManicFixture(path.join(root,'qa/fixtures/biomes/manic-r10'));
const plan=createBiomeRoutePlan(coordinates),tiles=new Set();
for(const page of directory.batches){
  const body=JSON.parse(fs.readFileSync(path.join(data,page.file)));
  for(const d of body.tiles)tiles.add(`${d.x}-${d.y}`);
}
assert.equal(tiles.size,26);
let windows=0;
for(const direction of [1,-1]){
  const positions=[];for(let p=0;p<plan.totalMeters;p+=120)positions.push(p);positions.push(plan.totalMeters);
  for(const position of positions){
    const w=plan.window(position,renderedWindowOptions(R13_PROFILE,direction));
    assert.equal(w.capacityLimited,false);assert.equal(w.planningLimited,false);
    assert.ok(w.tiles.every(t=>tiles.has(t.key)),`Undeclared ${position}/${direction}`);windows++;
  }
}
const source=await createBiomeBatchSource({directory,baseUrl,fetchImpl});
const transport=createBiomeTileTransport({baseUrl,fetchImpl});
const session=createBiomeBatchRouteSession({source,transport});
let preparedWindows=0,reads=0;let missingBefore;
try{
  session.setRoute(coordinates);
  const original=await session.update(0,renderedWindowOptions(R12_PROFILE));
  assert.equal(original.status,'missing');
  missingBefore=[...original.missing].sort();
  assert.deepEqual(missingBefore,['1115-407','1116-407']);
  assert.equal(session.diagnostics().transport.loaded,0);
  // Same unchanged finite bytes, corrected profile window: startup now prepares.
  const fixed=await session.update(0,renderedWindowOptions(R13_PROFILE));
  assert.equal(fixed.status,'ready');
  const a=createForestCandidateAdapter({origin:{lon:-68.3467,lat:49.3213},routeId:'r13-window'}),point={};
  for(const [cx,cz] of [[0,0],[-1,0],[0,1],[-1,1]])for(let i=0;i<1744;i++){
    a.point(cx,cz,i,point);const c=session.query(point.lat,point.lon);
    assert.equal(c.status,'resolved');assert.equal(c.ecoregion.id,373);reads++;
  }
  const positions=[0,plan.totalMeters*.1,plan.totalMeters];
  for(let p=10000;p<plan.totalMeters;p+=10000)positions.push(p);
  for(const direction of [1,-1])for(const position of positions){
    const result=await session.update(position,renderedWindowOptions(R13_PROFILE,direction));
    assert.equal(result.status,'ready',JSON.stringify(result));preparedWindows++;
  }
  assert.equal(session.diagnostics().transport.rejected,0);
}finally{session.dispose();}
const report={status:'PASS',groups:3,declaredTiles:tiles.size,coverageWindows:windows,
  preparedWindows,exactStartupReads:reads,oldWindowMissing:missingBefore,
  sourceBytesUnchanged:true,scope:'Real source bytes with local transport responses; not native Worker or GPU evidence'};
if(args[1])fs.writeFileSync(args[1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

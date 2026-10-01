// Real finite source bytes and independent original-polygon expectations.
// Local transport responses, not a browser Worker or GPU performance test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createBiomeBatchSource} from '../src/scenery/biomes/batch-source.js';
import {createBiomeTileTransport} from '../src/scenery/biomes/tile-transport.js';
import {createBiomeBatchRouteSession} from '../src/scenery/biomes/batch-route-session.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {createForestCandidateAdapter} from '../src/scenery/biomes/forest-candidate-adapter.js';
import {R14_PROFILE,renderedWindowOptions,r12ContextEligible} from '../tools/biomes/rendered-pilot-policy-r12.mjs';
const [pilot,output]=process.argv.slice(2);
if(!pilot)throw new Error('Use: node qa-block8-rendered-laguna-data-r14.mjs PILOT_DIR [REPORT]');
const data=path.resolve(pilot,'public/local-data/biomes/pilot-r14');
const directory=JSON.parse(fs.readFileSync(path.join(data,'directory.json')));
const oracle=JSON.parse(fs.readFileSync(path.join(pilot,'oracle-plan.json')));
const expected=JSON.parse(fs.readFileSync(path.join(pilot,'source-expectations.json')));
const plan=createBiomeRoutePlan(oracle.coordinates),tiles=new Set();
for(const page of directory.batches)for(const t of JSON.parse(fs.readFileSync(path.join(data,page.file))).tiles)tiles.add(`${t.x}-${t.y}`);
assert.equal(tiles.size,9);let windows=0;
for(const direction of [1,-1])for(let i=0;i<oracle.coordinates.length;i++){
  const w=plan.window(plan.distanceAtVertex(i),renderedWindowOptions(R14_PROFILE,direction));
  assert.equal(w.capacityLimited,false);assert.equal(w.planningLimited,false);
  assert.ok(w.tiles.every(t=>tiles.has(t.key)));windows++;
}
const baseUrl='http://127.0.0.1/r14-data/';
const fetchImpl=async url=>{
  const u=new URL(url);assert.equal(u.origin,'http://127.0.0.1');assert.ok(u.pathname.startsWith('/r14-data/'));
  const name=u.pathname.slice('/r14-data/'.length);assert.match(name,/^(?:batch-\d+-\d+\.json|\d+-\d+\.json\.gz)$/);
  const bytes=fs.readFileSync(path.join(data,name));return new Response(bytes,{status:200,headers:{'content-length':String(bytes.byteLength)}});
};
const source=await createBiomeBatchSource({directory,baseUrl,fetchImpl}),transport=createBiomeTileTransport({baseUrl,fetchImpl});
const session=createBiomeBatchRouteSession({source,transport}),adapter=createForestCandidateAdapter({origin:oracle.origin,routeId:'r14-data'});
let reads=0,eligible=0,mixed=0,other=0;const regions={};let diagnostics;
try{
  session.setRoute(oracle.coordinates);
  for(const sample of oracle.samples){
    assert.equal((await session.update(plan.distanceAtVertex(sample.anchorIndex),renderedWindowOptions(R14_PROFILE))).status,'ready');
    const want=Buffer.from(expected[sample.key],'base64');assert.equal(want.byteLength,1744*2);
    let all=true;const ids=new Set();
    for(let i=0;i<1744;i++){
      const p=adapter.point(sample.cx,sample.cz,i),c=session.query(p.lat,p.lon),id=c.ecoregion?.id??0;
      assert.notEqual(c.status,'unavailable');assert.equal(id,want.readUInt16LE(i*2),`${sample.key}/${i}`);
      assert.equal(r12ContextEligible(c,R14_PROFILE),id===423);all&&=id===423;ids.add(id);
      regions[id]=(regions[id]??0)+1;reads++;
    }
    if(all)eligible++;else if(ids.size>1)mixed++;else other++;
  }
  assert.deepEqual({eligible,mixed,other},{eligible:39,mixed:7,other:2});
  diagnostics=session.diagnostics();assert.equal(diagnostics.transport.rejected,0);
}finally{session.dispose();}
const report={status:'PASS',coverageWindows:windows,sourceChunks:oracle.samples.length,reads,eligible,mixed,other,regions,
  boundaries:'Mixed and non-423 chunks must retain original geometry, not a guessed uniform dry tree',diagnostics,
  scope:'Real bytes/local source session; native exact-point bridge and rendered game are separate gates'};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,windows,reads,eligible,mixed,other}));

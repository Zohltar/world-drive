/** Execute the ACTUAL original forest builder/projection bodies as the oracle.
 * No retyped sampler in the assertion path. Dependencies only suppress placement
 * after observing each raw candidate at terrainSlope; exclusions stay untouched.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {FOREST_STREAMING_POLICY as FOREST,forestHash} from '../src/forest-streaming-policy.js';
import {createForestCandidateAdapter,forestSlotAtTraversal,forestChunkAtAbsolute}
  from '../src/scenery/biomes/forest-candidate-adapter.js';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const core=read('src/forest-chunk-streamer-core.js'),main=read('src/main.js');
const start=core.indexOf('  function createBuilder('),end=core.indexOf('  function finalizeBuilder(',start);
assert.ok(start>=0&&end>start,'Actual builder bodies missing: review parity harness');
const body=core.slice(start,end);
assert.equal((body.match(/function /g)||[]).length,4,'Unexpected actual builder structure');
function observe(cx,cz,source=body){
  const factory=new Function('FOREST','forestHash',`
    const chunkCells=FOREST.chunkCells,totalCells=chunkCells*chunkCells,densityBuckets=32,serial=7;
    const baseCandidatesPerCell=FOREST.candidatesPerCell,candidateLimitFor=()=>baseCandidatesPerCell;
    const firstLayerCandidatesPerCell=FOREST.firstLayerCandidatesPerCell;
    const progressiveFirstLayer=firstLayerCandidatesPerCell<baseCandidatesPerCell;
    const cellNearRoad=()=>false,densityAt=()=>1,rows=[];let builder;
    const terrainSlope=(x,z)=>{rows.push({x,z,cellIndex:builder.cellIndex,candidateIndex:builder.candidateIndex});return FOREST.maxSlope+1;};
    ${source}
    return (cx,cz)=>{
      builder=createBuilder({cx,cz},serial);let firstLayerAt=null;
      for(let count=0;count<totalCells*FOREST.candidatesPerCell;count++){
        processBuilderCandidate(builder);
        if(builder.firstLayerReady&&firstLayerAt===null)firstLayerAt=rows.length;
      }
      if(builder.cellIndex!==totalCells)throw new Error('Original traversal not complete');
      return {rows,firstLayerAt};
    };`);
  return factory(FOREST,forestHash)(cx,cz);
}
function projection(origin){
  const xz=main.match(/^function xzToLL\(x,z\)\{[^\n]+$/m)?.[0];
  const ll=main.match(/^function llToXZ\(lat,lon\)\{[^\n]+$/m)?.[0];
  const earth=Number(main.match(/const EARTH=(\d+);/)?.[1]);
  assert.ok(xz&&ll&&earth===6378137,'Actual game projection changed: review adapter');
  return new Function('origin','EARTH',`${xz}\n${ll}\nreturn {xzToLL,llToXZ};`)(origin,earth);
}
function compare(cx,cz,origin,source=body){
  const actual=observe(cx,cz,source),a=createForestCandidateAdapter({origin,routeId:'parity'}),p=projection(origin),scratch={};
  assert.equal(actual.rows.length,1744);assert.equal(actual.firstLayerAt,1024);
  for(let n=0;n<1744;n++){
    const raw=actual.rows[n],slot=raw.cellIndex*109+raw.candidateIndex;
    assert.equal(slot,forestSlotAtTraversal(n));a.point(cx,cz,slot,scratch);
    assert.equal(scratch.x,raw.x);assert.equal(scratch.z,raw.z);
    const ll=p.xzToLL(raw.x,raw.z);assert.equal(scratch.lon,ll.lon);assert.equal(scratch.lat,ll.lat);
  }
  return actual;
}
const origins=[{lat:49.1,lon:-68.5},{lat:-16.3,lon:-67.9},{lat:0,lon:0},{lat:67.5,lon:-64}];
const chunks=[[-64,33],[-8,-9],[-2,-1],[-1,0],[0,-1],[0,0],[1,1],[8,21],[100,-50]];
for(const origin of origins)for(const [cx,cz] of chunks)compare(cx,cz,origin);
// Demonstrate that this is a discriminating oracle, not just a self-comparison.
for(const [from,to] of [['17+i*7919','18+i*7919'],['31+i*104729','31+i*104723'],
  ['sz=index%chunkCells','sz=Math.floor(index/chunkCells)']]){
  assert.ok(body.includes(from));assert.throws(()=>compare(0,0,origins[0],body.replace(from,to)));
}
const report={status:'PASS',actualBuilderBodies:true,actualMainProjection:true,chunks:origins.length*chunks.length,
  rawCandidateComparisons:origins.length*chunks.length*1744,firstLayerAt:1024,coordinateMismatches:0,traversalMismatches:0,
  mutationControls:3,coreSha256:createHash('sha256').update(core).digest('hex'),mainSha256:createHash('sha256').update(main).digest('hex')};
console.log('PASS R7 actual forest sampler/projection oracle',report);
if(process.argv.includes('--report'))writeFileSync(process.argv[process.argv.indexOf('--report')+1],JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--plan')){
  const directory=process.argv[process.argv.indexOf('--plan')+1];mkdirSync(directory,{recursive:true});
  const routes=[],addresses=new Map();
  for(const name of ['laguna-seca','nordschleife']){
    const path=`src/routing/circuits/${name}.json`,text=read(path),route=JSON.parse(text),coordinates=route.coordinates;
    const origin={lat:coordinates[0][1],lon:coordinates[0][0]},p=projection(origin),plan=createBiomeRoutePlan(coordinates),samples=[],seen=new Set();
    const cumulative=[0];for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative[i-1]+createBiomeRoutePlan(coordinates.slice(i-1,i+1)).totalMeters);
    for(const vertex of [0,Math.floor(coordinates.length/4),Math.floor(coordinates.length/2),Math.floor(3*coordinates.length/4)]){
      const ll=coordinates[vertex],abs=p.llToXZ(ll[1],ll[0]),c=forestChunkAtAbsolute(abs.x,abs.z);
      const chosen=vertex===0?[[c.cx-1,c.cz-1],[c.cx-1,c.cz],[c.cx,c.cz-1],[c.cx,c.cz]]:[[c.cx,c.cz]];
      for(const [cx,cz] of chosen){
        if(seen.has(`${cx},${cz}`))continue;seen.add(`${cx},${cz}`);
        // Expected coordinate list is built from the ORIGINAL builder, not adapter.
        const original=compare(cx,cz,origin),points=Array(1744);
        for(const row of original.rows){const ll=p.xzToLL(row.x,row.z);points[row.cellIndex*109+row.candidateIndex]=[ll.lon,ll.lat];}
        samples.push({cx,cz,vertex,position:Math.min(cumulative[vertex],plan.totalMeters),points});
      }
    }
    for(const sample of samples){const w=plan.window(sample.position,{maxTiles:32,maxTests:65536});
      assert.equal(w.capacityLimited,false);assert.equal(w.planningLimited,false);for(const t of w.tiles)addresses.set(t.key,[t.x,t.y]);}
    routes.push({name,coordinates,origin,routeId:'r7-'+name,totalMeters:plan.totalMeters,samples,
      repositoryPath:path,sha256:createHash('sha256').update(text).digest('hex')});
  }
  writeFileSync(join(directory,'forest-plan.json'),JSON.stringify({routes,addresses:[...addresses.values()],oracle:report}));
}

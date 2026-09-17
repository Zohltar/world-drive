// Real repository circuit polylines + actual loopback HTTP/gzip loading.
// Not a browser/GPU or forest frame-pacing benchmark.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createBiomeRoutePlan} from '../src/scenery/biomes/route-tile-plan.js';
import {createBiomeTileTransport} from '../src/scenery/biomes/tile-transport.js';
import {createBiomeRoutePreparer} from '../src/scenery/biomes/route-preparer.js';
import {prepareBiomeService} from '../src/scenery/biomes/biome-service.js';
const [mode,directory]=process.argv.slice(2),json=p=>JSON.parse(readFileSync(p,'utf8'));
if(mode==='--plan') {
  const addresses=new Map(),routes=[];
  for(const name of ['laguna-seca','nordschleife']) {
    const path=new URL(`../src/routing/circuits/${name}.json`,import.meta.url);
    const raw=readFileSync(path),route=JSON.parse(raw),plan=createBiomeRoutePlan(route.coordinates);
    for(let p=0;p<=plan.totalMeters+250;p+=250) {
      const w=plan.window(Math.min(p,plan.totalMeters),{maxTiles:32,maxTests:65536});
      assert.equal(w.planningLimited,false);assert.equal(w.capacityLimited,false);
      for(const t of w.tiles)addresses.set(t.key,[t.x,t.y]);
    }
    routes.push({name,coordinates:route.coordinates,pointCount:route.coordinates.length,totalMeters:plan.totalMeters,
      repositoryPath:`src/routing/circuits/${name}.json`,sha256:createHash('sha256').update(raw).digest('hex')});
  }
  assert.ok(addresses.size>0&&addresses.size<=128);
  writeFileSync(join(directory,'route-plan.json'),JSON.stringify({addresses:[...addresses.values()],routes},null,2));
} else if(mode==='--evaluate') {
  const {routes}=json(join(directory,'route-plan.json')),manifest=json(join(directory,'manifest.json'));
  const expected=json(join(directory,'route-source-expectations.json'));
  const allowed=new Set(manifest.tiles.map(t=>'/'+t.file));let requests=0,wireBytes=0;
  const server=createServer((req,res)=>{
    if(!allowed.has(req.url)) {res.writeHead(404);res.end();return;}
    const bytes=readFileSync(join(directory,req.url.slice(1)));requests++;wireBytes+=bytes.length;
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length});
    // Explicit fragmented writes exercise streaming, not response.arrayBuffer().
    for(let i=0;i<bytes.length;i+=97)res.write(bytes.subarray(i,i+97));res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const transport=createBiomeTileTransport({baseUrl:`http://127.0.0.1:${server.address().port}/`});
  const service=await prepareBiomeService({refinementManifest:manifest});
  const coordinator=createBiomeRoutePreparer({service,transport});const reports=[];
  try {
    for(let routeIndex=0;routeIndex<routes.length;routeIndex++) {
      const route=routes[routeIndex];coordinator.setRoute(route.coordinates);
      let progress=0,noData=0,resolved=0,maxWindowTiles=0;
      for(let i=0;i<route.coordinates.length;i++) {
        if(i)progress+=createBiomeRoutePlan([route.coordinates[i-1],route.coordinates[i]]).totalMeters;
        const limit=coordinator.update(Math.min(progress,route.totalMeters));
        maxWindowTiles=Math.max(maxWindowTiles,limit.desired);
        const d=await coordinator.drain();assert.equal(d.ready,true,JSON.stringify({name:route.name,i,d}));
        const [lon,lat]=route.coordinates[i],context=service.query(lat,lon);
        assert.notEqual(context.status,'unavailable',`${route.name}/${i}: ${context.reason}`);
        assert.equal(context.ecoregion?.id??null,expected[routeIndex][i],`${route.name}/${i}: source agreement`);
        if(context.status==='resolved')resolved++;else noData++;
      }
      reports.push({name:route.name,pointCount:route.pointCount,totalMeters:route.totalMeters,
        polylineSha256:route.sha256,sourceRecordMismatches:0,resolved,noData,maxWindowTiles});
    }
    const report={routes:reports,requests,wireBytes,manifestTiles:manifest.tiles.length,
      transport:transport.diagnostics(),coordinator:coordinator.diagnostics(),service:service.diagnostics(),
      limitations:['Two existing repository circuit polylines; not a worldwide route-distribution test',
        'Actual Node HTTP/native gzip; not browser/GPU/frame-pacing certification',
        'Source agreement only; actual vegetation assets remain absent and game activation is unchanged']};
    writeFileSync(join(directory,'route-loading-r4-qa.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    console.log('PASS R4 real circuit continuous coverage + HTTP/gzip + source agreement');
  } finally {coordinator.dispose();transport.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
} else throw new Error('Usage: --plan|--evaluate DIRECTORY');

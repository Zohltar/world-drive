import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('./',import.meta.url));
const SRC=path.join(ROOT,'src');
const TRAFFIC_ROOT=[
  'src/civil-traffic.js',
  'src/civil-traffic-local.js',
  'src/civil-traffic-network-bridge.js',
  'src/civil-traffic-pool.js',
  'src/civil-traffic-preload.js'
];
const TRAFFIC_SET=new Set(TRAFFIC_ROOT);

function walk(dir,{extensions=null}={}){
  const out=[];
  if(!existsSync(dir))return out;
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full,{extensions}));
    else if(entry.isFile()&&(!extensions||extensions.some(ext=>entry.name.endsWith(ext))))out.push(full);
  }
  return out;
}
function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}
function localSpecs(source){
  const out=[];
  for(const {kind,regex} of [
    {kind:'static',regex:/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g},
    {kind:'dynamic',regex:/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g}
  ]){
    let match;
    while((match=regex.exec(source)))if(match[1]?.startsWith('.'))out.push({kind,spec:match[1]});
  }
  return out;
}
function resolveLocal(from,spec){
  const base=path.resolve(path.dirname(from),spec);
  for(const candidate of [base,`${base}.js`,`${base}.mjs`,`${base}.cjs`,path.join(base,'index.js')]){
    try{if(statSync(candidate).isFile())return candidate;}catch{}
  }
  return null;
}

for(const file of TRAFFIC_ROOT)assert(existsSync(path.join(ROOT,file)),`${file} missing before R3`);
assert.equal(existsSync(path.join(SRC,'traffic')),false,'R3 audit must run before src/traffic implementation move');

const sourceFiles=walk(SRC,{extensions:['.js','.mjs','.cjs']});
const productionEdges=[];
const dynamicEdges=[];
for(const file of sourceFiles){
  const source=readFileSync(file,'utf8');
  for(const item of localSpecs(source)){
    const resolved=resolveLocal(file,item.spec);
    if(!resolved)continue;
    const edge={from:rel(file),to:rel(resolved),kind:item.kind,spec:item.spec};
    if(TRAFFIC_SET.has(edge.from)||TRAFFIC_SET.has(edge.to))productionEdges.push(edge);
    if(item.kind==='dynamic'&&(TRAFFIC_SET.has(edge.from)||TRAFFIC_SET.has(edge.to)))dynamicEdges.push(edge);
  }
}

const inbound=productionEdges.filter(edge=>!TRAFFIC_SET.has(edge.from)&&TRAFFIC_SET.has(edge.to));
const outbound=productionEdges.filter(edge=>TRAFFIC_SET.has(edge.from)&&!TRAFFIC_SET.has(edge.to));
const internal=productionEdges.filter(edge=>TRAFFIC_SET.has(edge.from)&&TRAFFIC_SET.has(edge.to));

const expectedDynamic={
  from:'src/civil-traffic-pool.js',
  to:'src/civil-traffic-preload.js',
  kind:'dynamic',
  spec:'./civil-traffic-preload.js'
};
assert(dynamicEdges.some(edge=>Object.entries(expectedDynamic).every(([key,value])=>edge[key]===value)),'traffic pool startup preload dynamic import drift');

const localSource=readFileSync(path.join(ROOT,'src/civil-traffic-local.js'),'utf8');
const preloadSource=readFileSync(path.join(ROOT,'src/civil-traffic-preload.js'),'utf8');
const poolSource=readFileSync(path.join(ROOT,'src/civil-traffic-pool.js'),'utf8');
const networkSource=readFileSync(path.join(ROOT,'src/civil-traffic-network-bridge.js'),'utf8');
const facadeSource=readFileSync(path.join(ROOT,'src/civil-traffic.js'),'utf8');
const multiplayerSource=readFileSync(path.join(ROOT,'src/multiplayer.js'),'utf8');

for(const source of [localSource,preloadSource]){
  assert(source.includes("new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href"),'Sonata import.meta.url path contract drift');
}
assert(poolSource.includes("GENERIC_PASSENGER_PACK_URL='./assets/traffic/generic_passenger_car_pack_traffic.glb'"),'generic pack application-relative URL drift');
assert(poolSource.includes("GENERIC_PASSENGER_PACK_FALLBACK_URL='./assets/traffic/generic_passenger_car_pack.glb'"),'generic pack fallback URL drift');
assert(poolSource.includes("import('./civil-traffic-preload.js')"),'startup preload must remain dynamic');
assert(preloadSource.includes("fetch(url,{cache:'force-cache'})"),'traffic preload cache contract drift');
assert(preloadSource.includes('state.pack.promise=state.sonata.promise'),'traffic preload must remain sequential Sonata -> pack');

assert(networkSource.includes('ensureWorldDriveDiagnostics().traffic'),'network diagnostics canonical ownership drift');
assert(preloadSource.includes('ensureWorldDriveDiagnostics().traffic.preload=civilTrafficPreloadDiagnostics'),'preload diagnostics canonical ownership drift');
assert(facadeSource.includes('trafficDiagnostics.runtime=diagnostics'),'runtime diagnostics canonical ownership drift');
assert(facadeSource.includes('trafficDiagnostics.pool=poolDiagnostics'),'pool diagnostics canonical ownership drift');
assert(facadeSource.includes("installDiagnosticAlias('WorldDriveTraffic'"),'WorldDriveTraffic compatibility alias drift');
assert(facadeSource.includes("installDiagnosticAlias('WorldDriveTrafficPool'"),'WorldDriveTrafficPool compatibility alias drift');
assert(facadeSource.includes('globalThis.WorldDriveTrafficSpawn'),'WorldDriveTrafficSpawn facade command missing');
assert(localSource.includes('globalThis.WorldDriveTraffic=diagnostics'),'direct-local WorldDriveTraffic compatibility bootstrap missing');
assert(localSource.includes('globalThis.WorldDriveTrafficPool'),'direct-local WorldDriveTrafficPool compatibility bootstrap missing');
assert(localSource.includes('globalThis.WorldDriveTrafficSpawn'),'direct-local WorldDriveTrafficSpawn command missing');
assert(multiplayerSource.includes("from './civil-traffic-network-bridge.js'"),'public multiplayer/traffic bridge import drift');

const contractFiles=[
  ...walk(path.join(ROOT,'qa'),{extensions:['.mjs','.js']}),
  ...readdirSync(ROOT,{withFileTypes:true}).filter(entry=>entry.isFile()&&/^qa-.*\.mjs$/i.test(entry.name)).map(entry=>path.join(ROOT,entry.name)),
  ...walk(path.join(ROOT,'.github','workflows'),{extensions:['.yml','.yaml']}),
  ...walk(path.join(ROOT,'electron'),{extensions:['.js','.mjs','.cjs']}),
  path.join(ROOT,'index.html'),
  path.join(ROOT,'forge.config.cjs'),
  path.join(ROOT,'package.json')
].filter(existsSync);
const trafficPathRegex=/(?:\.\.\/|\.\/)?src\/civil-traffic(?:-[A-Za-z0-9_-]+)?\.js/g;
const pathContracts=[];
for(const file of [...new Set(contractFiles)]){
  const source=readFileSync(file,'utf8');
  const paths=[...new Set(source.match(trafficPathRegex)||[])].sort();
  if(paths.length)pathContracts.push({file:rel(file),paths});
}

assert(pathContracts.some(entry=>entry.file==='qa-traffic-r1.mjs'),'R3 audit did not discover sparse traffic QA path contract');
assert(pathContracts.some(entry=>entry.file==='qa-diagnostics-c6-12.mjs'),'R3 audit did not discover C6.12 traffic path contract');

const report={
  trafficRootFiles:TRAFFIC_ROOT,
  inbound,
  outbound,
  internal,
  dynamicEdges,
  pathContracts,
  moveSensitive:{
    sonataImportMetaUrls:[
      'src/civil-traffic-local.js',
      'src/civil-traffic-preload.js'
    ],
    sonataPathAfterMove:'../assets/2006_hyundai_sonata.glb',
    genericPackUrlsRemainApplicationRelative:true,
    multiplayerNetworkBridgeCrossBoundary:true
  },
  preservedContracts:{
    maxAgents:2,
    rightHandTraffic:true,
    preload:'sequential-sonata-then-pack',
    fetchCache:'force-cache',
    canonicalDiagnostics:['traffic.network','traffic.preload','traffic.runtime','traffic.pool'],
    compatibility:['WorldDriveTraffic','WorldDriveTrafficPool'],
    functionalCommand:'WorldDriveTrafficSpawn'
  }
};

console.log('SOURCE TREE R3 TRAFFIC AUDIT: PASS',JSON.stringify(report,null,2));

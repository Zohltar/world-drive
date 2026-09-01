import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('./',import.meta.url));
const read=relative=>readFileSync(path.join(ROOT,relative),'utf8');
const exists=relative=>existsSync(path.join(ROOT,relative));

const MOVED=[
  'src/traffic/civil-traffic.js',
  'src/traffic/civil-traffic-local.js',
  'src/traffic/civil-traffic-network-bridge.js',
  'src/traffic/civil-traffic-pool.js',
  'src/traffic/civil-traffic-preload.js'
];
const REMOVED_ROOT=[
  'src/civil-traffic.js',
  'src/civil-traffic-local.js',
  'src/civil-traffic-network-bridge.js',
  'src/civil-traffic-pool.js',
  'src/civil-traffic-preload.js'
];

for(const file of MOVED)assert(exists(file),`${file} missing after R3 move`);
for(const file of REMOVED_ROOT)assert(!exists(file),`${file} must not remain at src root after R3`);

const facade=read('src/traffic/civil-traffic.js');
const local=read('src/traffic/civil-traffic-local.js');
const network=read('src/traffic/civil-traffic-network-bridge.js');
const pool=read('src/traffic/civil-traffic-pool.js');
const preload=read('src/traffic/civil-traffic-preload.js');
const driving=read('src/driving-runtime.js');
const multiplayer=read('src/multiplayer.js');

assert(driving.includes("from './traffic/civil-traffic.js'"),'driving runtime must consume traffic from src/traffic');
assert(multiplayer.includes("from './traffic/civil-traffic-network-bridge.js'"),'multiplayer must consume the moved traffic network bridge');
assert(!driving.includes("from './civil-traffic.js'"),'legacy root traffic import returned in driving runtime');
assert(!multiplayer.includes("from './civil-traffic-network-bridge.js'"),'legacy root network-bridge import returned in multiplayer');

assert(facade.includes("export * from './civil-traffic-local.js'"),'traffic facade/local export boundary drift');
assert(facade.includes("from './civil-traffic-local.js'"),'traffic facade/local import boundary drift');
assert(facade.includes("from './civil-traffic-network-bridge.js'"),'traffic facade/network bridge boundary drift');
assert(local.includes("from './civil-traffic-pool.js'"),'local engine/pool boundary drift');
assert(preload.includes("from './civil-traffic-pool.js'"),'preload/pool boundary drift');
assert(pool.includes("import('./civil-traffic-preload.js')"),'traffic startup preload must remain a dynamic sibling import');

for(const source of [facade,network,preload]){
  assert(source.includes("from '../diagnostics.js'"),'moved traffic diagnostics import must cross one directory');
  assert(!source.includes("from './diagnostics.js'"),'stale traffic diagnostics path returned');
}
for(const source of [local,preload]){
  assert(source.includes("new URL('../assets/2006_hyundai_sonata.glb',import.meta.url).href"),'moved Sonata import.meta.url contract drift');
  assert(!source.includes("new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href"),'stale Sonata import.meta.url path returned');
}
assert(pool.includes("GENERIC_PASSENGER_PACK_URL='./assets/traffic/generic_passenger_car_pack_traffic.glb'"),'application-relative generic traffic pack URL must not change');
assert(pool.includes("GENERIC_PASSENGER_PACK_FALLBACK_URL='./assets/traffic/generic_passenger_car_pack.glb'"),'application-relative generic traffic fallback URL must not change');

assert(local.includes('export const CIVIL_TRAFFIC_MAX_ACTIVE=2'),'civil traffic max active drift');
assert(local.includes('export const CIVIL_TRAFFIC_LANE_OFFSET_M=1.72'),'right-hand traffic lane offset drift');
assert(local.includes('export const CIVIL_TRAFFIC_COOLDOWN_MIN_SEC=32'),'traffic cooldown minimum drift');
assert(local.includes('export const CIVIL_TRAFFIC_COOLDOWN_MAX_SEC=68'),'traffic cooldown maximum drift');

assert(preload.includes("fetch(url,{cache:'force-cache'})"),'traffic preload cache contract drift');
assert(preload.includes('state.pack.promise=state.sonata.promise'),'traffic preload order must remain Sonata then generic pack');

assert(network.includes('ensureWorldDriveDiagnostics().traffic'),'traffic network diagnostics ownership drift');
assert(preload.includes('ensureWorldDriveDiagnostics().traffic.preload=civilTrafficPreloadDiagnostics'),'traffic preload diagnostics ownership drift');
assert(facade.includes('trafficDiagnostics.runtime=diagnostics'),'traffic runtime diagnostics ownership drift');
assert(facade.includes('trafficDiagnostics.pool=poolDiagnostics'),'traffic pool diagnostics ownership drift');
assert(facade.includes("installDiagnosticAlias('WorldDriveTraffic'"),'WorldDriveTraffic compatibility alias missing');
assert(facade.includes("installDiagnosticAlias('WorldDriveTrafficPool'"),'WorldDriveTrafficPool compatibility alias missing');
assert(facade.includes('globalThis.WorldDriveTrafficSpawn'),'WorldDriveTrafficSpawn facade command missing');
assert(local.includes('globalThis.WorldDriveTraffic=diagnostics'),'direct-local WorldDriveTraffic compatibility bootstrap missing');
assert(local.includes('globalThis.WorldDriveTrafficPool'),'direct-local WorldDriveTrafficPool compatibility bootstrap missing');
assert(local.includes('globalThis.WorldDriveTrafficSpawn'),'direct-local WorldDriveTrafficSpawn command missing');

// This boundary is permanent: Dev Integration must keep invoking it after R3 closes.
const devIntegration=read('.github/workflows/qa-dev-integration.yml');
assert(devIntegration.includes('Source tree R3 traffic boundary QA'),'R3 boundary is not registered in Dev Integration');
assert(devIntegration.includes('run: node qa-source-tree-r3-traffic.mjs'),'Dev Integration R3 command missing');

console.log('SOURCE TREE R3 TRAFFIC BOUNDARY QA: PASS',{
  moved:MOVED,
  removedRoot:REMOVED_ROOT,
  externalConsumers:['src/driving-runtime.js','src/multiplayer.js'],
  lazyPreload:true,
  sonataAssetDepthCorrected:true,
  genericPackApplicationUrlsPreserved:true,
  maxAgents:2,
  diagnostics:['traffic.network','traffic.preload','traffic.runtime','traffic.pool'],
  compatibility:['WorldDriveTraffic','WorldDriveTrafficPool'],
  functionalCommand:'WorldDriveTrafficSpawn',
  devIntegrationPermanent:true
});

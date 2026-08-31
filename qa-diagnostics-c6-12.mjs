import assert from 'node:assert/strict';
import fs from 'node:fs';

const facade=fs.readFileSync('src/civil-traffic.js','utf8');
const local=fs.readFileSync('src/civil-traffic-local.js','utf8');

assert.ok(facade.includes("import {ensureWorldDriveDiagnostics,installDiagnosticAlias} from './diagnostics.js';"),'traffic facade diagnostics helpers missing');
assert.ok(facade.includes('trafficDiagnostics.runtime=diagnostics;'),'canonical traffic runtime diagnostics writer missing');
assert.ok(facade.includes('trafficDiagnostics.pool=poolDiagnostics;'),'canonical traffic pool diagnostics writer missing');
assert.ok(facade.includes("installDiagnosticAlias('WorldDriveTraffic',()=>trafficDiagnostics.runtime);"),'WorldDriveTraffic compatibility delegate missing');
assert.ok(facade.includes("installDiagnosticAlias('WorldDriveTrafficPool',()=>trafficDiagnostics.pool);"),'WorldDriveTrafficPool compatibility delegate missing');
assert.ok(!facade.includes('globalThis.WorldDriveTraffic=diagnostics;'),'MP1 facade must not own an independent WorldDriveTraffic diagnostic global');
assert.ok(!facade.includes('globalThis.WorldDriveTrafficPool='),'MP1 facade must not own an independent WorldDriveTrafficPool diagnostic global');
assert.ok(facade.includes('globalThis.WorldDriveTrafficSpawn=(kind,vehicleId)=>forceSpawn(kind,vehicleId);'),'forced traffic spawn control must remain a direct functional command');

assert.ok(facade.includes('configured:base.configuredPool'),'pool diagnostics configured list payload changed');
assert.ok(facade.includes('available:base.availableVehicles'),'pool diagnostics available list payload changed');
assert.ok(facade.includes('packReady:base.packReady'),'pool diagnostics packReady payload changed');
assert.ok(facade.includes("mode:'traffic-mp1-shared-variety'"),'MP1 runtime diagnostics mode changed');
assert.ok(facade.includes("return network.isAuthority?'authority':'follower';"),'traffic authority/follower mode selection changed');
assert.ok(facade.includes('if(network.connected&&!network.isAuthority)return false;'),'follower forced-spawn guard changed');

// The validated R7 local engine still supports direct construction for QA/dev use.
// Production creates it through this facade, which synchronously replaces these
// bootstrap globals with marked delegates to the canonical diagnostics tree.
assert.ok(local.includes('globalThis.WorldDriveTraffic=diagnostics;'),'R7 direct-use diagnostics compatibility unexpectedly removed');
assert.ok(local.includes('globalThis.WorldDriveTrafficPool=()=>({'),'R7 direct-use pool compatibility unexpectedly removed');
assert.ok(local.includes('globalThis.WorldDriveTrafficSpawn=(kind,vehicleId)=>forceSpawn(kind,vehicleId);'),'R7 direct-use spawn control unexpectedly removed');

console.log('CLEANUP C6.12 TRAFFIC RUNTIME DIAGNOSTICS QA: PASS',{
  canonicalRuntime:'WorldDriveDiagnostics.traffic.runtime',
  canonicalPool:'WorldDriveDiagnostics.traffic.pool',
  legacyRuntime:'delegate',
  legacyPool:'delegate',
  spawnControl:'retained-direct-command',
  localR7BehaviorUntouched:true,
  mp1BehaviorUntouched:true
});

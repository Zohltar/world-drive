import assert from 'node:assert/strict';
import fs from 'node:fs';

const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const client=fs.readFileSync('src/multiplayer.js','utf8');

for(const marker of [
  'const SMOOTH_POSITION_RATE=30;',
  'const SMOOTH_YAW_RATE=26;',
  'const SMOOTH_TELEPORT_DISTANCE=12;',
  'function installPresentationSmoothing(THREE,visual,perf)',
  "networkRoot.name=`${contentRoot.name||'remote'}-smoothed-network-anchor`;",
  'smoothedPosition.x+=(targetPosition.x-smoothedPosition.x)*positionAlpha;',
  'smoothedPosition.z+=(targetPosition.z-smoothedPosition.z)*positionAlpha;',
  'smoothedYaw+=angleDelta(targetYaw,smoothedYaw)*yawAlpha;',
  'distance>SMOOTH_TELEPORT_DISTANCE||yawError>SMOOTH_TELEPORT_YAW',
  'smoothedPosition.y=targetPosition.y;',
  'presentationRoot:contentRoot',
  "mode:'multiplayer-hd-overlay-v4-support-aligned-smoothing'"
]){
  assert(visuals.includes(marker),`missing multiplayer M2.3 smoothing marker: ${marker}`);
}

assert(visuals.includes('const correctionMeters=Math.hypot('),'smoothing diagnostics must track horizontal correction distance');
assert(visuals.includes('cancelAnimationFrame?.(rafId)'),'smoothing RAF must be disposed with peer visual');
assert(visuals.includes('contentRoot.position.set('),'smoothed world correction must be applied to presentation root');
assert(visuals.includes('contentRoot.rotation.y=yawCorrection;'),'yaw correction must use the support-aligned presentation yaw');
assert(!visuals.includes('correction.copy(smoothedPosition).sub(targetPosition);'),'M2.3 must not restore legacy 3D/double-Y smoothing');

// Smoothing must remain presentation-only. Network cadence and M2 trajectory
// reconstruction stay authoritative and unchanged.
assert(client.includes('const NETWORK_STATE_HZ=30;'),'presentation smoothing must retain 30 Hz network stream');
assert(client.includes('function interpolateGeographic(a,b,t,spanMs)'),'M2 Hermite trajectory interpolation must remain active');
assert(client.includes('const INTERPOLATION_DELAY_MS=110;'),'smoothing pass must not silently alter network buffer latency');

console.log('V21.31 MULTIPLAYER M2.3 PRESENTATION SMOOTHING QA: PASS',{
  networkHz:30,
  positionRate:30,
  yawRate:26,
  teleportSnapMeters:12,
  supportAligned:true,
  verticalDoubleSmoothing:false,
  networkAuthorityPreserved:true
});

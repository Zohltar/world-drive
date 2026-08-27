import assert from 'node:assert/strict';
import fs from 'node:fs';

const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const client=fs.readFileSync('src/multiplayer.js','utf8');

for(const marker of [
  'get presentationCorrectionX(){return correction.x;}',
  'get presentationCorrectionZ(){return correction.z;}',
  'get presentationYawCorrection(){return yawCorrection;}',
  'function solveRemoteVehicleSupport(input={})',
  'const presentationGeo=offsetLatLonMeters(',
  'lat:presentationGeo.lat',
  'lon:presentationGeo.lon',
  'heading:(Number(input.heading)||0)+yawCorrection',
  'smoothedPosition.y=targetPosition.y;',
  'supportPresentationAdjustments',
  'verticalDoubleSmoothing:false',
  'receiverSupportAligned:true'
]){
  assert(visuals.includes(marker),`missing M2.3 support-aligned smoothing marker: ${marker}`);
}
assert(visuals.includes("mode:'multiplayer-hd-overlay-v5-replicated-lighting'"),'M2.4 wrapper must retain M2.3 support alignment');

assert(
  /contentRoot\.position\.set\([\s\S]*?0,[\s\S]*?s\*dx\+c\*dz[\s\S]*?\);/.test(visuals),
  'presentation wrapper must not apply a second vertical smoothing correction'
);
assert(
  !visuals.includes('correction.copy(smoothedPosition).sub(targetPosition);'),
  'legacy 3D correction path can reintroduce vertical/support phase mismatch'
);

for(const marker of [
  'function tuneTemplate(THREE,root,vehicleId)',
  'function tuneWrxMaterial(THREE,material,name)',
  'function tuneCivicMaterial(THREE,material,name)',
  'function tuneSonataMaterial(THREE,material,name)',
  'function tuneI3Material(material,name)',
  'function tuneCountachMaterial(THREE,material,name)',
  "name.includes('fh_paint')",
  "name.includes('capaint')",
  "name.includes('pintura')",
  "name.includes('windows')",
  'material.envMapIntensity=1.9;',
  'material.envMapIntensity=1.85;',
  'material.opacity=.18;',
  "materialProfile:'local-parity-v1'",
  "mode:'multiplayer-hd-lazy-cache-local-material-parity'"
]){
  assert(hd.includes(marker),`missing remote local-lighting parity marker: ${marker}`);
}

assert(hd.includes('tuneTemplate(THREE,root,vehicleId);'),'remote template must receive vehicle-specific material tuning before caching');
assert(hd.includes('obj.castShadow=true;'),'remote authored meshes must cast shadows like local GLBs');
assert(hd.includes('obj.receiveShadow=true;'),'remote authored meshes must receive shadows like local GLBs');

// M2.3 must preserve the already validated network motion foundation.
assert(client.includes('const NETWORK_STATE_HZ=30;'),'M2.3 must retain the 30 Hz state stream');
assert(client.includes('function interpolateGeographic(a,b,t,spanMs)'),'M2 Hermite trajectory must remain active');
assert(client.includes('const INTERPOLATION_DELAY_MS=110;'),'M2.3 must not silently alter interpolation latency');

console.log('V21.31 MULTIPLAYER M2.3 STABILITY + LIGHTING QA: PASS',{
  networkHz:30,
  supportUsesRenderedPose:true,
  verticalDoubleSmoothing:false,
  materialProfile:'local-parity-v1',
  m24LightingOverlay:true,
  tunedVehicles:['wrx','civic','sonata','i3_2017','countach_80'],
  authoredBaseVehicles:['id4','f1_2010']
});

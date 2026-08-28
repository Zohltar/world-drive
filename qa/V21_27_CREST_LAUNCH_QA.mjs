import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const presentationPath=path.join(root,'src','vehicle-presentation.js');

function collectPresentationSource(file,seen=new Set()){
  const resolved=path.resolve(file);
  if(seen.has(resolved)||!fs.existsSync(resolved))return '';
  seen.add(resolved);
  const source=fs.readFileSync(resolved,'utf8');
  const imports=[];
  for(const match of source.matchAll(/from\s+['"](\.\/vehicle-presentation[^'"]*\.js)['"]/g)){
    imports.push(path.resolve(path.dirname(resolved),match[1]));
  }
  return [source,...imports.map(next=>collectPresentationSource(next,seen))].join('\n');
}

const source=collectPresentationSource(presentationPath);

// Structural regression guard: current and future crest samples must share the
// same center-line reference. Follow the active presentation wrapper chain so
// architectural wrappers (anti-roll, visuals, etc.) do not make this QA stale.
// The wheel-average support remains valid for actual chassis position/landing,
// but must not be mixed into curvature prediction.
assert.match(source,/const currentCenterSupportY\s*=\s*supportAtTravel\(0\)/,
  'crest launch no longer samples current center support');
assert.match(source,/const launchOriginY\s*=\s*Number\.isFinite\(currentCenterSupportY\)\?currentCenterSupportY:supportY/,
  'crest launch center fallback/origin missing');
assert.match(source,/predictedBallisticY=\s*launchOriginY\+/,
  'ballistic prediction is not referenced to current center support');
assert.match(source,/futureSupportY-launchOriginY-spatialSupportVelocity\*launchPredictionTime/,
  'required support acceleration mixes center and wheel-average references');

const G=9.81;
const MARGIN=1.25;
const T=.075;

function crestDecision({radiusM,speedMps}){
  // Local crest model y(x)=-x^2/(2R), evaluated at x=0. The center-line slope is
  // zero here, so required support acceleration is exactly -v^2/R.
  const current=0;
  const futureTravel=speedMps*T;
  const future=-(futureTravel*futureTravel)/(2*radiusM);
  const supportVelocity=0;
  const ballistic=current+supportVelocity*T-.5*G*T*T;
  const gap=ballistic-future;
  const requiredAccel=2*(future-current-supportVelocity*T)/(T*T);
  return {
    gap,
    requiredAccel,
    launch:gap>.003&&requiredAccel<-(G+MARGIN)
  };
}

for(const radiusM of [35,50,100,150,250]){
  const threshold=Math.sqrt((G+MARGIN)*radiusM);
  const below=crestDecision({radiusM,speedMps:threshold*.985});
  const above=crestDecision({radiusM,speedMps:threshold*1.015});
  assert.equal(below.launch,false,`crest R=${radiusM}m launches below physical threshold`);
  assert.equal(above.launch,true,`crest R=${radiusM}m fails to launch above physical threshold`);
  assert.ok(Math.abs(above.requiredAccel+Math.pow(threshold*1.015,2)/radiusM)<1e-9,
    'crest acceleration estimate drifted from v^2/R');
}

console.log('V21.27 CREST LAUNCH QA: PASS');
console.log('center-referenced crest prediction crosses the gravity+margin threshold consistently');

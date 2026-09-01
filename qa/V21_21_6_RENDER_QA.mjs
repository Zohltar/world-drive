import fs from 'node:fs';
import crypto from 'node:crypto';

function assert(ok,msg){if(!ok)throw new Error(msg);}
function read(p){return fs.readFileSync(p,'utf8');}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}

const main=read('src/main.js');
const pkg=JSON.parse(read('package.json'));

assert(pkg.version==='21.21.6','package version mismatch');
assert(main.includes("EffectComposer"),'EffectComposer missing');
assert(main.includes("FXAAPass"),'FXAAPass missing');
assert(main.includes("OutputPass"),'OutputPass missing');
assert(main.includes("antialias:false"),'native MSAA must be disabled');
assert(main.includes("PerspectiveCamera(65,innerWidth/innerHeight,.1,4500)"),'4500 m far plane changed');
assert(main.includes("composer.render(dt)"),'composer render path missing');
assert(!main.includes("renderer.render(scene,camera);"),'direct renderer path still active');
assert(main.includes("const ratioCap=next>=3?.94:(next===2?1.0:(next===1?1.08:1.15));"),'balanced FXAA ratio policy changed');
assert(main.includes("const wantFullShadows=next<2;"),'shadow quality policy changed');
assert(main.includes("drawCompass();\n   drawSpeedometer();"),'full-rate compass/instruments changed');
assert(main.includes("const GRIP_SOLVER_INTERVAL=1/20;"),'20 Hz secondary tire solver missing');
assert(main.includes("const WORLD_STREAMING_INTERVAL=.12;"),'streaming throttle missing');
assert(main.includes("freezeStaticMatrices(roadGroup)"),'road static-matrix freeze missing');
assert(main.includes("freezeStaticMatrices(sceneryForestGroup)"),'scenery static-matrix freeze missing');
assert(main.includes("renderer.info.autoReset=false"),'aggregated renderer diagnostics missing');

const expected={
  'src/terrain.js':'700e933712c17b8110f93ca8d1998d051748b5bc897538e9c0f91594b4227ada',
  'src/physics/vehicle-dynamics.js':'9974af2b3986fac12458eb4058d7d898b78e24254f833961f1c9513d2169c9d2',
  'src/vehicles/vehicle-system.js':'a19e373bbc3898b4874098e505284cbbd574faf85451c9ba42fabc162338ecf6',
  'src/vehicles/vehicle-presentation.js':'58dcf00b415c06fa0b30251afbac0463551510711e0411554128ae18c6977b3a',
  'electron/main.cjs':'c88c40acfacbd024e8e581133c463880aff0c38cebc34f5ae02083a99571f006',
  'electron/preload.cjs':'cd5a3c702732142f9310cab98c05ee1f96ba2a01e23764aed63e2a97d67a9b6b',
  'electron/multiplayer-runtime.cjs':'9c431ce52a8b68508fb31f83038ef344cacd5ebe86ba7e7e45e785a1df4d95c7'
};
for(const [file,hash] of Object.entries(expected)){
  assert(sha(file)===hash,`${file} changed unexpectedly`);
}

console.log('PASS V21.21.6 render policy');
console.log('PASS visual distance/material path preserved; MSAA replaced by FXAA');
console.log('PASS full-rate compass + gauges preserved');
console.log('PASS core physics modules byte-identical to V21.21.5');
console.log('PASS terrain / Electron / multiplayer byte-identical to V21.21.5');
console.log('PASS secondary per-wheel grip solver reduced 24 -> 20 Hz');
console.log('PASS streaming visibility checks throttled to ~8 Hz');

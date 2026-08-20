import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function assert(ok,msg){ if(!ok) throw new Error(msg); }
assert(main.includes("new THREE.WebGLRenderer({antialias:true"),'MSAA/antialias must remain enabled');
assert(!main.includes('EffectComposer'),'FXAA/postprocessing must remain absent');
assert(!main.includes('FXAAShader'),'FXAA shader must remain absent');
assert(main.includes("new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,4500)"),'4500m far plane must remain');
assert(main.includes("const ratioCap=next>=3?.72:(next===2?.80:(next===1?.92:1.0));"),'adaptive ratio ladder changed');
assert(main.includes('drawCompass();\n   drawSpeedometer();'),'compass and instruments must remain full-rate');
assert(main.includes("left:'12px'"),'FPS HUD must remain left');
assert(main.includes('renderer.shadowMap.autoUpdate=false'),'shadow maps must stay manual-update');
console.log('PASS V21.21.7 render policy');

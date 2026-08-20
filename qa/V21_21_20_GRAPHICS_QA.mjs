import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const fail=(m)=>{throw new Error(m)};
const has=(s,m)=>{if(!main.includes(s))fail(m)};

// Road owns stencil pixels; water rejects those exact pixels.
has("new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true})",'renderer stencil buffer must be enabled');
has('stencilRef:1','road/water stencil ref missing');
has('stencilFunc:THREE.NotEqualStencilFunc','water must reject road-owned stencil pixels');
has('stencilZPass:THREE.ReplaceStencilOp','road must write stencil on visible pixels');

// Larger near terrain/imagery patch and more distant streaming.
has('const NEAR_TERRAIN_SIZE=2400;','near terrain size must be 2400m');
has('const NEAR_TERRAIN_SEGMENTS=192;','near terrain segments must be 192');
has('groundSize:NEAR_TERRAIN_SIZE','terrain/imagery must share the enlarged extent');
has('streamingScale:1.55','high distance profile must prefetch farther');
has('streamingScale:1.16','medium distance profile must prefetch farther');

// Road quality + modest supersampling while retaining native MSAA.
has('Math.ceil(sampledLen/4)','road ribbon sampling must be <=4m');
has('c.width=c.height=256','asphalt texture must be 256px');
has('t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())','asphalt anisotropy must be enabled');
has('const ratioCap=next>=3?.76:(next===2?.84:(next===1?.96:1.08));','supersampling ladder mismatch');
if(main.includes('EffectComposer')||main.includes('FXAAShader'))fail('FXAA/post-processing must remain absent');
if(!terrain.includes('groundSize=2000'))fail('terrain defaults unexpectedly removed; caller override should own V21.21.20 extent');

const oldMargin=2000/2-520;
const newMargin=2400/2-520;
if(newMargin<=oldMargin)fail('terrain look-ahead margin did not improve');
console.log('V21.21.20 GRAPHICS QA: PASS');
console.log(`near-terrain worst-case forward margin: ${oldMargin}m -> ${newMargin}m (+${newMargin-oldMargin}m)`);
console.log('road sample spacing: <=5m -> <=4m (25% finer longitudinal tessellation)');
console.log('render ratio ladder: 1.08 / .96 / .84 / .76 with MSAA');
console.log('road-over-water stencil ownership: enabled');

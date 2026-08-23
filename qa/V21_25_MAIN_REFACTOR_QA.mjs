import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS
} from '../src/route-presets.js';
import {installDesktopOverpassTransport} from '../src/desktop-overpass-transport.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const cssPath=path.join(src,'v21-ui.css');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(cssPath),true,'src/v21-ui.css missing — run tools/refactor-main-v21-25.mjs first');
assert.equal(fs.existsSync(path.join(src,'route-challenge.js')),true,'route-challenge module missing');
assert.equal(fs.existsSync(path.join(src,'route-presets.js')),true,'route-presets module missing');
assert.equal(fs.existsSync(path.join(src,'desktop-overpass-transport.js')),true,'desktop Overpass module missing');

const main=fs.readFileSync(mainPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');

// Extracted responsibilities must not creep back into the engine entrypoint.
for(const pattern of [
  /function installV21BaseStyle\s*\(/,
  /instrumentClusterStyle/,
  /function installDesktopOverpassTransport\s*\(/,
  /const MANIC2\s*=/,
  /const R169_START\s*=/,
  /const YUNGAS_START\s*=/,
  /const runChallenge\s*=/,
  /V21\.21\.26/,
  /V21\.21\.1\s+ALPHA/i,
  /21\.24\.0-candidate/
]){
  assert.doesNotMatch(main,pattern,`main.js still contains extracted/stale responsibility: ${pattern}`);
}

for(const pattern of [
  /import '\.\/v21-ui\.css';/,
  /import '\.\/desktop-overpass-transport\.js';/,
  /from '\.\/route-presets\.js';/,
  /from '\.\/route-challenge\.js';/,
  /from '\.\/version\.js';/,
  /const routeChallenge=createRouteChallenge\s*\(/,
  /version:WORLD_DRIVE_VERSION/,
  /WORLD_DRIVE_VERSION_LABEL/,
  /WORLD_DRIVE_TITLE/
]){
  assert.match(main,pattern,`main.js missing refactor integration: ${pattern}`);
}

// Extracted CSS must still contain both large presentation families.
assert.match(css,/#v21MenuButton\s*\{/,'V21 menu CSS missing');
assert.match(css,/#v21Startup\s*\{/,'startup overlay CSS missing');
assert.match(css,/#speedometerCanvas\s*\{/,'instrument cluster CSS missing');
assert.doesNotMatch(css,/style\.textContent/,'CSS extraction contains JavaScript wrapper text');

// Presets remain byte-for-byte equivalent in their important route data.
assert.deepEqual(MANIC2,{lat:49.3213,lon:-68.3467,name:'Manic‑2'});
assert.deepEqual(MANIC5,{lat:50.6451065,lon:-68.7271214,name:'Manic‑5'});
assert.deepEqual(R169_START,{lat:48.39474,lon:-71.67772,name:'Hébertville'});
assert.deepEqual(R169_END,{lat:48.650002,lon:-72.449997,name:'Saint‑Félicien'});
assert.deepEqual(R132_START,{lat:48.849998,lon:-67.533333,name:'Matane'});
assert.deepEqual(R132_END,{lat:48.533333,lon:-64.216667,name:'Percé'});
assert.deepEqual(YUNGAS_START,{lat:-16.29911,lon:-67.81891,name:'Chuspipata · Yungas'});
assert.deepEqual(YUNGAS_END,{lat:-16.23312,lon:-67.73975,name:'Yolosa · Yungas'});
assert.deepEqual(YUNGAS_WAYPOINTS,[{lat:-16.2577,lon:-67.7861,name:'Camino de la Muerte'}]);

// Browser-only transport module must be safe to import under Node.
assert.equal(
  installDesktopOverpassTransport({worldDriveDesktop:{isDesktop:false}}),
  false,
  'desktop transport should no-op outside Electron'
);

const syntax=spawnSync(process.execPath,['--check',mainPath],{
  cwd:root,
  encoding:'utf8'
});
assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'main.js syntax check failed');

console.log('V21.25 MAIN REFACTOR QA: PASS');
console.log(`main.js: ${main.split(/\r?\n/).length} lines; extracted UI CSS: ${css.split(/\r?\n/).length} lines`);

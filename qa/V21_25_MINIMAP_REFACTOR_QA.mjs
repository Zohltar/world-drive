import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const minimapFacadePath=path.join(src,'minimap.js');
const minimapPath=path.join(src,'ui','minimap.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(minimapFacadePath),true,'src/minimap.js facade missing');
assert.equal(fs.existsSync(minimapPath),true,'src/ui/minimap.js implementation missing');

const main=fs.readFileSync(mainPath,'utf8');
const minimapFacade=fs.readFileSync(minimapFacadePath,'utf8');
const minimap=fs.readFileSync(minimapPath,'utf8');

assert.match(
  minimapFacade,
  /export \* from ['"]\.\/ui\/minimap\.js['"];/,
  'src/minimap.js must remain the stable R7 facade for src/ui/minimap.js'
);

for(const pattern of [
  /transient sign readout on minimap/,
  /^\/\/ ---------- minimap ----------$/m,
  /const signReadout=\{/,
  /const passedSignKeys=/,
  /const mc=\$\('minimap'\)/,
  /function signDisplayCum\s*\(/,
  /function signReadoutText\s*\(/,
  /function updatePassedSignReadout\s*\(/,
  /function prepMap\s*\(/,
  /function drawMap\s*\(/,
  /passedSignKeys\.clear\s*\(/,
  /signReadout\.key/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns minimap/sign implementation: ${pattern}`);
}

for(const pattern of [
  /from '\.\/minimap\.js'/,
  /const minimapSystem=createMinimapSystem\s*\(/,
  /routeStart:ROUTE_START/,
  /routeEnd:ROUTE_END/,
  /resetSignReadout:resetMinimapSignReadout/,
  /resetMinimapSignReadout\(\)/,
  /prepMap,/,
  /drawMap,/,
  /updatePassedSignReadout/
]){
  assert.match(main,pattern,`main.js missing minimap integration: ${pattern}`);
}

for(const pattern of [
  /export function createMinimapSystem\s*\(/,
  /function syncMinimapState\s*\(/,
  /function resetSignReadout\s*\(/,
  /function updatePassedSignReadout\s*\(/,
  /function prepMap\s*\(/,
  /function drawMap\s*\(/,
  /multiplayer\.getPeers\s*\(/,
  /signReadout\.duration/,
  /signReadout\.fadeMs/,
  /passedSignKeys\.clear\s*\(/,
  /ROUTE_START\.name/,
  /ROUTE_END\.name/,
  /resetSignReadout,/,
  /return Object\.freeze\s*\(\{/
]){
  assert.match(minimap,pattern,`src/ui/minimap.js missing expected behavior: ${pattern}`);
}

const syncCalls=(minimap.match(/syncMinimapState\(\);/g)||[]).length;
assert.equal(syncCalls,3,'minimap runtime state should sync in updatePassedSignReadout, prepMap and drawMap');

for(const filePath of [mainPath,minimapFacadePath,minimapPath]){
  const syntax=spawnSync(process.execPath,['--check',filePath],{
    cwd:root,
    encoding:'utf8'
  });
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`${path.basename(filePath)} syntax check failed`);
}

const facadeImport=await import(`${pathToFileURL(minimapFacadePath).href}?qa=${Date.now()}`);
const imported=await import(`${pathToFileURL(minimapPath).href}?qa=${Date.now()+1}`);
assert.equal(typeof facadeImport.createMinimapSystem,'function','root minimap facade lost createMinimapSystem export');
assert.equal(typeof imported.createMinimapSystem,'function','createMinimapSystem implementation export missing');

console.log('V21.25 MINIMAP REFACTOR QA: PASS');
console.log(`main.js: ${main.split(/\r?\n/).length} lines; minimap implementation: ${minimap.split(/\r?\n/).length} lines; root facade retained`);

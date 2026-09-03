import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootUrl=new URL('../src/world-scene.js',import.meta.url);
const implUrl=new URL('../src/terrain/world-scene.js',import.meta.url);
const mainUrl=new URL('../src/main.js',import.meta.url);

assert.equal(fs.existsSync(rootUrl),true,'R8 world-scene root facade missing');
assert.equal(fs.existsSync(implUrl),true,'R8 nested world-scene implementation missing');

const facade=fs.readFileSync(rootUrl,'utf8');
const implementation=fs.readFileSync(implUrl,'utf8');
const main=fs.readFileSync(mainUrl,'utf8');

assert.ok(facade.length<500,'R8 world-scene root facade must remain thin');
assert.match(facade,/from ['"]\.\/terrain\/world-scene\.js['"]/,
  'R8 world-scene root facade must point to nested implementation');
for(const name of [
  'createWorldScene',
  'freezeStaticMatrices',
  'resetStaticGroupOrigin',
  'NEAR_TERRAIN_SIZE',
  'NEAR_TERRAIN_SEGMENTS'
])assert.match(facade,new RegExp(`\\b${name}\\b`),`R8 world-scene facade missing export ${name}`);

assert.match(implementation,/export const NEAR_TERRAIN_SIZE=5600;/,
  'nested world-scene near terrain size changed');
assert.match(implementation,/export const NEAR_TERRAIN_SEGMENTS=448;/,
  'nested world-scene near terrain segments changed');
assert.match(implementation,/export function createWorldScene\s*\(/,
  'nested world-scene implementation owner missing');
assert.match(implementation,/export function freezeStaticMatrices\s*\(/,
  'nested world-scene matrix helper missing');
assert.match(implementation,/export function resetStaticGroupOrigin\s*\(/,
  'nested world-scene origin helper missing');
assert.doesNotMatch(implementation,/^\s*import\s/m,
  'nested world-scene unexpectedly gained an import dependency');

assert.match(main,/from ['"]\.\/world-scene\.js['"]/,
  'main must keep the stable root world-scene path');
assert.doesNotMatch(main,/\.\/terrain\/world-scene\.js/,
  'main must not bypass the stable root world-scene facade');

const facadeModule=await import(rootUrl.href);
const implementationModule=await import(implUrl.href);
for(const name of [
  'createWorldScene',
  'freezeStaticMatrices',
  'resetStaticGroupOrigin',
  'NEAR_TERRAIN_SIZE',
  'NEAR_TERRAIN_SEGMENTS'
])assert.equal(facadeModule[name],implementationModule[name],
  `root facade identity changed for ${name}`);

console.log('SOURCE TREE R8 WORLD SCENE QA: PASS',{
  facade:'src/world-scene.js',
  implementation:'src/terrain/world-scene.js',
  stableMainImport:true,
  implementationImportFree:true,
  exportedIdentities:5
});

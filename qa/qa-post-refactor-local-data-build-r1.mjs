import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);

const vitePath=path.join(ROOT,'vite.config.js');
const packagePath=path.join(ROOT,'package.json');
const forgePath=path.join(ROOT,'forge.config.cjs');
const electronPath=path.join(ROOT,'electron','main.cjs');
const routingPath=path.join(ROOT,'electron','static-resource-routing.cjs');
const offlineHydroPath=path.join(ROOT,'src','water-offline-hydro-source.js');
const waterDataPath=path.join(ROOT,'src','water-data.js');

const viteSource=readFileSync(vitePath,'utf8').replace(/\r\n/g,'\n');
const packageInfo=JSON.parse(readFileSync(packagePath,'utf8'));
const electronSource=readFileSync(electronPath,'utf8').replace(/\r\n/g,'\n');
const offlineHydroSource=readFileSync(offlineHydroPath,'utf8').replace(/\r\n/g,'\n');
const waterDataSource=readFileSync(waterDataPath,'utf8').replace(/\r\n/g,'\n');
const forgeConfig=require(forgePath);
const {isWorldDataRequest,staticRootForRequest}=require(routingPath);

assert.equal(
  packageInfo.scripts.build,
  'vite build',
  'normal browser production build must keep its existing Vite contract'
);
assert.equal(
  packageInfo.scripts['build:desktop'],
  'vite build --mode desktop',
  'desktop build must use the explicit Vite desktop mode'
);
assert.equal(
  packageInfo.scripts.desktop,
  'npm run build:desktop && electron .',
  'desktop launcher stopped using the optimized desktop build'
);
assert.equal(
  packageInfo.scripts.package,
  'npm run build:desktop && electron-forge package',
  'Electron package flow stopped using the optimized desktop build'
);
assert.equal(
  packageInfo.scripts.make,
  'npm run build:desktop && electron-forge make',
  'Electron make flow stopped using the optimized desktop build'
);

assert.match(
  viteSource,
  /name:'world-drive-desktop-local-data-build'/,
  'desktop local-data Vite policy plugin is missing'
);
assert.match(
  viteSource,
  /desktopBuild=mode==='desktop'/,
  'desktop build policy is no longer scoped to the explicit desktop mode'
);
assert.match(
  viteSource,
  /copyPublicDir:false/,
  'desktop build no longer disables Vite public-directory bulk copying'
);
assert.match(
  viteSource,
  /if\(entry\.name==='world-data'\)continue;/,
  'desktop build no longer excludes generated public/world-data from dist'
);

const configModule=await import(`${pathToFileURL(vitePath).href}?qa-local-data=${Date.now()}`);
const desktopBuildPlugin=configModule.default.plugins.find(
  plugin=>plugin?.name==='world-drive-desktop-local-data-build'
);
assert.ok(desktopBuildPlugin,'desktop local-data Vite plugin not registered');
assert.equal(
  desktopBuildPlugin.config({}, {mode:'production'}),
  undefined,
  'normal production build unexpectedly changed its public-directory behavior'
);
const desktopConfig=desktopBuildPlugin.config({}, {mode:'desktop'});
assert.equal(
  desktopConfig?.build?.copyPublicDir,
  false,
  'desktop mode did not disable Vite public-directory copying'
);

assert.equal(isWorldDataRequest('/world-data'),true,'world-data root request was not recognized');
assert.equal(isWorldDataRequest('/world-data/osm-v2/quebec/hydro/manifest.json'),true,'runtime hydro request was not recognized');
assert.equal(isWorldDataRequest('/world-dataset/example'),false,'world-data prefix check became too broad');
assert.equal(
  staticRootForRequest('/world-data/osm-v2/quebec/hydro/manifest.json',{
    distRoot:'DIST',
    publicRoot:'PUBLIC'
  }),
  'PUBLIC',
  'desktop world-data request no longer routes to public/'
);
assert.equal(
  staticRootForRequest('/assets/index.js',{distRoot:'DIST',publicRoot:'PUBLIC'}),
  'DIST',
  'normal desktop static request no longer routes to dist/'
);

assert.match(
  electronSource,
  /require\('\.\/static-resource-routing\.cjs'\)/,
  'Electron static server is not wired to the world-data routing helper'
);
assert.match(
  electronSource,
  /const publicRoot=path\.resolve\(__dirname,'\.\.','public'\);/,
  'Electron static server no longer owns a separate public root'
);
assert.match(
  electronSource,
  /staticRootForRequest\(requestUrl\.pathname,\{distRoot,publicRoot\}\)/,
  'Electron static server stopped selecting the request root before safe path resolution'
);
assert.match(
  electronSource,
  /if\(candidate!==root&&!candidate\.startsWith\(rootPrefix\)\)return null;/,
  'Electron static path traversal guard changed while adding local-data routing'
);

const ignoreRules=forgeConfig?.packagerConfig?.ignore||[];
const ignored=file=>ignoreRules.some(rule=>rule instanceof RegExp&&rule.test(file));
assert.equal(
  ignored('/world-data/source/quebec-latest.osm.pbf'),
  true,
  'packaging no longer excludes source PBF/world-data inputs'
);
assert.equal(
  ignored('/public/world-data/osm/quebec/tiles/1/2.jsonl'),
  true,
  'packaging no longer excludes the bulky v1 intermediate tile tree'
);
assert.equal(
  ignored('/public/world-data/osm-v2/quebec/hydro/manifest.json'),
  false,
  'packaging incorrectly excludes the maintained runtime hydro v2 tree'
);

assert.match(
  offlineHydroSource,
  /const DEFAULT_BASE_URL='\/world-data\/osm-v2\/quebec\/hydro';/,
  'offline hydro runtime URL changed during build-copy optimization'
);
const localIndex=waterDataSource.indexOf('const local=await offline.loadAround(ll.lat,ll.lon,HYDRO_RADIUS_M);');
const cacheIndex=waterDataSource.indexOf('const cached=await readCache(ll.lat,ll.lon);',localIndex);
const overpassIndex=waterDataSource.indexOf('data=await overpass.fetchRaw({',cacheIndex);
assert.ok(localIndex>=0,'local hydro load path missing');
assert.ok(cacheIndex>localIndex,'cache path no longer follows local hydro availability check');
assert.ok(overpassIndex>cacheIndex,'Overpass fallback no longer follows local/cache paths');
assert.match(
  waterDataSource,
  /if\(local\?\.available\)\{[\s\S]*?source:'local'/,
  'local hydro no longer retains source authority when available'
);

console.log('POST-REFACTOR LOCAL-DATA BUILD R1 QA: PASS');
console.log('desktop-only copy suppression / public world-data routing / package boundary / local-first hydro: verified');

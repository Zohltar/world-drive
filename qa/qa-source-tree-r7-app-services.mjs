import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');

const facades={
  'application-settings.js':"export * from './app/application-settings.js';\n",
  'loaded-settings-application.js':"export * from './app/loaded-settings-application.js';\n",
  'diagnostics.js':"export * from './app/diagnostics.js';\n",
  'version.js':"export * from './app/version.js';\n",
  'cache.js':"export * from './services/cache.js';\n",
  'overpass.js':"export * from './services/overpass.js';\n",
  'desktop-overpass-transport.js':"export * from './services/desktop-overpass-transport.js';\n"
};
const nested=[
  'app/application-settings.js','app/loaded-settings-application.js','app/diagnostics.js','app/version.js',
  'services/cache.js','services/overpass.js','services/desktop-overpass-transport.js','services/diagnostics.js'
];

for(const [name,expected] of Object.entries(facades)){
  const file=path.join(src,name);
  assert.equal(fs.existsSync(file),true,`root facade missing: src/${name}`);
  assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),expected,`root facade changed: src/${name}`);
}
for(const rel of nested){
  const file=path.join(src,rel);
  assert.equal(fs.existsSync(file),true,`nested implementation missing: src/${rel}`);
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/from ['"]\.\.\/main\.js['"]|from ['"]\.\.\/\.\.\/main\.js['"]/,`nested module imports main.js: src/${rel}`);
  const syntax=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`syntax failed: src/${rel}`);
}

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
for(const name of Object.keys(facades)){
  assert.doesNotMatch(main,new RegExp(`from ['"]\\./(?:app|services)/${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['"]`),`main.js bypasses root facade: ${name}`);
}
for(const expected of [
  "import './desktop-overpass-transport.js';",
  "from './version.js';",
  "from './cache.js';",
  "from './application-settings.js';",
  "from './diagnostics.js';",
  "from './loaded-settings-application.js';",
  "from './overpass.js';"
])assert.ok(main.includes(expected),`main.js root-facade integration missing: ${expected}`);

const versionSource=fs.readFileSync(path.join(src,'app','version.js'),'utf8');
assert.ok(versionSource.includes("from '../../package.json' with {type:'json'}"),'nested version module does not resolve package.json from src/app');
const overpassSource=fs.readFileSync(path.join(src,'services','overpass.js'),'utf8');
assert.ok(overpassSource.includes("from './diagnostics.js'"),'Overpass diagnostics dependency changed during structural move');
assert.equal(fs.readFileSync(path.join(src,'services','diagnostics.js'),'utf8').replace(/\r\n/g,'\n'),
`// Internal compatibility bridge for the moved Overpass implementation.\n// Keeps its historical './diagnostics.js' dependency byte-for-byte while the\n// canonical diagnostics implementation now lives under src/app/.\nexport * from '../diagnostics.js';\n`,
'Overpass diagnostics compatibility bridge changed');

const settings=await import(`${pathToFileURL(path.join(src,'application-settings.js')).href}?qa=${Date.now()}`);
const loadedSettings=await import(`${pathToFileURL(path.join(src,'loaded-settings-application.js')).href}?qa=${Date.now()}`);
const diagnostics=await import(`${pathToFileURL(path.join(src,'diagnostics.js')).href}?qa=${Date.now()}`);
const version=await import(`${pathToFileURL(path.join(src,'version.js')).href}?qa=${Date.now()}`);
const cache=await import(`${pathToFileURL(path.join(src,'cache.js')).href}?qa=${Date.now()}`);
const overpass=await import(`${pathToFileURL(path.join(src,'overpass.js')).href}?qa=${Date.now()}`);

for(const [value,label] of [
  [settings.createApplicationSettingsController,'createApplicationSettingsController'],
  [loadedSettings.createLoadedSettingsApplication,'createLoadedSettingsApplication'],
  [diagnostics.ensureWorldDriveDiagnostics,'ensureWorldDriveDiagnostics'],
  [overpass.createOverpassClient,'createOverpassClient']
])assert.equal(typeof value,'function',`${label} export missing through root facade`);
assert.equal(typeof version.WORLD_DRIVE_VERSION_LABEL,'string','version branding export missing through root facade');
assert.equal(typeof cache.DEFAULT_WORLD_SETTINGS,'object','DEFAULT_WORLD_SETTINGS export missing through root facade');
assert.ok(cache.WorldCache&&cache.WorldSettings,'cache service exports missing through root facade');

const defaults={controls:{keyboard:{accelerate:['KeyW']},gamepad:{steerAxis:0}},display:{cluster:true},displayDistance:'high'};
const loaded={controls:{keyboard:{accelerate:['KeyZ']},gamepad:{steerAxis:2}},display:{cluster:false},displayDistance:'medium'};
const store={async load(){return structuredClone(loaded);},async save(){return true;}};
const controller=settings.createApplicationSettingsController({defaults,store,setTimeoutFn:()=>1,clearTimeoutFn:()=>{}});
const stableRoot=controller.settings;
const keyboardRef=stableRoot.controls.keyboard;
await controller.load();
assert.strictEqual(controller.settings,stableRoot,'settings root identity changed across moved app boundary');
assert.strictEqual(stableRoot.controls.keyboard,keyboardRef,'nested keyboard identity changed across moved app boundary');
assert.deepEqual(keyboardRef.accelerate,['KeyZ'],'loaded settings did not propagate through captured reference');

const fake={};
const diagA=diagnostics.ensureWorldDriveDiagnostics(fake);
const diagB=diagnostics.ensureWorldDriveDiagnostics(fake);
assert.strictEqual(diagA,diagB,'diagnostics root identity changed across moved app boundary');

console.log('SOURCE TREE R7 APP/SERVICES QA: PASS',{
  stableRootFacades:Object.keys(facades).length,
  appImplementations:4,
  serviceImplementations:3,
  overpassDiagnosticsBridge:true,
  settingsIdentitySmoke:true,
  diagnosticsIdentitySmoke:true,
  versionBranding:version.WORLD_DRIVE_VERSION_LABEL
});

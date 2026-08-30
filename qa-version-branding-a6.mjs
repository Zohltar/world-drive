import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const versionSource=fs.readFileSync('src/version.js','utf8');
const electronSource=fs.readFileSync('electron/main.cjs','utf8');
const indexSource=fs.readFileSync('index.html','utf8');

assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'package version must remain valid semver for Electron Forge/Squirrel');
assert.ok(['dev','stable'].includes(pkg.worldDriveChannel),'worldDriveChannel must be dev or stable');
assert.equal(lock.version,pkg.version,'package-lock top-level version diverged from package.json');
assert.equal(lock.packages?.['']?.version,pkg.version,'package-lock root package version diverged from package.json');

const branding=await import(`./src/version.js?qa=${Date.now()}`);
const expectedDisplay=pkg.version.replace(/\.0$/,'');
const expectedLabel=`V${expectedDisplay} ${pkg.worldDriveChannel}`;
const expectedTitle=`World Drive ${expectedLabel}`;
assert.equal(branding.WORLD_DRIVE_PACKAGE_VERSION,pkg.version,'web package version does not come from package.json');
assert.equal(branding.WORLD_DRIVE_VERSION,expectedDisplay,'web display version diverged from package semver');
assert.equal(branding.WORLD_DRIVE_CHANNEL,pkg.worldDriveChannel,'web channel diverged from package.json');
assert.equal(branding.WORLD_DRIVE_VERSION_LABEL,expectedLabel,'web version label diverged');
assert.equal(branding.WORLD_DRIVE_TITLE,expectedTitle,'web title diverged');
assert.ok(versionSource.includes("from '../package.json' with {type:'json'}"),'web branding must import authoritative package metadata');
assert.ok(!/WORLD_DRIVE_VERSION\s*=\s*['"]\d/.test(versionSource),'web version must not return to a hard-coded numeric constant');
assert.ok(!/WORLD_DRIVE_CHANNEL\s*=\s*['"](?:dev|stable)/.test(versionSource),'web channel must not return to a hard-coded constant');

assert.ok(electronSource.includes("require('../package.json')"),'Electron must read the authoritative package metadata');
assert.ok(electronSource.includes('DESKTOP_PACKAGE_VERSION'),'Electron package-version derivation missing');
assert.ok(electronSource.includes('DESKTOP_CHANNEL'),'Electron channel derivation missing');
assert.ok(electronSource.includes('title:DESKTOP_TITLE'),'Electron window title must use derived branding');
assert.ok(electronSource.includes('WorldDrive/${DESKTOP_PACKAGE_VERSION}'),'Overpass User-Agent must use the package semver');
assert.ok(!/WorldDrive\/\d+\.\d+(?:\.\d+)?/.test(electronSource),'Electron contains a hard-coded WorldDrive User-Agent version');
assert.ok(!/title\s*:\s*['"]World Drive V\d+/.test(electronSource),'Electron contains a hard-coded window version');

const staticVersions=[...indexSource.matchAll(/\bV\d+(?:\.\d+){1,2}(?:\s+(?:alpha|beta|dev|stable|cleanup))?\b/g)].map(m=>m[0]);
assert.deepEqual(staticVersions,[],'index.html must not own an application version');
assert.ok(indexSource.includes('data-world-drive-title'),'static loading title placeholder missing');
assert.ok(indexSource.includes('data-world-drive-version-label'),'static version-label placeholder missing');

assert.equal(pkg.version,'21.31.0','A6 must align the current package build with the V21.31 stable baseline');
assert.equal(pkg.worldDriveChannel,'stable','A6 current baseline must remain the stable channel');

console.log('CLEANUP A6 VERSION / BUILD BRANDING QA: PASS',{
  packageVersion:pkg.version,
  displayVersion:branding.WORLD_DRIVE_VERSION,
  channel:pkg.worldDriveChannel,
  label:branding.WORLD_DRIVE_VERSION_LABEL,
  title:branding.WORLD_DRIVE_TITLE
});

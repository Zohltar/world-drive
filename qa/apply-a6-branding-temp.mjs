import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const packageVersion=String(pkg.version||'');
const channel=String(pkg.worldDriveChannel||'');
assert.match(packageVersion,/^\d+\.\d+\.\d+$/,'package version must be semver');
assert.ok(channel,'worldDriveChannel is required');

// package-lock mirrors the package machine version used by Electron Forge/Squirrel.
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
lock.version=packageVersion;
assert.ok(lock.packages?.[''],'package-lock root package missing');
lock.packages[''].version=packageVersion;
fs.writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');

// Electron reads the same package metadata as the web runtime.
const mainPath='electron/main.cjs';
let main=fs.readFileSync(mainPath,'utf8');
const importAnchor="const { createMultiplayerRuntime } = require('./multiplayer-runtime.cjs');";
assert.ok(main.includes(importAnchor),'Electron package metadata insertion anchor missing');
assert.ok(!main.includes("require('../package.json')"),'Electron already has package metadata import');
main=main.replace(importAnchor,`${importAnchor}\nconst packageInfo = require('../package.json');\n\nconst DESKTOP_PACKAGE_VERSION=String(packageInfo.version||'0.0.0');\nconst DESKTOP_CHANNEL=String(packageInfo.worldDriveChannel||'dev');\nconst DESKTOP_DISPLAY_VERSION=DESKTOP_PACKAGE_VERSION.replace(/\\.0$/,'');\nconst DESKTOP_VERSION_LABEL=\`V\${DESKTOP_DISPLAY_VERSION} \${DESKTOP_CHANNEL}\`;\nconst DESKTOP_TITLE=\`World Drive \${DESKTOP_VERSION_LABEL}\`;`);
const uaOld="'User-Agent':'WorldDrive/21.21.12 (Windows; Electron Overpass proxy)'";
assert.ok(main.includes(uaOld),'legacy Electron User-Agent anchor missing');
main=main.replace(uaOld,"'User-Agent':`WorldDrive/${DESKTOP_PACKAGE_VERSION} (Windows; Electron Overpass proxy)`");
const titleOld="title:'World Drive V21.21.12'";
assert.ok(main.includes(titleOld),'legacy Electron title anchor missing');
main=main.replace(titleOld,'title:DESKTOP_TITLE');
assert.ok(!/WorldDrive\/\d+\.\d+/.test(main),'hard-coded version remains in Electron User-Agent');
assert.ok(!/World Drive V\d+\.\d+/.test(main),'hard-coded version remains in Electron title');
fs.writeFileSync(mainPath,main);

// Static HTML must never own a version number. It only exposes placeholders that
// src/version.js fills from package.json as soon as the application module loads.
const indexPath='index.html';
let html=fs.readFileSync(indexPath,'utf8');
const replacements=[
  ['<title>World Drive V21.25 cleanup</title>','<title>World Drive</title>'],
  ['<h1>World Drive V21.25 cleanup</h1>','<h1 data-world-drive-title>World Drive</h1>'],
  ['<div id="brand"><b>V21.25</b> WORLD DRIVE</div>','<div id="brand"><b data-world-drive-version-label></b> WORLD DRIVE</div>']
];
for(const [from,to] of replacements){
  assert.ok(html.includes(from),`index branding anchor missing: ${from}`);
  html=html.replace(from,to);
}
const stale=[...html.matchAll(/\bV\d+(?:\.\d+){1,2}(?:\s+(?:alpha|beta|dev|stable|cleanup))?\b/g)].map(m=>m[0]);
assert.deepEqual(stale,[],'static index still contains a hard-coded application version');
assert.ok(html.includes('data-world-drive-title'),'title branding placeholder missing');
assert.ok(html.includes('data-world-drive-version-label'),'version-label placeholder missing');
fs.writeFileSync(indexPath,html);

console.log('A6 BRANDING PATCH: PASS',{packageVersion,channel});

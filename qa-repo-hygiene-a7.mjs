import assert from 'node:assert/strict';
import fs from 'node:fs';

const forbiddenRoot=[
  'CLEANUP_V21_25.md',
  'FIX_VERSION_DISPLAY_V20_13.ps1',
  'FIX_VERSION_DISPLAY_V20_13_ROBUST.ps1',
  'README_PACKAGING_V21_24_1.md',
  'index.html.encoding-backup'
];
for(const file of forbiddenRoot){
  assert.equal(fs.existsSync(file),false,`obsolete root artifact returned: ${file}`);
}

for(const file of [
  'docs/archive/README.md',
  'docs/archive/CLEANUP_V21_25.md',
  'docs/archive/README_PACKAGING_V21_24_1.md',
  'docs/archive/README_PACKAGING_V21_24_64.md'
]){
  assert.equal(fs.existsSync(file),true,`expected historical archive missing: ${file}`);
}

const packaging=fs.readFileSync('README_PACKAGING.md','utf8');
assert.ok(packaging.includes('package.json'),'current packaging guide must point to package.json as version source');
assert.ok(packaging.includes('worldDriveChannel'),'current packaging guide must document the release channel');
assert.ok(packaging.includes('BUILD_WINDOWS_RELEASE.bat'),'current Windows packaging entry point must remain documented');
assert.ok(packaging.includes('npm run make'),'current npm packaging command must remain documented');
assert.ok(!/V21\.24\.(?:1|64)/.test(packaging),'current packaging guide must not be an old V21.24 snapshot');

const rootNames=fs.readdirSync('.');
assert.deepEqual(
  rootNames.filter(name=>/\.encoding-backup$/i.test(name)),
  [],
  'encoding backup files must not return to repository root'
);
assert.deepEqual(
  rootNames.filter(name=>/^FIX_VERSION_DISPLAY_/i.test(name)),
  [],
  'one-off version patch scripts must not return to repository root'
);

console.log('CLEANUP A7 REPOSITORY HYGIENE QA: PASS');

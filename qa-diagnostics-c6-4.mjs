import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureWorldDriveDiagnostics} from './src/diagnostics.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const expect=(value,message)=>{if(!value)throw new Error(message);};

const diagnosticsA=ensureWorldDriveDiagnostics();
const roadSignsA=diagnosticsA.roadSigns;
const diagnosticsB=ensureWorldDriveDiagnostics();
expect(diagnosticsB===diagnosticsA,'diagnostics root identity changed');
expect(diagnosticsB.roadSigns===roadSignsA,'roadSigns category identity changed');

const p930=read('src/road-furniture-p930.js');
const p937=read('src/road-furniture-p937.js');
const p937Qa=read('qa-p937-combined-frame-pacing.mjs');

expect(!p930.includes('__WORLD_DRIVE_P930_ROAD_SIGNS__'),'legacy P9.30 road-sign global remains');
expect(!p937.includes('__WORLD_DRIVE_P937_ROAD_SIGNS__'),'legacy P9.37 road-sign global remains');
expect(p937.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"),'P9.37 must import canonical diagnostics root');
expect(p937.includes('const roadSignDiagnostics=ensureWorldDriveDiagnostics().roadSigns;'),'P9.37 must bind stable roadSigns category');
expect(p937.includes('roadSignDiagnostics.snapshot=diagnostics;'),'P9.37 must publish the existing combined diagnostic function canonically');
expect((p937.match(/roadSignDiagnostics\.snapshot=diagnostics;/g)||[]).length===1,'canonical road-sign snapshot must have one writer');

expect(p930.includes("mode:'p930-incremental-sign-build'"),'P9.30 diagnostic payload changed');
expect(p937.includes("mode:'p937-idle-sign-collection'"),'P9.37 diagnostic payload changed');
expect(p937.includes('const baseDiag=base.diagnostics?.()||{};'),'P9.37 must still compose P9.30 diagnostics');
expect(p937.includes('...baseDiag'),'P9.37 must still expose the P9.30 payload');
expect(p937.includes('pending:scheduled||baseDiag.pending===true'),'P9.37 pending composition changed');

expect(!p937Qa.includes('__WORLD_DRIVE_P937_ROAD_SIGNS__'),'P9.37 QA still pins the legacy global');
expect(p937Qa.includes('roadSignDiagnostics.snapshot=diagnostics'),'P9.37 QA must protect canonical road-sign diagnostics');

for(const [file,source] of [['src/road-furniture-p930.js',p930],['src/road-furniture-p937.js',p937]]){
  expect(!source.includes('WorldDriveDiagnostics.roadSigns='),`${file} must not replace the stable roadSigns category`);
}

console.log('CLEANUP C6.4 ROAD-SIGN DIAGNOSTICS QA: PASS',{
  stableRoot:true,
  stableCategory:true,
  legacyP930Removed:true,
  legacyP937Removed:true,
  canonicalSnapshot:true,
  p930PayloadPreserved:true,
  p937PayloadPreserved:true
});

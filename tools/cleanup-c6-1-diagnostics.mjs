import fs from 'node:fs';

function edit(path,mutate){
  const before=fs.readFileSync(path,'utf8');
  const after=mutate(before);
  if(after===before)throw new Error(`${path}: no change produced`);
  fs.writeFileSync(path,after);
}

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0)throw new Error(`${label}: source fragment not found`);
  if(text.indexOf(from,first+from.length)>=0)throw new Error(`${label}: source fragment is not unique`);
  return text.slice(0,first)+to+text.slice(first+from.length);
}

edit('src/main.js',text=>{
  text=replaceOnce(
    text,
    "import { createApplicationSettingsController } from './application-settings.js';",
    "import { createApplicationSettingsController } from './application-settings.js';\nimport { ensureWorldDriveDiagnostics, installDiagnosticAlias } from './diagnostics.js';",
    'main diagnostics import'
  );
  return replaceOnce(
    text,
    `// V21.22.3 diagnostics are kept in memory so observing them cannot itself\n// cause a periodic console/devtools hitch. Inspect manually if needed:\n// window.WorldDriveFramePacing()\nwindow.WorldDriveFramePacing=()=>({\n  fps:perfGovernor.fps,\n  ...(streamingCoordinator?.diagnostics?.()||{})\n});`,
    `// V21.22.3 diagnostics are kept in memory so observing them cannot itself\n// cause a periodic console/devtools hitch. C6.1 keeps the historical callable\n// alias, but the stable WorldDriveDiagnostics root is now authoritative.\nconst worldDriveDiagnostics=ensureWorldDriveDiagnostics();\nworldDriveDiagnostics.framePacing.snapshot=()=>({\n  fps:perfGovernor.fps,\n  ...(streamingCoordinator?.diagnostics?.()||{})\n});\ninstallDiagnosticAlias(\n  'WorldDriveFramePacing',\n  ()=>worldDriveDiagnostics.framePacing.snapshot,\n  window\n);`,
    'main frame pacing diagnostics'
  );
});

edit('src/forest-chunk-streamer.js',text=>{
  text=replaceOnce(
    text,
    "import {frameRuntimeSnapshot} from './frame-runtime-profiler.js';",
    "import {frameRuntimeSnapshot} from './frame-runtime-profiler.js';\nimport {ensureWorldDriveDiagnostics,installDiagnosticAlias} from './diagnostics.js';",
    'forest diagnostics import'
  );
  const from=`  function installDiagnostics(){\n    globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__=recordHitch;\n    globalThis.__WORLD_DRIVE_P929_FOREST__=snapshot;\n    globalThis.__WORLD_DRIVE_P931_FOREST__=snapshot;\n    globalThis.__WORLD_DRIVE_P934_FOREST__=snapshot;\n    globalThis.__WORLD_DRIVE_P936_FOREST__=snapshot;\n    globalThis.__WORLD_DRIVE_P940_FOREST__=snapshot;\n    globalThis.__WORLD_DRIVE_P941_FOREST__=snapshot;\n    if(typeof globalThis.setTimeout!=='function')return;\n    const attempt=()=>{\n      const current=globalThis.WorldDriveFramePacing;\n      if(typeof current!=='function'){\n        globalThis.setTimeout(attempt,INSTALL_RETRY_MS);\n        return;\n      }\n      if(current.__worldDriveP941Forest)return;\n      const original=current.__worldDriveP928Original||current;\n      const wrapped=()=>({\n        ...((original?.()||{})),\n        forest:snapshot(),\n        frameRuntime:frameRuntimeSnapshot()\n      });\n      wrapped.__worldDriveP929Forest=true;\n      wrapped.__worldDriveP931Forest=true;\n      wrapped.__worldDriveP934Forest=true;\n      wrapped.__worldDriveP936Forest=true;\n      wrapped.__worldDriveP940Forest=true;\n      wrapped.__worldDriveP941Forest=true;\n      wrapped.__worldDriveP928Original=original;\n      globalThis.WorldDriveFramePacing=wrapped;\n    };\n    globalThis.setTimeout(attempt,0);\n  }`;
  const to=`  function installDiagnostics(){\n    const diagnostics=ensureWorldDriveDiagnostics();\n    diagnostics.forest.recordHitch=recordHitch;\n    diagnostics.forest.snapshot=snapshot;\n\n    // C6.1 compatibility delegates: legacy P9 names remain callable while the\n    // stable diagnostics root owns the current implementation.\n    installDiagnosticAlias('__WORLD_DRIVE_P928_RECORD_HITCH__',()=>diagnostics.forest.recordHitch);\n    installDiagnosticAlias('__WORLD_DRIVE_P929_FOREST__',()=>diagnostics.forest.snapshot);\n    installDiagnosticAlias('__WORLD_DRIVE_P931_FOREST__',()=>diagnostics.forest.snapshot);\n    installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST__',()=>diagnostics.forest.snapshot);\n    installDiagnosticAlias('__WORLD_DRIVE_P936_FOREST__',()=>diagnostics.forest.snapshot);\n    installDiagnosticAlias('__WORLD_DRIVE_P940_FOREST__',()=>diagnostics.forest.snapshot);\n    installDiagnosticAlias('__WORLD_DRIVE_P941_FOREST__',()=>diagnostics.forest.snapshot);\n\n    if(typeof globalThis.setTimeout!=='function')return;\n    const attempt=()=>{\n      // WorldDriveFramePacing remains a compatibility alias installed by main;\n      // the forest wrapper now replaces only the canonical snapshot authority.\n      const current=diagnostics.framePacing.snapshot;\n      if(typeof current!=='function'){\n        globalThis.setTimeout(attempt,INSTALL_RETRY_MS);\n        return;\n      }\n      if(current.__worldDriveP941Forest)return;\n      const original=current.__worldDriveP928Original||current;\n      const wrapped=()=>({\n        ...((original?.()||{})),\n        forest:snapshot(),\n        frameRuntime:frameRuntimeSnapshot()\n      });\n      wrapped.__worldDriveP929Forest=true;\n      wrapped.__worldDriveP931Forest=true;\n      wrapped.__worldDriveP934Forest=true;\n      wrapped.__worldDriveP936Forest=true;\n      wrapped.__worldDriveP940Forest=true;\n      wrapped.__worldDriveP941Forest=true;\n      wrapped.__worldDriveP928Original=original;\n      diagnostics.framePacing.snapshot=wrapped;\n    };\n    globalThis.setTimeout(attempt,0);\n  }`;
  return replaceOnce(text,from,to,'forest installDiagnostics');
});

edit('src/scenery-renderer-p933.js',text=>{
  text=replaceOnce(
    text,
    "import {FOREST_STREAMING_POLICY as FOREST} from './forest-streaming-policy.js';",
    "import {FOREST_STREAMING_POLICY as FOREST} from './forest-streaming-policy.js';\nimport {ensureWorldDriveDiagnostics,installDiagnosticAlias} from './diagnostics.js';",
    'scenery diagnostics import'
  );
  return replaceOnce(
    text,
    `  globalThis.__WORLD_DRIVE_P933_FOREST_READY__=whenInitialForestReady;\n  globalThis.__WORLD_DRIVE_P933_FOREST_STATUS__=startupForestStatus;\n  globalThis.__WORLD_DRIVE_P934_FOREST_READY__=whenInitialForestReady;\n  globalThis.__WORLD_DRIVE_P934_FOREST_STATUS__=startupForestStatus;\n  globalThis.__WORLD_DRIVE_P935_FOREST_READY__=whenInitialForestReady;\n  globalThis.__WORLD_DRIVE_P935_FOREST_STATUS__=startupForestStatus;`,
    `  const diagnostics=ensureWorldDriveDiagnostics();\n  diagnostics.forest.whenInitialReady=whenInitialForestReady;\n  diagnostics.forest.startupStatus=startupForestStatus;\n  installDiagnosticAlias('__WORLD_DRIVE_P933_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);\n  installDiagnosticAlias('__WORLD_DRIVE_P933_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);\n  installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);\n  installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);\n  installDiagnosticAlias('__WORLD_DRIVE_P935_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);\n  installDiagnosticAlias('__WORLD_DRIVE_P935_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);`,
    'scenery readiness aliases'
  );
});

edit('src/startup-ui.js',text=>replaceOnce(
  text,
  `        const waitForForest=\n          globalThis.__WORLD_DRIVE_P935_FOREST_READY__||\n          globalThis.__WORLD_DRIVE_P934_FOREST_READY__||\n          globalThis.__WORLD_DRIVE_P933_FOREST_READY__;`,
  `        const waitForForest=\n          globalThis.WorldDriveDiagnostics?.forest?.whenInitialReady||\n          globalThis.__WORLD_DRIVE_P935_FOREST_READY__||\n          globalThis.__WORLD_DRIVE_P934_FOREST_READY__||\n          globalThis.__WORLD_DRIVE_P933_FOREST_READY__;`,
  'startup forest readiness lookup'
));

edit('src/streaming-coordinator.js',text=>replaceOnce(
  text,
  `      try{\n        forestMatched=globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__?.({\n          hitchCount:gameplayHitchCount,\n          hitchAt:now,\n          frameMs:rawFrameMs\n        })===true;\n      }catch{}`,
  `      try{\n        const forestHitchRecorder=\n          globalThis.WorldDriveDiagnostics?.forest?.recordHitch||\n          globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__;\n        forestMatched=forestHitchRecorder?.({\n          hitchCount:gameplayHitchCount,\n          hitchAt:now,\n          frameMs:rawFrameMs\n        })===true;\n      }catch{}`,
  'streaming forest hitch lookup'
));

edit('qa/V21_22_3_HITCH_FREE_QA.mjs',text=>replaceOnce(
  text,
  `has('window.WorldDriveFramePacing=()=>({','quiet hitch diagnostics missing');`,
  `has('worldDriveDiagnostics.framePacing.snapshot=()=>({','canonical quiet hitch diagnostics missing');\nhas("installDiagnosticAlias(\\n  'WorldDriveFramePacing'",'frame-pacing compatibility alias missing');`,
  'V21.22.3 diagnostic ownership assertion'
));

edit('qa-p939-hitch-attribution.mjs',text=>replaceOnce(
  text,
  `expect(\n  source.includes('forestMatched=globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__?.({'),\n  'P9.39 must reuse the forest hitch correlation result'\n);`,
  `expect(\n  source.includes('globalThis.WorldDriveDiagnostics?.forest?.recordHitch||')&&\n  source.includes('globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__'),\n  'P9.39 must prefer canonical forest hitch correlation while preserving the compatibility fallback'\n);`,
  'P9.39 diagnostic ownership assertion'
));

console.log('C6.1 diagnostics bridge materialized');

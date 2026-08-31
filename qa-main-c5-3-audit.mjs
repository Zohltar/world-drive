import fs from 'node:fs';

const source=fs.readFileSync('src/main.js','utf8');
const lines=source.split(/\r?\n/);
const imports=[...source.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"];?/gm)].map(match=>match[1]);
const functions=[];
for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if(match)functions.push({name:match[1],line:i+1});
}
for(let i=0;i<functions.length;i++)functions[i].end=(functions[i+1]?.line||lines.length+1)-1;

const buckets={route:[],settings:[],renderer:[],vehicle:[],diagnostics:[],worldData:[],other:[]};
const rules=[
  ['route',/(route|geo|lat|lon|project|origin|coord)/i],
  ['settings',/(setting|option|quality|display|volume|preference|persist)/i],
  ['renderer',/(render|frame|animate|resize|camera|light|shadow|fps|performance)/i],
  ['vehicle',/(vehicle|car|truck|spawn|select|drive|wheel|transmission)/i],
  ['diagnostics',/(diag|debug|stats|metric|hitch|telemetry|profile)/i],
  ['worldData',/(water|hydro|scenery|roadMeta|elevation|imagery|terrain|forest)/i]
];
for(const fn of functions){
  const hit=rules.find(([,regex])=>regex.test(fn.name));
  buckets[hit?.[0]||'other'].push(fn);
}

const markers=[];
for(let i=0;i<lines.length;i++){
  const text=lines[i].trim();
  if(text.startsWith('// ----------'))markers.push({line:i+1,text});
}

const candidates={
  settings:{names:['queueSettingsSave','cloneDefaultControls','applyLoadedV21Settings']},
  performanceGovernor:{names:['performanceIntervals','applyPerformanceLevel','updateFpsAndGovernor']},
  routeLookup:{names:['nearestRouteForVehicle','geoDist']},
  streamedOrigins:{names:['resetStaticGroupOrigin','resetStreamedWorldOrigins','freezeStaticMatrices']},
  roadMetadata:{names:['parseMaxspeed','roadSurfaceGrip','safeRoadWidth','updateRoadMetaHUD','roadMetaQuery','loadRoadMetadataAround']},
  hydro:{names:['waterWidth','updateHydroCacheHUD','loadWaterAround']},
  vehicleSelection:{names:['vehicleTopSpeedKmh','syncVehicleSpeedCapability','applyVehicleSelection']}
};
for(const candidate of Object.values(candidates)){
  candidate.functions=candidate.names.map(name=>functions.find(fn=>fn.name===name)).filter(Boolean);
  candidate.span=candidate.functions.length
    ?candidate.functions[candidate.functions.length-1].end-candidate.functions[0].line+1
    :0;
}

const summary={
  lines:lines.length,
  bytes:Buffer.byteLength(source),
  imports:imports.length,
  topLevelFunctions:functions.length,
  sideEffectSignals:{
    globalThis:(source.match(/\bglobalThis\./g)||[]).length,
    windowDiagnostics:(source.match(/window\.WorldDrive/g)||[]).length,
    eventListeners:(source.match(/\.addEventListener\s*\(/g)||[]).length,
    animationLoops:(source.match(/requestAnimationFrame|setAnimationLoop/g)||[]).length,
    rendererRefs:(source.match(/\brenderer\b/g)||[]).length
  },
  candidates,
  buckets,
  markers,
  importsList:imports
};
console.log('CLEANUP C5.3 MAIN RESPONSIBILITY AUDIT');
console.log(JSON.stringify(summary,null,2));
if(lines.length>=3245)throw new Error(`C5.1/C5.2 reductions missing: ${lines.length}`);
if(!source.includes("from './world-materials.js'"))throw new Error('C5.1 canonical world-materials import missing');
if(!source.includes("from './sky-lighting.js'"))throw new Error('C5.2 canonical sky-lighting import missing');

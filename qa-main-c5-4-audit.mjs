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

const markers=[];
for(let i=0;i<lines.length;i++){
  const text=lines[i].trim();
  if(text.startsWith('// ----------'))markers.push({line:i+1,text});
}

function fn(name){return functions.find(item=>item.name===name)||null;}
function candidate(names){
  const found=names.map(fn).filter(Boolean);
  return {
    names,
    found,
    firstLine:found.length?Math.min(...found.map(item=>item.line)):null,
    lastEnd:found.length?Math.max(...found.map(item=>item.end)):null,
    approximateSpan:found.length?Math.max(...found.map(item=>item.end))-Math.min(...found.map(item=>item.line))+1:0,
    references:Object.fromEntries(names.map(name=>[name,(source.match(new RegExp(`\\b${name}\\b`,'g'))||[]).length]))
  };
}

const candidates={
  settingsLifecycle:candidate(['queueSettingsSave','cloneDefaultControls','applyLoadedV21Settings']),
  performanceGovernor:candidate(['performanceIntervals','applyPerformanceLevel','updateFpsAndGovernor']),
  roadMetadata:candidate(['parseMaxspeed','roadSurfaceGrip','safeRoadWidth','updateRoadMetaHUD','roadMetaQuery','loadRoadMetadataAround']),
  geographicSigns:candidate(['nearestRouteCumToFeature','collectEndpointLocalitySigns','collectFallbackRiverSigns','addFallbackSpeedSign','addGeographicRoadSigns']),
  hydroAndWaterFiltering:candidate(['pointInPolygon2D','pointSegDist2D','isWaterAt','removeTreesOverWater','waterWidth','updateHydroCacheHUD','loadWaterAround']),
  vehicleSelection:candidate(['vehicleTopSpeedKmh','syncVehicleSpeedCapability','applyVehicleSelection']),
  routeLoad:candidate(['createRequestedRoute','bumpRouteGeneration','loadRoute']),
  localWorldOrchestration:candidate(['loadSceneryAround','terrainFrameAt','ensureRoadProfileNear','rebuildLocalWorld','resetWorldCaches']),
  uiComposition:candidate(['setCollapsed','ensureV21MenuSystem','installV21Menu','syncV21RuntimeControls','syncV21VehicleInfo','applyV21DisplayVisibility','showV21MenuButton'])
};

const summary={
  lines:lines.length,
  bytes:Buffer.byteLength(source),
  imports:imports.length,
  topLevelFunctions:functions.length,
  sideEffectSignals:{
    globalThis:(source.match(/\bglobalThis\./g)||[]).length,
    windowWorldDrive:(source.match(/window\.WorldDrive/g)||[]).length,
    eventListeners:(source.match(/\.addEventListener\s*\(/g)||[]).length,
    animationLoops:(source.match(/requestAnimationFrame|setAnimationLoop/g)||[]).length,
    rendererRefs:(source.match(/\brenderer\b/g)||[]).length
  },
  candidates,
  markers,
  importsList:imports
};

console.log('CLEANUP C5.4 MAIN RESPONSIBILITY AUDIT');
console.log(JSON.stringify(summary,null,2));
if(lines.length!==2859)throw new Error(`unexpected post-C5.3 main.js line count: ${lines.length}`);
for(const module of ['./world-materials.js','./sky-lighting.js','./world-scene.js']){
  if(!imports.includes(module))throw new Error(`completed C5 module missing: ${module}`);
}

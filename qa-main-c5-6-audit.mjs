import fs from 'node:fs';

const source=fs.readFileSync('src/main.js','utf8');
const lines=source.split(/\r?\n/);
const imports=[...source.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"];?/gm)].map(match=>match[1]);
const functions=[];
for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if(match)functions.push({name:match[1],line:i+1});
}
for(let i=0;i<functions.length;i++){
  functions[i].end=(functions[i+1]?.line||lines.length+1)-1;
  functions[i].span=functions[i].end-functions[i].line+1;
  functions[i].references=(source.match(new RegExp(`\\b${functions[i].name}\\b`,'g'))||[]).length;
}

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
function markerSpan(startText,endText){
  const start=markers.find(item=>item.text.includes(startText));
  const end=markers.find(item=>item.text.includes(endText));
  return start&&end?{start:start.line,end:end.line-1,lines:end.line-start.line}:null;
}

const candidates={
  menuFacade:candidate(['ensureV21MenuSystem','installV21Menu','syncV21RuntimeControls','syncV21VehicleInfo','applyV21DisplayVisibility','showV21MenuButton']),
  loadedSettingsApplication:candidate(['applyLoadedV21Settings']),
  panelUi:candidate(['setCollapsed']),
  performanceGovernor:candidate(['performanceIntervals','applyPerformanceLevel','updateFpsAndGovernor']),
  roadMetadata:candidate(['parseMaxspeed','roadSurfaceGrip','safeRoadWidth','updateRoadMetaHUD','roadMetaQuery','loadRoadMetadataAround']),
  hydro:candidate(['pointInPolygon2D','pointSegDist2D','isWaterAt','removeTreesOverWater','waterWidth','updateHydroCacheHUD','loadWaterAround']),
  routeLoad:candidate(['createRequestedRoute','bumpRouteGeneration','loadRoute']),
  localWorld:candidate(['loadSceneryAround','terrainFrameAt','ensureRoadProfileNear','rebuildLocalWorld','resetWorldCaches']),
  vehicleSelection:candidate(['vehicleTopSpeedKmh','syncVehicleSpeedCapability','applyVehicleSelection']),
  renderFrame:candidate(['performanceIntervals','applyPerformanceLevel','updateFpsAndGovernor','animate']),
  spans:{
    routePlannerAndPanels:markerSpan('route planner UI facade','instrument cluster + compass'),
    menuAndLoadedSettings:markerSpan('V21 menu facade','main'),
    vehicleSystems:markerSpan('Vehicle systems','geographic scenery rendering'),
    localWorldToDriving:markerSpan('geographic scenery rendering','Driving')
  }
};

const summary={
  lines:lines.length,
  bytes:Buffer.byteLength(source),
  imports:imports.length,
  topLevelFunctions:functions.length,
  largestFunctions:[...functions].sort((a,b)=>b.span-a.span).slice(0,20),
  sideEffectSignals:{
    windowWorldDrive:(source.match(/window\.WorldDrive/g)||[]).length,
    globalThisWorldDrive:(source.match(/globalThis\.WorldDrive/g)||[]).length,
    eventListeners:(source.match(/\.addEventListener\s*\(/g)||[]).length,
    onclick:(source.match(/\.onclick\s*=/g)||[]).length,
    requestAnimationFrame:(source.match(/requestAnimationFrame/g)||[]).length,
    rendererRefs:(source.match(/\brenderer\b/g)||[]).length,
    appSettingsRefs:(source.match(/\bappSettings\b/g)||[]).length,
    queueSettingsSaveRefs:(source.match(/\bqueueSettingsSave\b/g)||[]).length
  },
  candidates,
  markers,
  importsList:imports
};

console.log('CLEANUP C5.6 MAIN RESPONSIBILITY AUDIT');
console.log(JSON.stringify(summary,null,2));
if(lines.length!==2752)throw new Error(`unexpected post-C5.5 main.js line count: ${lines.length}`);
for(const module of ['./world-materials.js','./sky-lighting.js','./world-scene.js','./signs.js','./application-settings.js']){
  if(!imports.includes(module))throw new Error(`completed C5 module missing: ${module}`);
}

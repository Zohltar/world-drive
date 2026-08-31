import fs from 'node:fs';

const source=fs.readFileSync('src/main.js','utf8').replace(/\r\n/g,'\n');
const lines=source.split('\n');
const imports=[...source.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"];?/gm)].map(m=>m[1]);

function lineOfIndex(index){
  return source.slice(0,index).split('\n').length;
}

function findMatchingBrace(openIndex){
  let depth=0;
  let quote=null;
  let template=false;
  let lineComment=false;
  let blockComment=false;
  let escaped=false;
  for(let i=openIndex;i<source.length;i++){
    const ch=source[i];
    const next=source[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(template){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='`'){template=false;continue;}
      // Template interpolation braces are intentionally counted; nested JS braces still balance.
    }else{
      if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
      if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
      if(ch==='"'||ch==="'"){quote=ch;continue;}
      if(ch==='`'){template=true;continue;}
    }
    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0)return i;
    }
  }
  return -1;
}

const functions=[];
const decl=/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^\n]*\)\s*\{/gm;
for(const match of source.matchAll(decl)){
  const open=source.indexOf('{',match.index);
  const close=findMatchingBrace(open);
  if(close<0)continue;
  const startLine=lineOfIndex(match.index);
  const endLine=lineOfIndex(close);
  functions.push({
    name:match[1],
    startLine,
    endLine,
    lines:endLine-startLine+1,
    references:(source.match(new RegExp(`\\b${match[1]}\\b`,'g'))||[]).length
  });
}

const arrowDefs=[];
const arrow=/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^\n]*?\)|[A-Za-z_$][\w$]*)\s*=>/gm;
for(const match of source.matchAll(arrow)){
  arrowDefs.push({name:match[1],line:lineOfIndex(match.index),references:(source.match(new RegExp(`\\b${match[1]}\\b`,'g'))||[]).length});
}

const markers=[];
for(let i=0;i<lines.length;i++){
  const text=lines[i].trim();
  if(text.startsWith('// ----------'))markers.push({line:i+1,text});
}

const sensitive=new Set([
  'performanceIntervals','applyPerformanceLevel','updateFpsAndGovernor','animate',
  'createRequestedRoute','loadRoute','loadWaterAround','isWaterAt','removeTreesOverWater',
  'applyVehicleSelection','vehicleTopSpeedKmh','syncVehicleSpeedCapability',
  'rebuildLocalWorld','ensureRoadProfileNear','loadSceneryAround'
]);

const largest=[...functions].sort((a,b)=>b.lines-a.lines).slice(0,30);
const lowRiskLargest=largest.filter(fn=>!sensitive.has(fn.name));

const candidateNames=[
  'setCollapsed','showV21MenuButton','installV21Menu','syncV21RuntimeControls','syncV21VehicleInfo','applyV21DisplayVisibility',
  'drawCompass','drawSpeedometer','updateRoadMetaHUD','updateHydroCacheHUD','clearWorldCacheAndReload',
  'featureCentroid','parseMaxspeed','roadSurfaceGrip','safeRoadWidth','roadMetaQuery',
  'resetWorldCaches','terrainFrameAt'
];
const candidates=candidateNames.map(name=>functions.find(fn=>fn.name===name)||{name,missing:true});

const report={
  lines:lines.length,
  bytes:Buffer.byteLength(source),
  imports:imports.length,
  functionDeclarations:functions.length,
  arrowDefinitions:arrowDefs.length,
  largestFunctions:largest,
  lowRiskLargest,
  candidates,
  markers,
  sideEffects:{
    addEventListener:(source.match(/\.addEventListener\s*\(/g)||[]).length,
    onclick:(source.match(/\.onclick\s*=/g)||[]).length,
    globalThisWorldDrive:(source.match(/globalThis\.WorldDrive/g)||[]).length,
    windowWorldDrive:(source.match(/window\.WorldDrive/g)||[]).length,
    rendererRefs:(source.match(/\brenderer\b/g)||[]).length,
    requestAnimationFrame:(source.match(/requestAnimationFrame/g)||[]).length
  },
  completedC5Modules:[
    './world-materials.js','./sky-lighting.js','./world-scene.js','./signs.js',
    './application-settings.js','./loaded-settings-application.js'
  ].map(module=>({module,present:imports.includes(module)}))
};

console.log('CLEANUP C5.7 BRACE-AWARE MAIN AUDIT');
console.log(JSON.stringify(report,null,2));
if(lines.length!==2722)throw new Error(`unexpected post-C5.6 main.js line count: ${lines.length}`);
for(const item of report.completedC5Modules){if(!item.present)throw new Error(`completed C5 module missing: ${item.module}`);}

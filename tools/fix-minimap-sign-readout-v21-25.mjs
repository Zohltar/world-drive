import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const minimapPath=path.join(root,'src','minimap.js');
const mainCheck=path.join(root,'src','__main_minimap_sign_check__.mjs');
const minimapCheck=path.join(root,'src','__minimap_sign_check__.mjs');

function die(message){
  console.error(`V21.25 minimap sign fix: ${message}`);
  process.exit(1);
}

function syntaxCheck(filePath,content,label){
  fs.writeFileSync(filePath,content,'utf8');
  try{
    const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
    if(result.status!==0)die(`${label} syntax check failed:\n${result.stderr||result.stdout}`);
  }finally{
    try{fs.unlinkSync(filePath);}catch{}
  }
}

if(!fs.existsSync(mainPath))die('src/main.js missing.');
if(!fs.existsSync(minimapPath))die('src/minimap.js missing — run the minimap refactor first.');

let main=fs.readFileSync(mainPath,'utf8');
let minimap=fs.readFileSync(minimapPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';

const alreadyFixed=
  main.includes('let currentRoadGuideSign=null;')&&
  main.includes('roadGuideSign:currentRoadGuideSign,')&&
  minimap.includes('let roadGuideSign=null;')&&
  minimap.includes('Math.abs(signDisplayCum(f)-nr.cum)>80');

if(alreadyFixed){
  console.log('V21.25 MINIMAP SIGN FIX: already applied; nothing to do.');
  process.exit(0);
}

if(!main.includes("from './minimap.js'"))die('main.js is not minimap-refactored. No files changed.');
if(!main.includes('resetSignReadout:resetMinimapSignReadout,'))die('minimap reset repair is missing. Run repair-minimap-reset-v21-25.mjs first.');
if(!minimap.includes('function updatePassedSignReadout(nr){'))die('minimap readout function missing. No files changed.');

// Main owns the synthetic road-name guide because it also owns the matching 3D sign.
if(!main.includes('let currentRoadGuideSign=null;')){
  const activeMetaPattern=/(let activeRoadMeta=\{[\s\S]*?\r?\n\};)(\r?\nlet lastRoadMetaCenter=)/;
  if(!activeMetaPattern.test(main))die('activeRoadMeta anchor not found. No files changed.');
  main=main.replace(activeMetaPattern,`$1${eol}let currentRoadGuideSign=null;$2`);
}

const roadSignsPattern=/function addCurrentRoadSigns\(\)\{[\s\S]*?\r?\n\}\r?\n\r?\nfunction refreshRoadSignsOnly\(\)\{/;
const roadSignsMatch=main.match(roadSignsPattern);
if(!roadSignsMatch)die('addCurrentRoadSigns block not found. No files changed.');

const newRoadSigns=[
  'function addCurrentRoadSigns(){',
  ' currentRoadGuideSign=null;',
  ' if(activeRoadMeta.confidence<=.25)return;',
  ' const n=nearestRoute(absX,absZ);if(!n)return;',
  ' const label=activeRoadMeta.ref||activeRoadMeta.name;',
  ' if(label){',
  '  const guideCum=Math.min(routeLength,n.cum+170);',
  '  const p=routePointAtCum(guideCum);p.y=roadHeightAt(p.x,p.z);',
  '  const guideLabel=String(label).slice(0,28);',
  "  addRoadSignAt(p,guideLabel,'guide',1);",
  '  currentRoadGuideSign={',
  '   key:`road-guide:${guideLabel}:${Math.round(guideCum)}`,',
  "   kind:'guide',",
  '   label:guideLabel,',
  '   routeCum:guideCum',
  '  };',
  ' }',
  '}',
  '',
  'function refreshRoadSignsOnly(){'
].join(eol);
main=main.replace(roadSignsPattern,newRoadSigns);

if(!main.includes('roadGuideSign:currentRoadGuideSign,')){
  const stateAnchor='    geographicSigns,'+eol+'    routeStart:ROUTE_START,';
  if(!main.includes(stateAnchor))die('minimap getState anchor not found. No files changed.');
  main=main.replace(
    stateAnchor,
    '    geographicSigns,'+eol+'    roadGuideSign:currentRoadGuideSign,'+eol+'    routeStart:ROUTE_START,'
  );
}

if(!main.includes('currentRoadGuideSign=null;'+eol+'  worldStreaming.reset();')){
  const resetAnchor='function resetWorldCaches(){'+eol+'  worldStreaming.reset();';
  if(!main.includes(resetAnchor))die('resetWorldCaches anchor not found. No files changed.');
  main=main.replace(
    resetAnchor,
    'function resetWorldCaches(){'+eol+'  currentRoadGuideSign=null;'+eol+'  worldStreaming.reset();'
  );
}

// Minimap merges the synthetic road-name guide with geographic OSM signs.
if(!minimap.includes('let roadGuideSign=null;')){
  const stateAnchor='  let geographicSigns=[];'+eol;
  if(!minimap.includes(stateAnchor))die('minimap geographicSigns state anchor not found. No files changed.');
  minimap=minimap.replace(stateAnchor,stateAnchor+'  let roadGuideSign=null;'+eol);
}

if(!minimap.includes('roadGuideSign=state.roadGuideSign||null;')){
  const syncAnchor='    geographicSigns=Array.isArray(state.geographicSigns)?state.geographicSigns:[];'+eol;
  if(!minimap.includes(syncAnchor))die('minimap sync state anchor not found. No files changed.');
  minimap=minimap.replace(syncAnchor,syncAnchor+'    roadGuideSign=state.roadGuideSign||null;'+eol);
}

const updatePattern=/function updatePassedSignReadout\(nr\)\{[\s\S]*?\r?\n\}\r?\n\r?\n(?:function resetSignReadout\(\)\{[\s\S]*?\r?\n\}\r?\n\r?\n)?\/\/ ---------- minimap ----------/;
const updateMatch=minimap.match(updatePattern);
if(!updateMatch)die('minimap updatePassedSignReadout block not found. No files changed.');

const hasInlineReset=updateMatch[0].includes('function resetSignReadout(){');
const resetBlock=hasInlineReset?[
  'function resetSignReadout(){',
  '  passedSignKeys.clear();',
  '  signReadout.key=null;',
  "  signReadout.text='';",
  '  signReadout.startedAt=0;',
  '}',
  ''
].join(eol):'';

const newUpdate=[
  'function updatePassedSignReadout(nr){',
  '  syncMinimapState();',
  '  const candidates=roadGuideSign',
  '    ?[...geographicSigns,roadGuideSign]',
  '    :geographicSigns;',
  '  if(!nr||!candidates.length)return;',
  '  let best=null,bestDelta=Infinity;',
  '  for(const f of candidates){',
  '    if(!f?.key||passedSignKeys.has(f.key))continue;',
  '    const d=Math.abs(signDisplayCum(f)-nr.cum);',
  '    if(d<=14 && d<bestDelta){best=f;bestDelta=d}',
  '  }',
  '  if(best){',
  '    passedSignKeys.add(best.key);',
  '    signReadout.key=best.key;',
  '    signReadout.text=signReadoutText(best);',
  '    signReadout.startedAt=performance.now();',
  '  }',
  '  // Rearm after moving well clear of the sign in EITHER direction.',
  '  // This makes a U-turn + recross behave the same as the original pass.',
  '  for(const f of candidates){',
  '    if(passedSignKeys.has(f.key) && Math.abs(signDisplayCum(f)-nr.cum)>80){',
  '      passedSignKeys.delete(f.key);',
  '    }',
  '  }',
  '}',
  '',
  resetBlock,
  '// ---------- minimap ----------'
].filter((line,index,array)=>!(line===''&&index>0&&array[index-1]==='')).join(eol);

minimap=minimap.replace(updatePattern,newUpdate);

for(const required of [
  'let currentRoadGuideSign=null;',
  'roadGuideSign:currentRoadGuideSign,',
  'currentRoadGuideSign={',
  "kind:'guide',",
  'currentRoadGuideSign=null;'+eol+'  worldStreaming.reset();'
]){
  if(!main.includes(required))die(`main.js integration missing: ${required}. No files changed.`);
}

for(const required of [
  'let roadGuideSign=null;',
  'roadGuideSign=state.roadGuideSign||null;',
  'const candidates=roadGuideSign',
  'Math.abs(signDisplayCum(f)-nr.cum)>80'
]){
  if(!minimap.includes(required))die(`minimap.js integration missing: ${required}. No files changed.`);
}

if(minimap.includes('signDisplayCum(f)-nr.cum>80')){
  die('one-way sign rearm logic still present. No files changed.');
}

syntaxCheck(mainCheck,main,'main.js');
syntaxCheck(minimapCheck,minimap,'minimap.js');

fs.writeFileSync(mainPath,main,'utf8');
fs.writeFileSync(minimapPath,minimap,'utf8');

console.log('V21.25 MINIMAP SIGN FIX: APPLIED');
console.log('Road-name guide signs now feed the minimap readout.');
console.log('Passed signs now rearm after 80 m in either travel direction.');

import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const historicalProductionFiles=[
  'src/forest-chunk-streamer-p929.js',
  'src/forest-chunk-streamer-p929-wrapper.js',
  'src/forest-terrain-sampler-p912.js',
  'src/frame-runtime-profiler-p941.js'
];
const canonicalFacade='src/forest-chunk-streamer.js';

for(const file of [canonicalFacade,...historicalProductionFiles]){
  if(!fs.existsSync(file))throw new Error(`C4 expected active production file missing: ${file}`);
}

const canonical=fs.readFileSync(canonicalFacade,'utf8');
const wrapper=fs.readFileSync('src/forest-chunk-streamer-p929-wrapper.js','utf8');
const core=fs.readFileSync('src/forest-chunk-streamer-p929.js','utf8');
const profiler=fs.readFileSync('src/frame-runtime-profiler-p941.js','utf8');

if(!canonical.includes("from './forest-chunk-streamer-p929-wrapper.js'")){
  throw new Error('C4 current canonical facade no longer points to the expected production wrapper');
}
if(!wrapper.includes("from './forest-chunk-streamer-p929.js'")){
  throw new Error('C4 current wrapper no longer composes the expected production core');
}
if(!wrapper.includes("from './frame-runtime-profiler-p941.js'")){
  throw new Error('C4 current wrapper no longer composes the expected runtime profiler');
}
if(!core.includes("from './forest-terrain-sampler-p912.js'")){
  throw new Error('C4 current core no longer composes the expected terrain sampler');
}

const skipDirs=new Set(['.git','node_modules','dist']);
const refs=Object.fromEntries(historicalProductionFiles.map(file=>[file,[]]));
const pNamedProduction=[];

function walk(dir='.'){
  for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    if(skipDirs.has(entry.name))continue;
    const rel=path.join(dir,entry.name).replaceAll('\\','/').replace(/^\.\//,'');
    if(entry.isDirectory()){
      walk(rel);
      continue;
    }
    if(rel.startsWith('src/')&&/-p\d+/i.test(path.basename(rel)))pNamedProduction.push(rel);
    if(!/\.(?:js|mjs|cjs|yml|yaml|md)$/.test(rel))continue;
    if(rel==='qa-forest-c4-audit.mjs')continue;
    const text=fs.readFileSync(path.join(root,rel),'utf8');
    for(const target of historicalProductionFiles){
      const basename=path.basename(target);
      if(text.includes(basename))refs[target].push(rel);
    }
  }
}
walk();

const diagnosticAliases=[...wrapper.matchAll(/globalThis\.(__WORLD_DRIVE_[A-Z0-9_]+__)\s*=/g)].map(match=>match[1]);
const framePacingAliases=[...wrapper.matchAll(/__worldDriveP\d+Forest/g)].map(match=>match[0]);

const summary={
  productionChain:{
    facade:canonicalFacade,
    wrapper:'src/forest-chunk-streamer-p929-wrapper.js',
    core:'src/forest-chunk-streamer-p929.js',
    terrainSampler:'src/forest-terrain-sampler-p912.js',
    runtimeProfiler:'src/frame-runtime-profiler-p941.js'
  },
  productionSizes:Object.fromEntries(
    [canonicalFacade,...historicalProductionFiles].map(file=>[file,fs.statSync(file).size])
  ),
  references:refs,
  pNamedProduction:pNamedProduction.sort(),
  diagnosticAliases:[...new Set(diagnosticAliases)].sort(),
  framePacingAliases:[...new Set(framePacingAliases)].sort(),
  responsibilitySignals:{
    coreOwnsFrameBudget:/sliceBudgetMs|candidateBatchSize|catchupSliceBudgetMs/.test(core),
    coreOwnsPrefetch:/prefetchLeadM|prefetchRadiusM|rollingPrefetch/.test(core),
    coreOwnsMaintenance:/queueSorts|cacheTrimRuns/.test(core),
    wrapperOwnsHitchAttribution:/recordHitch|hitchesAttributedToForest|nearestActivity/.test(wrapper),
    wrapperOwnsStartupDirection:/seedStartupRouteDirection|STARTUP_DIRECTION_SEED_M/.test(wrapper),
    wrapperOwnsDiagnostics:/installDiagnostics|WorldDriveFramePacing/.test(wrapper),
    profilerOwnsFrameRuntime:/frameRuntimeSnapshot/.test(profiler)
  }
};

console.log('CLEANUP C4 FOREST LAYER AUDIT');
console.log(JSON.stringify(summary,null,2));

for(const [name,value] of Object.entries(summary.responsibilitySignals)){
  if(!value)throw new Error(`C4 responsibility signal missing: ${name}`);
}

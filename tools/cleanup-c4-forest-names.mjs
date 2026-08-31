import fs from 'node:fs';
import path from 'node:path';

// C4 candidate materializer: naming/ownership only, no streaming-policy changes.
const files={
  facade:'src/forest-chunk-streamer.js',
  wrapper:'src/forest-chunk-streamer-p929-wrapper.js',
  core:'src/forest-chunk-streamer-p929.js',
  sampler:'src/forest-terrain-sampler-p912.js',
  profiler:'src/frame-runtime-profiler-p941.js',
  newCore:'src/forest-chunk-streamer-core.js',
  newSampler:'src/forest-terrain-sampler.js',
  newProfiler:'src/frame-runtime-profiler.js'
};
for(const file of [files.facade,files.wrapper,files.core,files.sampler,files.profiler]){
  if(!fs.existsSync(file))throw new Error(`C4 expected production file missing: ${file}`);
}

function tidy(text){return text.replace(/[ \t]+$/gm,'').trimEnd()+'\n';}
function replaceAllExact(text,from,to){return text.split(from).join(to);}

let wrapper=fs.readFileSync(files.wrapper,'utf8');
let core=fs.readFileSync(files.core,'utf8');
let sampler=fs.readFileSync(files.sampler,'utf8');
let profiler=fs.readFileSync(files.profiler,'utf8');

wrapper=replaceAllExact(wrapper,"'./forest-chunk-streamer-p929.js'","'./forest-chunk-streamer-core.js'");
wrapper=replaceAllExact(wrapper,"'./frame-runtime-profiler-p941.js'","'./frame-runtime-profiler.js'");
wrapper=replaceAllExact(wrapper,'createForestChunkStreamerP929','createForestChunkStreamerCore');
core=replaceAllExact(core,"'./forest-terrain-sampler-p912.js'","'./forest-terrain-sampler.js'");
core=replaceAllExact(core,'createForestTerrainSamplerP912','createForestTerrainSampler');
sampler=replaceAllExact(sampler,'createForestTerrainSamplerP912','createForestTerrainSampler');

fs.writeFileSync(files.facade,tidy(wrapper));
fs.writeFileSync(files.newCore,tidy(core));
fs.writeFileSync(files.newSampler,tidy(sampler));
fs.writeFileSync(files.newProfiler,tidy(profiler));
for(const file of [files.wrapper,files.core,files.sampler,files.profiler])fs.unlinkSync(file);

const replacements=new Map([
  ['forest-chunk-streamer-p929-wrapper.js','forest-chunk-streamer.js'],
  ['forest-chunk-streamer-p929.js','forest-chunk-streamer-core.js'],
  ['forest-terrain-sampler-p912.js','forest-terrain-sampler.js'],
  ['frame-runtime-profiler-p941.js','frame-runtime-profiler.js'],
  ['createForestTerrainSamplerP912','createForestTerrainSampler']
]);

const roots=['src','qa','.github'];
for(const entry of fs.readdirSync('.')){
  if(/^qa.*\.mjs$/i.test(entry))roots.push(entry);
}
roots.push('README.md');
const seen=new Set();
function rewriteTarget(target){
  if(seen.has(target)||!fs.existsSync(target))return;
  seen.add(target);
  const stat=fs.statSync(target);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(target))rewriteTarget(path.join(target,entry));
    return;
  }
  if(!/\.(?:js|mjs|cjs|yml|yaml|md)$/i.test(target))return;
  const rel=target.replaceAll('\\','/');
  if(rel==='qa-forest-c4.mjs'||rel==='.github/workflows/qa-cleanup-c4-candidate.yml')return;
  let text=fs.readFileSync(target,'utf8');
  let next=text;
  for(const [from,to] of replacements)next=replaceAllExact(next,from,to);
  if(next!==text)fs.writeFileSync(target,tidy(next));
}
for(const target of roots)rewriteTarget(target);

// P9.29 remains a useful frame-budget/diagnostics regression, but its wiring
// assertion described the old facade -> wrapper -> core filename chain. After
// C4 the canonical streamer owns the former wrapper behavior directly.
const p929Qa='qa-forest-p929-frame-budget.mjs';
if(fs.existsSync(p929Qa)){
  let qa=fs.readFileSync(p929Qa,'utf8');
  qa=replaceAllExact(
    qa,
    `expect(entry.includes("from './forest-chunk-streamer.js'"),'entry point must use P9.29 wrapper');`,
    `expect(entry.includes("from './forest-chunk-streamer-core.js'"),'canonical forest streamer must compose the frame-budget core');`
  );
  fs.writeFileSync(p929Qa,tidy(qa));
}

console.log('C4 forest naming migration materialized',{
  canonical:files.facade,
  core:files.newCore,
  sampler:files.newSampler,
  profiler:files.newProfiler,
  behaviorChanged:false
});

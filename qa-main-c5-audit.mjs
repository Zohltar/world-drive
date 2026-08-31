import fs from 'node:fs';

const source=fs.readFileSync('src/main.js','utf8');
const lines=source.split(/\r?\n/);
const imports=[...source.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"];?/gm)].map(match=>match[1]);
const functions=[];
for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const match=line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if(match)functions.push({name:match[1],line:i+1});
}
for(let i=0;i<functions.length;i++)functions[i].end=(functions[i+1]?.line||lines.length+1)-1;

const buckets={route:[],settings:[],renderer:[],vehicle:[],diagnostics:[],other:[]};
const rules=[
  ['route',/(route|geo|lat|lon|mercator|project|origin|world.*coord|coord.*world)/i],
  ['settings',/(setting|option|quality|photo|volume|preference|persist|storage)/i],
  ['renderer',/(render|frame|animate|loop|resize|camera|light|scene)/i],
  ['vehicle',/(vehicle|car|truck|spawn|select|drive|wheel)/i],
  ['diagnostics',/(diag|debug|stats|metric|perf|hitch|telemetry|profile)/i]
];
for(const fn of functions){
  const hit=rules.find(([,regex])=>regex.test(fn.name));
  buckets[hit?.[0]||'other'].push(fn);
}

const markers=[];
for(let i=0;i<lines.length;i++){
  const text=lines[i].trim();
  if(/^\/\/\s*(?:[-=]{3,}|[A-Z][A-Za-z0-9 .:/_-]{5,})/.test(text))markers.push({line:i+1,text:text.slice(0,120)});
}

const summary={
  lines:lines.length,
  bytes:Buffer.byteLength(source),
  imports:imports.length,
  topLevelFunctions:functions.length,
  sideEffectSignals:{
    globalThis:(source.match(/\bglobalThis\./g)||[]).length,
    localStorage:(source.match(/\blocalStorage\b/g)||[]).length,
    eventListeners:(source.match(/\.addEventListener\s*\(/g)||[]).length,
    animationLoops:(source.match(/requestAnimationFrame|setAnimationLoop/g)||[]).length,
    rendererRefs:(source.match(/\brenderer\b/g)||[]).length
  },
  buckets,
  markers:markers.slice(0,120),
  importsList:imports
};
console.log('CLEANUP C5 MAIN RESPONSIBILITY AUDIT');
console.log(JSON.stringify(summary,null,2));
if(lines.length<2500)throw new Error(`C5 audit assumption changed: main.js unexpectedly small (${lines.length})`);

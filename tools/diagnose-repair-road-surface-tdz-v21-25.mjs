import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const checkPath=path.join(root,'src','__road_surface_tdz_check__.mjs');

function fail(message){
  console.error(`V21.25 roadSurfaceAt TDZ diagnostic: ${message}`);
  process.exit(1);
}

if(!fs.existsSync(mainPath))fail('src/main.js missing');
let main=fs.readFileSync(mainPath,'utf8');
const eol=main.includes('\r\n')?'\r\n':'\n';

function lineOf(index){
  return main.slice(0,index).split(/\r?\n/).length;
}

const lexical=/\b(?:const|let|var)\s+roadSurfaceAt\b[^\n\r]*/g;
const lexicalMatches=[...main.matchAll(lexical)];
const functionMatches=[...main.matchAll(/\bfunction\s+roadSurfaceAt\s*\(/g)];

console.log(`roadSurfaceAt lexical declarations: ${lexicalMatches.length}`);
for(const match of lexicalMatches){
  console.log(`  line ${lineOf(match.index)}: ${match[0].trim()}`);
}
console.log(`roadSurfaceAt function declarations: ${functionMatches.length}`);
for(const match of functionMatches){
  console.log(`  line ${lineOf(match.index)}: function roadSurfaceAt(...)`);
}

let changed=0;
const exactConst='const roadSurfaceAt=(...args)=>roadGeometry.roadSurfaceAt(...args);';
const exactLet='let roadSurfaceAt=(...args)=>roadGeometry.roadSurfaceAt(...args);';
const exactVar='var roadSurfaceAt=(...args)=>roadGeometry.roadSurfaceAt(...args);';
const repaired='function roadSurfaceAt(...args){return roadGeometry.roadSurfaceAt(...args);}';

for(const before of [exactConst,exactLet,exactVar]){
  while(main.includes(before)){
    main=main.replace(before,repaired);
    changed++;
  }
}

const remainingLexical=[...main.matchAll(/\b(?:const|let|var)\s+roadSurfaceAt\b/g)];
if(remainingLexical.length){
  fail(`unsupported lexical roadSurfaceAt declaration remains at line ${lineOf(remainingLexical[0].index)}`);
}

const repairedFunctions=[...main.matchAll(/\bfunction\s+roadSurfaceAt\s*\(/g)];
if(repairedFunctions.length!==1){
  fail(`expected exactly one function roadSurfaceAt declaration after repair, found ${repairedFunctions.length}`);
}

fs.writeFileSync(checkPath,main,'utf8');
try{
  const result=spawnSync(process.execPath,['--check',checkPath],{cwd:root,encoding:'utf8'});
  if(result.status!==0)fail(`repaired main.js syntax error:\n${result.stderr||result.stdout}`);
}finally{
  try{fs.unlinkSync(checkPath);}catch{}
}

if(changed){
  fs.writeFileSync(mainPath,main,'utf8');
  console.log(`ROAD SURFACE TDZ REPAIR: APPLIED (${changed} lexical declaration replaced)`);
}else{
  console.log('ROAD SURFACE TDZ REPAIR: source already uses a hoisted function declaration');
}

const finalIndex=main.search(/\bfunction\s+roadSurfaceAt\s*\(/);
console.log(`roadSurfaceAt final declaration: function, line ${lineOf(finalIndex)}`);
console.log('If the browser still reports a TDZ after this, restart Vite and hard-refresh the page; the source binding itself is no longer lexical.');

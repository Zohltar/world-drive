import fs from 'node:fs';
import path from 'node:path';

const roots=['src'];
const skipDirs=new Set(['node_modules','dist','.git']);
const files=[];
function walk(target){
  const stat=fs.statSync(target);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(target)){
      if(skipDirs.has(entry))continue;
      walk(path.join(target,entry));
    }
    return;
  }
  if(/\.(?:js|mjs|cjs)$/i.test(target))files.push(target.replaceAll('\\','/'));
}
for(const root of roots)walk(root);

const rows=[];
const add=(file,name,kind,index)=>{
  if(!name)return;
  const line=fs.readFileSync(file,'utf8').slice(0,index).split('\n').length;
  rows.push({name,kind,file,line});
};

for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const direct=/(?:globalThis|window)\.([_$A-Za-z][\w$]*)\s*=/g;
  const bracket=/(?:globalThis|window)\[['"]([^'"]+)['"]\]\s*=/g;
  const alias=/installDiagnosticAlias\(\s*['"]([^'"]+)['"]/g;
  let match;
  while((match=direct.exec(text)))add(file,match[1],'direct-write',match.index);
  while((match=bracket.exec(text)))add(file,match[1],'direct-write',match.index);
  while((match=alias.exec(text)))add(file,match[1],'diagnostic-alias',match.index);
}

rows.sort((a,b)=>a.name.localeCompare(b.name)||a.file.localeCompare(b.file)||a.line-b.line);
const byName={};
for(const row of rows)(byName[row.name]??=[]).push({kind:row.kind,file:row.file,line:row.line});

console.log('C6 FINAL GLOBAL INVENTORY');
console.log(JSON.stringify(byName,null,2));
console.log('SUMMARY',{names:Object.keys(byName).length,occurrences:rows.length});

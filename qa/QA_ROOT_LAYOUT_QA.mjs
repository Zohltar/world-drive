import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const qaName=/^(?:qa[-_].*|.*_QA)\.(?:m?js)$/i;
const rootQa=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&qaName.test(e.name)).map(e=>e.name);
assert.deepEqual(rootQa,[],`QA files remain at project root: ${rootQa.join(', ')}`);
const workflowDir=path.join(root,'.github','workflows');
const stale=[];
if(fs.existsSync(workflowDir))for(const name of fs.readdirSync(workflowDir)){
  if(name==='qa-root-layout-migrate.yml'||!/\.ya?ml$/i.test(name))continue;
  const text=fs.readFileSync(path.join(workflowDir,name),'utf8');
  for(const m of text.matchAll(/(^|[^\w/])((?:qa[-_][A-Za-z0-9_.-]*|[A-Za-z0-9_.-]*_QA)\.(?:m?js))/g))stale.push(`${name}: ${m[2]}`);
}
assert.deepEqual(stale,[],`workflow references still target root QA files:\n${stale.join('\n')}`);
console.log('QA ROOT LAYOUT QA: PASS',{rootQaFiles:0,workflowStaleRefs:0});

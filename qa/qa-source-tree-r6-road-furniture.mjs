import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));

assert.equal(exists('src/road-furniture-p930.js'),false,'legacy root P9.30 implementation must stay removed');
assert.equal(exists('src/road-furniture-p937.js'),false,'legacy root P9.37 implementation must stay removed');
assert.equal(exists('src/road/road-furniture-p930.js'),true,'nested P9.30 implementation missing');
assert.equal(exists('src/road/road-furniture-p937.js'),true,'nested P9.37 implementation missing');

const entry=read('src/road-furniture.js');
const wrapper=read('src/road/road-furniture-p937.js');
const main=read('src/main.js');

assert.ok(entry.includes("from './road/road-furniture-p937.js'"),'root road-furniture facade must target nested P9.37 implementation');
assert.ok(wrapper.includes("from './road-furniture-p930.js'"),'nested P9.37 must keep the sibling P9.30 implementation boundary');
assert.ok(wrapper.includes("from '../diagnostics.js'"),'nested P9.37 must use the canonical diagnostics root');
assert.ok(main.includes("from './road-furniture.js'"),'main.js must keep the stable road-furniture root facade');
assert.ok(!main.includes("road-furniture-p930.js")&&!main.includes("road-furniture-p937.js"),'main.js must not bypass the public road-furniture facade');

console.log('SOURCE TREE R6 ROAD FURNITURE QA: PASS',{
  stableRootFacade:true,
  nestedP930:true,
  nestedP937:true,
  mainFacadeBoundary:true,
  diagnosticsBoundary:true
});

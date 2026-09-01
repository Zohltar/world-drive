import fs from 'node:fs';

const path='src/main.js';
const before="from './audio.js';";
const after="from './audio/audio.js';";
const source=fs.readFileSync(path,'utf8');
const count=source.split(before).length-1;
if(count!==1)throw new Error(`R5 expected exactly one main audio import, found ${count}`);
const next=source.replace(before,after);
if(next.includes(before))throw new Error('R5 legacy main audio import remains');
fs.writeFileSync(path,next);
console.log('R5 AUDIO MAIN PATH MIGRATION: PASS');

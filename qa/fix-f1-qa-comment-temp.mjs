import fs from 'node:fs';
const path='qa/V21_21_PHYSICS_QA.mjs';
let s=fs.readFileSync(path,'utf8');
const old=`// V21.21.24 deliberately gives the F1 its own progressive rack/envelope mapping;\n// that profile is covered by V21_21_24_F1_STEERING_QA.mjs below instead of this\n// historical road-car equivalence check.\n`;
const replacement=`// The F1 now has its own current steering / physical-drift ownership coverage;\n// this historical equivalence block therefore only checks finite/bounded F1\n// outputs rather than enforcing abandoned V21.21 rack/envelope semantics.\n`;
if(!s.includes(old))throw new Error('stale F1 QA comment anchor missing');
s=s.replace(old,replacement);
fs.writeFileSync(path,s);
console.log('F1 QA COMMENT CLEANUP: PASS');

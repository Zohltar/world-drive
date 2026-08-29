import fs from 'node:fs';
const path='tools/apply-drift-stress-r1.mjs';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const fixes=[
  [
    '  const suppliedRoad=Number(surfaceRoadFraction);',
    '  const suppliedRoad=surfaceRoadFraction===null||surfaceRoadFraction===undefined?NaN:Number(surfaceRoadFraction);'
  ],
  [
    '  const suppliedRoadFraction=Number(surfaceRoadFraction);',
    '  const suppliedRoadFraction=surfaceRoadFraction===null||surfaceRoadFraction===undefined?NaN:Number(surfaceRoadFraction);'
  ]
];
for(const [from,to] of fixes){
  const count=s.split(from).length-1;
  if(count!==1)throw new Error(`expected one surface fallback anchor, found ${count}: ${from}`);
  s=s.replace(from,to);
}
fs.writeFileSync(path,s);
console.log('Drift stress optional surface fallback fixed');

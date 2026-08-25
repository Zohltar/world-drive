import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/vehicle-placement-controller.js',import.meta.url),'utf8');

const mustInclude=[
  'const frameX=placedFrame?.px;',
  'const frameZ=placedFrame?.pz;',
  'const validPlacedFrame=',
  "throw new Error('Route placement returned non-finite coordinates')"
];

for(const needle of mustInclude){
  if(!src.includes(needle)){
    throw new Error(`V21.31 route placement QA failed: missing ${needle}`);
  }
}

if(src.includes('state.absX=placedFrame.x;')||src.includes('state.absZ=placedFrame.z;')){
  throw new Error('V21.31 route placement QA failed: legacy x/z frame contract returned');
}

console.log('V21.31 route placement finite QA passed');

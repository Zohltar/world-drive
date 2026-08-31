import fs from 'node:fs';

function replaceExact(path,from,to){
  const before=fs.readFileSync(path,'utf8');
  if(!before.includes(from))throw new Error(`C1 expected reference missing in ${path}: ${from}`);
  fs.writeFileSync(path,before.split(from).join(to));
}

replaceExact(
  'qa-momentum-direction-b4.mjs',
  "const dynBase=fs.readFileSync('src/vehicle-dynamics-base.js','utf8');",
  "const dynBase=fs.readFileSync('src/vehicle-dynamics-core.js','utf8');"
);

for(const path of [
  'src/vehicle-dynamics-base.js',
  'src/vehicle-dynamics-v21.29.js',
  'tools/cleanup-c1-vehicle-dynamics.mjs'
]){
  if(!fs.existsSync(path))throw new Error(`C1 expected legacy/staging file missing: ${path}`);
  fs.unlinkSync(path);
}

// This is a one-shot repository materializer; do not leave it in final dev.
fs.unlinkSync(new URL(import.meta.url));

console.log('C1 materialization finalized: historical dynamics names removed');

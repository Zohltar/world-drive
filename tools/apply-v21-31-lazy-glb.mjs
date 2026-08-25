import fs from 'node:fs';

const PASSENGER_FILES=[
  'src/civic-glb.js',
  'src/countach-glb.js',
  'src/f1-glb.js',
  'src/i3-glb.js',
  'src/id4-glb.js',
  'src/sonata-glb.js',
  'src/wrx-glb.js'
];

function replaceRequired(text,from,to,label){
  if(text.includes(to))return text;
  if(!text.includes(from))throw new Error(`${label}: marker not found: ${from}`);
  return text.replace(from,to);
}

function optimizePassenger(path){
  let text=fs.readFileSync(path,'utf8');
  const before=text;

  text=replaceRequired(
    text,
    'let loadError=null;',
    'let loadError=null;\n  let loadStarted=false;',
    path
  );

  text=replaceRequired(
    text,
    'async function load(){',
    'async function load(){\n    if(loadStarted)return;\n    loadStarted=true;',
    path
  );

  const activeMarker='requestedActive=!!value;';
  const activeReplacement='requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();';
  text=replaceRequired(text,activeMarker,activeReplacement,path);

  const eager=/\n\s*load\(\);\s*\n(\s*return\s*\{)/;
  if(eager.test(text))text=text.replace(eager,'\n$1');

  if(/\n\s*load\(\);\s*\n\s*return\s*\{/.test(text)){
    throw new Error(`${path}: eager load still present`);
  }

  if(text!==before){
    fs.writeFileSync(path,text);
    console.log(`lazy passenger GLB: ${path}`);
  }else{
    console.log(`already lazy: ${path}`);
  }
}

function optimizeTruck(path='src/truck-trailer.js'){
  let text=fs.readFileSync(path,'utf8');
  const before=text;

  text=replaceRequired(
    text,
    'let truckAssetLoadError=null;',
    'let truckAssetLoadError=null;\n  let truckAssetLoadStarted=false;',
    path
  );

  const assetMarker="const modelUrl=new URL('./assets/saia_ltl_freight_truck_half_trailer.glb',import.meta.url).href;";
  if(!text.includes('function loadTruckAsset(){')){
    const assetIndex=text.indexOf(assetMarker);
    if(assetIndex<0)throw new Error(`${path}: Saia asset marker not found`);
    const start=text.lastIndexOf('(async()=>{',assetIndex);
    const end=text.indexOf('  })();',assetIndex);
    if(start<0||end<0||end<=start)throw new Error(`${path}: eager truck IIFE bounds not found`);
    const body=text.slice(start+'(async()=>{'.length,end);
    const wrapped=`function loadTruckAsset(){\n    if(truckAssetLoadStarted)return;\n    truckAssetLoadStarted=true;\n    (async()=>{${body}  })();\n  }`;
    text=text.slice(0,start)+wrapped+text.slice(end+'  })();'.length);
  }

  text=replaceRequired(
    text,
    'const should=!!next;',
    'const should=!!next;\n    if(should&&!truckAssetReady&&!truckAssetLoadStarted)loadTruckAsset();',
    path
  );

  if(text!==before){
    fs.writeFileSync(path,text);
    console.log(`lazy truck GLB: ${path}`);
  }else{
    console.log(`already lazy: ${path}`);
  }
}

for(const path of PASSENGER_FILES)optimizePassenger(path);
optimizeTruck();
console.log('V21.31 lazy GLB optimization applied');

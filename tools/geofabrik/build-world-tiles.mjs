import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const EARTH_RADIUS_M=6378137;
const MAX_MERCATOR_LAT=85.05112878;
const DEFAULT_TILE_SIZE_M=16000;
const DEFAULT_MAX_TILES_PER_FEATURE=256;
const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const FILTER_FILE=path.join(SCRIPT_DIR,'world-drive-tags-filter.txt');

const KEEP_TAGS=new Set([
  'name','ref','waterway','water','natural','landuse','building','bridge',
  'highway','surface','lanes','maxspeed','power','man_made','barrier',
  'traffic_sign','destination','width','layer','covered','tunnel','intermittent',
  'ele','operator','service','access'
]);

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

export function lonLatToMercator(lon,lat){
  const safeLat=clamp(Number(lat),-MAX_MERCATOR_LAT,MAX_MERCATOR_LAT);
  const safeLon=Number(lon);
  const x=EARTH_RADIUS_M*safeLon*Math.PI/180;
  const y=EARTH_RADIUS_M*Math.log(Math.tan(Math.PI/4+(safeLat*Math.PI/180)/2));
  return {x,y};
}

export function tileForLonLat(lon,lat,tileSizeMeters=DEFAULT_TILE_SIZE_M){
  const {x,y}=lonLatToMercator(lon,lat);
  return {
    x:Math.floor(x/tileSizeMeters),
    y:Math.floor(y/tileSizeMeters)
  };
}

function tagsFromFeature(feature){
  const props=feature?.properties&&typeof feature.properties==='object'
    ? feature.properties
    : {};
  return props;
}

function truthyTag(value){
  if(value===undefined||value===null)return false;
  const text=String(value).toLowerCase();
  return text!==''&&text!=='no'&&text!=='false'&&text!=='0';
}

export function classifyFeature(feature){
  const tags=tagsFromFeature(feature);
  const type=feature?.geometry?.type||'';
  const polygon=/Polygon$/.test(type);
  const line=/LineString$/.test(type);
  const point=type==='Point'||type==='MultiPoint';
  const categories=[];

  const waterArea=
    polygon&&(
      tags.natural==='water'||
      truthyTag(tags.water)||
      tags.waterway==='riverbank'||
      tags.landuse==='reservoir'||
      tags.landuse==='basin'
    );
  if(waterArea)categories.push('water');
  if(line&&tags.natural==='coastline')categories.push('water');

  if(
    line&&[
      'river','stream','canal','ditch','drain'
    ].includes(String(tags.waterway||''))
  )categories.push('waterway');

  if(
    truthyTag(tags.bridge)||
    tags.man_made==='bridge'
  )categories.push('bridge');

  if(polygon&&truthyTag(tags.building))categories.push('building');

  if(
    (polygon||line)&&(
      ['forest','meadow','grass','orchard','vineyard'].includes(String(tags.landuse||''))||
      ['wood','scrub','bare_rock','scree','cliff'].includes(String(tags.natural||''))
    )
  )categories.push('landuse');

  if(
    ['line','minor_line','tower','pole'].includes(String(tags.power||''))&&
    (line||point)
  )categories.push('power');

  if(
    tags.man_made==='dam'||tags.waterway==='dam'
  )categories.push('dam');

  if(tags.barrier==='guard_rail')categories.push('barrier');

  if(
    point&&(
      truthyTag(tags.traffic_sign)||
      tags.highway==='traffic_sign'
    )
  )categories.push('sign');

  return [...new Set(categories)];
}

function visitCoordinates(value,visit){
  if(!Array.isArray(value))return;
  if(
    value.length>=2&&
    Number.isFinite(Number(value[0]))&&
    Number.isFinite(Number(value[1]))
  ){
    visit(Number(value[0]),Number(value[1]));
    return;
  }
  for(const child of value)visitCoordinates(child,visit);
}

export function geometryBounds(geometry){
  let minLon=Infinity;
  let minLat=Infinity;
  let maxLon=-Infinity;
  let maxLat=-Infinity;
  visitCoordinates(geometry?.coordinates,(lon,lat)=>{
    minLon=Math.min(minLon,lon);
    minLat=Math.min(minLat,lat);
    maxLon=Math.max(maxLon,lon);
    maxLat=Math.max(maxLat,lat);
  });
  if(!Number.isFinite(minLon))return null;
  return {minLon,minLat,maxLon,maxLat};
}

function compactTags(tags){
  const compact={};
  for(const [key,value] of Object.entries(tags||{})){
    if(!KEEP_TAGS.has(key))continue;
    if(value===undefined||value===null||value==='')continue;
    compact[key]=value;
  }
  return compact;
}

function featureId(feature,lineNumber){
  const props=tagsFromFeature(feature);
  return String(
    feature?.id??
    props['@id']??
    props.osm_id??
    props.id??
    `anon-${lineNumber}`
  );
}

export function compactFeature(feature,categories,lineNumber=0){
  return {
    v:1,
    id:featureId(feature,lineNumber),
    k:categories,
    g:feature.geometry,
    t:compactTags(tagsFromFeature(feature))
  };
}

function tileRangeForBounds(bounds,tileSizeMeters){
  const min=lonLatToMercator(bounds.minLon,bounds.minLat);
  const max=lonLatToMercator(bounds.maxLon,bounds.maxLat);
  return {
    minX:Math.floor(Math.min(min.x,max.x)/tileSizeMeters),
    maxX:Math.floor(Math.max(min.x,max.x)/tileSizeMeters),
    minY:Math.floor(Math.min(min.y,max.y)/tileSizeMeters),
    maxY:Math.floor(Math.max(min.y,max.y)/tileSizeMeters)
  };
}

function tilePath(outDir,x,y){
  return path.join(outDir,'tiles',String(x),`${y}.jsonl`);
}

function createBufferedTileWriter(outDir,{maxOpenBuffers=128,maxBufferedBytes=4*1024*1024}={}){
  const buffers=new Map();
  const tileCounts=new Map();
  let bufferedBytes=0;

  function flush(key){
    const entry=buffers.get(key);
    if(!entry)return;
    buffers.delete(key);
    bufferedBytes-=entry.bytes;
    fs.mkdirSync(path.dirname(entry.file),{recursive:true});
    fs.appendFileSync(entry.file,entry.lines.join(''),'utf8');
  }

  function flushOldest(){
    const first=buffers.keys().next().value;
    if(first!==undefined)flush(first);
  }

  function write(x,y,record){
    const key=`${x}/${y}`;
    let entry=buffers.get(key);
    if(!entry){
      while(buffers.size>=maxOpenBuffers)flushOldest();
      entry={
        file:tilePath(outDir,x,y),
        lines:[],
        bytes:0
      };
    }else{
      buffers.delete(key);
    }

    const line=JSON.stringify(record)+'\n';
    entry.lines.push(line);
    entry.bytes+=Buffer.byteLength(line);
    bufferedBytes+=Buffer.byteLength(line);
    buffers.set(key,entry);
    tileCounts.set(key,(tileCounts.get(key)||0)+1);

    while(bufferedBytes>maxBufferedBytes&&buffers.size>1)flushOldest();
  }

  function close(){
    for(const key of [...buffers.keys()])flush(key);
  }

  return {write,close,tileCounts};
}

async function prepareOutput(outDir,overwrite){
  if(fs.existsSync(outDir)){
    if(!overwrite){
      throw new Error(`Output directory already exists: ${outDir}. Use --overwrite.`);
    }
    await fsp.rm(outDir,{recursive:true,force:true});
  }
  await fsp.mkdir(outDir,{recursive:true});
}

function updateTileBounds(current,x,y){
  if(!current)return {minX:x,maxX:x,minY:y,maxY:y};
  current.minX=Math.min(current.minX,x);
  current.maxX=Math.max(current.maxX,x);
  current.minY=Math.min(current.minY,y);
  current.maxY=Math.max(current.maxY,y);
  return current;
}

export async function buildFromGeoJSONSeq({
  input,
  outDir,
  tileSizeMeters=DEFAULT_TILE_SIZE_M,
  maxTilesPerFeature=DEFAULT_MAX_TILES_PER_FEATURE,
  overwrite=false,
  source='geojsonseq'
}){
  if(!input)throw new Error('GeoJSONSeq input path is required');
  if(!outDir)throw new Error('Output directory is required');
  if(!(tileSizeMeters>0))throw new Error('tileSizeMeters must be > 0');

  await prepareOutput(outDir,overwrite);
  const writer=createBufferedTileWriter(outDir);
  const categoryCounts={};
  let inputFeatures=0;
  let emittedFeatures=0;
  let tileRecords=0;
  let oversizeFeatures=0;
  let tileBounds=null;

  const oversizeFile=path.join(outDir,'oversize.jsonl');
  const stream=fs.createReadStream(input,{encoding:'utf8'});
  const rl=readline.createInterface({input:stream,crlfDelay:Infinity});
  let lineNumber=0;

  for await (let rawLine of rl){
    lineNumber++;
    rawLine=rawLine.replace(/^\x1e/,'').trim();
    if(!rawLine)continue;

    let feature;
    try{
      feature=JSON.parse(rawLine);
    }catch(error){
      throw new Error(`Invalid GeoJSONSeq at line ${lineNumber}: ${error.message}`);
    }
    if(feature?.type!=='Feature'||!feature.geometry)continue;
    inputFeatures++;

    const categories=classifyFeature(feature);
    if(!categories.length)continue;

    const bounds=geometryBounds(feature.geometry);
    if(!bounds)continue;
    const record=compactFeature(feature,categories,lineNumber);
    const range=tileRangeForBounds(bounds,tileSizeMeters);
    const count=(range.maxX-range.minX+1)*(range.maxY-range.minY+1);

    emittedFeatures++;
    for(const category of categories){
      categoryCounts[category]=(categoryCounts[category]||0)+1;
    }

    if(count>maxTilesPerFeature){
      oversizeFeatures++;
      fs.appendFileSync(
        oversizeFile,
        JSON.stringify({...record,b:bounds})+'\n',
        'utf8'
      );
      continue;
    }

    for(let x=range.minX;x<=range.maxX;x++){
      for(let y=range.minY;y<=range.maxY;y++){
        writer.write(x,y,record);
        tileRecords++;
        tileBounds=updateTileBounds(tileBounds,x,y);
      }
    }
  }

  writer.close();

  const tileIndex=[...writer.tileCounts.entries()]
    .map(([key,records])=>{
      const [x,y]=key.split('/').map(Number);
      return {x,y,records};
    })
    .sort((a,b)=>a.x-b.x||a.y-b.y);
  await fsp.writeFile(
    path.join(outDir,'tiles-index.jsonl'),
    tileIndex.map(item=>JSON.stringify(item)).join('\n')+(tileIndex.length?'\n':''),
    'utf8'
  );

  const manifest={
    version:1,
    format:'world-drive-osm-jsonl-v1',
    generatedAt:new Date().toISOString(),
    source,
    attribution:'© OpenStreetMap contributors, ODbL 1.0; extract source: Geofabrik',
    geometry:'WGS84 lon/lat GeoJSON',
    tileIndexProjection:'Web Mercator EPSG:3857',
    tileSizeMeters,
    maxTilesPerFeature,
    inputFeatures,
    emittedFeatures,
    oversizeFeatures,
    tileRecords,
    tileCount:tileIndex.length,
    tileBounds,
    categoryCounts,
    files:{
      tiles:'tiles/{x}/{y}.jsonl',
      index:'tiles-index.jsonl',
      oversize:oversizeFeatures?'oversize.jsonl':null
    }
  };
  await fsp.writeFile(
    path.join(outDir,'manifest.json'),
    JSON.stringify(manifest,null,2)+'\n',
    'utf8'
  );
  return manifest;
}

function runCommand(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',windowsHide:true});
    child.once('error',reject);
    child.once('exit',(code,signal)=>{
      if(code===0)return resolve();
      reject(new Error(`${command} exited with ${code??signal}`));
    });
  });
}

async function ensureOsmium(){
  try{
    await runCommand('osmium',['--version']);
  }catch(error){
    throw new Error(
      `osmium-tool is required for --pbf mode. Ensure "osmium --version" works first. ${error.message}`
    );
  }
}

export async function buildFromPbf({
  pbf,
  outDir,
  tileSizeMeters=DEFAULT_TILE_SIZE_M,
  maxTilesPerFeature=DEFAULT_MAX_TILES_PER_FEATURE,
  overwrite=false,
  keepTemp=false,
  region='unknown'
}){
  await ensureOsmium();
  const tempDir=path.join(
    path.dirname(outDir),
    `.worlddrive-geofabrik-${Date.now()}`
  );
  await fsp.mkdir(tempDir,{recursive:true});
  const filtered=path.join(tempDir,'filtered.osm.pbf');
  const seq=path.join(tempDir,'filtered.geojsonseq');

  try{
    await runCommand('osmium',[
      'tags-filter','--expressions',FILTER_FILE,pbf,'-o',filtered,'-O'
    ]);
    await runCommand('osmium',[
      'export',filtered,'-f','geojsonseq','-o',seq,'-O'
    ]);
    return await buildFromGeoJSONSeq({
      input:seq,
      outDir,
      tileSizeMeters,
      maxTilesPerFeature,
      overwrite,
      source:`Geofabrik ${region} PBF: ${path.basename(pbf)}`
    });
  }finally{
    if(!keepTemp)await fsp.rm(tempDir,{recursive:true,force:true});
  }
}

function parseArgs(argv){
  const result={overwrite:false,keepTemp:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--overwrite'){result.overwrite=true;continue;}
    if(arg==='--keep-temp'){result.keepTemp=true;continue;}
    if(!arg.startsWith('--'))continue;
    const key=arg.slice(2);
    const value=argv[++i];
    if(value===undefined)throw new Error(`Missing value for ${arg}`);
    result[key]=value;
  }
  return result;
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.pbf&&!args.geojsonseq){
    console.log(`World Drive Geofabrik tile builder\n\n`+
      `PBF mode:\n  node tools/geofabrik/build-world-tiles.mjs --pbf <file.osm.pbf> --region quebec --out public/world-data/osm/quebec --overwrite\n\n`+
      `GeoJSONSeq mode:\n  node tools/geofabrik/build-world-tiles.mjs --geojsonseq <file.geojsonseq> --out <dir> --overwrite\n`);
    return;
  }

  const outDir=path.resolve(args.out||'public/world-data/osm/quebec');
  const tileSizeMeters=Math.round(Number(args['tile-km']||16)*1000);
  const maxTilesPerFeature=Math.max(1,Number(args['max-tiles-per-feature']||DEFAULT_MAX_TILES_PER_FEATURE));

  const manifest=args.pbf
    ? await buildFromPbf({
        pbf:path.resolve(args.pbf),
        outDir,
        tileSizeMeters,
        maxTilesPerFeature,
        overwrite:args.overwrite,
        keepTemp:args.keepTemp,
        region:args.region||'unknown'
      })
    : await buildFromGeoJSONSeq({
        input:path.resolve(args.geojsonseq),
        outDir,
        tileSizeMeters,
        maxTilesPerFeature,
        overwrite:args.overwrite,
        source:args.region||path.basename(args.geojsonseq)
      });

  console.log(JSON.stringify(manifest,null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const HYDRO_CATEGORIES=new Set(['water','waterway','bridge','dam']);

function humanBytes(bytes){
  const units=['B','KB','MB','GB','TB'];
  let value=Number(bytes)||0;
  let index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${value.toFixed(index>=3?2:1)} ${units[index]}`;
}

function matchesHydro(record){
  const categories=Array.isArray(record?.k)?record.k:[];
  return categories.some(category=>HYDRO_CATEGORIES.has(category));
}

async function readTileIndex(dir){
  const source=await fsp.readFile(path.join(dir,'tiles-index.jsonl'),'utf8');
  return source
    .split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .map(line=>JSON.parse(line));
}

async function filterTile(file){
  const input=fs.createReadStream(file,{encoding:'utf8'});
  const rl=readline.createInterface({input,crlfDelay:Infinity});
  const lines=[];
  let records=0;
  let parseErrors=0;
  let uncompressedBytes=0;
  for await (const raw of rl){
    if(!raw)continue;
    let record;
    try{record=JSON.parse(raw);}catch{parseErrors++;continue;}
    if(!matchesHydro(record))continue;
    const line=raw+'\n';
    lines.push(line);
    records++;
    uncompressedBytes+=Buffer.byteLength(line);
  }
  return {lines,records,parseErrors,uncompressedBytes};
}

async function writeGzip(file,lines,level){
  await fsp.mkdir(path.dirname(file),{recursive:true});
  const compressed=gzipSync(Buffer.from(lines.join(''),'utf8'),{level});
  await fsp.writeFile(file,compressed);
  return compressed.byteLength;
}

async function packOversize(inputDir,outDir,level){
  const source=path.join(inputDir,'oversize.jsonl');
  if(!fs.existsSync(source))return {records:0,uncompressedBytes:0,compressedBytes:0,file:null};
  const filtered=await filterTile(source);
  if(!filtered.records)return {records:0,uncompressedBytes:0,compressedBytes:0,file:null};
  const target=path.join(outDir,'oversize.jsonl.gz');
  const compressedBytes=await writeGzip(target,filtered.lines,level);
  return {
    records:filtered.records,
    uncompressedBytes:filtered.uncompressedBytes,
    compressedBytes,
    parseErrors:filtered.parseErrors,
    file:'oversize.jsonl.gz'
  };
}

export async function packHydroGzipV2({
  inputDir,
  outDir,
  overwrite=false,
  gzipLevel=9,
  progressEvery=250,
  log=console.log
}={}){
  if(!inputDir)throw new Error('inputDir is required');
  if(!outDir)throw new Error('outDir is required');
  if(fs.existsSync(outDir)){
    if(!overwrite)throw new Error(`Output directory already exists: ${outDir}. Use --overwrite.`);
    await fsp.rm(outDir,{recursive:true,force:true});
  }
  await fsp.mkdir(outDir,{recursive:true});

  const manifest=JSON.parse(await fsp.readFile(path.join(inputDir,'manifest.json'),'utf8'));
  const index=await readTileIndex(inputDir);
  const outIndex=[];
  let records=0;
  let tileCount=0;
  let uncompressedBytes=0;
  let compressedBytes=0;
  let parseErrors=0;
  let maxTileCompressedBytes=0;
  let maxTileUncompressedBytes=0;
  let maxTile=null;
  const started=Date.now();

  for(let i=0;i<index.length;i++){
    const tile=index[i];
    const source=path.join(inputDir,'tiles',String(tile.x),`${tile.y}.jsonl`);
    const filtered=await filterTile(source);
    parseErrors+=filtered.parseErrors;
    if(filtered.records){
      const target=path.join(outDir,'tiles',String(tile.x),`${tile.y}.jsonl.gz`);
      const tileCompressedBytes=await writeGzip(target,filtered.lines,gzipLevel);
      records+=filtered.records;
      tileCount++;
      uncompressedBytes+=filtered.uncompressedBytes;
      compressedBytes+=tileCompressedBytes;
      outIndex.push({
        x:tile.x,
        y:tile.y,
        records:filtered.records,
        bytes:filtered.uncompressedBytes,
        gzipBytes:tileCompressedBytes
      });
      if(tileCompressedBytes>maxTileCompressedBytes){
        maxTileCompressedBytes=tileCompressedBytes;
        maxTileUncompressedBytes=filtered.uncompressedBytes;
        maxTile={x:tile.x,y:tile.y};
      }
    }

    if(progressEvery>0&&((i+1)%progressEvery===0||i===index.length-1)){
      const pct=((i+1)/index.length*100).toFixed(1);
      const elapsed=((Date.now()-started)/1000).toFixed(0);
      log(`Hydro pack ${i+1}/${index.length} tiles (${pct}%) · ${humanBytes(compressedBytes)} gzip · ${elapsed}s`);
    }
  }

  await fsp.writeFile(
    path.join(outDir,'tiles-index.jsonl'),
    outIndex.map(item=>JSON.stringify(item)).join('\n')+(outIndex.length?'\n':''),
    'utf8'
  );

  const oversize=await packOversize(inputDir,outDir,gzipLevel);
  const totalCompressedBytes=compressedBytes+oversize.compressedBytes;
  const totalUncompressedBytes=uncompressedBytes+oversize.uncompressedBytes;
  const result={
    version:2,
    format:'world-drive-osm-hydro-jsonl-gzip-v2',
    generatedAt:new Date().toISOString(),
    sourceFormat:manifest.format,
    sourceGeneratedAt:manifest.generatedAt,
    sourceTileSizeMeters:manifest.tileSizeMeters,
    source:manifest.source,
    attribution:manifest.attribution,
    categories:[...HYDRO_CATEGORIES],
    compression:'gzip',
    gzipLevel,
    tileCount,
    records,
    parseErrors,
    uncompressedBytes:totalUncompressedBytes,
    uncompressedSize:humanBytes(totalUncompressedBytes),
    compressedBytes:totalCompressedBytes,
    compressedSize:humanBytes(totalCompressedBytes),
    compressionRatio:totalUncompressedBytes?Number((totalCompressedBytes/totalUncompressedBytes).toFixed(4)):0,
    reductionPercent:totalUncompressedBytes?Number(((1-totalCompressedBytes/totalUncompressedBytes)*100).toFixed(2)):0,
    averageTileCompressedBytes:tileCount?Math.round(compressedBytes/tileCount):0,
    averageTileCompressedSize:tileCount?humanBytes(compressedBytes/tileCount):'0 B',
    maxTileCompressedBytes,
    maxTileCompressedSize:humanBytes(maxTileCompressedBytes),
    maxTileUncompressedBytes,
    maxTileUncompressedSize:humanBytes(maxTileUncompressedBytes),
    maxTile,
    oversize,
    files:{
      tiles:'tiles/{x}/{y}.jsonl.gz',
      index:'tiles-index.jsonl',
      oversize:oversize.file
    }
  };

  await fsp.writeFile(path.join(outDir,'manifest.json'),JSON.stringify(result,null,2)+'\n','utf8');
  return result;
}

export function decodeHydroTileGzip(buffer){
  return gunzipSync(buffer).toString('utf8');
}

function parseArgs(argv){
  const out={overwrite:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--overwrite'){out.overwrite=true;continue;}
    if(!arg.startsWith('--'))continue;
    const key=arg.slice(2);
    const value=argv[++i];
    if(value===undefined)throw new Error(`Missing value for ${arg}`);
    out[key]=value;
  }
  return out;
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.in||!args.out){
    console.log('Usage: node tools/geofabrik/pack-hydro-gzip-v2.mjs --in public/world-data/osm/quebec --out public/world-data/osm-v2/quebec/hydro --overwrite');
    return;
  }
  const result=await packHydroGzipV2({
    inputDir:args.in,
    outDir:args.out,
    overwrite:args.overwrite,
    gzipLevel:Number(args['gzip-level']||9),
    progressEvery:Number(args['progress-every']||250)
  });
  console.log(JSON.stringify(result,null,2));
}

const isDirect=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isDirect){
  main().catch(error=>{
    console.error(error?.stack||error);
    process.exitCode=1;
  });
}

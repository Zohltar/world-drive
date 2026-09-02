import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

const GROUPS={
  hydro:new Set(['water','waterway','bridge','dam']),
  scenery:new Set(['building','landuse','power','barrier']),
  signs:new Set(['sign'])
};

function humanBytes(bytes){
  const units=['B','KB','MB','GB','TB'];
  let value=Number(bytes)||0;
  let index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${value.toFixed(index>=3?2:1)} ${units[index]}`;
}

function makeGroupStats(){
  return {
    bytes:0,
    records:0,
    tilesWithData:0,
    maxTileBytes:0,
    maxTile:null
  };
}

function matchesGroup(categories,set){
  return categories.some(category=>set.has(category));
}

async function readTileIndex(dir){
  const file=path.join(dir,'tiles-index.jsonl');
  const source=await fsp.readFile(file,'utf8');
  return source
    .split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .map(line=>JSON.parse(line));
}

async function profileTile(file,groups){
  const perGroup={};
  for(const key of Object.keys(groups))perGroup[key]={bytes:0,records:0};
  let rawBytes=0;
  let rawRecords=0;
  let parseErrors=0;

  const input=fs.createReadStream(file,{encoding:'utf8'});
  const rl=readline.createInterface({input,crlfDelay:Infinity});
  for await (const raw of rl){
    if(!raw)continue;
    const lineBytes=Buffer.byteLength(raw)+1;
    rawBytes+=lineBytes;
    rawRecords++;
    let record;
    try{record=JSON.parse(raw);}catch{parseErrors++;continue;}
    const categories=Array.isArray(record?.k)?record.k:[];
    for(const [name,set] of Object.entries(groups)){
      if(!matchesGroup(categories,set))continue;
      perGroup[name].bytes+=lineBytes;
      perGroup[name].records++;
    }
  }
  return {rawBytes,rawRecords,parseErrors,perGroup};
}

export async function profileWorldTiles({dir,progressEvery=250,log=console.log}={}){
  if(!dir)throw new Error('dir is required');
  const manifest=JSON.parse(await fsp.readFile(path.join(dir,'manifest.json'),'utf8'));
  const index=await readTileIndex(dir);
  const stats={
    dir:path.resolve(dir),
    tileCount:index.length,
    rawBytes:0,
    rawRecords:0,
    parseErrors:0,
    groups:Object.fromEntries(Object.keys(GROUPS).map(name=>[name,makeGroupStats()]))
  };

  const started=Date.now();
  for(let i=0;i<index.length;i++){
    const tile=index[i];
    const file=path.join(dir,'tiles',String(tile.x),`${tile.y}.jsonl`);
    const result=await profileTile(file,GROUPS);
    stats.rawBytes+=result.rawBytes;
    stats.rawRecords+=result.rawRecords;
    stats.parseErrors+=result.parseErrors;

    for(const [name,tileStats] of Object.entries(result.perGroup)){
      const group=stats.groups[name];
      group.bytes+=tileStats.bytes;
      group.records+=tileStats.records;
      if(tileStats.bytes>0)group.tilesWithData++;
      if(tileStats.bytes>group.maxTileBytes){
        group.maxTileBytes=tileStats.bytes;
        group.maxTile={x:tile.x,y:tile.y};
      }
    }

    if(progressEvery>0&&((i+1)%progressEvery===0||i===index.length-1)){
      const elapsed=(Date.now()-started)/1000;
      const pct=((i+1)/index.length*100).toFixed(1);
      log(`Profile ${i+1}/${index.length} tiles (${pct}%) · ${humanBytes(stats.rawBytes)} scanned · ${elapsed.toFixed(0)}s`);
    }
  }

  const groups={};
  for(const [name,group] of Object.entries(stats.groups)){
    groups[name]={
      bytes:group.bytes,
      size:humanBytes(group.bytes),
      shareOfRawPercent:stats.rawBytes?Number((group.bytes/stats.rawBytes*100).toFixed(2)):0,
      records:group.records,
      tilesWithData:group.tilesWithData,
      averageTileBytes:group.tilesWithData?Math.round(group.bytes/group.tilesWithData):0,
      averageTileSize:group.tilesWithData?humanBytes(group.bytes/group.tilesWithData):'0 B',
      maxTileBytes:group.maxTileBytes,
      maxTileSize:humanBytes(group.maxTileBytes),
      maxTile:group.maxTile
    };
  }

  return {
    format:'world-drive-osm-profile-v1',
    sourceFormat:manifest.format,
    sourceGeneratedAt:manifest.generatedAt,
    sourceTileSizeMeters:manifest.tileSizeMeters,
    tileCount:stats.tileCount,
    rawRecords:stats.rawRecords,
    rawBytes:stats.rawBytes,
    rawSize:humanBytes(stats.rawBytes),
    parseErrors:stats.parseErrors,
    groups
  };
}

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--quiet'){out.quiet=true;continue;}
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
  if(!args.dir){
    console.log('Usage: node tools/geofabrik/profile-world-tiles.mjs --dir public/world-data/osm/quebec');
    return;
  }
  const result=await profileWorldTiles({
    dir:args.dir,
    progressEvery:Number(args['progress-every']||250),
    log:args.quiet?()=>{}:console.log
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

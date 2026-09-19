// Synthetic one-degree pages: a LONG artificial route, not geographic evidence.
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const encode=v=>Buffer.from(JSON.stringify(v));
const sha=v=>createHash('sha256').update(v).digest('hex');
export function batchFixture(count=150){
  const source={id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',sha256:'a'.repeat(64)};
  const records=[null,{id:1,biome:1,name:'MOCK tropical',realm:'Test'},{id:2,biome:6,name:'MOCK boreal',realm:'Test'}];
  const catalogSha256=sha(encode(records)),revision='synthetic-r5';
  const files=new Map(),groups=new Map(),coordinates=[],tiles=[];
  for(let i=0;i<count;i++){
    const x=1800+i,y=900;
    const tile={schema:'world-drive-biome-refinement-v1',crs:'EPSG:4326',sourceSha256:source.sha256,catalogSha256,
      tileX:x,tileY:y,divisions:16,cellSlots:Array(256).fill(i%2+1),cellReasons:Array(256).fill(0),
      cellPolygonOffsets:Array(257).fill(0),polygonSlots:[],polygonRingOffsets:[0],ringPointOffsets:[0],coordinates:[]};
    const bytes=encode(tile),gzip=gzipSync(bytes),file=`${x}-${y}.json.gz`;
    files.set(file,gzip);const d={x,y,file,sha256:sha(bytes),jsonBytes:bytes.length,gzipBytes:gzip.length};tiles.push(d);
    const bx=Math.floor(x/10),key=`${bx}-90`;if(!groups.has(key))groups.set(key,{x:bx,y:90,tiles:[]});groups.get(key).tiles.push(d);
    coordinates.push([(x+.5)/10-180,-.05]);
  }
  const batches=[];
  for(const [key,v] of groups){const body=encode({schema:'world-drive-biome-page-v1',revision,sourceSha256:source.sha256,catalogSha256,...v});
    const file=`batch-${key}.json`;files.set(file,body);batches.push({x:v.x,y:v.y,file,sha256:sha(body),jsonBytes:body.length});}
  return {directory:{schema:'world-drive-biome-directory-v1',revision,source,records,catalogSha256,batches},files,coordinates,tiles};
}
export function writeFixture(path){const f=batchFixture();mkdirSync(path,{recursive:true});for(const [file,b] of f.files)writeFileSync(join(path,file),b);
  writeFileSync(join(path,'directory.json'),encode(f.directory));writeFileSync(join(path,'route.json'),encode(f.coordinates));return f;}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href&&process.argv[2])writeFixture(process.argv[2]);

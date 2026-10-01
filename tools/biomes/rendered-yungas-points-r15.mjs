// Offline original-R4 exact candidates around EVERY captured Yungas route vertex.
// This is source-oracle sampling, not live tree placement or a rendered drive.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createForestCandidateAdapter} from '../../src/scenery/biomes/forest-candidate-adapter.js';
const raw=gunzipSync(fs.readFileSync(new URL('../../qa/fixtures/biomes/yungas-r15/response.json.gz',import.meta.url)),{maxOutputLength:2097152});
if(createHash('sha256').update(raw).digest('hex')!=='511da11b27aa74d91237f45f13c84170a57fb0653107a7d7ffc6374e2c871ddb')throw new Error('Pinned Yungas response changed');
const route=JSON.parse(raw).routes[0].geometry.coordinates;
const origin={lat:-16.29911,lon:-67.81891},a=createForestCandidateAdapter({origin,routeId:'r15-source-oracle'}),keys=new Map();
for(let index=0;index<route.length;index++){
  const [lon,lat]=route[index],x=(lon-origin.lon)*Math.PI/180*6378137*Math.cos(origin.lat*Math.PI/180),z=-(lat-origin.lat)*Math.PI/180*6378137;
  const cx=Math.floor(x/480),cz=Math.floor(z/480);
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    const key=`${cx+dx}:${cz+dz}`;if(!keys.has(key))keys.set(key,index);
  }
}
for(const key of [...keys.keys()].sort()){
  const [cx,cz]=key.split(':').map(Number),points=[];
  for(let i=0;i<1744;i++){const p=a.point(cx,cz,i);points.push([p.lon,p.lat]);}
  console.log(JSON.stringify({key,cx,cz,anchorIndex:keys.get(key),points}));
}
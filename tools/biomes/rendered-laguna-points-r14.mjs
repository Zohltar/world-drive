// Offline original-R4 exact candidates around EVERY authored circuit vertex.
// This is source-oracle sampling, not live tree placement or a rendered lap.
import fs from 'node:fs';
import {createForestCandidateAdapter} from '../../src/scenery/biomes/forest-candidate-adapter.js';
const route=JSON.parse(fs.readFileSync(new URL('../../src/routing/circuits/laguna-seca.json',import.meta.url),'utf8')).coordinates;
const origin={lat:route[0][1],lon:route[0][0]},a=createForestCandidateAdapter({origin,routeId:'r14-source-oracle'}),keys=new Map();
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
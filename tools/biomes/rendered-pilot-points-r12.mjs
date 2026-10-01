// Bounded offline oracle samples only. Not imported by the game.
import fs from 'node:fs';
import {createForestCandidateAdapter} from '../../src/scenery/biomes/forest-candidate-adapter.js';
const raw=JSON.parse(fs.readFileSync(new URL('../../src/routing/circuits/nordschleife.json',import.meta.url),'utf8'));
const route=raw.coordinates??raw,origin={lat:route[0][1],lon:route[0][0]};
const a=createForestCandidateAdapter({origin,routeId:'r12-source-oracle'}),keys=new Map();
for(const index of [0,267,534,801]){
 const [lon,lat]=route[index],x=(lon-origin.lon)*Math.PI/180*6378137*Math.cos(origin.lat*Math.PI/180),z=-(lat-origin.lat)*Math.PI/180*6378137;
 const cx=Math.floor(x/480),cz=Math.floor(z/480);
 for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const key=`${cx+dx}:${cz+dz}`;if(!keys.has(key))keys.set(key,index);}
}
for(const key of [...keys.keys()].sort()){
 const [cx,cz]=key.split(':').map(Number),points=[];
 for(let i=0;i<1744;i++){const p=a.point(cx,cz,i);points.push([p.lon,p.lat]);}
 console.log(JSON.stringify({key,cx,cz,anchorIndex:keys.get(key),points}));
}

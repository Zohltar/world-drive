// Original bounded, deterministic authoring buffers. No model approval or game hook.
import {FOREST_STREAMING_POLICY as FOREST} from '../../src/forest-streaming-policy.js';
const freeze = Object.freeze;
export const VEGETATION_PROTOTYPES = freeze([
  {id:'preview-conifer', label:'Conifère — référence R4', triangles:68, kind:'tree', palettes:['boreal-conifer','temperate-conifer']},
  {id:'preview-temperate', label:'Feuillu tempéré', triangles:60, kind:'tree', palettes:['temperate-broadleaf-mixed']},
  {id:'preview-tropical', label:'Feuillu tropical', triangles:60, kind:'tree', palettes:['tropical-moist-broadleaf','tropical-dry-broadleaf']},
  {id:'preview-woodland', label:'Arbre de milieu sec', triangles:44, kind:'tree', palettes:['mediterranean-woodland-scrub']},
  {id:'preview-shrub', label:'Arbuste', triangles:36, kind:'shrub', palettes:['temperate-grassland','desert-xeric-scrub']},
  {id:'preview-rock', label:'Roche', triangles:16, kind:'rock', palettes:['tundra','rock-ice','montane-grassland']},
].map(p => freeze({...p, palettes:freeze(p.palettes), review:'authoring-prototype', species:null,
  productionApproved:false, placementAuthority:false})));
const crowns = {
  'preview-temperate': [[-.14,.68,0,.25,.27,.23,8],[.17,.70,.05,.26,.30,.24,8],[0,.80,-.08,.25,.28,.24,8]],
  'preview-tropical': [[-.17,.86,0,.34,.14,.29,8],[.21,.90,.03,.36,.16,.30,8],[.01,1.00,-.08,.31,.17,.28,8]],
  'preview-woodland': [[-.20,.80,0,.38,.13,.31,8],[.23,.82,.03,.40,.14,.32,8]],
  'preview-shrub': [[-.12,.14,0,.21,.14,.20,6],[.15,.18,.05,.23,.18,.19,6],[0,.22,-.08,.19,.20,.20,6]],
  'preview-rock': [[0,.18,0,.32,.18,.24,8]],
};
/** Pure authoring buffers, no THREE required. All arrays are newly owned. */
export function buildVegetationPrototypeData(id) {
  if (!Object.hasOwn(crowns,id)) throw new TypeError('Unknown original prototype');
  const positions=[], normals=[], colors=[];
  const scale=Math.max(.1,Number(FOREST.treeScale)||1);
  function face(a,b,c,color,centre) {
    const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n);
    if (!Number.isFinite(length)||length<1e-10) throw new Error('Degenerate prototype face');
    const dot=n.reduce((sum,x,i)=>sum+x*((a[i]+b[i]+c[i])/3-centre[i]),0);
    if(dot<0){[b,c]=[c,b];n=n.map(x=>-x);}
    n=n.map(x=>x/length);
    for(const p of [a,b,c]){positions.push(...p.map(x=>x*scale));normals.push(...n);colors.push(...color);}
  }
  if(id!=='preview-shrub'&&id!=='preview-rock') {
    const h=id==='preview-tropical'?.92:id==='preview-woodland'?.77:.67;
    const r=id==='preview-tropical'?.035:.027;
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
      const p=[Math.cos(a)*r,0,Math.sin(a)*r],q=[Math.cos(b)*r,0,Math.sin(b)*r];
      const s=[p[0]+.02,h,p[2]],t=[q[0]+.02,h,q[2]],centre=[.01,h/2,0];
      face(p,s,q,[.102,.051,.021],centre);face(q,s,t,[.102,.051,.021],centre);
    }
  }
  crowns[id].forEach(([x,y,z,rx,ry,rz,sides],layer)=>{
    const ring=[];
    for(let i=0;i<sides;i++) {
      const angle=2*Math.PI*i/sides+layer*.71;
      const wobble=1+.065*Math.sin(i*2.31+layer*1.71);
      ring.push([x+rx*wobble*Math.cos(angle),y+ry*.08*Math.sin(i*1.37),z+rz*wobble*Math.sin(angle)]);
    }
    const top=[x+.023*rx,y+ry,z-.07*rz],bottom=[x-.03*rx,y-ry,z+.04*rz];
    // Explicit linear RGB vertex colors, no texture or color-space dependency.
    const c=id==='preview-rock'?[.20,.19,.17]:id==='preview-woodland'?[.13,.19,.065]
      :id==='preview-shrub'?[.16,.22,.07]:id==='preview-tropical'?[.045,.18,.073]:[.085,.21,.065];
    const upper=c.map(v=>v*(1+.055*layer)),lower=upper.map(v=>v*.78);
    for(let i=0;i<sides;i++) {
      const next=(i+1)%sides;
      face(ring[i],top,ring[next],upper,[x,y,z]);
      face(ring[i],ring[next],bottom,lower,[x,y,z]);
    }
  });
  if(id!=='preview-shrub'&&id!=='preview-rock'){
    let top=0;for(let i=1;i<positions.length;i+=3)top=Math.max(top,positions[i]);
    const factor=.9792*scale/top;
    for(let i=0;i<positions.length;i++)positions[i]*=factor;
  }
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),
    colors:new Float32Array(colors),triangles:positions.length/9};
}

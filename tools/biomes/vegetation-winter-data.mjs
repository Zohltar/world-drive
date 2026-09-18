/** R11W authoring-only winter silhouettes. No runtime, season clock or placement. */
import {FOREST_STREAMING_POLICY as FOREST} from '../../src/forest-streaming-policy.js';
import {buildVegetationPrototypeData} from './vegetation-prototype-data.mjs';

const freeze = Object.freeze;
export const WINTER_VARIANTS = freeze([
  {id:'preview-conifer-winter',baseId:'preview-conifer',label:'Conifère enneigé',kind:'tree',triangles:180,leafless:false},
  {id:'preview-temperate-winter',baseId:'preview-temperate',label:'Feuillu dénudé et enneigé',kind:'tree',triangles:114,leafless:true},
  {id:'preview-shrub-winter',baseId:'preview-shrub',label:'Arbuste dormant et enneigé',kind:'shrub',triangles:72,leafless:true},
  {id:'preview-rock-winter',baseId:'preview-rock',label:'Roche enneigée et givrée',kind:'rock',triangles:32,leafless:false}
].map(d=>freeze({...d,season:'winter',snow:true,species:null,review:'winter-style-pending',
  productionApproved:false,placementAuthority:false})));
const summerIds=freeze(['preview-conifer','preview-temperate','preview-tropical','preview-woodland','preview-shrub','preview-rock']);
/** Exact variant mapping, not an ecological/hemisphere/weather decision. */
export function seasonalVegetationId(baseId,season) {
  if(typeof baseId!=='string'||!summerIds.includes(baseId))throw new TypeError('Unknown base vegetation');
  if(season==='summer')return baseId;
  if(season!=='winter')throw new TypeError('Season must be summer or winter');
  return WINTER_VARIANTS.find(d=>d.baseId===baseId)?.id??null;
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(!Number.isFinite(n)||n<1e-10)throw new Error('Degenerate winter geometry');return mul(a,1/n);};
const bark=freeze([.10,.070,.047]),twig=freeze([.13,.098,.072]);
const snow=freeze([.78,.86,.94]),ice=freeze([.27,.39,.45]);

function writer() {
  const positions=[],normals=[],colors=[],surfaces=[];
  return {
    face(a,b,c,color,surface='wood') {
      const n=unit(cross(sub(b,a),sub(c,a)));
      for(const p of [a,b,c]){positions.push(...p);normals.push(...n);colors.push(...color);}
      surfaces.push(surface);
    },
    result(){return {positions:new Float32Array(positions),normals:new Float32Array(normals),
      colors:new Float32Array(colors),surfaces:freeze(surfaces),triangles:surfaces.length};}
  };
}
/** Tapered triangular branches: a flat upper face receives snow; sides stay wood.
 * The snow is baked into the same mesh/material, with a slight raised upper ridge.
 * Roots/intersections hide open ends. Thin tips have no separate snow geometry.
 */
function branch(w,a,b,r0,r1,snowy,scale) {
  const axis=unit(sub(b,a));
  let up=sub([0,1,0],mul(axis,axis[1]));
  if(Math.hypot(...up)<.05)up=sub([1,0,0],mul(axis,axis[0]));
  up=unit(up);const side=unit(cross(axis,up));
  const ring=(p,r,end)=>Array.from({length:3},(_,i)=>{
    const angle=Math.PI/3+i*Math.PI*2/3;
    let v=add(p,add(mul(up,r*Math.cos(angle)),mul(side,r*Math.sin(angle))));
    // Both upper vertices are lifted, forming a small snow ridge on a snowy limb.
    if(snowy&&i!==1)v=add(v,mul(up,(end?.002:.006)));
    if(!end&&a[1]===0)v[1]=0;
    return mul(v,scale);
  });
  const lo=ring(a,r0,false),hi=ring(b,r1,true);
  for(let i=0;i<3;i++) {
    const j=(i+1)%3,white=snowy&&i===2;
    const color=white?snow:(snowy?bark:twig),surface=white?'snow':'wood';
    // The basis orientation makes this winding outward.
    w.face(lo[i],lo[j],hi[i],color,surface);w.face(lo[j],hi[j],hi[i],color,surface);
  }
}

function bareTemperate(w,scale) {
  const A=[0,0,0],B=[.012,.36,0],C=[.018,.64,.018],D=[-.025,.85,-.025];
  const limbs=[
    [A,B,.030,.026,false],[B,C,.026,.019,false],[C,D,.019,.010,false],[D,[.02,.9792,-.055],.010,.002,false],
    [B,[-.19,.55,.06],.025,.016,true],[[-.19,.55,.06],[-.32,.74,.09],.016,.007,true],
    [[-.32,.74,.09],[-.39,.88,.06],.007,.0015,false],[[-.19,.55,.06],[-.08,.75,.12],.009,.002,false],
    [[.015,.49,.009],[.21,.67,.02],.022,.012,true],[[.21,.67,.02],[.34,.87,.055],.012,.003,true],
    [[.21,.67,.02],[.13,.83,-.04],.007,.0015,false],
    [[.018,.60,.016],[.09,.73,-.21],.018,.009,true],[[.09,.73,-.21],[.15,.90,-.30],.009,.002,false],
    [[.09,.73,-.21],[-.045,.88,-.24],.007,.0015,false],
    [[.018,.62,.01],[-.14,.78,.21],.016,.008,true],[[-.14,.78,.21],[-.20,.92,.28],.008,.002,false],
    [[-.14,.78,.21],[-.005,.90,.28],.006,.0015,false],
    [[-.015,.77,-.007],[.14,.88,.15],.012,.006,true],[[.14,.88,.15],[.19,.968,.20],.006,.0015,false]
  ];
  for(const [a,b,r0,r1,s] of limbs)branch(w,a,b,r0,r1,s,scale);
}
function bareShrub(w,scale) {
  const limbs=[
    [[0,0,0],[-.12,.18,.02],.024,.014,false],
    [[-.12,.18,.02],[-.26,.31,.06],.014,.005,true],
    [[-.26,.31,.06],[-.29,.38,.04],.005,.0015,false],
    [[-.12,.18,.02],[-.08,.36,.12],.010,.002,true],
    [[.04,0,.02],[.16,.21,.07],.022,.012,false],
    [[.16,.21,.07],[.28,.34,.05],.012,.003,true],
    [[.16,.21,.07],[.11,.42,.10],.009,.002,false],
    [[.16,.21,.07],[.22,.29,.19],.008,.002,false],
    [[-.01,0,-.04],[.01,.23,-.12],.020,.011,false],
    [[.01,.23,-.12],[-.12,.38,-.19],.011,.002,true],
    [[.01,.23,-.12],[.13,.39,-.20],.009,.002,false],
    [[.01,.23,-.12],[.01,.42,-.10],.007,.0015,false]
  ];
  for(const [a,b,r0,r1,s] of limbs)branch(w,a,b,r0,r1,s,scale);
}

function splitSnowFace(w,a,tip,c,cut,color,baseSurface) {
  const u=mix(a,tip,cut),v=mix(c,tip,cut);
  w.face(a,u,c,color,baseSurface);w.face(c,u,v,color,baseSurface);
  w.face(u,tip,v,snow,'snow');
}
/** Caller supplies arrays from an owned original R4 conifer; never modified. */
function snowyConifer(w,reference) {
  const p=reference?.positions,c=reference?.colors,index=reference?.indices;
  if(!(p instanceof Float32Array)||!(c instanceof Float32Array)||p.length!==c.length||
    !index||index.length!==204||p.length!==225||p.some(v=>!Number.isFinite(v))||
    c.some(v=>!Number.isFinite(v))||Array.from(index).some(v=>!Number.isInteger(v)||v<0||v>=75))
    throw new TypeError('Exact 68-triangle R4 conifer arrays required');
  const point=k=>Array.from(p.subarray(k*3,k*3+3));
  for(let i=0;i<index.length;i+=3) {
    const a=point(index[i]),tip=point(index[i+1]),b=point(index[i+2]);
    if(i<36){w.face(a,tip,b,bark,'wood');continue;}
    const color=Array.from(c.subarray(index[i]*3,index[i]*3+3)).map((v,k)=>v*[.80,.90,1.08][k]);
    // Splitting coplanar faces keeps the certified silhouette and avoids overlay z-fighting.
    splitSnowFace(w,a,tip,b,.28+.045*Math.sin(i*.37),color,'needles');
  }
}
function snowyRock(w) {
  const base=buildVegetationPrototypeData('preview-rock');
  for(let i=0;i<base.positions.length;i+=9) {
    const points=[0,3,6].map(n=>Array.from(base.positions.subarray(i+n,i+n+3)));
    if(base.normals[i+1]>.2) {
      const top=points.reduce((best,p,j)=>p[1]>points[best][1]?j:best,0);
      splitSnowFace(w,points[(top+2)%3],points[top],points[(top+1)%3],.24,
        (i/9)%4===0?ice:[.20,.21,.22],(i/9)%4===0?'ice':'stone');
    } else w.face(...points,(i/9)%5===0?ice:[.17,.18,.19],(i/9)%5===0?'ice':'stone');
  }
}
/** All data is newly owned, deterministic and bounded; no THREE required. */
export function buildWinterVegetationData(id,reference=null) {
  const descriptor=WINTER_VARIANTS.find(d=>d.id===id);
  if(!descriptor)throw new TypeError('Unknown winter vegetation');
  const scale=Math.max(.1,Number(FOREST.treeScale)||1),w=writer();
  if(id==='preview-conifer-winter')snowyConifer(w,reference);
  else if(id==='preview-temperate-winter')bareTemperate(w,scale);
  else if(id==='preview-shrub-winter')bareShrub(w,scale);
  else snowyRock(w);
  const result=w.result();
  if(descriptor.leafless){
    let top=0;for(let i=1;i<result.positions.length;i+=3)top=Math.max(top,result.positions[i]);
    const factor=(descriptor.kind==='tree'?.9792:.42)*scale/top;
    for(let i=0;i<result.positions.length;i++)result.positions[i]*=factor;
  }
  if(result.triangles!==descriptor.triangles)throw new Error('Winter triangle contract drift');
  return result;
}

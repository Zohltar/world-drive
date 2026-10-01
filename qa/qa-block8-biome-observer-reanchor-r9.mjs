import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBiomeObserverPlan} from '../src/scenery/biomes/route-observer-plan.js';

// R9 full-game evidence: the old 480 m hint fallback accepted a point 355 m
// from its hinted segment after a legitimate <960 m UI jump on Laguna Seca.
// Use the original circuit vertices and a fresh full scan as the reference.
const results=[];
function circuit(key){
  const data=JSON.parse(readFileSync(new URL(`../src/routing/circuits/${key}.json`,import.meta.url),'utf8'));
  const origin={lon:data.coordinates[0][0],lat:data.coordinates[0][1]};
  const route=data.coordinates.map(([lon,lat])=>({lon,lat}));
  const xy=route.map(p=>({x:(p.lon-origin.lon)*Math.PI/180*6378137*Math.cos(origin.lat*Math.PI/180),
    z:-(p.lat-origin.lat)*Math.PI/180*6378137}));
  const cumulative=[0];
  for(let i=1;i<xy.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(xy[i].x-xy[i-1].x,xy[i].z-xy[i-1].z));
  function pointAt(fraction){
    const distance=cumulative.at(-1)*fraction;
    let i=0;while(i<xy.length-2&&cumulative[i+1]<distance)i++;
    const length=cumulative[i+1]-cumulative[i],t=length?(distance-cumulative[i])/length:0;
    return {x:xy[i].x+(xy[i+1].x-xy[i].x)*t,z:xy[i].z+(xy[i+1].z-xy[i].z)*t};
  }
  const make=()=>createBiomeObserverPlan(route,{origin,routeId:`r9-${key}`});
  return {make,pointAt,points:xy.length};
}
const laguna=circuit('laguna-seca');
{
  const plan=laguna.make();
  plan.locate(-33.77510811096586,9.179836002990564);
  const x=-586.2197606300127,z=124.44945497491703;
  const actual=plan.locate(x,z),expected=laguna.make().locate(x,z);
  assert.ok(Math.abs(actual.progress-expected.progress)<1e-7,
    `short Laguna UI jump retained old segment: progress ${actual.progress}, expected ${expected.progress}`);
  assert.ok(actual.distanceFromRoute<1,'the actual car position is on the authored track');
  assert.equal(actual.teleport,false,'do not lower the 960 m Worker-reset threshold');
  results.push({name:'original short Laguna jump',progress:actual.progress,distance:actual.distanceFromRoute});
}
for(const key of ['laguna-seca','nordschleife']){
  const {make,pointAt,points}=circuit(key),plan=make();
  for(const fraction of [.01,.25,.75,.02,.9,.5,.01]){
    const p=pointAt(fraction),actual=plan.locate(p.x,p.z),expected=make().locate(p.x,p.z);
    assert.ok(Math.abs(actual.progress-expected.progress)<1e-7,`${key} ${fraction}: stale segment`);
    assert.ok(actual.distanceFromRoute<1e-7);
    assert.ok(actual.tests<=points-1+65,'scan remains bounded by one route plus hint');
  }
  results.push({name:`original ${key} forward/reverse UI jumps`,positions:7});
}
{
  // A short displacement can still leave a very densely sampled hint window.
  const origin={lon:0,lat:0},scale=Math.PI/180*6378137;
  const route=Array.from({length:1001},(_,i)=>({lon:i/scale,lat:0}));
  const make=()=>createBiomeObserverPlan(route,{origin,routeId:'dense-r9'});
  const p=make();p.locate(0,0);
  const missed=p.locate(100,0);assert.ok(Math.abs(missed.progress-make().locate(100,0).progress)<1e-7);
  assert.ok(missed.distanceFromRoute<1e-9);assert.ok(missed.tests<=1065);assert.equal(missed.teleport,false);
  const nearby=p.locate(105,0);assert.ok(nearby.tests<=65,'legitimate local motion keeps bounded hint');
  const reverse=p.locate(101,0);assert.equal(reverse.direction,-1);assert.ok(reverse.tests<=65);
  const unchanged=p.locate(101,0);assert.ok(unchanged.tests<=65);
  const large=p.locate(5000,0);assert.equal(large.teleport,true);
  results.push({name:'dense short displacement fallback and retained local/reverse/teleport behavior',checks:6});
}
console.log(JSON.stringify({status:'PASS',groups:results.length,results,
  scope:'Diagnostic progress only; no authoritative routing, physics or forest scheduler changes'},null,2));

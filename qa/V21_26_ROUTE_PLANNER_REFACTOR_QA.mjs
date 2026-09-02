import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const plannerPath=path.join(root,'src','route-planner-ui.js');

assert.ok(fs.existsSync(plannerPath),'src/route-planner-ui.js missing — run tools/refactor-main-route-planner-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const planner=fs.readFileSync(plannerPath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}

syntaxCheck(mainPath);
syntaxCheck(plannerPath);

assert.match(main,/import \{ createRoutePlannerUi \} from '\.\/route-planner-ui\.js';/,'main.js missing route planner import');
assert.match(main,/const routePlannerUi=createRoutePlannerUi\(\{[\s\S]*?documentRef:document,[\s\S]*?YUNGAS_WAYPOINTS[\s\S]*?\}\);/,'main.js missing route planner facade initialization');

for(const pattern of [
  /let selectedStart=\{\.\.\.MANIC2\};/,
  /function setSelectedPlace\(which,p\)/,
  /async function searchPlaceField\(which\)/,
  /\$\('buildRouteBtn'\)\.addEventListener\('click',async\(\)=>\{/,
  /function applyPreset\(start,end,waypoints=\[\]\)/,
  /button\.id='presetYungasBtn'/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns route planner behavior: ${pattern}`);
  assert.match(planner,pattern,`route-planner-ui.js missing extracted behavior: ${pattern}`);
}

assert.match(planner,/export function createRoutePlannerUi\s*\(\{/,'createRoutePlannerUi export missing');
assert.match(planner,/documentRef\.querySelector\('#plannerBox \.presetGrid'\)/,'planner must use injected document reference');
assert.match(planner,/resolveWaypointLines\(\$\('waypointsInput'\)\.value\)/,'waypoint resolution missing');
assert.match(planner,/createRequestedRoute\(\s*\{\.\.\.selectedStart\},\s*\{\.\.\.selectedEnd\},\s*waypoints\s*\)/s,'custom route creation missing');

const plannerInit=main.indexOf('const routePlannerUi=createRoutePlannerUi({');
const geocoderInit=main.indexOf('const geocodingService=createGeocodingService({');
const sectionHeadInit=main.indexOf("document.querySelectorAll('.sectionHead').forEach");
assert.ok(plannerInit>geocoderInit,'route planner initialized before geocoding service');
assert.ok(sectionHeadInit<0||plannerInit<sectionHeadInit,'route planner facade moved after unrelated section UI');

const mainLines=main.split('\n').length;
assert.ok(mainLines<4400,`main.js still unexpectedly large after route planner extraction: ${mainLines} lines`);

const { createRoutePlannerUi }=await import(`${pathToFileURL(plannerPath).href}?qa=${Date.now()}`);
assert.equal(typeof createRoutePlannerUi,'function','createRoutePlannerUi export is not a function');

const elements=new Map();

class FakeClassList{
  constructor(){this.values=new Set();}
  add(value){this.values.add(value);}
  remove(value){this.values.delete(value);}
  contains(value){return this.values.has(value);}
}

class FakeElement{
  constructor(id=''){
    this.id=id;
    this.value='';
    this.textContent='';
    this.innerHTML='';
    this.disabled=false;
    this.title='';
    this.type='';
    this.className='';
    this.classList=new FakeClassList();
    this.children=[];
    this.listeners=new Map();
    this.onclick=null;
  }
  addEventListener(type,handler){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(handler);
  }
  appendChild(child){
    this.children.push(child);
    if(child.id)elements.set(child.id,child);
    return child;
  }
  async dispatch(type,event={}){
    for(const handler of this.listeners.get(type)||[]){
      await handler(event);
    }
    if(type==='click'&&typeof this.onclick==='function'){
      await this.onclick(event);
    }
  }
}

for(const id of [
  'startPlace','endPlace','startLat','startLon','endLat','endLon',
  'startSearchResults','endSearchResults','findStartBtn','findEndBtn',
  'buildRouteBtn','waypointsInput','preset389Btn','preset169Btn','preset132Btn'
]){
  elements.set(id,new FakeElement(id));
}

elements.get('findStartBtn').textContent='Chercher';
elements.get('findEndBtn').textContent='Chercher';
elements.get('buildRouteBtn').textContent='Créer le trajet';

const presetGrid=new FakeElement('presetGrid');
const documentRef={
  createElement:()=>new FakeElement(),
  querySelector:selector=>selector==='#plannerBox .presetGrid'?presetGrid:null
};
const $=id=>elements.get(id)||null;

const MANIC2={lat:49.10,lon:-68.40,name:'Manic-2'};
const MANIC5={lat:50.65,lon:-68.73,name:'Manic-5'};
const R169_START={lat:48.40,lon:-71.20,name:'R169 start'};
const R169_END={lat:47.55,lon:-72.20,name:'R169 end'};
const R132_START={lat:46.10,lon:-73.10,name:'R132 start'};
const R132_END={lat:48.10,lon:-65.90,name:'R132 end'};
const YUNGAS_START={lat:-16.29,lon:-67.83,name:'Chuspipata'};
const YUNGAS_END={lat:-16.20,lon:-67.73,name:'Yolosa'};
const YUNGAS_WAYPOINTS=[{lat:-16.25,lon:-67.79,name:'Yungas waypoint'}];

const routeCalls=[];
const searchCalls=[];
const toastCalls=[];
const geocodingService={
  async search(query,limit){
    searchCalls.push({query,limit});
    return [{lat:45.50,lon:-73.56,name:`${query} result`}];
  },
  async resolveWaypointLines(value){
    return value.trim()
      ?[{lat:45.75,lon:-73.20,name:'Resolved waypoint'}]
      :[];
  }
};
const createRequestedRoute=(start,end,waypoints=[])=>{
  routeCalls.push({start,end,waypoints});
  return Promise.resolve(true);
};
const toast=message=>toastCalls.push(message);

const ui=createRoutePlannerUi({
  $,
  documentRef,
  geocodingService,
  createRequestedRoute,
  toast,
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS
});

assert.ok(elements.has('presetYungasBtn'),'Yungas preset button was not created');
assert.equal(typeof ui.applyPreset,'function','applyPreset facade missing');
assert.deepEqual(ui.getSelection(),{start:MANIC2,end:MANIC5},'initial planner selection changed');

ui.applyPreset(R169_START,R169_END);
assert.equal(elements.get('startPlace').value,R169_START.name,'preset start field not updated');
assert.equal(elements.get('endPlace').value,R169_END.name,'preset end field not updated');
assert.equal(routeCalls.length,1,'preset did not create a route');
assert.deepEqual(routeCalls[0].start,R169_START,'preset route start changed');
assert.deepEqual(routeCalls[0].end,R169_END,'preset route end changed');

elements.get('startPlace').value='Montréal';
await ui.searchPlaceField('start');
assert.equal(searchCalls.at(-1).query,'Montréal','place search query changed');
assert.equal(searchCalls.at(-1).limit,5,'interactive place search limit changed');
assert.equal(elements.get('startSearchResults').children.length,1,'search result rendering failed');
assert.ok(elements.get('startSearchResults').classList.contains('open'),'search result panel was not opened');

// Simulate custom route creation after editing both text fields without selecting a result.
elements.get('startPlace').value='Custom start';
elements.get('endPlace').value='Custom end';
elements.get('waypointsInput').value='Waypoint text';
await elements.get('buildRouteBtn').dispatch('click');
assert.equal(elements.get('buildRouteBtn').disabled,false,'build route button remained disabled');
assert.equal(elements.get('buildRouteBtn').textContent,'Créer le trajet','build route button label was not restored');
assert.equal(routeCalls.length,2,'custom route action did not call createRequestedRoute');
assert.equal(routeCalls[1].start.name,'Custom start','custom start resolution changed');
assert.equal(routeCalls[1].end.name,'Custom end','custom end resolution changed');
assert.equal(routeCalls[1].waypoints.length,1,'waypoint resolution result was not forwarded');

await elements.get('presetYungasBtn').dispatch('click');
assert.equal(routeCalls.length,3,'Yungas preset did not create a route');
assert.deepEqual(routeCalls[2].waypoints,YUNGAS_WAYPOINTS,'Yungas waypoint list changed');

// Driving ownership has evolved independently since V21.26. Keep this historical
// regression focused on its actual route-planner contract instead of chaining a
// stale driving source-layout assertion into an unrelated UI/routing test.
console.log('V21.26 ROUTE PLANNER REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; route-planner-ui.js: ${planner.split('\n').length} lines`);
console.log('place search, waypoint routing, presets and Yungas injection verified');

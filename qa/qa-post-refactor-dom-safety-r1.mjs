import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoutePlannerUi} from '../src/ui/route-planner-ui.js';
import {createStartupUi} from '../src/ui/startup-ui.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n');
const routeSource=read('src/ui/route-planner-ui.js');
const startupSource=read('src/ui/startup-ui.js');
const menuSource=read('src/ui/v21-menu.js');

assert.doesNotMatch(routeSource,/\.innerHTML\s*=/,'route planner must not use innerHTML for search results');
assert.doesNotMatch(routeSource,/insertAdjacentHTML\s*\(/,'route planner must not use insertAdjacentHTML');
assert.match(routeSource,/box\.replaceChildren\(\)/,'route planner must clear search results without HTML parsing');
assert.match(routeSource,/b\.textContent=String\(p\.name\|\|''\)/,'remote place names must render through textContent');
assert.match(routeSource,/meta\.textContent=`\$\{p\.lat\.toFixed\(5\)\}, \$\{p\.lon\.toFixed\(5\)\}`/,'search metadata must render through textContent');

const startupTemplates=[...startupSource.matchAll(/\.innerHTML\s*=\s*`([\s\S]*?)`/g)].map(match=>match[1]);
assert.ok(startupTemplates.length>=2,'startup UI should retain controlled static markup skeletons');
for(const template of startupTemplates){
  assert.ok(!template.includes('${'),'startup innerHTML templates must remain static and controlled');
}
assert.ok(startupSource.includes("versionText.textContent=`${versionLabel} · initialisation du monde`;"),'startup version label must render as text');
assert.ok(startupSource.includes("routeSummary.textContent=`${route.start||'Départ'} → ${route.end||'Arrivée'}`;"),'route summary must render as text');
assert.ok(startupSource.includes("vehicleName.textContent=String(vehicle.name||'');"),'vehicle name must render as text');
assert.ok(startupSource.includes("vehicleDescription.textContent=String(vehicle.description||'');"),'vehicle description must render as text');
assert.match(menuSource,/v21MenuEl\.innerHTML=`/,'controlled V21 menu markup must remain allowed');

class FakeClassList{
  constructor(){this.values=new Set();}
  add(...names){for(const name of names)this.values.add(name);}
  remove(...names){for(const name of names)this.values.delete(name);}
  toggle(name,force){
    const enabled=force===undefined?!this.values.has(name):!!force;
    if(enabled)this.values.add(name);else this.values.delete(name);
    return enabled;
  }
}

class FakeNode{
  constructor(documentRef,tagName='div'){
    this.documentRef=documentRef;
    this.tagName=String(tagName).toUpperCase();
    this.children=[];
    this.classList=new FakeClassList();
    this.dataset={};
    this.listeners=new Map();
    this.value='';
    this.disabled=false;
    this.className='';
    this.type='';
    this.title='';
    this._id='';
    this._textContent='';
    this._innerHTML='';
  }
  set id(value){
    this._id=String(value||'');
    if(this._id)this.documentRef?.register(this);
  }
  get id(){return this._id;}
  set textContent(value){
    this._textContent=value===null||value===undefined?'':String(value);
    this.children=[];
  }
  get textContent(){
    return this._textContent+this.children.map(child=>child.textContent).join('');
  }
  set innerHTML(value){
    const html=String(value||'');
    assert.ok(!html.includes('__TAINT_'),'untrusted test payload reached innerHTML');
    this._innerHTML=html;
    this.children=[];
    for(const match of html.matchAll(/id="([^"]+)"/g)){
      if(!this.documentRef.getElementById(match[1])){
        const node=new FakeNode(this.documentRef,'div');
        node.id=match[1];
      }
    }
  }
  get innerHTML(){return this._innerHTML;}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=[...children];this._textContent='';}
  addEventListener(type,listener){this.listeners.set(type,listener);}
  querySelector(){return null;}
  querySelectorAll(){return this.children;}
}

class FakeDocument{
  constructor(){
    this.nodes=new Map();
    this.body=new FakeNode(this,'body');
    this.title='';
    this.presetGrid=new FakeNode(this,'div');
  }
  register(node){this.nodes.set(node.id,node);}
  createElement(tagName){return new FakeNode(this,tagName);}
  getElementById(id){return this.nodes.get(id)||null;}
  querySelector(selector){return selector==='#plannerBox .presetGrid'?this.presetGrid:null;}
}

function registerIds(documentRef,ids){
  for(const id of ids){
    const node=documentRef.createElement('div');
    node.id=id;
  }
}

const routeDocument=new FakeDocument();
registerIds(routeDocument,[
  'startPlace','endPlace','startLat','startLon','endLat','endLon',
  'startSearchResults','endSearchResults','findStartBtn','findEndBtn',
  'buildRouteBtn','waypointsInput','preset389Btn','preset169Btn','preset132Btn'
]);
const routeUi=createRoutePlannerUi({
  $:id=>routeDocument.getElementById(id),
  documentRef:routeDocument,
  geocodingService:{search:async()=>[],resolveWaypointLines:async()=>[]},
  createRequestedRoute:()=>{},
  toast:()=>{},
  MANIC2:{lat:49,lon:-68,name:'Manic-2'},
  MANIC5:{lat:50,lon:-69,name:'Manic-5'},
  R169_START:{lat:48,lon:-71,name:'R169 start'},
  R169_END:{lat:49,lon:-72,name:'R169 end'},
  R132_START:{lat:47,lon:-70,name:'R132 start'},
  R132_END:{lat:48,lon:-69,name:'R132 end'},
  YUNGAS_START:{lat:-16.2,lon:-67.7,name:'Yungas start'},
  YUNGAS_END:{lat:-16.1,lon:-67.6,name:'Yungas end'},
  YUNGAS_WAYPOINTS:[]
});
const maliciousPlace='__TAINT_PLACE__<img src=x onerror=globalThis.pwned=true>';
routeUi.renderSearchResults('start',[{name:maliciousPlace,lat:45.5017,lon:-73.5673}]);
const searchBox=routeDocument.getElementById('startSearchResults');
assert.equal(searchBox.children.length,1,'search result button missing');
const searchButton=searchBox.children[0];
assert.equal(searchButton.tagName,'BUTTON','search result contract changed');
assert.ok(searchButton.textContent.includes(maliciousPlace),'remote place label was not preserved literally');
assert.equal(searchButton.children.length,1,'search metadata span contract changed');
assert.equal(searchButton.children[0].tagName,'SPAN','search metadata must remain a span');
assert.equal(searchButton.children[0].className,'searchMeta','search metadata CSS contract changed');

const startupDocument=new FakeDocument();
const loading=startupDocument.createElement('div');
const originalDocument=globalThis.document;
globalThis.document=startupDocument;
try{
  const routeStart='__TAINT_START__<img src=x onerror=1>';
  const routeEnd='__TAINT_END__</b><script>1</script>';
  const vehicleName='__TAINT_VEHICLE__<svg onload=1>';
  const vehicleDescription='__TAINT_DESCRIPTION__</span><img src=x>';
  const startupUi=createStartupUi({
    versionLabel:'__TAINT_VERSION__<img src=x>',
    title:'World Drive QA',
    loading,
    getRouteSummary:()=>({start:routeStart,end:routeEnd}),
    getVehicles:()=>[{id:'qa-car',name:vehicleName,description:vehicleDescription}],
    onStartVehicle:async()=>true
  });
  startupUi.install();
  startupUi.showVehicleChooser();

  assert.equal(startupDocument.getElementById('v21StartupVersion').textContent,'__TAINT_VERSION__<img src=x> · initialisation du monde','version label changed or entered HTML parsing');
  assert.equal(startupDocument.getElementById('v21RouteReadySummary').textContent,`${routeStart} → ${routeEnd}`,'route summary changed or entered HTML parsing');
  const grid=startupDocument.getElementById('v21VehicleGrid');
  assert.equal(grid.children.length,1,'vehicle choice missing');
  const vehicleButton=grid.children[0];
  assert.equal(vehicleButton.className,'v21VehicleChoice','vehicle choice CSS contract changed');
  assert.equal(vehicleButton.children[0].tagName,'B','vehicle name element contract changed');
  assert.equal(vehicleButton.children[0].textContent,vehicleName,'vehicle name must remain literal text');
  assert.equal(vehicleButton.children[1].tagName,'SPAN','vehicle description element contract changed');
  assert.equal(vehicleButton.children[1].textContent,vehicleDescription,'vehicle description must remain literal text');
  assert.equal(typeof startupUi.setProgress,'function','startup UI contract lost setProgress');
  assert.equal(typeof startupUi.showVehicleChooser,'function','startup UI contract lost showVehicleChooser');
}finally{
  globalThis.document=originalDocument;
}

console.log('POST-REFACTOR DOM SAFETY R1 QA: PASS',{
  remotePlaceText:true,
  routeSummaryText:true,
  vehicleMetadataText:true,
  staticControlledMarkup:true,
  uiContractsPreserved:true
});

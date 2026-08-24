import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','autopilot-controller.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const controllerImport="import { createAutopilotController } from './autopilot-controller.js';";

if(main.includes(controllerImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 AUTOPILOT REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(controllerImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 autopilot refactor: partial previous application detected. Restore the generated files before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 autopilot refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 autopilot refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

function replaceBlock(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  if(start<0||end<0||end<=start){
    throw new Error(`V21.26 autopilot refactor: ${label} markers not found. No files changed.`);
  }
  if(source.indexOf(startMarker,start+startMarker.length)>=0){
    throw new Error(`V21.26 autopilot refactor: ${label} start marker is ambiguous. No files changed.`);
  }
  return source.slice(0,start)+replacement+source.slice(end);
}

for(const required of [
  "function setAutopilot(enabled,message=''){",
  'function toggleAutopilot(){ setAutopilot(!autopilot); }',
  'function autopilotControl(dt,nr){',
  'function toggleAssist(){',
  'function updateSpeedLimitModeUI(){',
  'function toggleRoadSpeedLimits(){',
  "toast(message||'Pilote automatique activé')",
  'const curveSpeed=maxCurve>.00015?Math.sqrt(3.0/maxCurve):MAX;',
  'obeyRoadSpeedLimits &&',
  "toast('Assistance '+(assist?'activée':'désactivée'))"
]){
  if(!main.includes(required)){
    throw new Error(`V21.26 autopilot refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const moduleSource=`export function createAutopilotController({
  state,
  $,
  nearestRoute,
  recenterIfNeeded,
  routePointAtCum,
  angleDelta,
  queueSettingsSave,
  syncRuntimeControls,
  toast,
}){
  function setAutopilot(enabled,message=''){
    state.autopilot=enabled;
    $('autopilotBtn').textContent='Pilote auto: '+(state.autopilot?'ON':'OFF');
    $('autopilotStatus').textContent=state.autopilot?'ACTIF':'OFF';

    if(state.autopilot){
      state.assist=true;
      state.appSettings.assist=true;
      queueSettingsSave();
      $('assist').textContent='Assist: ON';
      state.roadContact=true;

      const n=nearestRoute(state.absX,state.absZ);
      if(n&&n.d>6){
        state.absX=n.px;
        state.absZ=n.pz;
        recenterIfNeeded(state.absX,state.absZ,true);
      }

      toast(message||'Pilote automatique activé');
    }else{
      state.autopilotSteer=0;
      toast(message||'Pilote automatique désactivé');
    }

    syncRuntimeControls();
  }

  function toggleAutopilot(){
    setAutopilot(!state.autopilot);
  }

  function autopilotControl(dt,nr){
    if(!state.autopilot||!nr||!state.routeLength){
      return {throttle:0,turn:0,hand:false};
    }

    const kmh=Math.abs(state.speed)*3.6;
    const lookAhead=Math.max(18,Math.min(105,18+kmh*.40));
    const target=routePointAtCum(
      Math.min(state.routeLength-1,nr.cum+lookAhead)
    );

    const desired=Math.atan2(target.x-state.absX,target.z-state.absZ);
    const headingErr=angleDelta(desired,state.heading);

    const lateralSign=Math.sign(
      Math.sin(nr.angle)*(state.absZ-nr.pz)-
      Math.cos(nr.angle)*(state.absX-nr.px)
    )||0;
    const crossTrack=Math.min(1,nr.d/5)*lateralSign;
    const steerRequest=Math.max(
      -1,
      Math.min(1,headingErr*1.55-crossTrack*.34)
    );

    state.autopilotSteer+=(steerRequest-state.autopilotSteer)*(
      1-Math.exp(-dt*(kmh>130?4.5:6.5))
    );

    let maxCurve=0;
    const step=Math.max(12,lookAhead*.45);
    let prev=routePointAtCum(
      Math.min(state.routeLength-1,nr.cum+step)
    );

    for(let d=step*2;d<=lookAhead*2.6;d+=step){
      const q=routePointAtCum(
        Math.min(state.routeLength-1,nr.cum+d)
      );
      const ds=Math.max(5,q.cum-prev.cum);
      maxCurve=Math.max(
        maxCurve,
        Math.abs(angleDelta(q.angle,prev.angle))/ds
      );
      prev=q;
    }

    const curveSpeed=maxCurve>.00015
      ?Math.sqrt(3.0/maxCurve)
      :state.maxSpeedMps;

    const roadLimit=(
      state.obeyRoadSpeedLimits&&
      state.activeRoadMeta.maxspeed
    )
      ?state.activeRoadMeta.maxspeed/3.6
      :state.maxSpeedMps;

    let targetSpeed=Math.min(
      state.maxSpeedMps,
      roadLimit,
      Math.max(7.5,curveSpeed)
    );

    const remaining=state.routeLength-nr.cum;
    if(remaining<120){
      targetSpeed=Math.min(
        targetSpeed,
        Math.sqrt(Math.max(0,remaining)*5.2)
      );
    }
    if(remaining<8)targetSpeed=0;

    const errorV=targetSpeed-state.speed;
    let throttle=0;
    if(errorV>1.0)throttle=Math.min(1,.30+errorV/5);
    else if(errorV>.12)throttle=Math.max(.08,errorV/1.2);
    else if(errorV<-.25)throttle=Math.max(-1,errorV/3.5);

    if(remaining<5&&Math.abs(state.speed)<.45){
      state.speed=0;
      setAutopilot(false,'Arrivée à destination');
    }

    return {
      throttle,
      turn:state.autopilotSteer,
      hand:false
    };
  }

  function toggleAssist(){
    if(state.autopilot){
      setAutopilot(false,'Pilote auto désactivé');
    }
    state.assist=!state.assist;
    state.appSettings.assist=state.assist;
    queueSettingsSave();
    $('assist').textContent='Assist: '+(state.assist?'ON':'OFF');
    syncRuntimeControls();
    toast('Assistance '+(state.assist?'activée':'désactivée'));
  }

  function updateSpeedLimitModeUI(){
    const speedLimitModeBtn=$('speedLimitModeBtn');
    if(!speedLimitModeBtn)return;

    speedLimitModeBtn.textContent=
      'Limites route: '+
      (state.obeyRoadSpeedLimits?'ON':'OFF');

    speedLimitModeBtn.classList.toggle(
      'active',
      state.obeyRoadSpeedLimits
    );

    speedLimitModeBtn.title=
      state.obeyRoadSpeedLimits
        ?'Le pilote automatique respecte les limites OSM'
        :'Le pilote automatique ignore les limites OSM';
  }

  function toggleRoadSpeedLimits(){
    state.obeyRoadSpeedLimits=!state.obeyRoadSpeedLimits;
    state.appSettings.obeyRoadSpeedLimits=state.obeyRoadSpeedLimits;
    queueSettingsSave();
    updateSpeedLimitModeUI();
    syncRuntimeControls();

    if(state.obeyRoadSpeedLimits&&state.activeRoadMeta.maxspeed){
      toast(
        \`Limites route ON · \${Math.round(state.activeRoadMeta.maxspeed)} km/h\`
      );
    }else{
      toast('Limites route '+(state.obeyRoadSpeedLimits?'ON':'OFF'));
    }
  }

  return {
    setAutopilot,
    toggleAutopilot,
    autopilotControl,
    toggleAssist,
    updateSpeedLimitModeUI,
    toggleRoadSpeedLimits
  };
}
`;

const facade=`// ---------- autopilot / assist controller facade ----------
let autopilotController=null;
function setAutopilot(...args){return autopilotController.setAutopilot(...args);}
function toggleAutopilot(...args){return autopilotController.toggleAutopilot(...args);}
function autopilotControl(...args){return autopilotController.autopilotControl(...args);}
function toggleAssist(...args){return autopilotController.toggleAssist(...args);}
function updateSpeedLimitModeUI(...args){return autopilotController.updateSpeedLimitModeUI(...args);}
function toggleRoadSpeedLimits(...args){return autopilotController.toggleRoadSpeedLimits(...args);}

const autopilotStateBridge={};
Object.defineProperties(autopilotStateBridge,{
  autopilot:{get:()=>autopilot,set:value=>{autopilot=value;}},
  autopilotSteer:{get:()=>autopilotSteer,set:value=>{autopilotSteer=value;}},
  assist:{get:()=>assist,set:value=>{assist=value;}},
  roadContact:{get:()=>roadContact,set:value=>{roadContact=value;}},
  speed:{get:()=>speed,set:value=>{speed=value;}},
  absX:{get:()=>absX,set:value=>{absX=value;}},
  absZ:{get:()=>absZ,set:value=>{absZ=value;}},
  heading:{get:()=>heading},
  routeLength:{get:()=>routeLength},
  maxSpeedMps:{get:()=>MAX},
  obeyRoadSpeedLimits:{get:()=>obeyRoadSpeedLimits,set:value=>{obeyRoadSpeedLimits=value;}},
  activeRoadMeta:{get:()=>activeRoadMeta},
  appSettings:{get:()=>appSettings}
});
autopilotController=createAutopilotController({
  state:autopilotStateBridge,
  $,
  nearestRoute,
  recenterIfNeeded,
  routePointAtCum,
  angleDelta,
  queueSettingsSave,
  syncRuntimeControls:()=>syncV21RuntimeControls(),
  toast
});

`;

main=replaceBlock(
  main,
  "function setAutopilot(enabled,message=''){",
  'const groundHeightRoadScratch={};',
  facade,
  'autopilot control block'
);

main=replaceBlock(
  main,
  'function toggleAssist(){',
  'function placeAt(frac){',
  '',
  'assist toggle block'
);

main=replaceBlock(
  main,
  'function updateSpeedLimitModeUI(){',
  'function vehicleTopSpeedKmh(){',
  '',
  'speed-limit UI block'
);

const importAnchor="import { createTransmissionController } from './transmission-controller.js';";
main=replaceOnce(
  main,
  importAnchor,
  `${importAnchor}\n${controllerImport}`,
  'transmission import anchor'
);

for(const legacy of [
  "function setAutopilot(enabled,message=''){",
  'function toggleAutopilot(){ setAutopilot(!autopilot); }',
  'function autopilotControl(dt,nr){',
  'function toggleAssist(){',
  'function updateSpeedLimitModeUI(){',
  'function toggleRoadSpeedLimits(){'
]){
  if(main.includes(legacy)){
    throw new Error(`V21.26 autopilot refactor: legacy implementation remains in main.js: ${legacy}`);
  }
}

for(const required of [
  'function setAutopilot(enabled,message=',
  'function autopilotControl(dt,nr){',
  'state.autopilotSteer',
  'state.obeyRoadSpeedLimits',
  'state.activeRoadMeta.maxspeed',
  'function toggleAssist(){',
  'function toggleRoadSpeedLimits(){'
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 autopilot refactor: generated module lost behavior: ${required}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_autopilot_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_autopilot_module_check__.mjs');
function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempModule,moduleSource,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempModule);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempModule,{force:true});
}

const outputMain=eol==='\n'?main:main.replace(/\n/g,eol);
const outputModule=eol==='\n'?moduleSource:moduleSource.replace(/\n/g,eol);
fs.writeFileSync(modulePath,outputModule,'utf8');
fs.writeFileSync(mainPath,outputMain,'utf8');

const beforeLines=raw.split(/\r?\n/).length;
const afterLines=outputMain.split(/\r?\n/).length;
const moduleLinesCount=outputModule.split(/\r?\n/).length;
console.log('V21.26 AUTOPILOT REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`autopilot-controller.js: ${moduleLinesCount} lines`);
console.log('Extracted: autopilot activation/control, assist toggle and OSM speed-limit mode with live main-state bridge.');

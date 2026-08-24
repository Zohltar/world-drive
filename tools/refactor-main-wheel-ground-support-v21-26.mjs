import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','wheel-ground-support.js');

const raw=fs.readFileSync(mainPath,'utf8');
const eol=raw.includes('\r\n')?'\r\n':'\n';
let main=raw.replace(/\r\n/g,'\n');

const moduleImport="import { createWheelGroundSupport } from './wheel-ground-support.js';";

if(main.includes(moduleImport)&&fs.existsSync(modulePath)){
  console.log('V21.26 WHEEL GROUND SUPPORT REFACTOR: already applied');
  process.exit(0);
}
if(main.includes(moduleImport)||fs.existsSync(modulePath)){
  throw new Error('V21.26 wheel ground support refactor: partial previous application detected. Restore generated files before retrying.');
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 wheel ground support refactor: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 wheel ground support refactor: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const startMarker='const groundHeightRoadScratch={};';
const endMarker='// V21.21.3 PERFORMANCE: simulation stays per-frame, but DOM/canvas telemetry does';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start<0||end<0||end<=start){
  throw new Error('V21.26 wheel ground support refactor: support block markers not found. No files changed.');
}

const legacyBlock=main.slice(start,end);
for(const required of [
  'const groundHeightRoadScratch={};',
  'const fastWheelRoadSupport={',
  'halfWidth:ROAD_WHEEL_CONTACT_HALF_WIDTH',
  'function setFastWheelRoadSupport(active,roadFrame,centerY,centerX=absX,centerZ=absZ){',
  'fastWheelRoadSupport.tanPitch=Math.tan(roadFrame.pitch||0);',
  'fastWheelRoadSupport.tanRoll=Math.tan(roadFrame.roll||0);',
  'function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){',
  'const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);',
  'return terrainAbs(absx,absz);'
]){
  if(!legacyBlock.includes(required)){
    throw new Error(`V21.26 wheel ground support refactor: expected behavior missing: ${required}. No files changed.`);
  }
}

const moduleSource=`export function createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth,
}){
  const groundHeightRoadScratch={};
  const fastWheelRoadSupport={
    active:false,
    centerX:0,
    centerZ:0,
    centerY:0,
    sinAngle:0,
    cosAngle:1,
    tanPitch:0,
    tanRoll:0,
    halfWidth:roadHalfWidth
  };

  function setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ){
    if(!active||!roadFrame||!Number.isFinite(centerY)){
      fastWheelRoadSupport.active=false;
      return;
    }

    fastWheelRoadSupport.active=true;
    fastWheelRoadSupport.centerX=centerX;
    fastWheelRoadSupport.centerZ=centerZ;
    fastWheelRoadSupport.centerY=centerY;
    fastWheelRoadSupport.sinAngle=Math.sin(roadFrame.angle||0);
    fastWheelRoadSupport.cosAngle=Math.cos(roadFrame.angle||0);
    fastWheelRoadSupport.tanPitch=Math.tan(roadFrame.pitch||0);
    fastWheelRoadSupport.tanRoll=Math.tan(roadFrame.roll||0);
  }

  function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){
    if(preferLocalRoadPlane&&fastWheelRoadSupport.active){
      const dx=absx-fastWheelRoadSupport.centerX;
      const dz=absz-fastWheelRoadSupport.centerZ;
      const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
      const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;

      if(
        Math.abs(lateral)<fastWheelRoadSupport.halfWidth&&
        Math.abs(along)<8.5
      ){
        return fastWheelRoadSupport.centerY+
          fastWheelRoadSupport.tanPitch*along+
          fastWheelRoadSupport.tanRoll*lateral;
      }
    }

    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
    if(rs&&Math.abs(rs.lateral)<roadHalfWidth)return rs.y;
    return terrainAbs(absx,absz);
  }

  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    support:fastWheelRoadSupport
  };
}
`;

const facade=`// ---------- wheel / road ground support facade ----------
const wheelGroundSupport=createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth:ROAD_WHEEL_CONTACT_HALF_WIDTH
});
function setFastWheelRoadSupport(active,roadFrame,centerY,centerX=absX,centerZ=absZ){
  return wheelGroundSupport.setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ);
}
function groundHeightForWheel(...args){
  return wheelGroundSupport.groundHeightForWheel(...args);
}

`;

main=main.slice(0,start)+facade+main.slice(end);

const importAnchor="import { createAutopilotController } from './autopilot-controller.js';";
main=replaceOnce(main,importAnchor,`${importAnchor}\n${moduleImport}`,'autopilot import anchor');

for(const forbidden of [
  'const groundHeightRoadScratch={};',
  'const fastWheelRoadSupport={',
  'fastWheelRoadSupport.tanPitch=',
  'const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);'
]){
  if(main.includes(forbidden)){
    throw new Error(`V21.26 wheel ground support refactor: legacy implementation remains in main.js: ${forbidden}`);
  }
}

for(const required of [
  'export function createWheelGroundSupport({',
  'const groundHeightRoadScratch={};',
  'const fastWheelRoadSupport={',
  'function setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ){',
  'function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){',
  'roadSurfaceAt(absx,absz,groundHeightRoadScratch)',
  'return terrainAbs(absx,absz);'
]){
  if(!moduleSource.includes(required)){
    throw new Error(`V21.26 wheel ground support refactor: generated module lost behavior: ${required}`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_wheel_support_main_check__.mjs');
const tempModule=path.join(root,'tools','__v21_26_wheel_support_module_check__.mjs');
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
console.log('V21.26 WHEEL GROUND SUPPORT REFACTOR: APPLIED');
console.log(`main.js: ${beforeLines} -> ${afterLines} lines`);
console.log(`wheel-ground-support.js: ${moduleLinesCount} lines`);
console.log('Extracted: fast local road-plane wheel support and road/terrain wheel-height fallback.');

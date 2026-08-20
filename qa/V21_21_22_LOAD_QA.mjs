import fs from 'node:fs';
const src=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=src.indexOf('function updateDrive(');
const end=src.indexOf('\nfunction ',start+1);
if(start<0)throw new Error('updateDrive() not found');
const body=src.slice(start,end>start?end:src.length);
const early=body.indexOf('const longitudinalSpeedAbs=Math.abs(speed);');
const lateral=body.indexOf('const speedAbs=Math.abs(speed);');
if(early<0||lateral<0||early>=lateral)throw new Error('speed declaration ordering invalid');
const beforeLateral=body.slice(0,lateral);
for(const scratch of ['drive','brake','handbrake']){
  const re=new RegExp(`speedAbs:longitudinalSpeedAbs\\s*\\n\\s*},dynamicsScratch\\.${scratch}\\)`);
  if(!re.test(beforeLateral))throw new Error(`safe speed wiring missing for ${scratch}`);
}
if(/airborne:airborneNow,speedAbs\s*\n\s*},dynamicsScratch\.(drive|brake)\)/.test(beforeLateral))throw new Error('bare speedAbs still used before initialization');
console.log('V21.21.22 LOAD QA: PASS');

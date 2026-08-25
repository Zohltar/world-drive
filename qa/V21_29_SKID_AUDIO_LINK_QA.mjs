import fs from 'node:fs';
function fail(message){throw new Error(message);}

const audio=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');
for(const marker of ['skidLinkedTireLevel','preSkidCue','visibleSkidCue','skidFrontLevel','skidRearLevel','tire-squeal.mp3']){
  if(!audio.includes(marker))fail(`Missing skid-linked audio marker: ${marker}`);
}
const {skidLinkedTireLevel}=await import('../src/audio.js');

const quiet=skidLinkedTireLevel({tireSquealLevel:0,wheelGripUsage:[.2,.2,.2,.2]});
const belowThreshold=skidLinkedTireLevel({tireSquealLevel:.55,wheelGripUsage:[.93,.93,.93,.93]});
const near=skidLinkedTireLevel({tireSquealLevel:.76,wheelGripUsage:[.97,.97,.97,.97]});
const light=skidLinkedTireLevel({tireSquealLevel:.7,skidFrontLevel:.18,skidRearLevel:.12});
const dark=skidLinkedTireLevel({tireSquealLevel:1,skidFrontLevel:.88,skidRearLevel:.75});

if(quiet>.01)fail(`Quiet tires should be silent, got ${quiet}`);
if(belowThreshold>.015)fail(`93% grip should remain essentially silent after threshold retune, got ${belowThreshold}`);
if(!(near>belowThreshold&&near<light))fail(`Pre-skid cue must sit between silence and visible skid: ${near}`);
if(!(dark>light))fail(`Darker skid must be louder: light=${light}, dark=${dark}`);
if(dark<.75)fail(`Deep skid should be strongly audible, got ${dark}`);

console.log('V21.31 skid/audio linkage QA passed',{quiet,belowThreshold,near,light,dark});

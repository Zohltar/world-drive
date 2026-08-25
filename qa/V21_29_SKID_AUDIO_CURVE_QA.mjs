import {skidLinkedTireLevel} from '../src/audio-v21-29-wrapper.tmp';
function fail(m){throw new Error(m);}
const pre=skidLinkedTireLevel({wheelGripUsage:[.94,.94,.94,.94],tireSquealLevel:.4});
const light=skidLinkedTireLevel({skidFrontLevel:.18,skidRearLevel:.12,tireSquealLevel:.6});
const medium=skidLinkedTireLevel({skidFrontLevel:.5,skidRearLevel:.4,tireSquealLevel:.8});
const dark=skidLinkedTireLevel({skidFrontLevel:.9,skidRearLevel:.8,tireSquealLevel:1});
if(!(pre>0&&pre<.18))fail(`pre-skid cue out of range: ${pre}`);
if(!(pre<light&&light<medium&&medium<dark))fail(`skid darkness must map monotonically to volume: ${pre},${light},${medium},${dark}`);
console.log('V21.29 skid audio curve QA passed',{pre,light,medium,dark});

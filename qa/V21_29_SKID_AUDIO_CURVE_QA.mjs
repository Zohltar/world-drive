import {skidLinkedTireLevel} from '../src/audio.js';
function fail(m){throw new Error(m);}

const quiet=skidLinkedTireLevel({wheelGripUsage:[.90,.90,.90,.90],tireSquealLevel:.3});
const pre=skidLinkedTireLevel({wheelGripUsage:[.97,.97,.97,.97],tireSquealLevel:.82});
const light=skidLinkedTireLevel({skidFrontLevel:.18,skidRearLevel:.12,tireSquealLevel:.6});
const medium=skidLinkedTireLevel({skidFrontLevel:.5,skidRearLevel:.4,tireSquealLevel:.8});
const dark=skidLinkedTireLevel({skidFrontLevel:.9,skidRearLevel:.8,tireSquealLevel:1});

if(quiet>.015)fail(`pre-skid warning arrives too early: ${quiet}`);
if(!(pre>.015&&pre<.12))fail(`near-limit pre-skid cue out of range: ${pre}`);
if(!(pre<light&&light<medium&&medium<dark))fail(`skid darkness must map monotonically to level: ${pre},${light},${medium},${dark}`);
if(medium-light<.20)fail(`visible skid levels need stronger separation: light=${light}, medium=${medium}`);
if(dark<.88)fail(`dark skid must drive near-maximum squeal: ${dark}`);

console.log('V21.29 skid audio curve QA passed',{quiet,pre,light,medium,dark});

import fs from 'node:fs';
const path='tools/apply-drift-stress-r1.mjs';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const old=`  s=replaceOnce(s,
    "    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);",
    "    const rs=sampleRoadSurface(absx,absz);",
    'reuse cached road sample');`;
const replacement=`  {
    const from="    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);";
    const at=s.lastIndexOf(from);
    if(at<0)throw new Error('Drift stress anchor missing: reuse cached road sample');
    s=s.slice(0,at)+"    const rs=sampleRoadSurface(absx,absz);"+s.slice(at+from.length);
  }`;
if(!s.includes(old))throw new Error('drift patcher fix anchor missing');
s=s.replace(old,replacement);
fs.writeFileSync(path,s);
console.log('Drift stress patcher ordering fixed');

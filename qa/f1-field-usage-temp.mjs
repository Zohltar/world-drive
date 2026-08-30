import fs from 'node:fs';
import path from 'node:path';

const fields=[
  'maxSteerHigh','steeringInputExponent','steeringGripEnvelopeFraction','yawResponseMultiplier',
  'powerOversteerGripLoss','powerOversteerYaw','aeroLaunchRetentionScale','aeroAirborneDownforceScale',
  'steeringResponseLow','steeringResponseMid','steeringResponseHigh','steeringCenterToFullTimeSec',
  'maxSteerLow','parkingSteerBoost','absEnabled','aeroDownforceClA','aeroDownforceFrontBias'
];
function walk(dir,out=[]){for(const n of fs.readdirSync(dir)){const f=path.join(dir,n);const st=fs.statSync(f);if(st.isDirectory())walk(f,out);else if(/\.js$/.test(n))out.push(f.replaceAll('\\','/'));}return out;}
const files=walk('src');
for(const field of fields){
  const hits=[];
  const re=new RegExp(`\\b${field}\\b`);
  for(const file of files){
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    lines.forEach((line,i)=>{if(re.test(line))hits.push(`${file}:${i+1}: ${line.trim()}`);});
  }
  console.log(`\n=== ${field} (${hits.length}) ===`);
  hits.forEach(x=>console.log(x));
}

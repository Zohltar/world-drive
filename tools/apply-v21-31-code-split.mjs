import fs from 'node:fs';

const path='src/main.js';
let text=fs.readFileSync(path,'utf8');
const modules=['countach','id4','wrx','civic','sonata','f1','i3'];
let changed=0;
for(const name of modules){
  const from=`from './${name}-glb.js'`;
  const to=`from './vehicle-glb-entries.js'`;
  if(text.includes(from)){
    text=text.replaceAll(from,to);
    changed++;
  }
}
if(changed){
  fs.writeFileSync(path,text);
  console.log(`V21.31 passenger code split applied: ${changed} static imports redirected`);
}else if(modules.every(name=>!text.includes(`from './${name}-glb.js'`))&&text.includes("from './vehicle-glb-entries.js'")){
  console.log('V21.31 passenger code split already applied');
}else{
  throw new Error('Passenger GLB import layout not recognized');
}

'use strict';

const {app,BrowserWindow}=require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('use-angle','swiftshader');

const url=process.env.M415_URL||'http://127.0.0.1:5187/qa/m415-render.html';

async function main(){
  const win=new BrowserWindow({show:false,width:640,height:360,webPreferences:{contextIsolation:true,nodeIntegration:false,offscreen:true}});
  win.webContents.on('console-message',(_event,level,message)=>process.stdout.write(`[renderer:${level}] ${message}\n`));
  await win.loadURL(url);
  const started=Date.now();
  while(Date.now()-started<45000){
    const result=await win.webContents.executeJavaScript('globalThis.__M415_RESULT__||null',true);
    if(result){
      console.log('M4.15 RESULT',JSON.stringify(result,null,2));
      try{win.destroy();}catch{}
      app.exit(result.ok?0:1);return;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  console.error('M4.15 timed out waiting for integrated renderer result');
  try{win.destroy();}catch{}
  app.exit(1);
}

app.whenReady().then(main).catch(error=>{console.error(error);app.exit(1);});

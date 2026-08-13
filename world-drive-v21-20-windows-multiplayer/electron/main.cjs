'use strict';

const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const squirrelStartup = require('electron-squirrel-startup');
const { createMultiplayerRuntime } = require('./multiplayer-runtime.cjs');

let staticServer = null;
let mainWindow = null;
let appOrigin = null;
const multiplayerRuntime = createMultiplayerRuntime();
let multiplayerIpcRegistered = false;

const MIME_TYPES = new Map([
  ['.html','text/html; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],
  ['.png','image/png'],
  ['.jpg','image/jpeg'],
  ['.jpeg','image/jpeg'],
  ['.webp','image/webp'],
  ['.svg','image/svg+xml'],
  ['.ico','image/x-icon'],
  ['.mp3','audio/mpeg'],
  ['.ogg','audio/ogg'],
  ['.wav','audio/wav'],
  ['.wasm','application/wasm'],
  ['.map','application/json; charset=utf-8']
]);

function safeFilePath(root,requestPath){
  let decoded;
  try{
    decoded=decodeURIComponent(requestPath || '/');
  }catch{
    return null;
  }

  const relative=(decoded==='/'?'index.html':decoded.replace(/^\/+/,''));
  const candidate=path.resolve(root,relative);
  const rootPrefix=root.endsWith(path.sep)?root:root+path.sep;
  if(candidate!==root&&!candidate.startsWith(rootPrefix))return null;
  return candidate;
}

function startStaticServer(){
  const distRoot=path.resolve(__dirname,'..','dist');
  const indexFile=path.join(distRoot,'index.html');

  if(!fs.existsSync(indexFile)){
    throw new Error(
      'Build Vite introuvable. Lance "npm run build" avant de démarrer World Drive Desktop.'
    );
  }

  return new Promise((resolve,reject)=>{
    const server=http.createServer((req,res)=>{
      const requestUrl=new URL(req.url || '/','http://127.0.0.1');
      let filePath=safeFilePath(distRoot,requestUrl.pathname);

      if(!filePath){
        res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});
        res.end('Forbidden');
        return;
      }

      try{
        if(fs.existsSync(filePath)&&fs.statSync(filePath).isDirectory()){
          filePath=path.join(filePath,'index.html');
        }
      }catch{
        // The normal 404 path below will handle it.
      }

      fs.stat(filePath,(statError,stat)=>{
        if(statError||!stat.isFile()){
          res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
          res.end('Not found');
          return;
        }

        const type=MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
        res.writeHead(200,{
          'Content-Type':type,
          'Cache-Control':'no-cache',
          'X-Content-Type-Options':'nosniff'
        });
        fs.createReadStream(filePath)
          .on('error',()=>{
            if(!res.headersSent)res.writeHead(500);
            res.end();
          })
          .pipe(res);
      });
    });

    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      staticServer=server;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function isAllowedInternalUrl(url){
  return !!appOrigin && (url===appOrigin || url.startsWith(appOrigin+'/'));
}

function openExternalIfSafe(url){
  try{
    const parsed=new URL(url);
    if(parsed.protocol==='https:'||parsed.protocol==='http:'){
      shell.openExternal(url).catch(()=>{});
    }
  }catch{}
}

function createWindow(){
  mainWindow=new BrowserWindow({
    width:1440,
    height:900,
    minWidth:1100,
    minHeight:700,
    show:false,
    autoHideMenuBar:true,
    backgroundColor:'#08111c',
    title:'World Drive V21.20',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      webSecurity:true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    openExternalIfSafe(url);
    return {action:'deny'};
  });

  mainWindow.webContents.on('will-navigate',(event,url)=>{
    if(isAllowedInternalUrl(url))return;
    event.preventDefault();
    openExternalIfSafe(url);
  });

  mainWindow.once('ready-to-show',()=>mainWindow?.show());
  mainWindow.on('closed',()=>{mainWindow=null;});
  mainWindow.loadURL(appOrigin+'/');
}

function stopStaticServer(){
  if(!staticServer)return;
  try{staticServer.close();}catch{}
  staticServer=null;
}

function registerMultiplayerIpc(){
  if(multiplayerIpcRegistered)return;
  multiplayerIpcRegistered=true;

  ipcMain.handle('worlddrive:multiplayer:host',async(_event,options={})=>{
    return await multiplayerRuntime.hostSession(options);
  });

  ipcMain.handle('worlddrive:multiplayer:join',async(_event,options={})=>{
    return await multiplayerRuntime.joinSession(options);
  });

  ipcMain.handle('worlddrive:multiplayer:stop',async()=>{
    return await multiplayerRuntime.stop();
  });

  ipcMain.handle('worlddrive:multiplayer:status',()=>{
    return multiplayerRuntime.status();
  });
}

if(squirrelStartup){
  app.quit();
}else{
  // Squirrel.Windows uses this ID for taskbar/start-menu integration.
  app.setAppUserModelId('com.squirrel.WorldDrive.WorldDrive');

  app.whenReady().then(async()=>{
    // World Drive does not need privileged browser permissions. Deny unexpected
    // requests while keeping WebGL, audio and Gamepad API available normally.
    session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>{
      callback(false);
    });

    registerMultiplayerIpc();
    appOrigin=await startStaticServer();
    createWindow();

    app.on('activate',()=>{
      if(BrowserWindow.getAllWindows().length===0)createWindow();
    });
  }).catch(error=>{
    console.error('World Drive desktop startup failed:',error);
    app.quit();
  });

  app.on('before-quit',()=>{
    stopStaticServer();
    multiplayerRuntime.stop().catch(()=>{});
  });
  app.on('window-all-closed',()=>{
    if(process.platform!=='darwin')app.quit();
  });
}

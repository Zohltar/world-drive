'use strict';

const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const squirrelStartup = require('electron-squirrel-startup');
const { createMultiplayerRuntime } = require('./multiplayer-runtime.cjs');
const { createTrustedIpcHandler } = require('./ipc-origin-guard.cjs');
const packageInfo = require('../package.json');

const DESKTOP_PACKAGE_VERSION=String(packageInfo.version||'0.0.0');
const DESKTOP_CHANNEL=String(packageInfo.worldDriveChannel||'dev');
const DESKTOP_DISPLAY_VERSION=DESKTOP_PACKAGE_VERSION.replace(/\.0$/,'');
const DESKTOP_VERSION_LABEL=`V${DESKTOP_DISPLAY_VERSION} ${DESKTOP_CHANNEL}`;
const DESKTOP_TITLE=`World Drive ${DESKTOP_VERSION_LABEL}`;

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

const DESKTOP_HTTP_PORT=17317;
const OVERPASS_PROXY_HOSTS=new Set([
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.nchc.org.tw'
]);

function readRequestBody(req,maxBytes=1024*1024){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    let total=0;

    req.on('data',chunk=>{
      total+=chunk.length;
      if(total>maxBytes){
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.once('end',()=>resolve(Buffer.concat(chunks)));
    req.once('error',reject);
  });
}

function validateOverpassTarget(value){
  try{
    const target=new URL(String(value||''));
    if(target.protocol!=='https:')return null;
    if(!OVERPASS_PROXY_HOSTS.has(target.hostname))return null;
    if(!/\/api\/interpreter\/?$/i.test(target.pathname))return null;
    return target;
  }catch{
    return null;
  }
}

async function proxyOverpassRequest(req,res,requestUrl){
  const target=validateOverpassTarget(
    requestUrl.searchParams.get('target')
  );

  if(!target){
    res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Invalid Overpass target');
    return;
  }

  const method=String(req.method||'GET').toUpperCase();
  if(method!=='GET'&&method!=='POST'){
    res.writeHead(405,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Method not allowed');
    return;
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  const abortUpstream=()=>{
    if(!res.writableEnded)controller.abort();
  };

  req.once('aborted',abortUpstream);
  res.once('close',abortUpstream);

  try{
    const body=method==='POST'
      ?await readRequestBody(req)
      :undefined;

    const headers={
      'Accept':'application/json',
      'User-Agent':`WorldDrive/${DESKTOP_PACKAGE_VERSION} (Windows; Electron Overpass proxy)`
    };

    if(req.headers['content-type']){
      headers['Content-Type']=req.headers['content-type'];
    }

    const upstream=await fetch(target,{ 
      method,
      headers,
      body:method==='POST'?body:undefined,
      signal:controller.signal,
      redirect:'follow'
    });

    const payload=Buffer.from(
      await upstream.arrayBuffer()
    );

    if(res.writableEnded)return;

    res.writeHead(upstream.status,{
      'Content-Type':upstream.headers.get('content-type')||'application/json; charset=utf-8',
      'Content-Length':String(payload.length),
      'Cache-Control':'no-store',
      'X-World-Drive-Proxy':'overpass'
    });
    res.end(payload);
  }catch(error){
    if(res.writableEnded)return;
    const aborted=error?.name==='AbortError';
    res.writeHead(aborted?504:502,{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store'
    });
    res.end(JSON.stringify({
      error:aborted?'Overpass timeout':'Overpass proxy failed',
      detail:String(error?.message||error)
    }));
  }finally{
    clearTimeout(timer);
    req.off('aborted',abortUpstream);
    res.off('close',abortUpstream);
  }
}

function listenHttpServer(server,port){
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{
      server.off('error',onError);
      server.off('listening',onListening);
    };
    const onError=error=>{
      cleanup();
      reject(error);
    };
    const onListening=()=>{
      cleanup();
      resolve(server.address());
    };

    server.once('error',onError);
    server.once('listening',onListening);
    server.listen(port,'127.0.0.1');
  });
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

      if(requestUrl.pathname==='/__worlddrive_proxy/overpass'){
        proxyOverpassRequest(req,res,requestUrl).catch(error=>{
          console.error('Overpass proxy handler failed:',error);
          if(!res.headersSent){
            res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
          }
          if(!res.writableEnded)res.end('Overpass proxy error');
        });
        return;
      }

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

    (async()=>{
      let address;
      try{
        address=await listenHttpServer(server,DESKTOP_HTTP_PORT);
      }catch(error){
        if(error?.code!=='EADDRINUSE')throw error;
        console.warn(
          `Desktop port ${DESKTOP_HTTP_PORT} already in use; falling back to a dynamic port.`
        );
        address=await listenHttpServer(server,0);
      }

      staticServer=server;
      resolve(`http://127.0.0.1:${address.port}`);
    })().catch(reject);
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
    title:DESKTOP_TITLE,
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

function multiplayerIpcContext(){
  return {
    appOrigin,
    mainWebContents:mainWindow?.webContents||null
  };
}

function registerMultiplayerIpc(){
  if(multiplayerIpcRegistered)return;
  multiplayerIpcRegistered=true;

  ipcMain.handle(
    'worlddrive:multiplayer:host',
    createTrustedIpcHandler(
      (options={})=>multiplayerRuntime.hostSession(options),
      multiplayerIpcContext
    )
  );

  ipcMain.handle(
    'worlddrive:multiplayer:join',
    createTrustedIpcHandler(
      (options={})=>multiplayerRuntime.joinSession(options),
      multiplayerIpcContext
    )
  );

  ipcMain.handle(
    'worlddrive:multiplayer:stop',
    createTrustedIpcHandler(
      ()=>multiplayerRuntime.stop(),
      multiplayerIpcContext
    )
  );

  ipcMain.handle(
    'worlddrive:multiplayer:status',
    createTrustedIpcHandler(
      ()=>multiplayerRuntime.status(),
      multiplayerIpcContext
    )
  );
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

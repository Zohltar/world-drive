import { defineConfig } from 'vite';
import { access, cp, readdir } from 'node:fs/promises';
import path from 'node:path';

// World Drive keeps runtime samples such as assets/audio/*.mp3 in the repository
// root. Vite serves them during development, but arbitrary root files are not
// automatically copied by the production build. Preserve the exact runtime path
// expected by audio.js: dist/assets/...
function copyWorldDriveStaticAssets(){
  return {
    name:'world-drive-static-assets',
    apply:'build',
    async closeBundle(){
      const source=path.resolve('assets');
      const target=path.resolve('dist','assets');
      try{
        await access(source);
        await cp(source,target,{recursive:true,force:true});
      }catch(error){
        if(error?.code!=='ENOENT')throw error;
      }
    }
  };
}

// Desktop builds serve generated /world-data directly from public/ at runtime,
// so copying that potentially multi-gigabyte local dataset into dist is both
// redundant and very slow. Keep the normal browser production build unchanged;
// only Vite's explicit "desktop" mode suppresses the automatic public copy, then
// restores every normal public asset except the generated world-data directory.
function desktopLocalDataBuildPolicy(){
  let desktopBuild=false;
  return {
    name:'world-drive-desktop-local-data-build',
    apply:'build',
    config(_config,{mode}){
      desktopBuild=mode==='desktop';
      if(!desktopBuild)return;
      return {
        build:{
          copyPublicDir:false
        }
      };
    },
    async closeBundle(){
      if(!desktopBuild)return;

      const source=path.resolve('public');
      const target=path.resolve('dist');
      let entries;
      try{
        entries=await readdir(source,{withFileTypes:true});
      }catch(error){
        if(error?.code==='ENOENT')return;
        throw error;
      }

      for(const entry of entries){
        if(entry.name==='world-data')continue;
        await cp(
          path.join(source,entry.name),
          path.join(target,entry.name),
          {recursive:entry.isDirectory(),force:true}
        );
      }
    }
  };
}

const OVERPASS_HOSTS=new Set([
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.nchc.org.tw'
]);
const OVERPASS_MAX_BODY_BYTES=1024*1024;
const OVERPASS_METHODS=new Set(['GET','POST']);

function sendSoftOverpassFailure(res,{status=502,target=null,message='Overpass upstream failure'}={}){
  // Always answer the browser with HTTP 200. Public Overpass mirrors routinely
  // return 429/5xx or time out; exposing that status through the same-origin
  // development proxy makes Chrome emit a red network error even though the
  // client is designed to fail over to another mirror. The payload remains an
  // explicit failure and is never cached by overpass.js.
  res.statusCode=200;
  res.setHeader('content-type','application/json');
  res.setHeader('cache-control','no-store');
  res.end(JSON.stringify({
    __worldDriveOverpassFailure:true,
    status,
    target,
    message
  }));
}

// Browser development uses a same-origin Vite middleware for Overpass. This
// removes browser CORS from the equation while keeping the production/browser
// and Electron transports independent.
function worldDriveOverpassProxy(){
  return {
    name:'world-drive-overpass-dev-proxy',
    apply:'serve',
    configureServer(server){
      server.middlewares.use('/__worlddrive_proxy/overpass',async(req,res)=>{
        let target;
        try{
          const requestUrl=new URL(req.url||'/', 'http://localhost');
          const rawTarget=requestUrl.searchParams.get('target');
          if(!rawTarget)throw new Error('Missing Overpass target');

          target=new URL(rawTarget);
          if(
            target.protocol!=='https:'||
            !OVERPASS_HOSTS.has(target.hostname)||
            !/\/api\/interpreter\/?$/i.test(target.pathname)
          ){
            throw new Error('Unsupported Overpass target');
          }

          const method=String(req.method||'GET').toUpperCase();
          if(!OVERPASS_METHODS.has(method)){
            sendSoftOverpassFailure(res,{
              status:405,
              target:target.hostname,
              message:'Overpass proxy method not allowed'
            });
            return;
          }

          let body;
          if(method==='POST'){
            const chunks=[];
            let total=0;
            for await(const chunk of req){
              total+=chunk.length;
              if(total>OVERPASS_MAX_BODY_BYTES){
                sendSoftOverpassFailure(res,{
                  status:413,
                  target:target.hostname,
                  message:'Overpass request body too large'
                });
                return;
              }
              chunks.push(chunk);
            }
            body=Buffer.concat(chunks);
          }

          const upstream=await fetch(target,{
            method,
            headers:{
              'content-type':req.headers['content-type']||'application/x-www-form-urlencoded;charset=UTF-8',
              'user-agent':'WorldDrive/21.31 local-dev'
            },
            body,
            signal:AbortSignal.timeout(12000)
          });

          if(!upstream.ok){
            // Consume the upstream body so the connection can be reused, then
            // report a soft application failure to the browser client.
            await upstream.arrayBuffer().catch(()=>{});
            sendSoftOverpassFailure(res,{
              status:upstream.status,
              target:target.hostname,
              message:`Overpass upstream HTTP ${upstream.status}`
            });
            return;
          }

          res.statusCode=200;
          res.setHeader('content-type',upstream.headers.get('content-type')||'application/json');
          res.setHeader('cache-control','no-store');
          const payload=Buffer.from(await upstream.arrayBuffer());
          res.end(payload);
        }catch(error){
          const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
          sendSoftOverpassFailure(res,{
            status:timeout?504:502,
            target:target?.hostname||null,
            message:timeout?'Overpass upstream timeout':'Overpass proxy failure'
          });
        }
      });
    }
  };
}

function productionChunkName(id){
  const normalized=String(id||'').replaceAll('\\','/');
  // Keep only the Three.js core in the eager stable vendor chunk. Examples and
  // loaders (notably GLTFLoader) remain in their lazy vehicle dependency graph.
  if(normalized.includes('/node_modules/three/build/three.module.js'))return 'vendor-three';
  return undefined;
}

export default defineConfig({
  plugins:[
    copyWorldDriveStaticAssets(),
    desktopLocalDataBuildPolicy(),
    worldDriveOverpassProxy()
  ],
  build:{
    emptyOutDir:true,
    rollupOptions:{
      output:{
        manualChunks:productionChunkName
      }
    }
  }
});

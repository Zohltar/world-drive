import { defineConfig } from 'vite';
import { access, cp } from 'node:fs/promises';
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

const OVERPASS_HOSTS=new Set([
  'overpass-api.de',
  'overpass.private.coffee',
  'overpass.kumi.systems',
  'overpass.nchc.org.tw'
]);

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

          const chunks=[];
          for await(const chunk of req)chunks.push(chunk);
          const body=Buffer.concat(chunks);

          const upstream=await fetch(target,{
            method:req.method||'POST',
            headers:{
              'content-type':req.headers['content-type']||'application/x-www-form-urlencoded;charset=UTF-8',
              'user-agent':'WorldDrive/21.31 local-dev'
            },
            body:(req.method||'POST').toUpperCase()==='GET'?undefined:body,
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

export default defineConfig({
  plugins:[
    copyWorldDriveStaticAssets(),
    worldDriveOverpassProxy()
  ],
  build:{
    emptyOutDir:true
  }
});

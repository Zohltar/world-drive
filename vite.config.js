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

          res.statusCode=upstream.status;
          res.setHeader('content-type',upstream.headers.get('content-type')||'application/json');
          res.setHeader('cache-control','no-store');
          const payload=Buffer.from(await upstream.arrayBuffer());
          res.end(payload);
        }catch(error){
          const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
          res.statusCode=timeout?504:502;
          res.setHeader('content-type','application/json');
          res.end(JSON.stringify({
            error:timeout?'Overpass upstream timeout':'Overpass proxy failure',
            target:target?.hostname||null
          }));
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

import { defineConfig } from 'vite';
import { access, cp } from 'node:fs/promises';
import path from 'node:path';

// World Drive keeps runtime samples such as assets/audio/*.mp3 in the repository
// root. Vite serves them during development, but arbitrary root files are not
// automatically copied by the production build. Preserve the exact runtime path
// expected by audio.js: dist/assets/...
function copyWorldDriveStaticAssets(){
  return {
    name: 'world-drive-static-assets',
    apply: 'build',
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

export default defineConfig({
  plugins:[copyWorldDriveStaticAssets()],
  build:{
    emptyOutDir:true
  }
});

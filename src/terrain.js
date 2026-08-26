import {createTerrainService as createTerrainServiceP925} from './terrain-p925.js';

const P926_HORIZON_BUDGET_MS=1.15;
const P926_HORIZON_GAP_MS=8;

function nowMs(){return globalThis.performance?.now?.()??Date.now();}
function clamp01(v){return Math.max(0,Math.min(1,v));}
function lerp(a,b,t){return a+(b-a)*t;}

function scheduleHorizonSlice(callback){
  if(typeof globalThis.setTimeout==='function'){
    globalThis.setTimeout(callback,P926_HORIZON_GAP_MS);
  }else{
    callback();
  }
}

export function createTerrainService(options={}){
  const base=createTerrainServiceP925(options);
  const {
    THREE,
    horizonGroup,
    getWorldOffset,
    groundSize=2000,
    groundSegments=88
  }=options;

  if(!THREE||!horizonGroup||typeof getWorldOffset!=='function')return base;

  const sideSegments=Math.max(groundSegments,180);
  const nearHalf=groundSize/2;
  const halfExtents=[
    nearHalf,
    nearHalf+60,
    nearHalf+125,
    nearHalf+195,
    nearHalf+270,
    nearHalf+350,
    nearHalf+435,
    nearHalf+525,
    nearHalf+620,
    nearHalf+720,
    nearHalf+825,
    nearHalf+935,
    nearHalf+1050,
    nearHalf+1170,
    nearHalf+1295,
    nearHalf+1425,
    nearHalf+1560,
    nearHalf+1700,
    nearHalf+1845,
    nearHalf+1995,
    nearHalf+2150,
    nearHalf+2310,
    nearHalf+2475,
    nearHalf+2645,
    nearHalf+2820,
    nearHalf+3000,
    nearHalf+3190,
    nearHalf+3390,
    nearHalf+3600,
    nearHalf+3820,
    nearHalf+4050,
    nearHalf+4260
  ];
  const perimeterCount=sideSegments*4;
  const rowCount=halfExtents.length;
  const vertexCount=perimeterCount*rowCount;
  const indexCount=(rowCount-1)*perimeterCount*6;
  const localXZ=new Float32Array(vertexCount*2);
  const indices=new Uint32Array(indexCount);

  function perimeterPoint(side,index,half){
    const t=index/sideSegments;
    if(side===0)return {x:-half+2*half*t,z:-half};
    if(side===1)return {x:half,z:-half+2*half*t};
    if(side===2)return {x:half-2*half*t,z:half};
    return {x:-half,z:half-2*half*t};
  }

  let vertex=0;
  for(let row=0;row<rowCount;row++){
    const half=halfExtents[row];
    for(let side=0;side<4;side++)for(let i=0;i<sideSegments;i++){
      const p=perimeterPoint(side,i,half);
      localXZ[vertex*2]=p.x;
      localXZ[vertex*2+1]=p.z;
      vertex++;
    }
  }
  let indexCursor=0;
  for(let row=0;row<rowCount-1;row++){
    const base0=row*perimeterCount;
    const base1=(row+1)*perimeterCount;
    for(let i=0;i<perimeterCount;i++){
      const next=(i+1)%perimeterCount;
      const a=base0+i,b=base0+next,c=base1+i,d=base1+next;
      indices[indexCursor++]=a;
      indices[indexCursor++]=c;
      indices[indexCursor++]=b;
      indices[indexCursor++]=b;
      indices[indexCursor++]=c;
      indices[indexCursor++]=d;
    }
  }

  let horizonSerial=0;
  let horizonPromise=null;
  const perf={
    preparations:0,
    commits:0,
    discards:0,
    maxSliceMs:0,
    maxCommitMs:0,
    last:null
  };

  function distantHeight(wx,wz,distance){
    const rendered=base.renderHeightAt(wx,wz);
    if(distance<=nearHalf+120)return rendered;

    const natural=base.heightAt(wx,wz)-.15;
    if(Math.abs(rendered-natural)>.02)return rendered;

    const t=clamp01((distance-(nearHalf+120))/3300);
    const radius=8+t*34;
    const hL=base.heightAt(wx-radius,wz)-.15;
    const hR=base.heightAt(wx+radius,wz)-.15;
    const hD=base.heightAt(wx,wz-radius)-.15;
    const hU=base.heightAt(wx,wz+radius)-.15;
    const average=(natural*4+hL+hR+hD+hU)/8;
    const blend=.055+t*.235;
    return rendered+(average-natural)*blend;
  }

  function disposeHorizonObject(object){
    object?.traverse?.(child=>{
      child.geometry?.dispose?.();
      const material=child.material;
      if(Array.isArray(material))material.forEach(item=>item?.dispose?.());
      else material?.dispose?.();
    });
  }

  function clearLiveHorizon(){
    while(horizonGroup.children.length){
      const child=horizonGroup.children.pop();
      disposeHorizonObject(child);
    }
  }

  function prepareHorizonIncremental(){
    const serial=++horizonSerial;
    const wallStarted=nowMs();
    perf.preparations++;
    const offset={...(getWorldOffset()||{x:0,z:0})};
    const positions=new Float32Array(vertexCount*3);
    const normals=new Float32Array(vertexCount*3);
    const colors=new Float32Array(vertexCount*3);
    const stats={heightCpuMs:0,normalCpuMs:0,colorCpuMs:0,slices:0,maxSliceMs:0,minY:Infinity,maxY:-Infinity};

    function recordSlice(started){
      const elapsed=nowMs()-started;
      stats.slices++;
      stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
      perf.maxSliceMs=Math.max(perf.maxSliceMs,elapsed);
      return elapsed;
    }

    function runHeights(){
      return new Promise(resolve=>{
        let i=0;
        const step=()=>{
          if(serial!==horizonSerial){resolve(false);return;}
          const started=nowMs();
          let processed=0;
          while(i<vertexCount){
            const x=localXZ[i*2];
            const z=localXZ[i*2+1];
            const row=Math.floor(i/perimeterCount);
            const y=distantHeight(offset.x+x,offset.z+z,halfExtents[row]);
            const j=i*3;
            positions[j]=x;positions[j+1]=y;positions[j+2]=z;
            if(y<stats.minY)stats.minY=y;
            if(y>stats.maxY)stats.maxY=y;
            i++;processed++;
            if(processed>=48&&nowMs()-started>=P926_HORIZON_BUDGET_MS)break;
          }
          stats.heightCpuMs+=recordSlice(started);
          if(i<vertexCount){scheduleHorizonSlice(step);return;}
          resolve(true);
        };
        scheduleHorizonSlice(step);
      });
    }

    function runTriangleNormals(){
      return new Promise(resolve=>{
        let k=0;
        const step=()=>{
          if(serial!==horizonSerial){resolve(false);return;}
          const started=nowMs();
          let processed=0;
          while(k<indices.length){
            const ia=indices[k++]*3,ib=indices[k++]*3,ic=indices[k++]*3;
            const abx=positions[ib]-positions[ia];
            const aby=positions[ib+1]-positions[ia+1];
            const abz=positions[ib+2]-positions[ia+2];
            const acx=positions[ic]-positions[ia];
            const acy=positions[ic+1]-positions[ia+1];
            const acz=positions[ic+2]-positions[ia+2];
            const nx=aby*acz-abz*acy;
            const ny=abz*acx-abx*acz;
            const nz=abx*acy-aby*acx;
            normals[ia]+=nx;normals[ia+1]+=ny;normals[ia+2]+=nz;
            normals[ib]+=nx;normals[ib+1]+=ny;normals[ib+2]+=nz;
            normals[ic]+=nx;normals[ic+1]+=ny;normals[ic+2]+=nz;
            processed++;
            if(processed>=96&&nowMs()-started>=P926_HORIZON_BUDGET_MS)break;
          }
          stats.normalCpuMs+=recordSlice(started);
          if(k<indices.length){scheduleHorizonSlice(step);return;}
          resolve(true);
        };
        scheduleHorizonSlice(step);
      });
    }

    function runNormalizeAndColors(){
      return new Promise(resolve=>{
        let i=0;
        const minY=Number.isFinite(stats.minY)?stats.minY:0;
        const maxY=Number.isFinite(stats.maxY)?stats.maxY:minY+1;
        const heightSpan=Math.max(1,maxY-minY);
        const farHalf=halfExtents[rowCount-1];
        const hazeStart=nearHalf+900;
        const hazeSpan=Math.max(1200,farHalf-hazeStart);
        const valley=[0x53/255,0x6b/255,0x49/255];
        const low=[0x65/255,0x76/255,0x57/255];
        const mid=[0x74/255,0x75/255,0x5d/255];
        const high=[0x85/255,0x84/255,0x7a/255];
        const rock=[0x77/255,0x76/255,0x6f/255];
        const neutral=[0x77/255,0x7c/255,0x78/255];
        const step=()=>{
          if(serial!==horizonSerial){resolve(false);return;}
          const started=nowMs();
          let processed=0;
          while(i<vertexCount){
            const j=i*3;
            let nx=normals[j],ny=normals[j+1],nz=normals[j+2];
            const inv=1/(Math.hypot(nx,ny,nz)||1);
            nx*=inv;ny*=inv;nz*=inv;
            normals[j]=nx;normals[j+1]=ny;normals[j+2]=nz;

            const x=positions[j],z=positions[j+2],y=positions[j+1];
            const wx=offset.x+x,wz=offset.z+z;
            const distance=Math.max(Math.abs(x),Math.abs(z));
            const altitude=clamp01((y-minY)/heightSpan);
            let r,g,b;
            if(altitude<.34){
              const t=altitude/.34;r=lerp(valley[0],low[0],t);g=lerp(valley[1],low[1],t);b=lerp(valley[2],low[2],t);
            }else if(altitude<.72){
              const t=(altitude-.34)/.38;r=lerp(low[0],mid[0],t);g=lerp(low[1],mid[1],t);b=lerp(low[2],mid[2],t);
            }else{
              const t=(altitude-.72)/.28;r=lerp(mid[0],high[0],t);g=lerp(mid[1],high[1],t);b=lerp(mid[2],high[2],t);
            }
            const slope=clamp01((1-Math.abs(ny))/.42);
            const rockBlend=clamp01((slope-.16)/.62)*(.34+.66*altitude)*.62;
            r=lerp(r,rock[0],rockBlend);g=lerp(g,rock[1],rockBlend);b=lerp(b,rock[2],rockBlend);
            const macro=(Math.sin(wx*.00137+Math.cos(wz*.00073)*1.9)+Math.cos(wz*.00111-Math.sin(wx*.00091)*1.6)+Math.sin((wx+wz)*.00047))/3;
            const macroShade=.965+macro*.055;
            r*=macroShade;g*=macroShade;b*=macroShade;
            const haze=clamp01((distance-hazeStart)/hazeSpan)*.18;
            colors[j]=clamp01(lerp(r,neutral[0],haze));
            colors[j+1]=clamp01(lerp(g,neutral[1],haze));
            colors[j+2]=clamp01(lerp(b,neutral[2],haze));
            i++;processed++;
            if(processed>=96&&nowMs()-started>=P926_HORIZON_BUDGET_MS)break;
          }
          stats.colorCpuMs+=recordSlice(started);
          if(i<vertexCount){scheduleHorizonSlice(step);return;}
          resolve(true);
        };
        scheduleHorizonSlice(step);
      });
    }

    const promise=(async()=>{
      if(!await runHeights())return null;
      if(!await runTriangleNormals())return null;
      if(!await runNormalizeAndColors())return null;
      if(serial!==horizonSerial)return null;

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      geometry.setIndex(new THREE.BufferAttribute(indices,1));

      const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide,transparent:false,depthWrite:true,dithering:true,fog:true,stencilWrite:true,stencilRef:2,stencilFunc:THREE.NotEqualStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp});
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name='distant-terrain-seamless-square-lod';
      mesh.receiveShadow=false;
      mesh.castShadow=false;
      mesh.renderOrder=-3;
      mesh.matrixAutoUpdate=false;
      mesh.updateMatrix();

      const meta={serial,preparedOffset:{...offset},vertices:vertexCount,triangles:indices.length/3,prepareWallMs:nowMs()-wallStarted,prepareCpuMs:stats.heightCpuMs+stats.normalCpuMs+stats.colorCpuMs,slices:stats.slices,maxSliceMs:stats.maxSliceMs,p926SliceBudgetMs:P926_HORIZON_BUDGET_MS,p926SliceGapMs:P926_HORIZON_GAP_MS};
      perf.last=meta;
      return {serial,offset,mesh,meta};
    })();
    horizonPromise=promise;
    return promise.finally(()=>{if(horizonPromise===promise)horizonPromise=null;});
  }

  function commitPreparedHorizon(prepared){
    if(!prepared||prepared.serial!==horizonSerial){perf.discards++;return false;}
    const current=getWorldOffset()||{x:0,z:0};
    if(Math.hypot((current.x||0)-prepared.offset.x,(current.z||0)-prepared.offset.z)>.5){
      perf.discards++;disposeHorizonObject(prepared.mesh);return false;
    }
    const started=nowMs();
    clearLiveHorizon();
    horizonGroup.position.set(0,0,0);
    horizonGroup.updateMatrix?.();
    horizonGroup.add(prepared.mesh);
    const ms=nowMs()-started;
    perf.commits++;
    perf.maxCommitMs=Math.max(perf.maxCommitMs,ms);
    perf.last={...(prepared.meta||{}),commitMs:ms};
    return true;
  }

  async function rebuildHorizonIncremental(){
    const prepared=await prepareHorizonIncremental();
    if(!prepared)return false;
    return commitPreparedHorizon(prepared);
  }

  function cancelHorizonPreparation(){horizonSerial++;}
  function clearHorizon(){cancelHorizonPreparation();return base.clearHorizon();}
  function rebuildHorizon(){cancelHorizonPreparation();return base.rebuildHorizon();}
  function captureHorizonOrigin(){return {x:horizonGroup.position.x||0,y:horizonGroup.position.y||0,z:horizonGroup.position.z||0};}
  function restoreHorizonOrigin(snapshot){
    if(!snapshot||!horizonGroup.children.length)return;
    horizonGroup.position.set(snapshot.x||0,snapshot.y||0,snapshot.z||0);
    horizonGroup.updateMatrix?.();
  }
  function p926Diagnostics(){return {enabled:true,pending:!!horizonPromise,preparations:perf.preparations,commits:perf.commits,discards:perf.discards,maxSliceMs:Number(perf.maxSliceMs.toFixed(3)),maxCommitMs:Number(perf.maxCommitMs.toFixed(3)),vertices:vertexCount,triangles:indices.length/3,p926SliceBudgetMs:P926_HORIZON_BUDGET_MS,p926SliceGapMs:P926_HORIZON_GAP_MS,last:perf.last};}
  function diagnostics(){return {...(base.diagnostics?.()||{}),p926:p926Diagnostics()};}

  return {...base,rebuildHorizon,clearHorizon,prepareHorizonIncremental,commitPreparedHorizon,rebuildHorizonIncremental,cancelHorizonPreparation,captureHorizonOrigin,restoreHorizonOrigin,p926Diagnostics,diagnostics};
}

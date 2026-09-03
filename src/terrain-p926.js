// R8.5 terrain facade — keep the stable root import while P9.26 implementation lives under src/terrain/.
import { createTerrainService as createTerrainServiceP926 } from './terrain/terrain-p926.js';

function triangleWindingY(position,a,b,c){
  const ax=position.getX(a),az=position.getZ(a);
  const bx=position.getX(b),bz=position.getZ(b);
  const cx=position.getX(c),cz=position.getZ(c);
  return (bz-az)*(cx-ax)-(bx-ax)*(cz-az);
}

function normalizeUpwardTransitionWinding(geometry){
  const position=geometry?.getAttribute?.('position');
  const index=geometry?.index;
  if(!position||!index?.array||index.count<3)return false;

  let winding=0;
  for(let i=0;i+2<index.count;i+=3){
    winding=triangleWindingY(
      position,
      index.getX(i),
      index.getX(i+1),
      index.getX(i+2)
    );
    if(Math.abs(winding)>1e-6)break;
  }
  if(winding>=0)return false;

  const indices=index.array;
  for(let i=0;i+2<index.count;i+=3){
    const tmp=indices[i+1];
    indices[i+1]=indices[i+2];
    indices[i+2]=tmp;
  }
  index.needsUpdate=true;
  return true;
}

function normalizeSyncRoadTransition(ground){
  const groups=ground?.parent?.children?.filter?.(child=>
    child?.name==='road-terrain-transition'&&
    !child?.userData?.p927External&&
    !child?.userData?.p927Hold
  )||[];
  let flipped=0;
  for(const group of groups){
    group.traverse?.(child=>{
      if(child?.isMesh&&normalizeUpwardTransitionWinding(child.geometry))flipped++;
    });
  }
  return flipped;
}

export function createTerrainService(options={}){
  const base=createTerrainServiceP926(options);
  if(!base||typeof base.setRoadBed!=='function')return base;

  const originalSetRoadBed=base.setRoadBed;
  return {
    ...base,
    setRoadBed(...args){
      const result=originalSetRoadBed.apply(base,args);
      normalizeSyncRoadTransition(options.ground);
      return result;
    }
  };
}

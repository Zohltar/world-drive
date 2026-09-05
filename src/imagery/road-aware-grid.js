// Localized conforming refinement for satellite terrain geometry.
// Keeps the normal chunk grid unchanged away from roads while sampling the
// accepted refined road-earthwork surface densely enough that a coarse terrain
// triangle cannot bridge across the asphalt on extreme cuts/switchbacks.

const key=(row,col)=>`${row}:${col}`;

function finite(value){return Number.isFinite(value);}

export function buildRoadAwareImageryGrid({
  spec,
  segments,
  sampleTerrainHeight,
  sampleRoadVisualHeight=null,
  refineFactor=6,
  refinementRing=1,
  verticalOffset=.018
}={}){
  if(!spec)throw new Error('road-aware imagery grid requires spec');
  const seg=Math.max(1,Math.floor(segments)||1);
  const factor=Math.max(2,Math.floor(refineFactor)||2);
  const ring=Math.max(0,Math.floor(refinementRing)||0);
  const terrainSample=typeof sampleTerrainHeight==='function'
    ?sampleTerrainHeight
    :()=>0;
  const roadSample=typeof sampleRoadVisualHeight==='function'
    ?sampleRoadVisualHeight
    :null;
  const width=spec.east-spec.west;
  const depth=spec.south-spec.north;
  const cols=seg+1;
  const baseHeights=new Float64Array(cols*cols);
  const baseRoadMask=roadSample?new Uint8Array(cols*cols):null;

  const baseIndex=(row,col)=>row*cols+col;
  const basePoint=(row,col)=>({
    x:spec.west+width*(col/seg),
    z:spec.north+depth*(row/seg)
  });

  for(let row=0;row<=seg;row++){
    for(let col=0;col<=seg;col++){
      const point=basePoint(row,col);
      const height=terrainSample(point.x,point.z);
      baseHeights[baseIndex(row,col)]=finite(height)?height:0;
      if(baseRoadMask){
        baseRoadMask[baseIndex(row,col)]=finite(roadSample(point.x,point.z))?1:0;
      }
    }
  }

  const seeds=new Set();
  if(roadSample){
    for(let row=0;row<seg;row++){
      for(let col=0;col<seg;col++){
        const centerX=spec.west+width*((col+.5)/seg);
        const centerZ=spec.north+depth*((row+.5)/seg);
        const touchesRoad=
          !!baseRoadMask[baseIndex(row,col)]||
          !!baseRoadMask[baseIndex(row,col+1)]||
          !!baseRoadMask[baseIndex(row+1,col)]||
          !!baseRoadMask[baseIndex(row+1,col+1)]||
          finite(roadSample(centerX,centerZ));
        if(touchesRoad)seeds.add(key(row,col));
      }
    }
  }

  const refined=new Set(seeds);
  if(seeds.size&&ring){
    for(const cellKey of seeds){
      const [row,col]=cellKey.split(':').map(Number);
      for(let dr=-ring;dr<=ring;dr++){
        for(let dc=-ring;dc<=ring;dc++){
          const rr=row+dr;
          const cc=col+dc;
          if(rr<0||cc<0||rr>=seg||cc>=seg)continue;
          refined.add(key(rr,cc));
        }
      }
    }
  }

  const positions=[];
  const uvs=[];
  const indices=[];
  const vertexMap=new Map();
  const fineSpan=seg*factor;

  function baseHeight(row,col){
    return baseHeights[baseIndex(row,col)];
  }

  function addVertex(gRow,gCol,heightOverride=null){
    const vertexKey=key(gRow,gCol);
    const hit=vertexMap.get(vertexKey);
    if(hit!==undefined)return hit;
    const tz=gRow/fineSpan;
    const tx=gCol/fineSpan;
    const absX=spec.west+width*tx;
    const absZ=spec.north+depth*tz;
    const sampled=heightOverride===null
      ?terrainSample(absX,absZ)
      :heightOverride;
    const y=finite(sampled)?sampled:0;
    const index=positions.length/3;
    positions.push(absX-spec.centerX,y+verticalOffset,absZ-spec.centerZ);
    uvs.push(tx,1-tz);
    vertexMap.set(vertexKey,index);
    return index;
  }

  // Populate every coarse-grid corner first so refined/unrefined cells share
  // identical corner vertices and preserve the existing chunk boundary.
  for(let row=0;row<=seg;row++){
    for(let col=0;col<=seg;col++){
      addVertex(row*factor,col*factor,baseHeight(row,col));
    }
  }

  function isRefined(row,col){
    return row>=0&&col>=0&&row<seg&&col<seg&&refined.has(key(row,col));
  }

  function externalEdgeHeight(row,col,localRow,localCol){
    const top=localRow===0&&!isRefined(row-1,col);
    const bottom=localRow===factor&&!isRefined(row+1,col);
    const left=localCol===0&&!isRefined(row,col-1);
    const right=localCol===factor&&!isRefined(row,col+1);
    if(!(top||bottom||left||right))return null;

    // At chunk boundaries, retain analytic sampling whenever the accepted road
    // visual corridor actually reaches the seam. The neighbouring chunk sees
    // the same road sample and refines its matching boundary as well.
    const tx=(col+localCol/factor)/seg;
    const tz=(row+localRow/factor)/seg;
    const absX=spec.west+width*tx;
    const absZ=spec.north+depth*tz;
    const chunkBoundary=row===0||col===0||row===seg-1||col===seg-1;
    if(chunkBoundary&&roadSample&&finite(roadSample(absX,absZ)))return null;

    if(top){
      const t=localCol/factor;
      return baseHeight(row,col)*(1-t)+baseHeight(row,col+1)*t;
    }
    if(bottom){
      const t=localCol/factor;
      return baseHeight(row+1,col)*(1-t)+baseHeight(row+1,col+1)*t;
    }
    if(left){
      const t=localRow/factor;
      return baseHeight(row,col)*(1-t)+baseHeight(row+1,col)*t;
    }
    const t=localRow/factor;
    return baseHeight(row,col+1)*(1-t)+baseHeight(row+1,col+1)*t;
  }

  for(let row=0;row<seg;row++){
    for(let col=0;col<seg;col++){
      if(!isRefined(row,col)){
        const a=vertexMap.get(key(row*factor,col*factor));
        const b=vertexMap.get(key(row*factor,(col+1)*factor));
        const c=vertexMap.get(key((row+1)*factor,col*factor));
        const d=vertexMap.get(key((row+1)*factor,(col+1)*factor));
        indices.push(a,c,b,b,c,d);
        continue;
      }

      const local=[];
      for(let lr=0;lr<=factor;lr++){
        const localRow=[];
        for(let lc=0;lc<=factor;lc++){
          const gRow=row*factor+lr;
          const gCol=col*factor+lc;
          const coarseCorner=(lr===0||lr===factor)&&(lc===0||lc===factor);
          const override=coarseCorner
            ?baseHeight(row+(lr===factor?1:0),col+(lc===factor?1:0))
            :externalEdgeHeight(row,col,lr,lc);
          localRow.push(addVertex(gRow,gCol,override));
        }
        local.push(localRow);
      }

      for(let lr=0;lr<factor;lr++){
        for(let lc=0;lc<factor;lc++){
          const a=local[lr][lc];
          const b=local[lr][lc+1];
          const c=local[lr+1][lc];
          const d=local[lr+1][lc+1];
          indices.push(a,c,b,b,c,d);
        }
      }
    }
  }

  return {
    positions:new Float32Array(positions),
    uvs:new Float32Array(uvs),
    indices,
    stats:{
      baseCells:seg*seg,
      seedCells:seeds.size,
      refinedCells:refined.size,
      refineFactor:factor,
      vertexCount:positions.length/3,
      triangleCount:indices.length/3
    }
  };
}

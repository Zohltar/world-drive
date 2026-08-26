// World Drive Foret P8 - ultra-light conifer proxy geometry.
//
// The authored GLB trees stay untouched near the driver. These proxies are only
// used once a tree is small enough on screen that silhouette matters much more
// than branch-level detail. One opaque Lambert mesh per tree avoids both the
// triangle cost and alpha-overdraw of textured foliage cards in the mid/far LODs.

function pushColor(colors,color,count){
  for(let i=0;i<count;i++)colors.push(color.r,color.g,color.b);
}

function buildProxyGeometry(THREE,{
  sides,
  layers,
  trunkSides,
  crownStart=.14,
  crownTop=1,
  maxRadius=.24,
  minRadius=.055,
  irregularity=.10
}){
  const positions=[];
  const colors=[];
  const indices=[];
  const trunkColor=new THREE.Color(0x5a4028);
  const foliageLow=new THREE.Color(0x244b2a);
  const foliageHigh=new THREE.Color(0x446b35);

  // Thin trunk. Caps are deliberately omitted because the crown hides the top
  // and the base is embedded slightly into terrain.
  const trunkRadius=.025;
  const trunkTop=.34;
  const trunkBaseStart=positions.length/3;
  for(let yIndex=0;yIndex<2;yIndex++){
    const y=yIndex?trunkTop:0;
    for(let i=0;i<trunkSides;i++){
      const a=(i/trunkSides)*Math.PI*2;
      positions.push(Math.cos(a)*trunkRadius,y,Math.sin(a)*trunkRadius);
    }
  }
  pushColor(colors,trunkColor,trunkSides*2);
  for(let i=0;i<trunkSides;i++){
    const next=(i+1)%trunkSides;
    const a=trunkBaseStart+i;
    const b=trunkBaseStart+next;
    const c=trunkBaseStart+trunkSides+i;
    const d=trunkBaseStart+trunkSides+next;
    indices.push(a,c,b,b,c,d);
  }

  // Overlapping irregular cone skirts. Each skirt is only `sides` triangles.
  // Slightly different phase/radius per layer prevents the old perfect-cone
  // placeholder look while keeping the geometry tiny.
  for(let layer=0;layer<layers;layer++){
    const t=layers===1?0:layer/(layers-1);
    const baseY=crownStart+t*(crownTop-crownStart)*.72;
    const apexY=Math.min(crownTop,baseY+.31-.09*t);
    const baseRadius=maxRadius+(minRadius-maxRadius)*Math.pow(t,.78);
    const phase=(layer*.73+sides*.11)%1*Math.PI*2;
    const ringStart=positions.length/3;
    const layerColor=foliageLow.clone().lerp(foliageHigh,.18+.58*t);

    for(let i=0;i<sides;i++){
      const a=phase+(i/sides)*Math.PI*2;
      const wobble=1+Math.sin(i*2.31+layer*1.71)*irregularity;
      const r=baseRadius*wobble;
      positions.push(Math.cos(a)*r,baseY,Math.sin(a)*r);
    }
    pushColor(colors,layerColor,sides);

    const apexIndex=positions.length/3;
    const tipOffset=maxRadius*.055;
    positions.push(
      Math.sin(layer*1.93)*tipOffset,
      apexY,
      Math.cos(layer*1.47)*tipOffset
    );
    pushColor(colors,layerColor,1);

    for(let i=0;i<sides;i++){
      const next=(i+1)%sides;
      indices.push(ringStart+i,apexIndex,ringStart+next);
    }
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function makeAsset(THREE,name,options){
  const geometry=buildProxyGeometry(THREE,options);
  const material=new THREE.MeshLambertMaterial({
    color:0xffffff,
    vertexColors:true,
    side:THREE.FrontSide,
    fog:true,
    dithering:true
  });
  const count=geometry.index?.count||geometry.getAttribute('position')?.count||0;
  return {
    name,
    parts:[{geometry,material}],
    triangles:Math.floor(count/3),
    normalizedHeight:1,
    proxy:true
  };
}

export function buildForestProxyAssets(THREE){
  return [
    // ~68 triangles. Used from the end of the near GLB zone to 900 m.
    makeAsset(THREE,'proxy-mid',{
      sides:8,
      layers:7,
      trunkSides:6,
      maxRadius:.235,
      minRadius:.050,
      irregularity:.085
    }),

    // ~20 triangles. Beyond 900 m, scene fog and sub-pixel branch detail make
    // additional geometry pure cost.
    makeAsset(THREE,'proxy-far',{
      sides:4,
      layers:3,
      trunkSides:4,
      maxRadius:.22,
      minRadius:.060,
      irregularity:.12
    })
  ];
}

// World Drive - hydrography rendering subsystem
// Step 13B: owns river ribbons, water polygons, coastline water,
// water-group cleanup and visible hydro rebuild.
// OSM/cache/parsing remains in water-data.js.

export function createWaterRenderer({
  THREE,
  group,
  statusEl,
  waterFeatures,
  coastlineFeatures,
  materials,
  terrainHeight,
  getWorldOffset,
  waterWidth,
  buildRibbon
}) {
  if(!THREE)throw new Error('Water renderer requires THREE');
  if(!group)throw new Error('Water renderer requires group');
  if(!Array.isArray(waterFeatures)){
    throw new Error('Water renderer requires waterFeatures');
  }
  if(!Array.isArray(coastlineFeatures)){
    throw new Error('Water renderer requires coastlineFeatures');
  }
  if(typeof terrainHeight!=='function'){
    throw new Error('Water renderer requires terrainHeight()');
  }
  if(typeof getWorldOffset!=='function'){
    throw new Error('Water renderer requires getWorldOffset()');
  }
  if(typeof waterWidth!=='function'){
    throw new Error('Water renderer requires waterWidth()');
  }
  if(typeof buildRibbon!=='function'){
    throw new Error('Water renderer requires buildRibbon()');
  }

  const {
    waterMat,
    riverMat,
    coastWaterMat
  }=materials;

  function disposeObject(object){
    object.traverse?.(child=>{
      child.geometry?.dispose?.();

      // Materials are shared with main.js and intentionally kept alive.
    });
  }

  function clear(){
    while(group.children.length){
      const child=group.children.pop();
      disposeObject(child);
    }
  }

  function addWaterRibbon(points,width,material){
    if(points.length<2)return null;

    // Keep water visually smooth and slightly above surrounding terrain.
    const raw=points.map(point=>
      terrainHeight(point.x,point.z)
    );

    const heights=raw.slice();

    for(let i=1;i<heights.length-1;i++){
      heights[i]=(
        raw[i-1]+
        2*raw[i]+
        raw[i+1]
      )/4;
    }

    const profile=points.map((point,i)=>({
      x:point.x,
      z:point.z,
      y:heights[i]+.28
    }));

    return buildRibbon(
      profile,
      width,
      material,
      0
    );
  }

  function simplifyWaterPoints(points,maxPoints=700){
    if(points.length<=maxPoints)return points;

    const step=Math.ceil(
      points.length/maxPoints
    );

    const output=[];

    for(let i=0;i<points.length;i+=step){
      output.push(points[i]);
    }

    if(output.length>=3)return output;

    return points.slice(0,maxPoints);
  }

  function addWaterPolygon(inputPoints){
    if(inputPoints.length<3)return null;

    const points=simplifyWaterPoints(inputPoints);
    const offset=getWorldOffset();

    const local=points.map(point=>({
      x:point.x-offset.x,
      z:point.z-offset.z,
      y:terrainHeight(point.x,point.z)
    }));

    const shape=new THREE.Shape();
    shape.moveTo(local[0].x,-local[0].z);

    for(let i=1;i<local.length;i++){
      shape.lineTo(
        local[i].x,
        -local[i].z
      );
    }

    shape.closePath();

    let geometry;

    try{
      geometry=new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI/2);
    }catch(error){
      console.warn(
        'Large water polygon triangulation failed',
        error
      );
      return null;
    }

    const heights=local
      .map(point=>point.y)
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);

    const qIndex=Math.max(
      0,
      Math.min(
        heights.length-1,
        Math.floor(heights.length*.18)
      )
    );

    const level=heights.length
      ?heights[qIndex]
      :0;

    const mesh=new THREE.Mesh(
      geometry,
      waterMat
    );

    mesh.position.y=level+.30;
    mesh.renderOrder=2;
    mesh.receiveShadow=false;

    return mesh;
  }

  function rebuildCoastalWater(){
    if(!coastlineFeatures.length)return 0;

    const offset=getWorldOffset();
    const radius=2200;
    const radius2=radius*radius;
    const coastWidth=3400;

    let shown=0;

    for(const feature of coastlineFeatures){
      const points=feature.points||[];
      if(points.length<2)continue;

      let featureNear=false;

      for(const point of points){
        const dx=point.x-offset.x;
        const dz=point.z-offset.z;

        if(dx*dx+dz*dz<radius2){
          featureNear=true;
          break;
        }
      }

      if(!featureNear)continue;

      const usable=simplifyWaterPoints(
        points,
        500
      );

      const samples=usable
        .map(point=>
          terrainHeight(point.x,point.z)
        )
        .filter(Number.isFinite)
        .sort((a,b)=>a-b);

      const level=samples.length
        ?samples[Math.floor(samples.length*.12)]
        :0;

      const positions=[];
      const indices=[];

      for(let i=0;i<usable.length;i++){
        const point=usable[i];
        const previous=usable[Math.max(0,i-1)];
        const next=usable[
          Math.min(usable.length-1,i+1)
        ];

        let tx=next.x-previous.x;
        let tz=next.z-previous.z;
        const length=Math.hypot(tx,tz)||1;

        tx/=length;
        tz/=length;

        let nx=-tz;
        let nz=tx;

        // Infer the sea/lake side from terrain elevation on both sides.
        const probe=180;
        const heightA=terrainHeight(
          point.x+nx*probe,
          point.z+nz*probe
        );
        const heightB=terrainHeight(
          point.x-nx*probe,
          point.z-nz*probe
        );

        if(heightA>heightB){
          nx=-nx;
          nz=-nz;
        }

        const lx=point.x-offset.x;
        const lz=point.z-offset.z;

        positions.push(
          lx,
          level+.20,
          lz
        );

        positions.push(
          lx+nx*coastWidth,
          level+.20,
          lz+nz*coastWidth
        );

        if(i<usable.length-1){
          const a=i*2;

          indices.push(
            a,a+2,a+1,
            a+2,a+3,a+1
          );
        }
      }

      if(indices.length<3)continue;

      const geometry=new THREE.BufferGeometry();

      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          positions,
          3
        )
      );

      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const mesh=new THREE.Mesh(
        geometry,
        coastWaterMat
      );

      mesh.renderOrder=1;
      mesh.receiveShadow=false;

      group.add(mesh);
      shown++;
    }

    return shown;
  }

  function rebuild(){
    clear();

    const offset=getWorldOffset();
    const radius=1650;
    const radius2=radius*radius;

    let shown=0;

    rebuildCoastalWater();

    for(const feature of waterFeatures){
      let near=false;

      for(const point of feature.points){
        const dx=point.x-offset.x;
        const dz=point.z-offset.z;

        if(dx*dx+dz*dz<radius2){
          near=true;
          break;
        }
      }

      if(!near)continue;

      let mesh=null;

      if(feature.kind==='polygon'){
        mesh=addWaterPolygon(
          feature.points
        );
      }else{
        mesh=addWaterRibbon(
          feature.points,
          waterWidth(feature.tags),
          feature.tags?.waterway==='river'
            ?riverMat
            :waterMat
        );
      }

      if(mesh){
        group.add(mesh);
        shown++;
      }
    }

    if(shown&&statusEl){
      // Data layer replaces this with Cache/OSM + counts after network loads.
      // During world-origin/terrain rebuilds this short status confirms rendering.
      statusEl.textContent='OSM';
    }

    return shown;
  }

  return {
    rebuild,
    clear,
    addWaterRibbon,
    addWaterPolygon,
    rebuildCoastalWater,
    simplifyWaterPoints
  };
}

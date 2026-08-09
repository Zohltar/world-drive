// World Drive - scenery rendering subsystem
// Step 12B: owns Three.js rendering for OSM scenery.
// It uses dedicated scenery infrastructure/forest groups so asynchronous
// scenery refreshes cannot erase bridge furniture or road signs.

export function createSceneryRenderer({
  THREE,
  statusEl,
  features,
  terrainDetailGroup,
  infrastructureGroup,
  buildingGroup,
  forestGroup,
  materials,
  featureCentroid,
  terrainHeight,
  nearestRoute,
  isWaterAt,
  pointInPolygon,
  getWorldOffset
}) {
  if(!THREE)throw new Error('Scenery renderer requires THREE');
  if(!Array.isArray(features))throw new Error('Scenery renderer requires features');
  if(typeof featureCentroid!=='function')throw new Error('Scenery renderer requires featureCentroid()');
  if(typeof terrainHeight!=='function')throw new Error('Scenery renderer requires terrainHeight()');
  if(typeof nearestRoute!=='function')throw new Error('Scenery renderer requires nearestRoute()');
  if(typeof isWaterAt!=='function')throw new Error('Scenery renderer requires isWaterAt()');
  if(typeof pointInPolygon!=='function')throw new Error('Scenery renderer requires pointInPolygon()');
  if(typeof getWorldOffset!=='function')throw new Error('Scenery renderer requires getWorldOffset()');

  const {
    buildingWallMat,
    rockMat,
    scrubMat,
    towerMat,
    lineMatPower,
    railMat,
    damMat,
    treeTrunkMat,
    treeMat
  }=materials;

  function disposeObject(object){
    object.traverse?.(child=>{
      child.geometry?.dispose?.();
      // Shared materials are intentionally not disposed here.
    });
  }

  function clearGroup(group){
    while(group.children.length){
      const child=group.children.pop();
      disposeObject(child);
    }
  }

  function clear(){
    clearGroup(terrainDetailGroup);
    clearGroup(infrastructureGroup);
    clearGroup(buildingGroup);
    clearGroup(forestGroup);
  }

  function makeFootprintMesh(points,height=6,material=buildingWallMat){
    if(points.length<3)return null;

    const offset=getWorldOffset();
    const local=points.map(point=>({
      x:point.x-offset.x,
      z:point.z-offset.z
    }));

    const shape=new THREE.Shape();
    shape.moveTo(local[0].x,-local[0].z);

    for(let i=1;i<local.length;i++){
      shape.lineTo(local[i].x,-local[i].z);
    }

    shape.closePath();

    const geometry=new THREE.ExtrudeGeometry(shape,{
      depth:height,
      bevelEnabled:false,
      steps:1
    });

    geometry.rotateX(-Math.PI/2);

    const center=featureCentroid(points);
    const mesh=new THREE.Mesh(geometry,material);

    mesh.position.y=terrainHeight(center.x,center.z)+.08;
    mesh.castShadow=true;
    mesh.receiveShadow=true;

    return mesh;
  }

  function addUtilityTower(x,z,scale=1){
    const offset=getWorldOffset();
    const group=new THREE.Group();
    const y=terrainHeight(x,z);

    for(const sx of [-1,1]){
      for(const sz of [-1,1]){
        const leg=new THREE.Mesh(
          new THREE.CylinderGeometry(.07,.11,10*scale,5),
          towerMat
        );

        leg.position.set(
          (x-offset.x)+sx*.9*scale,
          y+5*scale,
          (z-offset.z)+sz*.7*scale
        );

        leg.rotation.z=sx*.06;
        group.add(leg);
      }
    }

    for(const h of [4,7.2,9.2]){
      const bar=new THREE.Mesh(
        new THREE.BoxGeometry(5.2*scale,.12,.12),
        towerMat
      );

      bar.position.set(
        x-offset.x,
        y+h*scale,
        z-offset.z
      );

      group.add(bar);
    }

    return group;
  }

  function addDam(points){
    if(points.length<2)return null;

    const offset=getWorldOffset();
    const group=new THREE.Group();

    for(let i=0;i<points.length-1;i++){
      const a=points[i];
      const b=points[i+1];
      const dx=b.x-a.x;
      const dz=b.z-a.z;
      const len=Math.hypot(dx,dz);

      if(len<1)continue;

      const h=14;
      const mesh=new THREE.Mesh(
        new THREE.BoxGeometry(6,h,len),
        damMat
      );

      const mx=(a.x+b.x)/2;
      const mz=(a.z+b.z)/2;

      mesh.position.set(
        mx-offset.x,
        Math.min(
          terrainHeight(a.x,a.z),
          terrainHeight(b.x,b.z)
        )+h/2,
        mz-offset.z
      );

      mesh.rotation.y=Math.atan2(dx,dz);
      mesh.castShadow=true;
      mesh.receiveShadow=true;

      group.add(mesh);
    }

    return group;
  }

  function addGuardRail(points){
    const offset=getWorldOffset();
    const group=new THREE.Group();

    for(let i=0;i<points.length-1;i++){
      const a=points[i];
      const b=points[i+1];
      const dx=b.x-a.x;
      const dz=b.z-a.z;
      const len=Math.hypot(dx,dz);

      if(len<.5)continue;

      const mesh=new THREE.Mesh(
        new THREE.BoxGeometry(.10,.18,len),
        railMat
      );

      const mx=(a.x+b.x)/2;
      const mz=(a.z+b.z)/2;

      mesh.position.set(
        mx-offset.x,
        terrainHeight(mx,mz)+.72,
        mz-offset.z
      );

      mesh.rotation.y=Math.atan2(dx,dz);
      group.add(mesh);
    }

    return group;
  }

  function addPowerLine(points){
    const group=new THREE.Group();
    if(points.length<2)return group;

    const offset=getWorldOffset();
    const vertices=[];

    for(const point of points){
      vertices.push(
        point.x-offset.x,
        terrainHeight(point.x,point.z)+14,
        point.z-offset.z
      );
    }

    const geometry=new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices,3)
    );

    group.add(
      new THREE.Line(
        geometry,
        lineMatPower
      )
    );

    return group;
  }

  function addLandPatch(points,material,yOffset=.03){
    if(points.length<3)return null;

    const offset=getWorldOffset();
    const local=points.map(point=>({
      x:point.x-offset.x,
      z:point.z-offset.z
    }));

    const shape=new THREE.Shape();
    shape.moveTo(local[0].x,-local[0].z);

    for(let i=1;i<local.length;i++){
      shape.lineTo(local[i].x,-local[i].z);
    }

    shape.closePath();

    const geometry=new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);

    const center=featureCentroid(points);
    const mesh=new THREE.Mesh(geometry,material);

    mesh.position.y=
      terrainHeight(center.x,center.z)+yOffset;

    mesh.receiveShadow=true;
    return mesh;
  }

  function densifyForestPolygon(points,id){
    const center=featureCentroid(points);

    let seed=(Number(id)||1)*2654435761;
    const random=()=>{
      seed=(seed*1664525+1013904223)>>>0;
      return seed/4294967296;
    };

    const group=new THREE.Group();
    const radius=Math.min(
      180,
      Math.max(35,Math.sqrt(points.length)*26)
    );

    const offset=getWorldOffset();

    for(let i=0;i<28;i++){
      const angle=random()*Math.PI*2;
      const radiusSample=Math.sqrt(random())*radius;

      const x=center.x+Math.cos(angle)*radiusSample;
      const z=center.z+Math.sin(angle)*radiusSample;

      if(!pointInPolygon(x,z,points))continue;
      if(isWaterAt(x,z,6))continue;

      const route=nearestRoute(x,z);
      if(route&&route.d<13)continue;

      const scale=.65+random()*.9;
      const y=terrainHeight(x,z);

      const trunk=new THREE.Mesh(
        new THREE.CylinderGeometry(
          .10*scale,
          .16*scale,
          1.5*scale,
          5
        ),
        treeTrunkMat
      );

      trunk.position.set(
        x-offset.x,
        y+.75*scale,
        z-offset.z
      );

      const crown=new THREE.Mesh(
        new THREE.ConeGeometry(
          .78*scale,
          3.2*scale,
          6
        ),
        treeMat
      );

      crown.position.set(
        x-offset.x,
        y+2.25*scale,
        z-offset.z
      );

      group.add(trunk,crown);
    }

    return group;
  }

  function makeBuildingLOD(points,tags,dist){
    if(dist<520){
      let height=parseFloat(tags.height||'');

      if(!Number.isFinite(height)){
        const levels=parseFloat(
          tags['building:levels']||''
        );

        height=Number.isFinite(levels)
          ?Math.max(3,levels*3.1)
          :6.5;
      }

      return makeFootprintMesh(
        points,
        Math.min(45,height)
      );
    }

    const center=featureCentroid(points);

    let minx=Infinity;
    let maxx=-Infinity;
    let minz=Infinity;
    let maxz=-Infinity;

    for(const point of points){
      minx=Math.min(minx,point.x);
      maxx=Math.max(maxx,point.x);
      minz=Math.min(minz,point.z);
      maxz=Math.max(maxz,point.z);
    }

    const width=Math.max(
      3,
      Math.min(35,maxx-minx)
    );

    const depth=Math.max(
      3,
      Math.min(35,maxz-minz)
    );

    const height=Math.max(
      4,
      Math.min(
        18,
        parseFloat(tags.height||'')||7
      )
    );

    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(
        width,
        height,
        depth
      ),
      buildingWallMat
    );

    const offset=getWorldOffset();

    mesh.position.set(
      center.x-offset.x,
      terrainHeight(center.x,center.z)+height/2,
      center.z-offset.z
    );

    mesh.castShadow=dist<750;
    mesh.receiveShadow=true;

    return mesh;
  }

  function rebuild(){
    clear();

    const offset=getWorldOffset();
    const radius=1500;
    const radius2=radius*radius;

    let shown=0;

    for(const feature of features){
      const center=featureCentroid(feature.points);
      const dx=center.x-offset.x;
      const dz=center.z-offset.z;
      const dist2=dx*dx+dz*dz;

      if(dist2>radius2)continue;

      const dist=Math.sqrt(dist2);
      const tags=feature.tags||{};
      let object=null;

      if(tags.building&&dist<1150){
        object=makeBuildingLOD(
          feature.points,
          tags,
          dist
        );

        if(object)buildingGroup.add(object);
      }
      else if(
        (tags.power==='tower'||tags.power==='pole') &&
        dist<1400
      ){
        infrastructureGroup.add(
          addUtilityTower(
            center.x,
            center.z,
            tags.power==='pole'?.6:1
          )
        );
      }
      else if(
        tags.power==='line'||
        tags.power==='minor_line'
      ){
        infrastructureGroup.add(
          addPowerLine(feature.points)
        );
      }
      else if(
        tags.man_made==='dam'||
        tags.waterway==='dam'
      ){
        object=addDam(feature.points);
        if(object)infrastructureGroup.add(object);
      }
      else if(tags.barrier==='guard_rail'){
        infrastructureGroup.add(
          addGuardRail(feature.points)
        );
      }
      else if(
        tags.natural==='bare_rock'||
        tags.natural==='scree'||
        tags.natural==='cliff'
      ){
        object=addLandPatch(
          feature.points,
          rockMat,
          .04
        );

        if(object)terrainDetailGroup.add(object);
      }
      else if(
        tags.natural==='scrub'||
        tags.landuse==='meadow'
      ){
        object=addLandPatch(
          feature.points,
          scrubMat,
          .035
        );

        if(object)terrainDetailGroup.add(object);
      }
      else if(
        (tags.natural==='wood'||tags.landuse==='forest') &&
        dist<1150
      ){
        const cluster=densifyForestPolygon(
          feature.points,
          feature.id
        );

        if(cluster){
          if(dist>700){
            for(
              let i=cluster.children.length-1;
              i>=0;
              i--
            ){
              if(i%2){
                const child=cluster.children[i];
                cluster.remove(child);
                child.geometry?.dispose?.();
              }
            }
          }

          forestGroup.add(cluster);
        }
      }

      shown++;
    }

    if(statusEl){
      statusEl.textContent=`${shown} objets`;
    }

    return shown;
  }

  function removeTreesOverWater(){
    const offset=getWorldOffset();
    const remove=[];

    // OSM forest children are nested in cluster groups.
    for(const cluster of forestGroup.children){
      for(const child of cluster.children||[]){
        const x=child.position.x+offset.x;
        const z=child.position.z+offset.z;

        if(isWaterAt(x,z,4)){
          remove.push({
            cluster,
            child
          });
        }
      }
    }

    for(const item of remove){
      item.cluster.remove(item.child);
      item.child.geometry?.dispose?.();
    }

    return remove.length;
  }

  return {
    rebuild,
    clear,
    removeTreesOverWater
  };
}

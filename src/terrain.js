// World Drive - terrain rendering subsystem
// Owns procedural fallback relief, near-ground mesh and far-horizon LOD rings.
// Elevation tile loading remains in elevation.js; global world reconstruction stays in main.js.

export function createTerrainService({
  THREE,
  elevation,
  ground,
  horizonGroup,
  getWorldOffset,
  applyImagery,
  groundSize=2000,
  groundSegments=88
}) {
  if(!THREE)throw new Error('Terrain requires THREE');
  if(!elevation)throw new Error('Terrain requires elevation service');
  if(!ground)throw new Error('Terrain requires ground mesh');
  if(!horizonGroup)throw new Error('Terrain requires horizonGroup');
  if(typeof getWorldOffset!=='function'){
    throw new Error('Terrain requires getWorldOffset()');
  }

  let roadBedGroup=null;

  function disposeObject(object){
    object.traverse?.(child=>{
      child.geometry?.dispose?.();

      const material=child.material;
      if(Array.isArray(material)){
        material.forEach(item=>item?.dispose?.());
      }else{
        material?.dispose?.();
      }
    });
  }

  function clearRoadBed(){
    if(!roadBedGroup)return;

    if(roadBedGroup.parent){
      roadBedGroup.parent.remove(roadBedGroup);
    }

    disposeObject(roadBedGroup);
    roadBedGroup=null;
  }

  function sampleProfilePoint(profile,index){
    const i=Math.max(
      0,
      Math.min(profile.length-1,index)
    );

    return profile[i];
  }

  function profileNormal(profile,index){
    const prev=sampleProfilePoint(profile,index-1);
    const next=sampleProfilePoint(profile,index+1);

    let tx=next.x-prev.x;
    let tz=next.z-prev.z;

    const len=Math.hypot(tx,tz)||1;
    tx/=len;
    tz/=len;

    return {
      x:-tz,
      z:tx
    };
  }

  let activeRoadProfile=[];
  let roadSegmentIndex=new Map();
  const roadIndexCellSize=48;

  let roadBedOptions={
    roadHalfWidth:5.2,

    // Main terrain is only 120x120 (~16.7 m grid spacing).
    // Lower a wider safety corridor so no coarse triangle can bridge over road.
    terrainCutHalfWidth:13.5,

    blendWidth:12.0,
    surfaceOffset:.14
  };

  function roadCellKey(cx,cz){
    return `${cx},${cz}`;
  }

  function rebuildRoadSegmentIndex(){
    roadSegmentIndex=new Map();

    if(activeRoadProfile.length<2){
      return;
    }

    const margin=
      Math.max(
        roadBedOptions.roadHalfWidth,
        roadBedOptions.terrainCutHalfWidth
      )+
      roadBedOptions.blendWidth+
      4;

    for(let i=0;i<activeRoadProfile.length-1;i++){
      const a=activeRoadProfile[i];
      const b=activeRoadProfile[i+1];

      const vx=b.x-a.x;
      const vz=b.z-a.z;
      const len2=vx*vx+vz*vz;

      if(len2<1e-6)continue;

      const ay=Number.isFinite(a.y)
        ?a.y
        :heightAt(a.x,a.z);

      const by=Number.isFinite(b.y)
        ?b.y
        :heightAt(b.x,b.z);

      const segment={
        ax:a.x,
        az:a.z,
        ay,
        aroll:a.roll||0,
        bx:b.x,
        bz:b.z,
        by,
        broll:b.roll||0,
        vx,
        vz,
        len2
      };

      const minCx=Math.floor(
        (Math.min(a.x,b.x)-margin)/
        roadIndexCellSize
      );
      const maxCx=Math.floor(
        (Math.max(a.x,b.x)+margin)/
        roadIndexCellSize
      );
      const minCz=Math.floor(
        (Math.min(a.z,b.z)-margin)/
        roadIndexCellSize
      );
      const maxCz=Math.floor(
        (Math.max(a.z,b.z)+margin)/
        roadIndexCellSize
      );

      for(let cx=minCx;cx<=maxCx;cx++){
        for(let cz=minCz;cz<=maxCz;cz++){
          const key=roadCellKey(cx,cz);
          let bucket=roadSegmentIndex.get(key);

          if(!bucket){
            bucket=[];
            roadSegmentIndex.set(
              key,
              bucket
            );
          }

          bucket.push(segment);
        }
      }
    }
  }

  function nearestRoadSample(x,z){
    if(
      !activeRoadProfile.length||
      !roadSegmentIndex.size
    ){
      return null;
    }

    const cx=Math.floor(
      x/roadIndexCellSize
    );
    const cz=Math.floor(
      z/roadIndexCellSize
    );

    const bucket=
      roadSegmentIndex.get(
        roadCellKey(cx,cz)
      );

    // No indexed road corridor touches this cell, so almost all terrain
    // vertices return here without doing any segment projection work.
    if(!bucket||!bucket.length){
      return null;
    }

    let best=null;
    let bestD2=Infinity;

    for(const segment of bucket){
      let t=
        (
          (x-segment.ax)*segment.vx+
          (z-segment.az)*segment.vz
        )/
        segment.len2;

      t=Math.max(
        0,
        Math.min(1,t)
      );

      const px=
        segment.ax+
        segment.vx*t;

      const pz=
        segment.az+
        segment.vz*t;

      const dx=x-px;
      const dz=z-pz;
      const d2=dx*dx+dz*dz;

      if(d2<bestD2){
        bestD2=d2;

        const len=Math.sqrt(
          segment.len2
        )||1;

        const nx=
          -segment.vz/len;

        const nz=
          segment.vx/len;

        best={
          distance2:d2,
          signedLateral:
            dx*nx+
            dz*nz,
          y:
            segment.ay+
            (segment.by-segment.ay)*t,
          roll:
            segment.aroll+
            (segment.broll-segment.aroll)*t
        };
      }
    }

    return best;
  }

  function gradedHeight(x,z,naturalY){
    const sample=nearestRoadSample(x,z);

    if(!sample){
      return naturalY;
    }

    const {
      terrainCutHalfWidth,
      blendWidth,
      surfaceOffset
    }=roadBedOptions;

    const roadSupportY=
      sample.y+
      Math.tan(sample.roll||0)*
      sample.signedLateral-
      surfaceOffset;

    const cutHalfWidth2=
      terrainCutHalfWidth*
      terrainCutHalfWidth;

    // Full safety cut around the road. This is intentionally wider than the
    // visible asphalt/shoulders because the coarse terrain grid can otherwise
    // form a triangle whose center crosses the roadway.
    if(sample.distance2<=cutHalfWidth2){
      return Math.min(
        naturalY,
        roadSupportY
      );
    }

    const outer=
      terrainCutHalfWidth+
      blendWidth;

    const outer2=outer*outer;

    if(sample.distance2>=outer2){
      return naturalY;
    }

    const distance=Math.sqrt(
      sample.distance2
    );

    const t=
      (distance-terrainCutHalfWidth)/
      blendWidth;

    // smoothstep transition from road platform back to untouched DEM.
    const smooth=t*t*(3-2*t);

    const blended=
      roadSupportY*(1-smooth)+
      naturalY*smooth;

    // Never raise terrain above its original DEM value. This system's job is
    // to cut down intrusive terrain, not create artificial berms.
    return Math.min(
      naturalY,
      blended
    );
  }

  function rebuildRoadBedVisual(){
    clearRoadBed();

    if(activeRoadProfile.length<2){
      return false;
    }

    const offset=getWorldOffset();
    const group=new THREE.Group();
    group.name='road-terrain-transition';

    const {
      roadHalfWidth,
      blendWidth,
      surfaceOffset
    }=roadBedOptions;

    const lateral=[
      -(roadHalfWidth+blendWidth),
      -roadHalfWidth,
      -roadHalfWidth*.5,
      0,
      roadHalfWidth*.5,
      roadHalfWidth,
      roadHalfWidth+blendWidth
    ];

    const positions=[];
    const uvs=[];
    const indices=[];
    const usable=[];
    const half=groundSize/2+80;

    for(let i=0;i<activeRoadProfile.length;i++){
      const point=activeRoadProfile[i];
      const lx=point.x-offset.x;
      const lz=point.z-offset.z;

      if(
        lx<-half||lx>half||
        lz<-half||lz>half
      ){
        continue;
      }

      usable.push({
        point,
        sourceIndex:i
      });
    }

    if(usable.length<2){
      return false;
    }

    for(let row=0;row<usable.length;row++){
      const {
        point,
        sourceIndex
      }=usable[row];

      const normal=profileNormal(
        activeRoadProfile,
        sourceIndex
      );

      const roadY=Number.isFinite(point.y)
        ?point.y
        :heightAt(point.x,point.z);

      const roadRoll=Number.isFinite(point.roll)
        ?point.roll
        :0;

      const roadRollSlope=Math.tan(
        roadRoll
      );

      for(const lateralOffset of lateral){
        const wx=
          point.x+
          normal.x*lateralOffset;

        const wz=
          point.z+
          normal.z*lateralOffset;

        const naturalY=heightAt(wx,wz);
        const absOffset=Math.abs(lateralOffset);

        let y;

        if(absOffset<=roadHalfWidth){
          y=Math.min(
            naturalY,
            roadY+roadRollSlope*lateralOffset-surfaceOffset
          );
        }else{
          const t=Math.min(
            1,
            (absOffset-roadHalfWidth)/
            blendWidth
          );

          const smooth=
            t*t*(3-2*t);

          const blended=
            (roadY+roadRollSlope*lateralOffset-surfaceOffset)*(1-smooth)+
            naturalY*smooth;

          y=Math.min(
            naturalY,
            blended
          );
        }

        positions.push(
          wx-offset.x,
          y,
          wz-offset.z
        );

        uvs.push(
          (wx-offset.x+groundSize/2)/groundSize,
          1-(wz-offset.z+groundSize/2)/groundSize
        );
      }
    }

    const cols=lateral.length;

    for(let row=0;row<usable.length-1;row++){
      for(let col=0;col<cols-1;col++){
        const a=row*cols+col;
        const b=a+1;
        const c=a+cols;
        const d=c+1;

        indices.push(
          a,c,b,
          b,c,d
        );
      }
    }

    if(!indices.length){
      return false;
    }

    const geometry=new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    );

    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        uvs,
        2
      )
    );

    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    applyHillshadeColors(
      geometry
    );

    const material=
      ground.material.clone();

    material.alphaMap=null;
    material.alphaTest=0;
    material.transparent=false;
    material.polygonOffset=true;
    material.polygonOffsetFactor=1;
    material.polygonOffsetUnits=1;

    const mesh=new THREE.Mesh(
      geometry,
      material
    );

    mesh.receiveShadow=true;
    mesh.castShadow=false;
    mesh.renderOrder=-1;

    group.add(mesh);
    ground.parent?.add(group);

    roadBedGroup=group;
    return true;
  }

  function setRoadBed(profile,{
    roadHalfWidth=5.2,
    terrainCutHalfWidth=13.5,
    blendWidth=12.0,
    surfaceOffset=.14
  }={}){
    activeRoadProfile=
      Array.isArray(profile)
        ?profile.slice()
        :[];

    roadBedOptions={
      roadHalfWidth,
      terrainCutHalfWidth,
      blendWidth,
      surfaceOffset
    };

    // Build once per local road profile. Terrain vertices then query only
    // nearby segments instead of scanning the full route.
    rebuildRoadSegmentIndex();

    // Rebuild main terrain too: nearby ground vertices are lowered smoothly.
    rebuildGround();

    return rebuildRoadBedVisual();
  }

  function fallbackHeight(x,z){
    // Mild deterministic procedural relief while real DEM tiles are unavailable.
    return (
      5*Math.sin(x*.00023) +
      4*Math.sin(z*.00031) +
      2.5*Math.sin((x+z)*.00017)
    );
  }

  function heightAt(x,z){
    const ll=elevation.worldToLatLon
      ?elevation.worldToLatLon(x,z)
      :null;

    // Current elevation service accepts lat/lon, while the terrain service receives
    // world coordinates. main.js injects a world-space adapter below when present.
    if(typeof elevation.relativeWorldHeight==='function'){
      const value=elevation.relativeWorldHeight(x,z);
      if(value!==null&&Number.isFinite(value))return value;
    }

    if(ll){
      const value=elevation.relativeElevationAt(ll.lat,ll.lon);
      if(value!==null&&Number.isFinite(value))return value;
    }

    return fallbackHeight(x,z);
  }

  function clearObjectGroup(group){
    while(group.children.length){
      const child=group.children.pop();

      child.traverse?.(object=>{
        object.geometry?.dispose?.();

        const material=object.material;
        if(Array.isArray(material)){
          material.forEach(item=>item?.dispose?.());
        }else{
          material?.dispose?.();
        }
      });
    }
  }

  function applyHillshadeColors(geometry){
    const positions=geometry.attributes.position;
    const normals=geometry.attributes.normal;

    if(!positions||!normals)return;

    let minY=Infinity;
    let maxY=-Infinity;

    for(let i=0;i<positions.count;i++){
      const y=positions.getY(i);
      if(y<minY)minY=y;
      if(y>maxY)maxY=y;
    }

    const heightSpan=Math.max(
      1,
      maxY-minY
    );

    // Strong fixed virtual light for Photo OFF readability.
    const lightX=-.58;
    const lightY=.64;
    const lightZ=-.50;

    const colors=new Float32Array(
      positions.count*3
    );

    const lowColor=new THREE.Color(0x4f6e3e);
    const midColor=new THREE.Color(0x6f8150);
    const highColor=new THREE.Color(0x8b8d69);
    const tempColor=new THREE.Color();

    const CONTOUR_INTERVAL=14;
    const CONTOUR_WIDTH=.16;

    for(let i=0;i<positions.count;i++){
      const nx=normals.getX(i);
      const ny=normals.getY(i);
      const nz=normals.getZ(i);
      const y=positions.getY(i);

      const directional=
        nx*lightX+
        ny*lightY+
        nz*lightZ;

      const slope=
        Math.max(
          0,
          Math.min(
            1,
            1-Math.abs(ny)
          )
        );

      const altitude=
        Math.max(
          0,
          Math.min(
            1,
            (y-minY)/heightSpan
          )
        );

      // Topographic base tint:
      // green valleys -> olive mids -> pale rocky heights.
      if(altitude<.58){
        tempColor.copy(lowColor).lerp(
          midColor,
          altitude/.58
        );
      }else{
        tempColor.copy(midColor).lerp(
          highColor,
          (altitude-.58)/.42
        );
      }

      // Strong directional hillshade + explicit slope darkening.
      let shade=
        .72+
        directional*.46-
        slope*.10;

      shade=
        Math.max(
          .34,
          Math.min(
            1.36,
            shade
          )
        );

      // Subtle but clearly visible contour lines every ~14 vertical metres.
      // Width is expressed as fraction of contour interval.
      const contourPhase=
        Math.abs(
          ((y/CONTOUR_INTERVAL)%1+1)%1-.5
        )*2;

      const contour=
        contourPhase>
        (1-CONTOUR_WIDTH)
          ?.72
          :1;

      // Intermediate soft contour gives terrain shape even at shallow camera angles.
      const minorPhase=
        Math.abs(
          ((y/(CONTOUR_INTERVAL/2))%1+1)%1-.5
        )*2;

      const minorContour=
        minorPhase>.94
          ?.88
          :1;

      const finalShade=
        shade*
        contour*
        minorContour;

      colors[i*3]=
        Math.min(
          1,
          tempColor.r*finalShade
        );

      colors[i*3+1]=
        Math.min(
          1,
          tempColor.g*finalShade
        );

      colors[i*3+2]=
        Math.min(
          1,
          tempColor.b*finalShade
        );
    }

    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(
        colors,
        3
      )
    );
  }

  function rebuildGround(){
    if(ground.geometry)ground.geometry.dispose();

    // Fine road detail is handled by the separate road-bed transition mesh.
    // The main terrain only needs enough density to blend into that corridor.
    // Keep the large terrain mesh light. Fine road-edge detail is handled by
    // the dedicated road-bed transition mesh instead of brute-force terrain density.
    const effectiveSegments=Math.max(
      groundSegments,
      120
    );

    const geometry=new THREE.PlaneGeometry(
      groundSize,
      groundSize,
      effectiveSegments,
      effectiveSegments
    );

    geometry.rotateX(-Math.PI/2);

    const positions=geometry.attributes.position;
    const offset=getWorldOffset();

    for(let i=0;i<positions.count;i++){
      const rx=positions.getX(i);
      const rz=positions.getZ(i);

      const wx=offset.x+rx;
      const wz=offset.z+rz;

      const natural=
        heightAt(wx,wz)-.15;

      positions.setY(
        i,
        activeRoadProfile.length
          ?gradedHeight(wx,wz,natural)
          :natural
      );
    }

    positions.needsUpdate=true;
    geometry.computeVertexNormals();
    applyHillshadeColors(
      geometry
    );

    ground.geometry=geometry;
    ground.rotation.set(0,0,0);
    ground.position.set(0,0,0);

    applyImagery?.();

    if(roadBedGroup){
      const mesh=roadBedGroup.children[0];

      if(mesh?.material){
        mesh.material.map=ground.material.map;
        mesh.material.color.copy?.(
          ground.material.color
        );
        mesh.material.needsUpdate=true;
      }

    }
  }

  function rebuildHorizon(){
    clearObjectGroup(horizonGroup);

    const offset=getWorldOffset();

    // Overlap near terrain from ~850 m onward. Each ring progressively reduces
    // geometry density while increasing opacity to soften the near/far hand-off.
    const rings=[
      {r0:850,r1:1150,segs:80,opacity:.28,yOff:-.42},
      {r0:1100,r1:1550,segs:64,opacity:.52,yOff:-.50},
      {r0:1500,r1:2150,segs:48,opacity:.78,yOff:-.58},
      {r0:2100,r1:3000,segs:36,opacity:1.0,yOff:-.66}
    ];

    for(const ring of rings){
      const positions=[];
      const indices=[];

      for(let i=0;i<=ring.segs;i++){
        const angle=i/ring.segs*Math.PI*2;

        for(const radius of [ring.r0,ring.r1]){
          const rx=Math.cos(angle)*radius;
          const rz=Math.sin(angle)*radius;

          positions.push(
            rx,
            heightAt(
              offset.x+rx,
              offset.z+rz
            )+ring.yOff,
            rz
          );
        }
      }

      for(let i=0;i<ring.segs;i++){
        const a=i*2;
        indices.push(
          a,a+2,a+1,
          a+2,a+3,a+1
        );
      }

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

      const material=new THREE.MeshStandardMaterial({
        color:0x60744f,
        roughness:1,
        side:THREE.DoubleSide,
        transparent:ring.opacity<1,
        opacity:ring.opacity,
        depthWrite:ring.opacity>.7
      });

      const mesh=new THREE.Mesh(
        geometry,
        material
      );

      mesh.receiveShadow=ring.r0<1200;
      mesh.renderOrder=-2;

      horizonGroup.add(mesh);
    }
  }

  function clearHorizon(){
    clearObjectGroup(horizonGroup);
  }

  return {
    heightAt,
    fallbackHeight,
    rebuildGround,
    rebuildHorizon,
    clearHorizon,
    setRoadBed,
    clearRoadBed:()=>{
      activeRoadProfile=[];
      roadSegmentIndex=new Map();
      clearRoadBed();
    }
  };
}

// World Drive V21.18 - flat departure platform + elevation-aware switchback terrain blend
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
  let nearTerrainColorRange={minY:null,maxY:null};

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

  function segmentUnitNormal(a,b){
    let tx=b.x-a.x;
    let tz=b.z-a.z;
    const len=Math.hypot(tx,tz)||1;
    tx/=len;
    tz/=len;

    return {
      x:-tz,
      z:tx
    };
  }

  // Robust polyline offset for terrain-only road cuts. The old transition
  // ribbon used a raw averaged normal. At a tight hairpin that normal can
  // become unstable and send an outer terrain vertex tens of metres away,
  // creating the long slabs/fins seen in Yungas. Use a clamped miter instead.
  function profileOffsetVector(profile,index,lateralOffset){
    const point=sampleProfilePoint(profile,index);
    const prev=sampleProfilePoint(profile,index-1);
    const next=sampleProfilePoint(profile,index+1);

    if(index<=0){
      const n=segmentUnitNormal(point,next);
      return {x:n.x*lateralOffset,z:n.z*lateralOffset};
    }

    if(index>=profile.length-1){
      const n=segmentUnitNormal(prev,point);
      return {x:n.x*lateralOffset,z:n.z*lateralOffset};
    }

    const n0=segmentUnitNormal(prev,point);
    const n1=segmentUnitNormal(point,next);

    let mx=n0.x+n1.x;
    let mz=n0.z+n1.z;
    const mlen=Math.hypot(mx,mz);

    // Near a reversal the two normals cancel. A bevel-style fallback is much
    // safer than trying to create an infinite miter.
    if(mlen<0.18){
      return {x:n1.x*lateralOffset,z:n1.z*lateralOffset};
    }

    mx/=mlen;
    mz/=mlen;

    const denom=mx*n1.x+mz*n1.z;
    if(denom<0.28){
      return {x:n1.x*lateralOffset,z:n1.z*lateralOffset};
    }

    let miterLength=lateralOffset/denom;

    // A 1.45x cap still closes normal bends cleanly but makes pathological
    // switchback joins geometrically incapable of producing giant spikes.
    const maxLength=Math.abs(lateralOffset)*1.45;
    miterLength=Math.max(
      -maxLength,
      Math.min(maxLength,miterLength)
    );

    return {
      x:mx*miterLength,
      z:mz*miterLength
    };
  }

  let activeRoadProfile=[];
  let roadSegmentIndex=new Map();
  const roadIndexCellSize=48;

  let roadBedOptions={
    roadHalfWidth:5.4,

    // V21.15.2 uses a denser main terrain plus a wider geometry-only cut.
    // This keeps mountain triangles physically below the road instead of
    // manipulating stencil/depth ownership at the GPU level.
    terrainCutHalfWidth:16.5,

    blendWidth:14.0,
    surfaceOffset:.20,
    startPad:null
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

  function nearestRoadSample(x,z,referenceY=null){
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
    let bestScore=Infinity;
    let hardRoadBest=null;
    let hardRoadBestD2=Infinity;
    const elevationAware=Number.isFinite(referenceY);
    const maxTerrainEffect=
      roadBedOptions.terrainCutHalfWidth+
      roadBedOptions.blendWidth+2;
    const maxTerrainEffect2=maxTerrainEffect*maxTerrainEffect;
    const hardRoadRadius=roadBedOptions.roadHalfWidth+1.0;
    const hardRoadRadius2=hardRoadRadius*hardRoadRadius;

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
      const roadY=
        segment.ay+
        (segment.by-segment.ay)*t;

      // Yungas contains many road branches that are close in plan view but
      // tens of metres apart vertically. Pure X/Z proximity can therefore
      // make an upper terrain vertex get excavated toward the LOWER road (or
      // vice versa), creating the large dark terraces/cliffs. Terrain grading
      // gets a modest elevation penalty so it follows the road branch that is
      // physically compatible with the local DEM. Calls without referenceY
      // retain the original planar-nearest behaviour.
      if(elevationAware&&d2>maxTerrainEffect2){
        continue;
      }

      const dy=elevationAware
        ?referenceY-roadY
        :0;
      const score=d2+(elevationAware?dy*dy*.34:0);

      const len=Math.sqrt(
        segment.len2
      )||1;

      const nx=
        -segment.vz/len;

      const nz=
        segment.vx/len;

      const candidate={
        distance2:d2,
        signedLateral:
          dx*nx+
          dz*nz,
        y:roadY,
        roll:
          segment.aroll+
          (segment.broll-segment.aroll)*t
      };

      // Directly under the visible road corridor, X/Z wins unconditionally:
      // terrain must never be allowed to remain above the actual road simply
      // because the untouched mountainside happens to match another stacked
      // branch better in elevation.
      if(elevationAware&&d2<=hardRoadRadius2&&d2<hardRoadBestD2){
        hardRoadBestD2=d2;
        hardRoadBest=candidate;
      }

      if(score<bestScore){
        bestScore=score;

        best=candidate;
      }
    }

    return hardRoadBest||best;
  }

  function startPadHeight(x,z,naturalY){
    const pad=roadBedOptions.startPad;
    if(!pad||!Number.isFinite(pad.x)||!Number.isFinite(pad.z)||!Number.isFinite(pad.y)){
      return naturalY;
    }

    const angle=Number.isFinite(pad.angle)?pad.angle:0;
    const forwardOffset=Number.isFinite(pad.forwardOffset)?pad.forwardOffset:0;
    const halfLength=Math.max(4,Number(pad.halfLength)||20);
    const halfWidth=Math.max(4,Number(pad.halfWidth)||10);
    const blendWidth=Math.max(2,Number(pad.blendWidth)||22);

    // Road tangent is (sin(angle), cos(angle)). Move the pad slightly forward
    // so there is useful flat terrain both behind the spawn and ahead of it.
    const tx=Math.sin(angle);
    const tz=Math.cos(angle);
    const nx=-tz;
    const nz=tx;
    const cx=pad.x+tx*forwardOffset;
    const cz=pad.z+tz*forwardOffset;
    const dx=x-cx;
    const dz=z-cz;
    const along=dx*tx+dz*tz;
    const lateral=dx*nx+dz*nz;

    // Distance to an oriented rectangle. Inside it, distance is zero and the
    // terrain is exactly flat. Outside it, blend smoothly back to the DEM.
    const qx=Math.abs(along)-halfLength;
    const qz=Math.abs(lateral)-halfWidth;
    const outside=Math.hypot(
      Math.max(0,qx),
      Math.max(0,qz)
    );

    if(qx<=0&&qz<=0){
      return pad.y;
    }

    if(outside>=blendWidth){
      return naturalY;
    }

    const t=Math.max(0,Math.min(1,outside/blendWidth));
    const smooth=t*t*(3-2*t);
    return pad.y*(1-smooth)+naturalY*smooth;
  }

  function gradedHeight(x,z,naturalY){
    const sample=nearestRoadSample(x,z,naturalY);

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
      terrainCutHalfWidth,
      blendWidth,
      surfaceOffset
    }=roadBedOptions;

    // IMPORTANT: the V21.16 main terrain excavation remains unchanged. It is
    // still the geometry that guarantees road clearance. This mesh is visual
    // terrain only: two side slopes that hide the broad safety trench. It no
    // longer spans underneath the road from left to right.
    const visualInner=Math.max(
      roadHalfWidth-.15,
      5.20
    );
    const visualOuter=Math.max(
      visualInner+1,
      terrainCutHalfWidth+blendWidth
    );

    // More samples near the shoulder, fewer farther out. Each side gets its
    // own ribbon; no triangle is ever allowed to bridge across the roadway.
    const fractions=[0,.12,.28,.50,.74,1];
    const lateralMagnitudes=fractions.map(f=>
      visualInner+(visualOuter-visualInner)*f
    );

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

    function buildSide(side){
      const positions=[];
      const uvs=[];
      const indices=[];
      const cols=lateralMagnitudes.length;

      for(let row=0;row<usable.length;row++){
        const {point,sourceIndex}=usable[row];
        const roadY=Number.isFinite(point.y)
          ?point.y
          :heightAt(point.x,point.z);
        const roadRoll=Number.isFinite(point.roll)
          ?point.roll
          :0;
        const roadRollSlope=Math.tan(roadRoll);

        for(let col=0;col<cols;col++){
          const magnitude=lateralMagnitudes[col];
          const lateralOffset=magnitude*side;
          const shift=profileOffsetVector(
            activeRoadProfile,
            sourceIndex,
            lateralOffset
          );

          const wx=point.x+shift.x;
          const wz=point.z+shift.z;
          const rawNaturalY=heightAt(wx,wz);
          const naturalY=startPadHeight(wx,wz,rawNaturalY);
          const roadSupportY=
            roadY+
            roadRollSlope*lateralOffset-
            surfaceOffset;

          const t=(magnitude-visualInner)/
            Math.max(.001,visualOuter-visualInner);

          // Ease out quickly from the shoulder. The main V21.16 terrain stays
          // safely cut underneath, while the visible terrain returns toward
          // the natural mountainside without leaving a giant flat platform.
          const rise=1-Math.pow(1-Math.max(0,Math.min(1,t)),2.35);
          const visualY=
            roadSupportY*(1-rise)+
            naturalY*rise;

          positions.push(
            wx-offset.x,
            Math.min(naturalY,visualY),
            wz-offset.z
          );

          uvs.push(
            (wx-offset.x+groundSize/2)/groundSize,
            1-(wz-offset.z+groundSize/2)/groundSize
          );
        }
      }

      for(let row=0;row<usable.length-1;row++){
        // The local profile can leave the square and re-enter. Never connect
        // separate route chunks with a terrain triangle.
        if(usable[row+1].sourceIndex!==usable[row].sourceIndex+1){
          continue;
        }

        const p0=usable[row].point;
        const p1=usable[row+1].point;
        const centerStep=Math.hypot(
          p1.x-p0.x,
          p1.z-p0.z
        );

        // Normal route samples are <=5 m apart. A very long jump means the
        // source geometry is discontinuous and must not be triangulated.
        if(centerStep>9){
          continue;
        }

        for(let col=0;col<cols-1;col++){
          const a=row*cols+col;
          const b=a+1;
          const c=a+cols;
          const d=c+1;

          // Final geometric fuse: if a hairpin join still produces an
          // abnormally stretched terrain quad, simply leave the original
          // V21.16 ground visible there instead of drawing a spike.
          const ax=positions[a*3],az=positions[a*3+2];
          const bx=positions[b*3],bz=positions[b*3+2];
          const cx=positions[c*3],cz=positions[c*3+2];
          const dx=positions[d*3],dz=positions[d*3+2];
          const maxEdge=Math.max(
            Math.hypot(cx-ax,cz-az),
            Math.hypot(dx-bx,dz-bz),
            Math.hypot(bx-ax,bz-az),
            Math.hypot(dx-cx,dz-cz)
          );

          const expected=Math.max(
            10,
            centerStep*3.0,
            (lateralMagnitudes[col+1]-lateralMagnitudes[col])*3.0
          );

          if(maxEdge>expected){
            continue;
          }

          // A side ribbon from one switchback can geometrically pass over a
          // neighbouring branch even though all of its source points belong
          // to the correct road. Reject any terrain triangle that crosses the
          // protected road corridor of ANY branch. This is terrain-only and
          // never changes road geometry.
          const protectedRadius=Math.max(5.05,roadHalfWidth-.28);
          const protected2=protectedRadius*protectedRadius;
          const pointClear=(ia,ib=null,ic=null)=>{
            let x=positions[ia*3];
            let z=positions[ia*3+2];
            if(ib!==null){x+=positions[ib*3];z+=positions[ib*3+2];}
            if(ic!==null){x+=positions[ic*3];z+=positions[ic*3+2];}
            const div=ic!==null?3:(ib!==null?2:1);
            x=x/div+offset.x;
            z=z/div+offset.z;
            const nearby=nearestRoadSample(x,z);
            return !nearby||nearby.distance2>protected2;
          };
          const triangleClear=(i0,i1,i2)=>
            pointClear(i0)&&pointClear(i1)&&pointClear(i2)&&
            pointClear(i0,i1)&&pointClear(i1,i2)&&pointClear(i2,i0)&&
            pointClear(i0,i1,i2);

          if(triangleClear(a,c,b))indices.push(a,c,b);
          if(triangleClear(b,c,d))indices.push(b,c,d);
        }
      }

      if(!indices.length){
        return null;
      }

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions,3)
      );
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(uvs,2)
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      applyRoadBedTerrainColors(geometry);

      const material=ground.material.clone();
      material.alphaMap=null;
      material.alphaTest=0;
      material.transparent=false;
      material.side=THREE.DoubleSide;

      // Terrain must always lose depth priority to the road surface. Test 2
      // pulled this ribbon forward, which could expose green wedges on top of
      // asphalt at very steep joins. Push it slightly behind instead.
      material.polygonOffset=true;
      material.polygonOffsetFactor=1;
      material.polygonOffsetUnits=1;

      const mesh=new THREE.Mesh(geometry,material);
      mesh.receiveShadow=true;
      mesh.castShadow=false;
      mesh.renderOrder=-1;
      return mesh;
    }

    const left=buildSide(-1);
    const right=buildSide(1);

    if(left)group.add(left);
    if(right)group.add(right);

    if(!group.children.length){
      return false;
    }

    ground.parent?.add(group);
    roadBedGroup=group;
    return true;
  }

  function setRoadBed(profile,{
    roadHalfWidth=5.4,
    terrainCutHalfWidth=16.5,
    blendWidth=14.0,
    surfaceOffset=.20,
    startPad=null
  }={}){
    activeRoadProfile=
      Array.isArray(profile)
        ?profile.slice()
        :[];

    roadBedOptions={
      roadHalfWidth,
      terrainCutHalfWidth,
      blendWidth,
      surfaceOffset,
      startPad:startPad&&typeof startPad==='object'
        ?{...startPad}
        :null
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

  function applyRoadBedTerrainColors(geometry){
    const positions=geometry.attributes.position;
    if(!positions)return;

    const offset=getWorldOffset();
    const colors=new Float32Array(positions.count*3);

    let minY=nearTerrainColorRange.minY;
    let maxY=nearTerrainColorRange.maxY;
    if(!Number.isFinite(minY)||!Number.isFinite(maxY)||maxY<=minY){
      minY=Infinity;
      maxY=-Infinity;
      for(let i=0;i<positions.count;i++){
        const wx=positions.getX(i)+offset.x;
        const wz=positions.getZ(i)+offset.z;
        const y=heightAt(wx,wz)-.15;
        if(y<minY)minY=y;
        if(y>maxY)maxY=y;
      }
      if(!Number.isFinite(minY)||!Number.isFinite(maxY)){
        minY=0;maxY=1;
      }
    }

    const heightSpan=Math.max(1,maxY-minY);
    const lightX=-.58,lightY=.64,lightZ=-.50;
    const lowColor=new THREE.Color(0x4f6e3e);
    const midColor=new THREE.Color(0x6f8150);
    const highColor=new THREE.Color(0x8b8d69);
    const tempColor=new THREE.Color();
    const CONTOUR_INTERVAL=14;
    const CONTOUR_WIDTH=.16;
    const eps=7;

    for(let i=0;i<positions.count;i++){
      const wx=positions.getX(i)+offset.x;
      const wz=positions.getZ(i)+offset.z;

      // Colour the artificial cut with the APPEARANCE of the untouched DEM,
      // not with the steep normal of the transition ribbon itself. Geometry
      // still performs the road clearance, but Photo OFF no longer reveals a
      // conspicuous dark-green strip tracing every road cut.
      const y=heightAt(wx,wz)-.15;
      const hL=heightAt(wx-eps,wz)-.15;
      const hR=heightAt(wx+eps,wz)-.15;
      const hD=heightAt(wx,wz-eps)-.15;
      const hU=heightAt(wx,wz+eps)-.15;

      const gx=(hR-hL)/(2*eps);
      const gz=(hU-hD)/(2*eps);
      let nx=-gx,ny=1,nz=-gz;
      const nlen=Math.hypot(nx,ny,nz)||1;
      nx/=nlen;ny/=nlen;nz/=nlen;

      const directional=nx*lightX+ny*lightY+nz*lightZ;
      const slope=Math.max(0,Math.min(1,1-Math.abs(ny)));
      const altitude=Math.max(0,Math.min(1,(y-minY)/heightSpan));

      if(altitude<.58){
        tempColor.copy(lowColor).lerp(midColor,altitude/.58);
      }else{
        tempColor.copy(midColor).lerp(highColor,(altitude-.58)/.42);
      }

      let shade=.72+directional*.46-slope*.10;
      shade=Math.max(.34,Math.min(1.36,shade));

      const contourPhase=Math.abs((((y/CONTOUR_INTERVAL)%1)+1)%1-.5)*2;
      const contour=contourPhase>(1-CONTOUR_WIDTH)?.72:1;
      const minorPhase=Math.abs((((y/(CONTOUR_INTERVAL/2))%1)+1)%1-.5)*2;
      const minorContour=minorPhase>.94?.88:1;
      const finalShade=shade*contour*minorContour;

      colors[i*3]=Math.min(1,tempColor.r*finalShade);
      colors[i*3+1]=Math.min(1,tempColor.g*finalShade);
      colors[i*3+2]=Math.min(1,tempColor.b*finalShade);
    }

    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors,3)
    );
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

  function effectiveGroundSegments(){
    // Keep the near terrain and the first distant-LOD perimeter on the exact
    // same sampling grid. A shared border prevents ridge spikes and avoids
    // overlapping geometry where the textured ground hands off to the
    // procedural mountain mesh.
    return Math.max(
      groundSegments,
      180
    );
  }

  function renderedTerrainHeight(x,z){
    const natural=heightAt(x,z)-.15;
    const departureSafe=startPadHeight(x,z,natural);

    // First flatten the dedicated departure pad, then let the normal road cut
    // win inside the asphalt corridor. This prevents the pad from ever pushing
    // terrain through the road surface.
    return activeRoadProfile.length
      ?gradedHeight(x,z,departureSafe)
      :departureSafe;
  }

  function rebuildGround(){
    if(ground.geometry)ground.geometry.dispose();

    // Fine road detail is handled by the separate road-bed transition mesh.
    // The main terrain only needs enough density to blend into that corridor.
    // Keep the large terrain mesh light. Fine road-edge detail is handled by
    // the dedicated road-bed transition mesh instead of brute-force terrain density.
    // V21.15.2: ~11 m spacing on the 2 km local patch instead of ~16.7 m.
    // This is still modest (~33k vertices) but dramatically reduces triangles
    // that can cut across a narrow mountain road between sampled vertices.
    const effectiveSegments=
      effectiveGroundSegments();

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

      positions.setY(
        i,
        renderedTerrainHeight(wx,wz)
      );
    }

    let colorMinY=Infinity;
    let colorMaxY=-Infinity;
    for(let i=0;i<positions.count;i++){
      const y=positions.getY(i);
      if(y<colorMinY)colorMinY=y;
      if(y>colorMaxY)colorMaxY=y;
    }
    nearTerrainColorRange={
      minY:colorMinY,
      maxY:colorMaxY
    };

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
      for(const mesh of roadBedGroup.children){
        if(mesh?.material){
          mesh.material.map=ground.material.map;
          mesh.material.color.copy?.(
            ground.material.color
          );
          mesh.material.needsUpdate=true;
        }
      }
    }
  }

  function rebuildHorizon(){
    clearObjectGroup(horizonGroup);

    const offset=getWorldOffset();

    // V21.16 — seamless square-ring distant terrain LOD.
    //
    // V21.14 used a circular horizon starting around 820 m while the textured
    // near terrain is a 2 km square (±1000 m). Those two meshes therefore
    // overlapped over a large area. On steep mountains their different
    // triangulation could intersect: procedural hillshade poked through the
    // downloaded imagery and ridge joins produced spikes.
    //
    // The distant mesh now starts EXACTLY on the square edge of the textured
    // terrain. Its first perimeter uses the same subdivision count and the
    // same height function as rebuildGround(), so there is no overlapping
    // surface and no independent ridge edge to disagree with.
    const nearHalf=groundSize/2;
    const sideSegments=
      effectiveGroundSegments();

    // Half-extents of concentric square rings. The final corners reach a
    // little over 7 km, comparable to the V21.14 far horizon. Dense rings near
    // the hand-off preserve mountain ridges; spacing grows with distance.
    const halfExtents=[
      nearHalf,
      nearHalf+120,
      nearHalf+280,
      nearHalf+480,
      nearHalf+720,
      nearHalf+1000,
      nearHalf+1320,
      nearHalf+1680,
      nearHalf+2080,
      nearHalf+2520,
      nearHalf+3000,
      nearHalf+3520,
      nearHalf+4080
    ];

    const positions=[];
    const indices=[];

    function perimeterPoint(side,index,half){
      const t=index/sideSegments;

      if(side===0){
        return {
          x:-half+2*half*t,
          z:-half
        };
      }

      if(side===1){
        return {
          x:half,
          z:-half+2*half*t
        };
      }

      if(side===2){
        return {
          x:half-2*half*t,
          z:half
        };
      }

      return {
        x:-half,
        z:half-2*half*t
      };
    }

    const perimeterCount=
      sideSegments*4;

    for(let row=0;row<halfExtents.length;row++){
      const half=halfExtents[row];

      for(let side=0;side<4;side++){
        for(let i=0;i<sideSegments;i++){
          const p=perimeterPoint(
            side,
            i,
            half
          );

          const wx=offset.x+p.x;
          const wz=offset.z+p.z;

          // The innermost row is mathematically identical to the border of
          // the textured ground. Outer rows continue from the same DEM/fallback
          // height source without any vertical bias or overlapping skirt.
          positions.push(
            p.x,
            renderedTerrainHeight(wx,wz),
            p.z
          );
        }
      }
    }

    for(let row=0;row<halfExtents.length-1;row++){
      const base0=row*perimeterCount;
      const base1=(row+1)*perimeterCount;

      for(let i=0;i<perimeterCount;i++){
        const next=(i+1)%perimeterCount;
        const a=base0+i;
        const b=base0+next;
        const c=base1+i;
        const d=base1+next;

        indices.push(
          a,c,b,
          b,c,d
        );
      }
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
    applyHillshadeColors(geometry);

    const material=new THREE.MeshStandardMaterial({
      color:0xffffff,
      vertexColors:true,
      roughness:1,
      metalness:0,
      side:THREE.DoubleSide,
      transparent:false,
      depthWrite:true
    });

    const mesh=new THREE.Mesh(
      geometry,
      material
    );

    mesh.name='distant-terrain-seamless-square-lod';
    mesh.receiveShadow=false;
    mesh.castShadow=false;
    mesh.renderOrder=-3;

    horizonGroup.add(mesh);
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

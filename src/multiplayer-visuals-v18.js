// World Drive V18E — remote-player vehicle rendering only.
// Exact model cloning, labels, lights, and receiver-local road support live here.
export function createMultiplayerVisualSystem({
  THREE,
  car,
  bodyGroup,
  wheels,
  tailMat,
  brakeLampMat,
  extraBrakeLampMaterials,
  llToXZ,
  groundHeightForWheel,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  TIRE_VISUAL_CLEARANCE
}){
  function smoothstep01(value){
    const t=Math.max(0,Math.min(1,value));
    return t*t*(3-2*t);
  }

  // ---------- V18B exact multiplayer vehicle visuals ----------
  // Remote cars reuse the exact procedural geometry already built for local cars.
  // Geometry is shared (read-only), while materials are cloned per peer so remote
  // brake lights cannot affect the local vehicle or another peer.
  function makeRemotePlayerLabel(name){
    const canvas=document.createElement('canvas');
    canvas.width=512;
    canvas.height=128;

    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.font='700 52px system-ui, sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    const safeName=String(name||'Conducteur').slice(0,24);
    const width=Math.min(
      480,
      Math.max(
        170,
        ctx.measureText(safeName).width+58
      )
    );
    const x=(canvas.width-width)/2;

    ctx.fillStyle='rgba(5,13,22,.84)';
    ctx.strokeStyle='rgba(228,241,255,.78)';
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.roundRect(x,20,width,88,22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle='#f6fbff';
    ctx.fillText(safeName,canvas.width/2,64);

    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.needsUpdate=true;

    const material=new THREE.SpriteMaterial({
      map:texture,
      transparent:true,
      depthTest:false,
      depthWrite:false
    });

    const sprite=new THREE.Sprite(material);
    sprite.position.set(0,2.30,0);
    sprite.scale.set(3.7,.92,1);
    sprite.renderOrder=1000;

    return {
      sprite,
      dispose(){
        texture.dispose();
        material.dispose();
      }
    };
  }

  function remoteBrakeDefinition(vehicleId,sourceMaterial){
    if(
      (vehicleId==='id4'||vehicleId==='wrx')&&
      (
        sourceMaterial===tailMat||
        sourceMaterial===brakeLampMat
      )
    ){
      return {
        base:new THREE.Color(0x8b1825),
        hot:new THREE.Color(0xff3048)
      };
    }

    const extra=
      extraBrakeLampMaterials.find(
        entry=>
          entry.vehicleId===vehicleId&&
          entry.material===sourceMaterial
      );

    if(extra){
      return {
        base:extra.baseColor.clone(),
        hot:extra.hotColor.clone()
      };
    }

    return null;
  }

  function cloneRemoteVehicleNode(
    source,
    vehicleId,
    objectMap,
    ownedMaterials,
    brakeEntries
  ){
    const clone=source.clone(false);

    // Inactive local models are hidden by applyVehicleVisualProfile().
    // A remote clone must always be visible regardless of our own selected car.
    clone.visible=true;
    objectMap.set(source,clone);

    if(source.isMesh){
      // Geometry is immutable after vehicle construction and is safe to share.
      clone.geometry=source.geometry;

      const cloneOneMaterial=material=>{
        const cloned=material.clone();
        ownedMaterials.add(cloned);

        const brake=
          remoteBrakeDefinition(
            vehicleId,
            material
          );

        if(brake){
          brakeEntries.push({
            material:cloned,
            baseColor:brake.base,
            hotColor:brake.hot
          });
        }

        return cloned;
      };

      clone.material=
        Array.isArray(source.material)
          ?source.material.map(cloneOneMaterial)
          :cloneOneMaterial(source.material);
    }

    for(const child of source.children){
      clone.add(
        cloneRemoteVehicleNode(
          child,
          vehicleId,
          objectMap,
          ownedMaterials,
          brakeEntries
        )
      );
    }

    return clone;
  }

  function remoteHeadlightProfile(vehicleId){
    const profiles={
      id4:{x:.64,y:1.02,z:2.18,targetY:.30,targetZ:72},
      wrx:{x:.62,y:.91,z:2.16,targetY:.26,targetZ:70},
      civic:{x:.61,y:1.00,z:2.16,targetY:.28,targetZ:70},
      sonata:{x:.63,y:1.00,z:2.30,targetY:.28,targetZ:72},
      i3_2017:{x:.58,y:1.04,z:1.91,targetY:.30,targetZ:68},
      f1_2010:{x:.46,y:.54,z:2.18,targetY:.16,targetZ:74},
      countach_80:{x:.56,y:.59,z:2.05,targetY:.16,targetZ:72}
    };
    return profiles[vehicleId]||profiles.id4;
  }

  function createRemoteHeadlightSystem(vehicleId,parent){
    const profile=remoteHeadlightProfile(vehicleId);

    const rig=new THREE.Group();
    rig.name=`remote-headlights-${vehicleId}`;
    parent.add(rig);

    const glowGeometry=
      new THREE.SphereGeometry(.085,10,6);

    const glowMaterials=[];
    const glows=[];
    const lights=[];

    for(const side of [-1,1]){
      const x=profile.x*side;

      const glowMaterial=
        new THREE.MeshBasicMaterial({
          color:0xf3f7ff,
          transparent:true,
          opacity:0,
          depthWrite:false,
          blending:THREE.AdditiveBlending
        });

      glowMaterials.push(glowMaterial);

      const glow=
        new THREE.Mesh(
          glowGeometry,
          glowMaterial
        );

      glow.position.set(
        x,
        profile.y,
        profile.z+.07
      );
      glow.scale.set(1.50,.66,.44);
      glow.renderOrder=7;
      glow.visible=false;
      rig.add(glow);
      glows.push(glow);

      const light=
        new THREE.SpotLight(
          0xf4f8ff,
          0,
          95,
          Math.PI/7.2,
          .60,
          1.55
        );

      light.position.set(
        x,
        profile.y,
        profile.z
      );
      light.castShadow=false;

      const target=new THREE.Object3D();
      target.position.set(
        x*.28,
        profile.targetY,
        profile.targetZ
      );

      rig.add(light);
      rig.add(target);
      light.target=target;

      lights.push(light);
    }

    return {
      setLevel(level,distanceMeters=0){
        const night=
          Math.max(
            0,
            Math.min(
              1,
              Number(level)||0
            )
          );

        const distance=
          Math.max(
            0,
            Number(distanceMeters)||0
          );

        // Keep projected light local to the convoy/passing-car zone.
        // Lens glows stay visible much farther away.
        const beamFade=
          1-smoothstep01(
            (distance-150)/130
          );

        const beamLevel=
          night*beamFade;

        for(const light of lights){
          light.intensity=
            165*beamLevel;
          light.visible=
            beamLevel>.01;
        }

        const glowFade=
          1-smoothstep01(
            (distance-900)/1700
          );

        const glowLevel=
          night*glowFade;

        for(const glow of glows){
          glow.material.opacity=
            .92*glowLevel;
          glow.visible=
            glowLevel>.012;
        }
      },

      dispose(){
        glowGeometry.dispose();
        for(const material of glowMaterials){
          material.dispose();
        }
      }
    };
  }

  function createExactRemoteVehicleVisual(vehicleId,name){
    const root=new THREE.Group();
    root.name=`remote-exact-${vehicleId}-${name}`;
    root.rotation.order='YXZ';

    // Model scale must match the local car exactly.
    const modelRoot=new THREE.Group();
    modelRoot.scale.copy(car.scale);
    root.add(modelRoot);

    // Same architecture as the local vehicle:
    // yaw is on root, sprung-body pitch/roll is isolated from wheels.
    const remoteBodyGroup=new THREE.Group();
    remoteBodyGroup.rotation.order='XYZ';
    modelRoot.add(remoteBodyGroup);

    const objectMap=new Map();
    const ownedMaterials=new Set();
    const brakeEntries=[];

    const bodySources=
      bodyGroup.children.filter(
        child=>
          child.userData?.vehicleId===vehicleId
      );

    if(!bodySources.length){
      return null;
    }

    for(const source of bodySources){
      remoteBodyGroup.add(
        cloneRemoteVehicleNode(
          source,
          vehicleId,
          objectMap,
          ownedMaterials,
          brakeEntries
        )
      );
    }

    const remoteHeadlights=
      createRemoteHeadlightSystem(
        vehicleId,
        remoteBodyGroup
      );

    const remoteWheels=[];

    for(const sourceWheel of wheels){
      if(sourceWheel.vehicleId!==vehicleId)continue;

      const wheelMap=new Map();
      const clonedPivot=
        cloneRemoteVehicleNode(
          sourceWheel.pivot,
          vehicleId,
          wheelMap,
          ownedMaterials,
          brakeEntries
        );

      // Suspension Y is dynamic on the local wheel pivot. Start the remote clone
      // at the neutral contact plane; multiplayer.update() solves visual Y.
      clonedPivot.position.y=0;
      modelRoot.add(clonedPivot);

      const clonedTire=
        wheelMap.get(sourceWheel.tire);

      const clonedRim=
        wheelMap.get(sourceWheel.rim);

      const radius=
        Number(
          sourceWheel.tire?.geometry?.parameters?.radiusTop
        )||.38;

      remoteWheels.push({
        pivot:clonedPivot,
        tire:clonedTire,
        rim:clonedRim,
        front:!!sourceWheel.front,
        radius,
        baseX:clonedPivot.position.x,
        baseZ:clonedPivot.position.z
      });
    }

    if(remoteWheels.length!==4){
      console.warn(
        'Remote vehicle wheel clone incomplete',
        vehicleId,
        remoteWheels.length
      );
    }

    const label=
      makeRemotePlayerLabel(name);

    root.add(label.sprite);

    return {
      root,
      modelRoot,
      bodyGroup:remoteBodyGroup,
      wheels:remoteWheels,
      brakeEntries,
      setBraking(level){
        for(const entry of brakeEntries){
          entry.material.color
            .copy(entry.baseColor)
            .lerp(entry.hotColor,level);
        }
      },
      setHeadlights(level,distanceMeters){
        remoteHeadlights.setLevel(
          level,
          distanceMeters
        );
      },
      dispose(){
        label.dispose();
        remoteHeadlights.dispose();

        for(const material of ownedMaterials){
          material.dispose?.();
        }

        // Shared local vehicle geometry is deliberately NOT disposed here.
        root.clear();
        objectMap.clear();
      }
    };
  }



  function solveRemoteVehicleSupport({
    lat,
    lon,
    heading:remoteHeading,
    visual
  }){
    if(
      !Number.isFinite(lat)||
      !Number.isFinite(lon)||
      !visual?.wheels?.length
    ){
      return null;
    }

    const center=
      llToXZ(lat,lon);

    const c=
      Math.cos(remoteHeading||0);

    const sn=
      Math.sin(remoteHeading||0);

    const contacts=[];

    for(const wheel of visual.wheels){
      const lx=
        Number.isFinite(wheel.baseX)
          ?wheel.baseX
          :wheel.pivot.position.x;

      const lz=
        Number.isFinite(wheel.baseZ)
          ?wheel.baseZ
          :wheel.pivot.position.z;

      const wx=
        center.x+
        lx*c+
        lz*sn;

      const wz=
        center.z-
        lx*sn+
        lz*c;

      const ground=
        groundHeightForWheel(
          wx,
          wz
        );

      const tireWidth=
        (
          Number(wheel.tire?.geometry?.parameters?.height)||
          .27
        )*
        (Number(visual.modelRoot?.scale?.x)||1);

      contacts.push({
        wheel,
        ground,
        lx,
        lz,
        absX:wx,
        absZ:wz,
        front:!!wheel.front,
        width:tireWidth
      });
    }

    if(contacts.length!==4){
      return null;
    }

    const front=
      contacts.filter(
        item=>item.wheel.front
      );

    const rear=
      contacts.filter(
        item=>!item.wheel.front
      );

    const left=
      contacts.filter(
        item=>item.lx<0
      );

    const right=
      contacts.filter(
        item=>item.lx>=0
      );

    const avg=list=>
      list.reduce(
        (sum,item)=>sum+item.ground,
        0
      )/
      Math.max(
        1,
        list.length
      );

    const frontAvg=avg(front);
    const rearAvg=avg(rear);
    const leftAvg=avg(left);
    const rightAvg=avg(right);
    const avgGround=avg(contacts);

    const frontZ=
      front.length
        ?front.reduce(
            (sum,item)=>sum+item.lz,
            0
          )/front.length
        :1;

    const rearZ=
      rear.length
        ?rear.reduce(
            (sum,item)=>sum+item.lz,
            0
          )/rear.length
        :-1;

    const leftX=
      left.length
        ?left.reduce(
            (sum,item)=>sum+item.lx,
            0
          )/left.length
        :-1;

    const rightX=
      right.length
        ?right.reduce(
            (sum,item)=>sum+item.lx,
            0
          )/right.length
        :1;

    const wheelbase=
      Math.max(
        .5,
        Math.abs(
          frontZ-rearZ
        )
      );

    const track=
      Math.max(
        .5,
        Math.abs(
          rightX-leftX
        )
      );

    const wheelPitch=
      Math.atan2(
        rearAvg-frontAvg,
        wheelbase
      );

    const wheelRoll=
      Math.atan2(
        leftAvg-rightAvg,
        track
      );

    // Match the local wheel-contact solver exactly.
    const camberAbs=
      Math.abs(wheelRoll);

    const effectiveWheelRadius=
      WHEEL_RADIUS*
      Math.cos(camberAbs)+
      TIRE_HALF_WIDTH*
      Math.sin(camberAbs);

    const rootY=
      avgGround+
      effectiveWheelRadius+
      TIRE_VISUAL_CLEARANCE;

    return {
      rootY,
      wheelPitch,
      wheelRoll,

      wheelLocalY:
        contacts.map(
          item=>
            item.ground+
            effectiveWheelRadius+
            TIRE_VISUAL_CLEARANCE-
            rootY
        ),

      wheelContacts:
        contacts.map(item=>({
          absX:item.absX,
          absZ:item.absZ,
          ground:item.ground,
          front:item.front,
          width:item.width
        }))
    };
  }

  return {
    createRemoteVehicleVisual:createExactRemoteVehicleVisual,
    solveRemoteVehicleSupport
  };
}

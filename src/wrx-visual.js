// World Drive - WRX visual
// Stylized rally-sport sedan silhouette built entirely with Three.js primitives.
// No external 3D assets are required.

export function buildWrxVisual({
  THREE,
  car,
  bodyGroup,
  wheels,
  brakeLampMaterial
}) {
  if(!THREE||!car||!bodyGroup||!Array.isArray(wheels)){
    throw new Error('WRX visual: missing dependencies');
  }

  const blue=new THREE.MeshStandardMaterial({
    color:0x0757c7,
    metalness:.38,
    roughness:.25
  });

  const blueDark=new THREE.MeshStandardMaterial({
    color:0x043b8f,
    metalness:.30,
    roughness:.30
  });

  const black=new THREE.MeshStandardMaterial({
    color:0x11161b,
    metalness:.18,
    roughness:.42
  });

  const grille=new THREE.MeshStandardMaterial({
    color:0x090c0f,
    metalness:.10,
    roughness:.55
  });

  const glass=new THREE.MeshStandardMaterial({
    color:0x132838,
    metalness:.16,
    roughness:.16,
    transparent:true,
    opacity:.90
  });

  const headlight=new THREE.MeshBasicMaterial({
    color:0xeaf5ff
  });

  const rimMat=new THREE.MeshStandardMaterial({
    color:0x272c31,
    metalness:.72,
    roughness:.22
  });

  const tireMat=new THREE.MeshStandardMaterial({
    color:0x0b0d0f,
    metalness:.08,
    roughness:.58
  });

  const exhaustMat=new THREE.MeshStandardMaterial({
    color:0x8d949a,
    metalness:.80,
    roughness:.26
  });

  const body=new THREE.Group();
  body.userData.vehicleId='wrx';

  // Lower, longer sedan stance.
  const floor=new THREE.Mesh(
    new THREE.BoxGeometry(1.98,.26,4.62),
    black
  );
  floor.position.y=.48;
  floor.castShadow=true;
  body.add(floor);

  const shellGeom=new THREE.BoxGeometry(
    1.94,.58,4.44,4,2,6
  );
  const shell=new THREE.Mesh(shellGeom,blue);
  shell.position.y=.82;
  shell.castShadow=true;

  // Taper nose/rear and create muscular shoulder line.
  {
    const p=shell.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i);
      const y=p.getY(i);
      const end=Math.min(1,Math.abs(z)/2.22);

      if(y>0){
        p.setX(
          i,
          p.getX(i)*(1-.045*end)
        );
      }

      if(z>1.35&&y>.05){
        p.setY(
          i,
          p.getY(i)-.08*((z-1.35)/.87)
        );
      }
    }
    p.needsUpdate=true;
    shell.geometry.computeVertexNormals();
  }
  body.add(shell);

  // Distinct sedan greenhouse.
  const cabinGeom=new THREE.BoxGeometry(
    1.62,.68,2.36,3,2,5
  );
  const cabin=new THREE.Mesh(cabinGeom,glass);
  cabin.position.set(0,1.31,-.16);
  cabin.castShadow=true;

  {
    const p=cabin.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i);
      const y=p.getY(i);
      if(y>0){
        const taper=.12+.15*Math.abs(z)/1.18;
        p.setX(i,p.getX(i)*(1-taper));
      }
      if(z>0)p.setY(i,p.getY(i)-.17*(z/1.18));
      if(z<0)p.setY(i,p.getY(i)-.10*(-z/1.18));
    }
    p.needsUpdate=true;
    cabin.geometry.computeVertexNormals();
  }
  body.add(cabin);

  // Hood + signature hood scoop.
  const hood=new THREE.Mesh(
    new THREE.BoxGeometry(1.72,.18,1.34),
    blue
  );
  hood.position.set(0,1.08,1.50);
  hood.rotation.x=-.025;
  hood.castShadow=true;
  body.add(hood);

  // Raised scoop shell.
  const scoopShell=new THREE.Mesh(
    new THREE.BoxGeometry(.76,.16,.54),
    blueDark
  );
  scoopShell.position.set(0,1.22,1.27);
  scoopShell.rotation.x=-.025;
  body.add(scoopShell);

  // Black intake opening gives the scoop its unmistakable silhouette.
  const scoopOpening=new THREE.Mesh(
    new THREE.BoxGeometry(.58,.105,.36),
    grille
  );
  scoopOpening.position.set(0,1.285,1.35);
  scoopOpening.rotation.x=-.06;
  body.add(scoopOpening);

  // Front fascia: large central grille + side intakes.
  const frontBumper=new THREE.Mesh(
    new THREE.BoxGeometry(1.86,.34,.24),
    blue
  );
  frontBumper.position.set(0,.70,2.20);
  body.add(frontBumper);

  const mainGrille=new THREE.Mesh(
    new THREE.BoxGeometry(1.08,.26,.035),
    grille
  );
  mainGrille.position.set(0,.78,2.335);
  body.add(mainGrille);

  for(const x of [-.69,.69]){
    const intake=new THREE.Mesh(
      new THREE.BoxGeometry(.34,.20,.04),
      grille
    );
    intake.position.set(x,.67,2.34);
    body.add(intake);

    const light=new THREE.Mesh(
      new THREE.BoxGeometry(.48,.18,.045),
      headlight
    );
    light.position.set(x,.98,2.33);
    body.add(light);
  }

  // Front fender shoulders / boxed rally arches.
  for(const x of [-.91,.91]){
    for(const z of [-1.25,1.25]){
      const flare=new THREE.Mesh(
        new THREE.TorusGeometry(.43,.065,8,20,Math.PI),
        blueDark
      );
      flare.rotation.y=Math.PI/2;
      flare.rotation.z=(x<0?Math.PI/2:-Math.PI/2);
      flare.position.set(x,.56,z);
      body.add(flare);
    }
  }

  // Side skirts.
  for(const x of [-.98,.98]){
    const skirt=new THREE.Mesh(
      new THREE.BoxGeometry(.10,.16,2.55),
      black
    );
    skirt.position.set(x,.42,-.03);
    body.add(skirt);
  }

  // Mirrors.
  for(const x of [-1.01,1.01]){
    const mirror=new THREE.Mesh(
      new THREE.BoxGeometry(.16,.13,.27),
      blue
    );
    mirror.position.set(x,1.29,.48);
    body.add(mirror);
  }

  // Rear trunk deck.
  const trunk=new THREE.Mesh(
    new THREE.BoxGeometry(1.76,.17,.84),
    blue
  );
  trunk.position.set(0,1.03,-1.78);
  trunk.rotation.x=.018;
  body.add(trunk);

  // Signature rally wing: two uprights + broad blade.
  for(const x of [-.58,.58]){
    const post=new THREE.Mesh(
      new THREE.BoxGeometry(.10,.46,.11),
      black
    );
    post.position.set(x,1.30,-1.90);
    body.add(post);
  }

  const wing=new THREE.Mesh(
    new THREE.BoxGeometry(1.72,.12,.42),
    blueDark
  );
  wing.position.set(0,1.54,-1.91);
  wing.rotation.x=.04;
  body.add(wing);

  // Rear lamps.
  for(const x of [-.62,.62]){
    const lamp=new THREE.Mesh(
      new THREE.BoxGeometry(.44,.19,.055),
      brakeLampMaterial
    );
    lamp.position.set(x,.94,-2.225);
    body.add(lamp);
  }

  // Rear diffuser and quad exhaust tips.
  const diffuser=new THREE.Mesh(
    new THREE.BoxGeometry(1.72,.24,.18),
    black
  );
  diffuser.position.set(0,.52,-2.20);
  body.add(diffuser);

  for(const x of [-.72,-.48,.48,.72]){
    const tip=new THREE.Mesh(
      new THREE.CylinderGeometry(.075,.075,.20,12),
      exhaustMat
    );
    tip.rotation.x=Math.PI/2;
    tip.position.set(x,.42,-2.31);
    body.add(tip);
  }

  bodyGroup.add(body);

  // Dedicated WRX wheels: smaller sidewall, dark multi-spoke impression.
  const wrxWheels=[];

  for(const x of [-.86,.86]){
    for(const z of [-1.25,1.25]){
      const pivot=new THREE.Group();
      pivot.position.set(x,-.02,z);
      pivot.userData.vehicleId='wrx';
      car.add(pivot);

      const tire=new THREE.Mesh(
        new THREE.CylinderGeometry(.365,.365,.285,22),
        tireMat
      );
      tire.rotation.z=Math.PI/2;
      tire.castShadow=true;
      pivot.add(tire);

      const rim=new THREE.Mesh(
        new THREE.CylinderGeometry(.245,.245,.294,14),
        rimMat
      );
      rim.rotation.z=Math.PI/2;
      pivot.add(rim);

      const wheel={
        pivot,
        tire,
        rim,
        front:z>0,
        vehicleId:'wrx'
      };

      wheels.push(wheel);
      wrxWheels.push(wheel);
    }
  }

  return {
    body,
    wheels:wrxWheels,
    materials:{
      blue,
      blueDark,
      black,
      grille,
      glass,
      headlight,
      rimMat,
      tireMat,
      exhaustMat
    }
  };
}

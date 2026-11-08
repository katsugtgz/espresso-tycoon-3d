import * as THREE from 'three';

export interface HumanCharacterMeshes {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  hair: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  apron?: THREE.Mesh;
  vipHat?: THREE.Mesh;
  glasses?: THREE.Mesh;
  torsoMat: THREE.MeshStandardMaterial;
  hairMat: THREE.MeshStandardMaterial;
}

export class ModelFactory {
  // Shared materials
  static matStainless = new THREE.MeshStandardMaterial({
    color: 0xDDDDDD,
    metalness: 0.8,
    roughness: 0.25,
    flatShading: true,
  });

  static matChrome = new THREE.MeshStandardMaterial({
    color: 0xEEEEEE,
    metalness: 0.9,
    roughness: 0.15,
    flatShading: true,
  });

  static matMachineRed = new THREE.MeshStandardMaterial({
    color: 0x9E2A2B,
    metalness: 0.2,
    roughness: 0.4,
    flatShading: true,
  });

  static matDarkMetal = new THREE.MeshStandardMaterial({
    color: 0x222225,
    metalness: 0.7,
    roughness: 0.35,
    flatShading: true,
  });

  static matBlackMatte = new THREE.MeshStandardMaterial({
    color: 0x1E1E1E,
    metalness: 0.1,
    roughness: 0.8,
    flatShading: true,
  });

  static matCoffeeBeans = new THREE.MeshStandardMaterial({
    color: 0x3E2723,
    roughness: 0.8,
    flatShading: true,
  });

  static matGlassHopper = new THREE.MeshStandardMaterial({
    color: 0xCCE5FF,
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
    metalness: 0.1,
  });

  static matWoodWarm = new THREE.MeshStandardMaterial({
    color: 0x8D5B36,
    roughness: 0.7,
    flatShading: true,
  });

  static matWoodDark = new THREE.MeshStandardMaterial({
    color: 0x4A2E1B,
    roughness: 0.8,
    flatShading: true,
  });

  static matTableTop = new THREE.MeshStandardMaterial({
    color: 0xD4A373,
    roughness: 0.6,
    flatShading: true,
  });

  static matMarble = new THREE.MeshStandardMaterial({
    color: 0xFAFAFA,
    roughness: 0.3,
    flatShading: true,
  });

  static matCupCeramic = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.2,
    flatShading: true,
  });

  static matLiquidCoffee = new THREE.MeshStandardMaterial({
    color: 0x382012,
    roughness: 0.2,
  });

  static matSkin = new THREE.MeshStandardMaterial({
    color: 0xF5C6A5,
    roughness: 0.8,
    flatShading: true,
  });

  static matPants = new THREE.MeshStandardMaterial({
    color: 0x2C3E50,
    roughness: 0.8,
    flatShading: true,
  });

  static matShoes = new THREE.MeshStandardMaterial({
    color: 0x1A1A1A,
    roughness: 0.9,
    flatShading: true,
  });

  static matApron = new THREE.MeshStandardMaterial({
    color: 0x334E3C, // Barista forest green apron
    roughness: 0.75,
    flatShading: true,
  });

  static matBaristaShirt = new THREE.MeshStandardMaterial({
    color: 0xF5F0E6, // Cream collared shirt
    roughness: 0.8,
    flatShading: true,
  });

  static matVipGold = new THREE.MeshStandardMaterial({
    color: 0xFFD700,
    metalness: 0.85,
    roughness: 0.25,
    flatShading: true,
  });

  static matGlasses = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 0.6,
    roughness: 0.3,
    flatShading: true,
  });

  static matPlantGreen = new THREE.MeshStandardMaterial({
    color: 0x2E7D32,
    roughness: 0.6,
    flatShading: true,
  });

  static matTerracotta = new THREE.MeshStandardMaterial({
    color: 0xD35400,
    roughness: 0.85,
    flatShading: true,
  });

  static matBrass = new THREE.MeshStandardMaterial({
    color: 0xD4AF37,
    metalness: 0.8,
    roughness: 0.3,
    flatShading: true,
  });

  static matLampGlow = new THREE.MeshStandardMaterial({
    color: 0xFFE082,
    emissive: 0xFFD54F,
    emissiveIntensity: 0.6,
    roughness: 0.5,
  });

  // Customer shirt color variants (0..5)
  static customerShirtColors = [
    0xE06A55, // 0: Coral / salmon
    0xE5AD35, // 1: Mustard yellow
    0x5F9E74, // 2: Sage green
    0x4B7BA6, // 3: Dusty blue
    0x9C6EA8, // 4: Lavender / mauve
    0xBF573F, // 5: Terracotta / rust
  ];

  static hairColors = [
    0x2C1D11, // Dark brown
    0x151515, // Black
    0xB87333, // Auburn
    0xD4A359, // Blonde
    0x785B45, // Chestnut
    0x888888, // Gray
  ];

  // =========================================================================
  // Espresso Machine Model - Professional commercial machine
  // =========================================================================
  static createEspressoMachine(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'espresso-machine';

    // Main machine chassis - polished stainless steel
    const bodyGeo = new THREE.BoxGeometry(0.86, 0.52, 0.58);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.matStainless);
    bodyMesh.position.y = 0.34;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Side panels with luxury espresso red accent
    const sideGeo = new THREE.BoxGeometry(0.02, 0.48, 0.54);
    const leftSide = new THREE.Mesh(sideGeo, this.matMachineRed);
    leftSide.position.set(-0.435, 0.34, 0);
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, this.matMachineRed);
    rightSide.position.set(0.435, 0.34, 0);
    group.add(rightSide);

    // Front chrome control & group panel
    const faceGeo = new THREE.BoxGeometry(0.82, 0.42, 0.04);
    const faceMesh = new THREE.Mesh(faceGeo, this.matChrome);
    faceMesh.position.set(0, 0.35, 0.29);
    faceMesh.castShadow = true;
    group.add(faceMesh);

    // Top cup warmer tray with chrome guard rail
    const trayGeo = new THREE.BoxGeometry(0.82, 0.03, 0.54);
    const trayMesh = new THREE.Mesh(trayGeo, this.matStainless);
    trayMesh.position.set(0, 0.61, 0);
    group.add(trayMesh);

    // Chrome top rail
    const railMat = this.matChrome;
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.04, 0.02), railMat);
    backRail.position.set(0, 0.64, -0.26);
    group.add(backRail);

    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.52), railMat);
    leftRail.position.set(-0.4, 0.64, 0);
    group.add(leftRail);

    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.52), railMat);
    rightRail.position.set(0.4, 0.64, 0);
    group.add(rightRail);

    // 4 small espresso cups warming on top tray!
    const cupPositions = [
      [-0.26, 0.65, -0.1],
      [-0.1, 0.65, -0.1],
      [0.1, 0.65, -0.1],
      [0.26, 0.65, -0.1],
    ];
    const miniCupGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.045, 8);
    for (const [cx, cy, cz] of cupPositions) {
      const miniCup = new THREE.Mesh(miniCupGeo, this.matCupCeramic);
      miniCup.position.set(cx, cy, cz);
      group.add(miniCup);
    }

    // Bottom drip tray with dark grid slits
    const dripGeo = new THREE.BoxGeometry(0.84, 0.07, 0.36);
    const dripMesh = new THREE.Mesh(dripGeo, this.matStainless);
    dripMesh.position.set(0, 0.035, 0.22);
    dripMesh.castShadow = true;
    group.add(dripMesh);

    const grillGeo = new THREE.BoxGeometry(0.78, 0.01, 0.3);
    const grillMesh = new THREE.Mesh(grillGeo, this.matDarkMetal);
    grillMesh.position.set(0, 0.075, 0.22);
    group.add(grillMesh);

    // Two dual group heads + portafilters
    for (const xOff of [-0.2, 0.2]) {
      // Group head chrome cylinder
      const headGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.08, 10);
      const headMesh = new THREE.Mesh(headGeo, this.matChrome);
      headMesh.position.set(xOff, 0.42, 0.33);
      group.add(headMesh);

      // Portafilter bowl
      const bowlGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10);
      const bowlMesh = new THREE.Mesh(bowlGeo, this.matStainless);
      bowlMesh.position.set(xOff, 0.37, 0.33);
      group.add(bowlMesh);

      // Portafilter handle pointing forward
      const handleGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.16, 8);
      const handleMesh = new THREE.Mesh(handleGeo, this.matBlackMatte);
      handleMesh.rotation.x = Math.PI / 2;
      handleMesh.position.set(xOff, 0.37, 0.43);
      group.add(handleMesh);

      // Dual spouts beneath portafilter
      const spoutGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
      const leftSpout = new THREE.Mesh(spoutGeo, this.matChrome);
      leftSpout.position.set(xOff - 0.015, 0.335, 0.33);
      group.add(leftSpout);

      const rightSpout = new THREE.Mesh(spoutGeo, this.matChrome);
      rightSpout.position.set(xOff + 0.015, 0.335, 0.33);
      group.add(rightSpout);
    }

    // Pressure gauges (dual circular dials with needles)
    const gaugeMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2 });
    const gaugeRingMat = this.matChrome;
    const gaugeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14);

    for (const [gx, gy] of [[-0.34, 0.48], [0.34, 0.48]]) {
      const gaugeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.022, 14), gaugeRingMat);
      gaugeRing.rotation.x = Math.PI / 2;
      gaugeRing.position.set(gx, gy, 0.31);
      group.add(gaugeRing);

      const gaugeMesh = new THREE.Mesh(gaugeGeo, gaugeMat);
      gaugeMesh.rotation.x = Math.PI / 2;
      gaugeMesh.position.set(gx, gy, 0.315);
      group.add(gaugeMesh);
    }

    // Machine brand badge in center
    const badgeGeo = new THREE.BoxGeometry(0.14, 0.04, 0.01);
    const badgeMesh = new THREE.Mesh(badgeGeo, this.matBrass);
    badgeMesh.position.set(0, 0.5, 0.315);
    group.add(badgeMesh);

    // Left and right steam wands
    for (const [wx, rotZ] of [[-0.38, 0.3], [0.38, -0.3]]) {
      const wandGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6);
      const wandMesh = new THREE.Mesh(wandGeo, this.matChrome);
      wandMesh.rotation.z = rotZ;
      wandMesh.position.set(wx, 0.27, 0.33);
      group.add(wandMesh);
    }

    return group;
  }

  // =========================================================================
  // Pro Grinder Model
  // =========================================================================
  static createGrinder(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'grinder';

    // Base body in dark brushed metal
    const baseGeo = new THREE.BoxGeometry(0.36, 0.48, 0.36);
    const baseMesh = new THREE.Mesh(baseGeo, this.matDarkMetal);
    baseMesh.position.y = 0.24;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Digital timer display screen on front
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x00E5FF,
      emissive: 0x00B0FF,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    const screenGeo = new THREE.PlaneGeometry(0.14, 0.07);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.34, 0.185);
    group.add(screenMesh);

    // Chrome collar ring below hopper
    const collarGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14);
    const collarMesh = new THREE.Mesh(collarGeo, this.matChrome);
    collarMesh.position.set(0, 0.5, 0);
    group.add(collarMesh);

    // Bean Hopper (glass cone/cylinder)
    const hopperGeo = new THREE.CylinderGeometry(0.2, 0.13, 0.36, 14);
    const hopperMesh = new THREE.Mesh(hopperGeo, this.matGlassHopper);
    hopperMesh.position.set(0, 0.7, 0);
    hopperMesh.castShadow = true;
    group.add(hopperMesh);

    // Coffee beans inside hopper
    const beansGeo = new THREE.CylinderGeometry(0.18, 0.12, 0.3, 12);
    const beansMesh = new THREE.Mesh(beansGeo, this.matCoffeeBeans);
    beansMesh.position.set(0, 0.67, 0);
    group.add(beansMesh);

    // Hopper black lid
    const lidGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.04, 14);
    const lidMesh = new THREE.Mesh(lidGeo, this.matBlackMatte);
    lidMesh.position.set(0, 0.89, 0);
    group.add(lidMesh);

    // Dispenser spout & portafilter cradle
    const spoutGeo = new THREE.BoxGeometry(0.08, 0.12, 0.1);
    const spoutMesh = new THREE.Mesh(spoutGeo, this.matChrome);
    spoutMesh.position.set(0, 0.22, 0.2);
    group.add(spoutMesh);

    const forkGeo = new THREE.BoxGeometry(0.14, 0.015, 0.12);
    const forkMesh = new THREE.Mesh(forkGeo, this.matStainless);
    forkMesh.position.set(0, 0.12, 0.22);
    group.add(forkMesh);

    return group;
  }

  // =========================================================================
  // POS Cash Register Model
  // =========================================================================
  static createRegister(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'register';

    // Cash drawer base
    const baseGeo = new THREE.BoxGeometry(0.48, 0.1, 0.42);
    const baseMesh = new THREE.Mesh(baseGeo, this.matDarkMetal);
    baseMesh.position.y = 0.05;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Stand
    const standGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.18, 8);
    const standMesh = new THREE.Mesh(standGeo, this.matDarkMetal);
    standMesh.position.set(0, 0.19, 0);
    group.add(standMesh);

    // Screen tilted back
    const screenGeo = new THREE.BoxGeometry(0.42, 0.28, 0.04);
    const screenMesh = new THREE.Mesh(screenGeo, this.matBlackMatte);
    screenMesh.position.set(0, 0.34, 0.02);
    screenMesh.rotation.x = -0.35;
    screenMesh.castShadow = true;
    group.add(screenMesh);

    // Screen glass with vibrant POS UI buttons
    const displayMat = new THREE.MeshStandardMaterial({
      color: 0x4FC3F7,
      emissive: 0x0288D1,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });
    const displayGeo = new THREE.PlaneGeometry(0.38, 0.24);
    const displayMesh = new THREE.Mesh(displayGeo, displayMat);
    displayMesh.position.set(0, 0.34, 0.043);
    displayMesh.rotation.x = -0.35;
    group.add(displayMesh);

    // Receipt printer
    const printerGeo = new THREE.BoxGeometry(0.16, 0.14, 0.18);
    const printerMesh = new THREE.Mesh(printerGeo, this.matDarkMetal);
    printerMesh.position.set(0.24, 0.17, -0.05);
    group.add(printerMesh);

    // White paper slip sticking out
    const slipMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const slipGeo = new THREE.PlaneGeometry(0.09, 0.06);
    const slipMesh = new THREE.Mesh(slipGeo, slipMat);
    slipMesh.position.set(0.24, 0.26, -0.05);
    slipMesh.rotation.x = -0.2;
    group.add(slipMesh);

    return group;
  }


  // =========================================================================
  // Cup Model (small ready cup)
  // =========================================================================
  static createCup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'cup';

    // Saucer
    const saucerGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.015, 12);
    const saucerMesh = new THREE.Mesh(saucerGeo, this.matCupCeramic);
    saucerMesh.position.y = 0.008;
    saucerMesh.castShadow = true;
    group.add(saucerMesh);

    // Cup body
    const cupGeo = new THREE.CylinderGeometry(0.065, 0.045, 0.08, 12);
    const cupMesh = new THREE.Mesh(cupGeo, this.matCupCeramic);
    cupMesh.position.y = 0.055;
    cupMesh.castShadow = true;
    group.add(cupMesh);

    // Coffee inside
    const coffeeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12);
    const coffeeMesh = new THREE.Mesh(coffeeGeo, this.matLiquidCoffee);
    coffeeMesh.position.y = 0.088;
    group.add(coffeeMesh);

    // Cup handle
    const handleGeo = new THREE.TorusGeometry(0.025, 0.008, 6, 8, Math.PI);
    const handleMesh = new THREE.Mesh(handleGeo, this.matCupCeramic);
    handleMesh.rotation.z = -Math.PI / 2;
    handleMesh.position.set(0.07, 0.055, 0);
    group.add(handleMesh);

    return group;
  }

  // =========================================================================
  // Table Model (round cafe bistro table)
  // =========================================================================
  static createTable(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'table';

    // Tabletop
    const topGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.05, 16);
    const topMesh = new THREE.Mesh(topGeo, this.matTableTop);
    topMesh.position.y = 0.76;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    // Pedestal post
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
    const postMesh = new THREE.Mesh(postGeo, this.matDarkMetal);
    postMesh.position.y = 0.38;
    postMesh.castShadow = true;
    group.add(postMesh);

    // Base plate
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12);
    const baseMesh = new THREE.Mesh(baseGeo, this.matDarkMetal);
    baseMesh.position.y = 0.015;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Cute tiny vase with yellow flower on center of table
    const vaseGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.09, 8);
    const vaseMesh = new THREE.Mesh(vaseGeo, this.matCupCeramic);
    vaseMesh.position.set(0, 0.83, 0);
    group.add(vaseMesh);

    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xFFD54F, roughness: 0.6 });
    const flowerGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const flowerMesh = new THREE.Mesh(flowerGeo, flowerMat);
    flowerMesh.position.set(0, 0.89, 0);
    group.add(flowerMesh);

    return group;
  }

  // =========================================================================
  // Bistro Chair Model
  // =========================================================================
  static createChair(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'chair';

    // Seat cushion
    const seatGeo = new THREE.BoxGeometry(0.42, 0.05, 0.42);
    const seatMesh = new THREE.Mesh(seatGeo, this.matWoodWarm);
    seatMesh.position.y = 0.44;
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    group.add(seatMesh);

    // 4 legs
    const legGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.44, 6);
    const legPositions = [
      [-0.17, 0.22, -0.17],
      [0.17, 0.22, -0.17],
      [-0.17, 0.22, 0.17],
      [0.17, 0.22, 0.17],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const legMesh = new THREE.Mesh(legGeo, this.matDarkMetal);
      legMesh.position.set(lx, ly, lz);
      legMesh.castShadow = true;
      group.add(legMesh);
    }

    // Backrest posts
    const backPostGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6);
    const leftPost = new THREE.Mesh(backPostGeo, this.matDarkMetal);
    leftPost.position.set(-0.17, 0.68, -0.18);
    group.add(leftPost);

    const rightPost = new THREE.Mesh(backPostGeo, this.matDarkMetal);
    rightPost.position.set(0.17, 0.68, -0.18);
    group.add(rightPost);

    // Top backrest rail
    const railGeo = new THREE.BoxGeometry(0.38, 0.08, 0.03);
    const railMesh = new THREE.Mesh(railGeo, this.matWoodWarm);
    railMesh.position.set(0, 0.88, -0.18);
    railMesh.castShadow = true;
    group.add(railMesh);

    return group;
  }

  // =========================================================================
  // Human Character Model (Customer & Barista)
  // =========================================================================
  static createCharacter(isBarista = false): HumanCharacterMeshes {
    const root = new THREE.Group();

    // Torso material
    const torsoMat = isBarista
      ? this.matBaristaShirt
      : new THREE.MeshStandardMaterial({
          color: this.customerShirtColors[0],
          roughness: 0.8,
          flatShading: true,
        });

    const hairMat = new THREE.MeshStandardMaterial({
      color: this.hairColors[0],
      roughness: 0.9,
      flatShading: true,
    });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.48, 0.22);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.96;
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.24, 0.26, 0.24);
    const head = new THREE.Mesh(headGeo, this.matSkin);
    head.position.set(0, 0.4, 0);
    head.castShadow = true;
    torso.add(head);

    // Hair cap
    const hairGeo = new THREE.BoxGeometry(0.26, 0.14, 0.26);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.1, 0);
    hair.castShadow = true;
    head.add(hair);

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
    const leftArm = new THREE.Mesh(armGeo, torsoMat);
    leftArm.position.set(-0.24, -0.04, 0);
    leftArm.castShadow = true;
    torso.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeo, torsoMat);
    rightArm.position.set(0.24, -0.04, 0);
    rightArm.castShadow = true;
    torso.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.14, 0.52, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, this.matPants);
    leftLeg.position.set(-0.1, 0.44, 0);
    leftLeg.castShadow = true;
    leftLeg.receiveShadow = true;
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, this.matPants);
    rightLeg.position.set(0.1, 0.44, 0);
    rightLeg.castShadow = true;
    rightLeg.receiveShadow = true;
    root.add(rightLeg);

    let apron: THREE.Mesh | undefined;
    let vipHat: THREE.Mesh | undefined;
    let glasses: THREE.Mesh | undefined;

    if (isBarista) {
      // Apron covering chest and front
      const apronGeo = new THREE.BoxGeometry(0.39, 0.45, 0.04);
      apron = new THREE.Mesh(apronGeo, this.matApron);
      apron.position.set(0, -0.05, 0.1);
      apron.castShadow = true;
      torso.add(apron);
    } else {
      // VIP gold hat (initially hidden)
      const hatGroupGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.12, 10);
      vipHat = new THREE.Mesh(hatGroupGeo, this.matVipGold);
      vipHat.position.set(0, 0.2, 0);
      vipHat.visible = false;
      head.add(vipHat);

      // Picky glasses (initially hidden)
      const glassesGeo = new THREE.BoxGeometry(0.22, 0.05, 0.06);
      glasses = new THREE.Mesh(glassesGeo, this.matGlasses);
      glasses.position.set(0, 0.02, 0.12);
      glasses.visible = false;
      head.add(glasses);
    }

    return {
      root,
      torso,
      head,
      hair,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      apron,
      vipHat,
      glasses,
      torsoMat,
      hairMat,
    };
  }

  // =========================================================================
  // Decor Items (Levels 1..8)
  // =========================================================================
  static createDecorItem(index: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `decor-${index}`;

    switch (index) {
      case 0: {
        // Spot 0: Monstera Plant in Terracotta Pot
        const potGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.55, 12);
        const potMesh = new THREE.Mesh(potGeo, this.matTerracotta);
        potMesh.position.y = 0.28;
        potMesh.castShadow = true;
        group.add(potMesh);

        // Soil
        const soilGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 10);
        const soilMesh = new THREE.Mesh(soilGeo, this.matDarkMetal);
        soilMesh.position.y = 0.54;
        group.add(soilMesh);

        // Monstera leaves
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI * 2) / 6;
          const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5);
          const stemMesh = new THREE.Mesh(stemGeo, this.matPlantGreen);
          stemMesh.position.set(Math.cos(a) * 0.15, 0.75, Math.sin(a) * 0.15);
          stemMesh.rotation.z = Math.cos(a) * 0.45;
          stemMesh.rotation.x = -Math.sin(a) * 0.45;
          group.add(stemMesh);

          const leafGeo = new THREE.SphereGeometry(0.18, 6, 6);
          leafGeo.scale(1.2, 0.1, 0.8);
          const leafMesh = new THREE.Mesh(leafGeo, this.matPlantGreen);
          leafMesh.position.set(Math.cos(a) * 0.38, 0.95, Math.sin(a) * 0.38);
          leafMesh.rotation.y = a;
          leafMesh.castShadow = true;
          group.add(leafMesh);
        }
        break;
      }

      case 1: {
        // Spot 1: Cozy Floor Lamp with warm light
        const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12);
        const baseMesh = new THREE.Mesh(baseGeo, this.matBrass);
        baseMesh.position.y = 0.02;
        group.add(baseMesh);

        const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8);
        const poleMesh = new THREE.Mesh(poleGeo, this.matBrass);
        poleMesh.position.y = 0.92;
        poleMesh.castShadow = true;
        group.add(poleMesh);

        // Shade
        const shadeGeo = new THREE.CylinderGeometry(0.22, 0.36, 0.45, 14, 1, true);
        const shadeMesh = new THREE.Mesh(shadeGeo, this.matLampGlow);
        shadeMesh.position.y = 1.85;
        group.add(shadeMesh);

        // Inner glowing bulb
        const bulbGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xFFF59D });
        const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
        bulbMesh.position.y = 1.82;
        group.add(bulbMesh);
        break;
      }

      case 2: {
        // Spot 2: Fiddle Leaf Fig tree in modern ceramic planter
        const potGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12);
        const potMesh = new THREE.Mesh(potGeo, this.matCupCeramic);
        potMesh.position.y = 0.3;
        potMesh.castShadow = true;
        group.add(potMesh);

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6);
        const trunkMesh = new THREE.Mesh(trunkGeo, this.matWoodDark);
        trunkMesh.position.y = 1.0;
        trunkMesh.castShadow = true;
        group.add(trunkMesh);

        // Dense foliage clusters
        for (let y = 0.9; y <= 1.7; y += 0.3) {
          const clusterGeo = new THREE.SphereGeometry(0.25, 7, 7);
          const clusterMesh = new THREE.Mesh(clusterGeo, this.matPlantGreen);
          clusterMesh.position.set((Math.random() - 0.5) * 0.1, y, (Math.random() - 0.5) * 0.1);
          clusterMesh.castShadow = true;
          group.add(clusterMesh);
        }
        break;
      }

      case 3: {
        // Spot 3: Small wooden bookshelf with coffee mugs and books
        const shelfGeo = new THREE.BoxGeometry(0.8, 1.4, 0.35);
        const shelfMesh = new THREE.Mesh(shelfGeo, this.matWoodDark);
        shelfMesh.position.y = 0.7;
        shelfMesh.castShadow = true;
        group.add(shelfMesh);

        // Books on shelf
        const bookMat1 = new THREE.MeshStandardMaterial({ color: 0xD32F2F });
        const bookMat2 = new THREE.MeshStandardMaterial({ color: 0x1976D2 });
        const bookGeo = new THREE.BoxGeometry(0.08, 0.22, 0.2);
        for (let b = 0; b < 5; b++) {
          const book = new THREE.Mesh(bookGeo, b % 2 === 0 ? bookMat1 : bookMat2);
          book.position.set(-0.25 + b * 0.1, 0.75, 0.04);
          group.add(book);
        }
        break;
      }

      case 4: {
        // Spot 4: Chalkboard Menu on back wall
        const boardGeo = new THREE.BoxGeometry(1.6, 1.1, 0.05);
        const boardMesh = new THREE.Mesh(boardGeo, this.matWoodWarm);
        boardMesh.position.y = 2.0;
        group.add(boardMesh);

        // Slate chalk surface
        const slateGeo = new THREE.PlaneGeometry(1.48, 0.98);
        const slateMat = new THREE.MeshStandardMaterial({
          color: 0x212121,
          roughness: 0.9,
        });
        const slateMesh = new THREE.Mesh(slateGeo, slateMat);
        slateMesh.position.set(0, 2.0, 0.03);
        group.add(slateMesh);
        break;
      }

      case 5: {
        // Spot 5: Framed Art Poster (left wall)
        const frameGeo = new THREE.BoxGeometry(0.04, 1.2, 0.9);
        const frameMesh = new THREE.Mesh(frameGeo, this.matBrass);
        frameMesh.position.y = 2.0;
        group.add(frameMesh);

        const canvasGeo = new THREE.PlaneGeometry(0.84, 1.14);
        const canvasMat = new THREE.MeshStandardMaterial({
          color: 0xE8A87C,
          roughness: 0.5,
        });
        const artMesh = new THREE.Mesh(canvasGeo, canvasMat);
        artMesh.rotation.y = Math.PI / 2;
        artMesh.position.set(0.025, 2.0, 0);
        group.add(artMesh);
        break;
      }

      case 6: {
        // Spot 6: Neon Sign on right wall
        const backerGeo = new THREE.BoxGeometry(0.03, 0.5, 0.9);
        const backerMesh = new THREE.Mesh(backerGeo, this.matDarkMetal);
        backerMesh.position.y = 2.2;
        group.add(backerMesh);

        const neonMat = new THREE.MeshStandardMaterial({
          color: 0xFF4081,
          emissive: 0xFF4081,
          emissiveIntensity: 0.8,
          roughness: 0.2,
        });
        const cupNeonGeo = new THREE.TorusGeometry(0.18, 0.025, 6, 16);
        const cupNeonMesh = new THREE.Mesh(cupNeonGeo, neonMat);
        cupNeonMesh.rotation.y = -Math.PI / 2;
        cupNeonMesh.position.set(-0.02, 2.2, 0);
        group.add(cupNeonMesh);
        break;
      }

      case 7: {
        // Spot 7: Cozy Entrance / Center Decorative Rug
        const rugGeo = new THREE.BoxGeometry(2.4, 0.01, 1.6);
        const rugMat = new THREE.MeshStandardMaterial({
          color: 0x9E2A2B,
          roughness: 0.95,
        });
        const rugMesh = new THREE.Mesh(rugGeo, rugMat);
        rugMesh.position.y = 0.006;
        rugMesh.receiveShadow = true;
        group.add(rugMesh);
        break;
      }
    }

    return group;
  }

  // =========================================================================
  // Pendant Light Fixture
  // =========================================================================
  static createPendantLight(height = 1.2): THREE.Group {
    const group = new THREE.Group();
    group.name = 'pendant-light';

    // Black cord from ceiling
    const cordGeo = new THREE.CylinderGeometry(0.008, 0.008, height, 4);
    const cordMesh = new THREE.Mesh(cordGeo, this.matBlackMatte);
    cordMesh.position.y = height / 2;
    group.add(cordMesh);

    // Brass conical shade
    const shadeGeo = new THREE.CylinderGeometry(0.06, 0.22, 0.16, 12, 1, true);
    const shadeMesh = new THREE.Mesh(shadeGeo, this.matBrass);
    shadeMesh.position.y = 0;
    group.add(shadeMesh);

    // Glowing warm bulb
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const bulbMesh = new THREE.Mesh(bulbGeo, this.matLampGlow);
    bulbMesh.position.y = -0.02;
    group.add(bulbMesh);

    return group;
  }

  // =========================================================================
  // Base Always-On Decor Elements
  // =========================================================================

  /** Floating wall shelf with coffee syrups, jars & cups */
  static createWallShelfWithItems(width = 4.5): THREE.Group {
    const group = new THREE.Group();
    group.name = 'wall-shelf';

    // Shelf plank
    const shelfGeo = new THREE.BoxGeometry(width, 0.05, 0.32);
    const shelfMesh = new THREE.Mesh(shelfGeo, this.matWoodWarm);
    shelfMesh.castShadow = true;
    shelfMesh.receiveShadow = true;
    group.add(shelfMesh);

    // Brass brackets under shelf
    const bracketGeo = new THREE.BoxGeometry(0.04, 0.2, 0.28);
    for (const bx of [-width * 0.4, 0, width * 0.4]) {
      const bMesh = new THREE.Mesh(bracketGeo, this.matBrass);
      bMesh.position.set(bx, -0.1, -0.02);
      group.add(bMesh);
    }

    // Items on shelf: syrup bottles with pump tops
    const syrupColors = [0xC68A4C, 0x8D5B36, 0x5D4037, 0xD4A373];
    const bottleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8);
    const pumpGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6);

    for (let i = 0; i < 4; i++) {
      const sx = -width * 0.35 + i * 0.15;
      const bMat = new THREE.MeshStandardMaterial({
        color: syrupColors[i],
        roughness: 0.2,
        transparent: true,
        opacity: 0.85,
      });
      const bottle = new THREE.Mesh(bottleGeo, bMat);
      bottle.position.set(sx, 0.135, 0);
      group.add(bottle);

      const pump = new THREE.Mesh(pumpGeo, this.matBlackMatte);
      pump.position.set(sx, 0.27, 0);
      group.add(pump);
    }

    // Stacked ceramic cups
    const cupGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.06, 8);
    for (let s = 0; s < 3; s++) {
      const cx = width * 0.15 + s * 0.14;
      for (let stack = 0; stack < 2; stack++) {
        const cup = new THREE.Mesh(cupGeo, this.matCupCeramic);
        cup.position.set(cx, 0.055 + stack * 0.055, 0);
        group.add(cup);
      }
    }

    // Coffee bean glass canisters
    const jarGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10);
    const jarBeansGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.15, 8);
    for (let j = 0; j < 2; j++) {
      const jx = width * -0.05 + j * 0.18;
      const jar = new THREE.Mesh(jarGeo, this.matGlassHopper);
      jar.position.set(jx, 0.115, 0);
      group.add(jar);

      const beans = new THREE.Mesh(jarBeansGeo, this.matCoffeeBeans);
      beans.position.set(jx, 0.1, 0);
      group.add(beans);
    }

    return group;
  }

  /** Wall sconce fixture with warm ambient glow */
  static createWallSconce(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'wall-sconce';

    // Wall mounting plate
    const plateGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10);
    const plateMesh = new THREE.Mesh(plateGeo, this.matBrass);
    plateMesh.rotation.x = Math.PI / 2;
    group.add(plateMesh);

    // Curved arm
    const armGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6);
    const armMesh = new THREE.Mesh(armGeo, this.matBrass);
    armMesh.position.set(0, 0.06, 0.09);
    armMesh.rotation.x = Math.PI / 3;
    group.add(armMesh);

    // Conical warm brass shade
    const shadeGeo = new THREE.CylinderGeometry(0.05, 0.14, 0.16, 12, 1, true);
    const shadeMesh = new THREE.Mesh(shadeGeo, this.matBrass);
    shadeMesh.position.set(0, 0.12, 0.16);
    group.add(shadeMesh);

    // Glowing bulb inside
    const bulbGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const bulbMesh = new THREE.Mesh(bulbGeo, this.matLampGlow);
    bulbMesh.position.set(0, 0.1, 0.16);
    group.add(bulbMesh);

    return group;
  }

  /** Large detailed chalkboard menu */
  static createChalkboardMenu(w = 4.2, h = 1.3): THREE.Group {
    const group = new THREE.Group();
    group.name = 'chalkboard-menu';

    // Wooden outer frame
    const frameGeo = new THREE.BoxGeometry(w, h, 0.06);
    const frameMesh = new THREE.Mesh(frameGeo, this.matWoodDark);
    group.add(frameMesh);

    // Blackboard slate
    const slateGeo = new THREE.PlaneGeometry(w - 0.12, h - 0.12);
    const slateMat = new THREE.MeshStandardMaterial({
      color: 0x1C1C1E,
      roughness: 0.95,
    });
    const slateMesh = new THREE.Mesh(slateGeo, slateMat);
    slateMesh.position.z = 0.032;
    group.add(slateMesh);

    // Header chalk panel
    const headerMat = new THREE.MeshBasicMaterial({ color: 0xFFE082 });
    const headerMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, 0.08), headerMat);
    headerMesh.position.set(0, h * 0.35, 0.035);
    group.add(headerMesh);

    // Chalk menu lines & simulated items
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xF5F5F5 });
    for (let c = 0; c < 3; c++) {
      const colX = -w * 0.3 + c * (w * 0.3);
      for (let r = 0; r < 4; r++) {
        const lineY = h * 0.15 - r * 0.12;
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.025), lineMat);
        line.position.set(colX, lineY, 0.035);
        group.add(line);
      }
    }

    return group;
  }

  /** Door frame with glass door & OPEN sign */
  static createDoorWithOpenSign(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'entrance-door';

    const w = 1.6;
    const h = 2.6;

    // Wooden door posts
    const postGeo = new THREE.BoxGeometry(0.12, h, 0.22);
    const leftPost = new THREE.Mesh(postGeo, this.matWoodDark);
    leftPost.position.set(-w / 2, h / 2, 0);
    group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, this.matWoodDark);
    rightPost.position.set(w / 2, h / 2, 0);
    group.add(rightPost);

    // Top door lintel
    const lintelGeo = new THREE.BoxGeometry(w + 0.12, 0.14, 0.22);
    const lintel = new THREE.Mesh(lintelGeo, this.matWoodDark);
    lintel.position.set(0, h, 0);
    group.add(lintel);

    // Glass door panel (open at ~25 deg angle welcoming guests)
    const doorLeaf = new THREE.Group();
    doorLeaf.position.set(-w / 2 + 0.06, 0, 0);
    doorLeaf.rotation.y = 0.45; // slightly ajar

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xCCE5FF,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.45,
    });
    const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h - 0.2), glassMat);
    doorGlass.position.set((w - 0.2) / 2, h / 2, 0);
    doorLeaf.add(doorGlass);

    // Door brass push handle
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
    const handleMesh = new THREE.Mesh(handleGeo, this.matBrass);
    handleMesh.position.set(w - 0.35, 1.1, 0.05);
    doorLeaf.add(handleMesh);

    // "OPEN" hanging wooden sign
    const signBoardGeo = new THREE.BoxGeometry(0.48, 0.22, 0.02);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 }); // Green enamel
    const signMesh = new THREE.Mesh(signBoardGeo, signMat);
    signMesh.position.set(w * 0.45, 1.6, 0.02);
    doorLeaf.add(signMesh);

    const signTextMat = new THREE.MeshBasicMaterial({ color: 0xFFD54F });
    const signText = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), signTextMat);
    signText.position.set(w * 0.45, 1.6, 0.032);
    doorLeaf.add(signText);

    group.add(doorLeaf);

    return group;
  }

  /** Lush entrance potted fern */
  static createEntrancePlant(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'entrance-plant';

    // Terracotta pot
    const potGeo = new THREE.CylinderGeometry(0.32, 0.24, 0.5, 10);
    const potMesh = new THREE.Mesh(potGeo, this.matTerracotta);
    potMesh.position.y = 0.25;
    potMesh.castShadow = true;
    group.add(potMesh);

    // Lush leaves
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const leafGeo = new THREE.SphereGeometry(0.18, 5, 5);
      leafGeo.scale(1.2, 0.08, 0.6);
      const leafMesh = new THREE.Mesh(leafGeo, this.matPlantGreen);
      leafMesh.position.set(Math.cos(a) * 0.28, 0.55, Math.sin(a) * 0.28);
      leafMesh.rotation.y = a;
      leafMesh.rotation.z = Math.cos(a) * 0.35;
      leafMesh.rotation.x = -Math.sin(a) * 0.35;
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }

    return group;
  }

  /** Cute counter corner succulent */
  static createCounterSucculent(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'counter-succulent';

    // White ceramic geometric pot
    const potGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.12, 6);
    const potMesh = new THREE.Mesh(potGeo, this.matCupCeramic);
    potMesh.position.y = 0.06;
    potMesh.castShadow = true;
    group.add(potMesh);

    // Succulent rosettes
    const rosetteGeo = new THREE.SphereGeometry(0.07, 6, 6);
    rosetteGeo.scale(1.0, 0.6, 1.0);
    const rosetteMat = new THREE.MeshStandardMaterial({ color: 0x558B2F, roughness: 0.7 });
    const rosetteMesh = new THREE.Mesh(rosetteGeo, rosetteMat);
    rosetteMesh.position.y = 0.14;
    group.add(rosetteMesh);

    return group;
  }

  /** Large warm dining rug under tables */
  static createLargeDiningRug(width = 6.8, depth = 5.2): THREE.Mesh {
    const rugGeo = new THREE.BoxGeometry(width, 0.008, depth);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x8C3B2B, // Warm rich bohemian burgundy/terracotta
      roughness: 0.98,
    });
    const rugMesh = new THREE.Mesh(rugGeo, rugMat);
    rugMesh.receiveShadow = true;
    return rugMesh;
  }
}


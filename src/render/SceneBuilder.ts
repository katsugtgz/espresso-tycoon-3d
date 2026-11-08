import * as THREE from 'three';
import { LAYOUT, seatPositions } from '../config/layout';
import { TextureGenerator } from './TextureGenerator';
import { ModelFactory } from './ModelFactory';
import type { ISim } from '../types';

export class SceneBuilder {
  public scene: THREE.Scene;
  public hemisphereLight: THREE.HemisphereLight;
  public sunLight: THREE.DirectionalLight;
  public fillLight: THREE.DirectionalLight;
  public pointLights: THREE.PointLight[] = [];

  // Structure groups
  public roomGroup = new THREE.Group();
  public furnitureGroup = new THREE.Group();
  public tablesGroup = new THREE.Group();
  public baseDecorGroup = new THREE.Group();
  public decorGroup = new THREE.Group();

  // References for dynamic updates
  public tableMeshes: THREE.Group[] = [];
  public chairMeshes: THREE.Group[] = [];
  public decorMeshes: THREE.Group[] = [];

  // Materials
  private floorMat: THREE.MeshStandardMaterial;
  private wallMat: THREE.MeshStandardMaterial;
  private wainscotMat: THREE.MeshStandardMaterial;
  private counterMat: THREE.MeshStandardMaterial;
  private marbleTopMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.background = new THREE.Color(0x231F20); // Warm dark background outside cafe

    // Floor: desaturated warm light oak, finer tile repeat (~1 tile per 1.8m)
    const floorTex = TextureGenerator.createFloorWoodTexture();
    floorTex.repeat.set(12, 10);
    this.floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0xD8C0A0, // Desaturate and warm
      roughness: 0.65,
      metalness: 0.05,
    });

    // Wall plaster: slightly darker warm tone, fine repeat
    const wallTex = TextureGenerator.createWallPlasterTexture();
    wallTex.repeat.set(8, 2);
    this.wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0xEDE3D5,
      roughness: 0.85,
    });

    // Wainscoting lower wall paneling: rich warm walnut
    this.wainscotMat = new THREE.MeshStandardMaterial({
      color: 0x6D452B,
      roughness: 0.75,
      flatShading: true,
    });

    // Counter body: warm lighter walnut (0x9A6A45) to avoid rendering near-black
    this.counterMat = new THREE.MeshStandardMaterial({
      color: 0x9A6A45,
      roughness: 0.65,
      flatShading: true,
    });

    // Pure white/cream marble countertop
    this.marbleTopMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.25,
      metalness: 0.05,
      flatShading: true,
    });

    // Try loading jpg textures asynchronously if available
    this.loadTextures();

    // Build scene hierarchy
    this.scene.add(this.roomGroup);
    this.scene.add(this.furnitureGroup);
    this.scene.add(this.tablesGroup);
    this.scene.add(this.baseDecorGroup);
    this.scene.add(this.decorGroup);

    // Setup lights: warm hemisphere + directional sun + camera-angle fill light
    this.hemisphereLight = new THREE.HemisphereLight(0xFFF5E8, 0x5D4037, 0.85);
    this.scene.add(this.hemisphereLight);

    this.sunLight = new THREE.DirectionalLight(0xFFF8E7, 1.3);
    this.sunLight.position.set(-10, 18, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 45;
    this.sunLight.shadow.camera.left = -16;
    this.sunLight.shadow.camera.right = 16;
    this.sunLight.shadow.camera.top = 16;
    this.sunLight.shadow.camera.bottom = -16;
    this.scene.add(this.sunLight);

    // Camera-angle warm fill light: ensures front counter face & customers are clearly illuminated
    this.fillLight = new THREE.DirectionalLight(0xFFE8D6, 0.65);
    this.fillLight.position.set(2, 12, 16);
    this.scene.add(this.fillLight);

    // Build room, furniture, tables, and decor
    this.buildRoom();
    this.buildCounters();
    this.buildTablesAndChairs();
    this.buildBaseDecor();
    this.buildDecor();
    this.buildPendantLights();
  }

  private loadTextures(): void {
    const loader = new THREE.TextureLoader();

    // Floor wood texture
    loader.load(
      '/assets/textures/floor_wood.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(6, 5);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.floorMat.map = tex;
        this.floorMat.needsUpdate = true;
      },
      undefined,
      () => { /* keep procedural fallback */ }
    );

    // Wall plaster texture
    loader.load(
      '/assets/textures/wall_plaster.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 2);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.wallMat.map = tex;
        this.wallMat.needsUpdate = true;
      },
      undefined,
      () => { /* keep procedural fallback */ }
    );

    // Counter walnut texture
    loader.load(
      '/assets/textures/counter_walnut.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 1);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.counterMat.map = tex;
        this.counterMat.needsUpdate = true;
      },
      undefined,
      () => { /* keep procedural fallback */ }
    );

    // Counter marble top texture
    loader.load(
      '/assets/textures/counter_marble.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 1);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.marbleTopMat.map = tex;
        this.marbleTopMat.needsUpdate = true;
      },
      undefined,
      () => { /* keep procedural fallback */ }
    );
  }

  private buildRoom(): void {
    const { minX, maxX, minZ, maxZ, wallHeight } = LAYOUT.room;
    const roomWidth = maxX - minX; // 20
    const roomDepth = maxZ - minZ; // 16

    // Interior floor
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    floorMesh.receiveShadow = true;
    this.roomGroup.add(floorMesh);

    // Outside sidewalk in front of entrance door (z from 8 to 11.5, x from 2 to 8)
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x9E9E9E,
      roughness: 0.9,
    });
    const sidewalkGeo = new THREE.PlaneGeometry(8, 4);
    const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    sidewalkMesh.rotation.x = -Math.PI / 2;
    sidewalkMesh.position.set(5, -0.01, 9.8);
    sidewalkMesh.receiveShadow = true;
    this.roomGroup.add(sidewalkMesh);

    // Dark trim / baseboard material
    const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x2E180E, roughness: 0.8 });
    const chairRailMat = new THREE.MeshStandardMaterial({ color: 0x4A2E1B, roughness: 0.7 });
    const wainscotH = 1.1; // lower wall paneling height

    // Back Wall (z = -8, x in [-10, 10])
    const backWallGeo = new THREE.BoxGeometry(roomWidth, wallHeight, 0.2);
    const backWallMesh = new THREE.Mesh(backWallGeo, this.wallMat);
    backWallMesh.position.set(0, wallHeight / 2, minZ);
    backWallMesh.receiveShadow = true;
    this.roomGroup.add(backWallMesh);

    // Back Wall Wainscoting (lower half wood paneling)
    const backWainscotGeo = new THREE.BoxGeometry(roomWidth, wainscotH, 0.22);
    const backWainscotMesh = new THREE.Mesh(backWainscotGeo, this.wainscotMat);
    backWainscotMesh.position.set(0, wainscotH / 2, minZ);
    backWainscotMesh.receiveShadow = true;
    this.roomGroup.add(backWainscotMesh);

    const backChairRailGeo = new THREE.BoxGeometry(roomWidth, 0.08, 0.24);
    const backChairRail = new THREE.Mesh(backChairRailGeo, chairRailMat);
    backChairRail.position.set(0, wainscotH, minZ);
    this.roomGroup.add(backChairRail);

    const backTrimGeo = new THREE.BoxGeometry(roomWidth, 0.15, 0.24);
    const backTrimMesh = new THREE.Mesh(backTrimGeo, baseboardMat);
    backTrimMesh.position.set(0, 0.075, minZ);
    this.roomGroup.add(backTrimMesh);

    // Left Wall (x = -10, z in [-8, 8])
    const leftWallGeo = new THREE.BoxGeometry(0.2, wallHeight, roomDepth);
    const leftWallMesh = new THREE.Mesh(leftWallGeo, this.wallMat);
    leftWallMesh.position.set(minX, wallHeight / 2, 0);
    leftWallMesh.receiveShadow = true;
    this.roomGroup.add(leftWallMesh);

    const leftWainscotGeo = new THREE.BoxGeometry(0.22, wainscotH, roomDepth);
    const leftWainscotMesh = new THREE.Mesh(leftWainscotGeo, this.wainscotMat);
    leftWainscotMesh.position.set(minX, wainscotH / 2, 0);
    leftWainscotMesh.receiveShadow = true;
    this.roomGroup.add(leftWainscotMesh);

    const leftChairRailGeo = new THREE.BoxGeometry(0.24, 0.08, roomDepth);
    const leftChairRail = new THREE.Mesh(leftChairRailGeo, chairRailMat);
    leftChairRail.position.set(minX, wainscotH, 0);
    this.roomGroup.add(leftChairRail);

    const leftTrimGeo = new THREE.BoxGeometry(0.24, 0.15, roomDepth);
    const leftTrimMesh = new THREE.Mesh(leftTrimGeo, baseboardMat);
    leftTrimMesh.position.set(minX, 0.075, 0);
    this.roomGroup.add(leftTrimMesh);

    // Right Wall (x = 10, z in [-8, 8])
    const rightWallGeo = new THREE.BoxGeometry(0.2, wallHeight, roomDepth);
    const rightWallMesh = new THREE.Mesh(rightWallGeo, this.wallMat);
    rightWallMesh.position.set(maxX, wallHeight / 2, 0);
    rightWallMesh.receiveShadow = true;
    this.roomGroup.add(rightWallMesh);

    const rightWainscotGeo = new THREE.BoxGeometry(0.22, wainscotH, roomDepth);
    const rightWainscotMesh = new THREE.Mesh(rightWainscotGeo, this.wainscotMat);
    rightWainscotMesh.position.set(maxX, wainscotH / 2, 0);
    rightWainscotMesh.receiveShadow = true;
    this.roomGroup.add(rightWainscotMesh);

    const rightChairRailGeo = new THREE.BoxGeometry(0.24, 0.08, roomDepth);
    const rightChairRail = new THREE.Mesh(rightChairRailGeo, chairRailMat);
    rightChairRail.position.set(maxX, wainscotH, 0);
    this.roomGroup.add(rightChairRail);

    const rightTrimGeo = new THREE.BoxGeometry(0.24, 0.15, roomDepth);
    const rightTrimMesh = new THREE.Mesh(rightTrimGeo, baseboardMat);
    rightTrimMesh.position.set(maxX, 0.075, 0);
    this.roomGroup.add(rightTrimMesh);

    // Cutaway Front Wall (z = 8, low height ~0.7m for isometric visibility, with door gap at x ≈ 5)
    const lowWallH = 0.7;
    // Left segment: x from -10 to 4.2
    const frontLeftW = 4.2 - minX; // 14.2
    const frontLeftGeo = new THREE.BoxGeometry(frontLeftW, lowWallH, 0.2);
    const frontLeftMesh = new THREE.Mesh(frontLeftGeo, this.wainscotMat);
    frontLeftMesh.position.set(minX + frontLeftW / 2, lowWallH / 2, maxZ);
    frontLeftMesh.receiveShadow = true;
    this.roomGroup.add(frontLeftMesh);

    const frontLeftCap = new THREE.Mesh(new THREE.BoxGeometry(frontLeftW, 0.04, 0.24), chairRailMat);
    frontLeftCap.position.set(minX + frontLeftW / 2, lowWallH, maxZ);
    this.roomGroup.add(frontLeftCap);

    // Right segment: x from 5.8 to 10
    const frontRightW = maxX - 5.8; // 4.2
    const frontRightGeo = new THREE.BoxGeometry(frontRightW, lowWallH, 0.2);
    const frontRightMesh = new THREE.Mesh(frontRightGeo, this.wainscotMat);
    frontRightMesh.position.set(5.8 + frontRightW / 2, lowWallH / 2, maxZ);
    frontRightMesh.receiveShadow = true;
    this.roomGroup.add(frontRightMesh);

    const frontRightCap = new THREE.Mesh(new THREE.BoxGeometry(frontRightW, 0.04, 0.24), chairRailMat);
    frontRightCap.position.set(5.8 + frontRightW / 2, lowWallH, maxZ);
    this.roomGroup.add(frontRightCap);

    // Door frame threshold on floor
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, roughness: 0.4 });
    const doorStepGeo = new THREE.BoxGeometry(1.6, 0.03, 0.3);
    const doorStepMesh = new THREE.Mesh(doorStepGeo, doorMat);
    doorStepMesh.position.set(5, 0.015, maxZ);
    this.roomGroup.add(doorStepMesh);

    // Windows with bronze frames and translucent glass on back and side walls
    this.buildWindows();
  }

  private buildWindows(): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xCCE5FF,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.45,
    });

    // 2 windows on back wall (x = -4 and x = 6)
    for (const wx of [-4, 6]) {
      const winGroup = new THREE.Group();
      winGroup.position.set(wx, 2.1, LAYOUT.room.minZ + 0.11);

      // Frame
      const frameGeo = new THREE.BoxGeometry(2.2, 1.4, 0.06);
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      winGroup.add(frameMesh);

      // Glass
      const glassGeo = new THREE.PlaneGeometry(2.0, 1.2);
      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.position.z = 0.04;
      winGroup.add(glassMesh);

      // Window mullions (cross)
      const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), frameMat);
      vMullion.position.z = 0.04;
      winGroup.add(vMullion);

      const hMullion = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.06), frameMat);
      hMullion.position.z = 0.04;
      winGroup.add(hMullion);

      this.roomGroup.add(winGroup);
    }
  }

  private buildCounters(): void {
    const { counter, backCounter } = LAYOUT;

    // 1. Front service counter (runs along z = -3.5 from x = -8 to x = 2)
    const counterW = counter.maxX - counter.minX; // 10m
    const counterCenterX = (counter.minX + counter.maxX) / 2; // -3m

    // Counter body
    const bodyGeo = new THREE.BoxGeometry(counterW, counter.height - 0.06, counter.depth - 0.05);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.counterMat);
    bodyMesh.position.set(counterCenterX, (counter.height - 0.06) / 2, counter.z);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.furnitureGroup.add(bodyMesh);

    // Marble countertop
    const topGeo = new THREE.BoxGeometry(counterW + 0.1, 0.06, counter.depth + 0.08);
    const topMesh = new THREE.Mesh(topGeo, this.marbleTopMat);
    topMesh.position.set(counterCenterX, counter.height - 0.03, counter.z);
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    this.furnitureGroup.add(topMesh);

    // 2. Back counter (runs along z = -5.6 from x = -8 to x = 2)
    const backCounterW = backCounter.maxX - backCounter.minX; // 10m
    const backCenterX = (backCounter.minX + backCounter.maxX) / 2;

    const backBodyGeo = new THREE.BoxGeometry(backCounterW, backCounter.height - 0.05, backCounter.depth - 0.04);
    const backBodyMesh = new THREE.Mesh(backBodyGeo, this.counterMat);
    backBodyMesh.position.set(backCenterX, (backCounter.height - 0.05) / 2, backCounter.z);
    backBodyMesh.castShadow = true;
    backBodyMesh.receiveShadow = true;
    this.furnitureGroup.add(backBodyMesh);

    const backTopGeo = new THREE.BoxGeometry(backCounterW + 0.1, 0.05, backCounter.depth + 0.06);
    const backTopMesh = new THREE.Mesh(backTopGeo, this.marbleTopMat);
    backTopMesh.position.set(backCenterX, backCounter.height - 0.025, backCounter.z);
    backTopMesh.castShadow = true;
    backTopMesh.receiveShadow = true;
    this.furnitureGroup.add(backTopMesh);

    // Register object on front counter
    const register = ModelFactory.createRegister();
    register.position.set(LAYOUT.registerObj.x, counter.height, LAYOUT.registerObj.z);
    this.furnitureGroup.add(register);

    // 5 Shaker decorative panels along front of counter facing customers (+Z)
    const panelGeo = new THREE.BoxGeometry(1.6, counter.height * 0.72, 0.02);
    const panelTrimMat = new THREE.MeshStandardMaterial({ color: 0x825435, roughness: 0.7 });
    for (let p = 0; p < 5; p++) {
      const px = counter.minX + 1.0 + p * 1.95;
      const pMesh = new THREE.Mesh(panelGeo, panelTrimMat);
      pMesh.position.set(px, counter.height / 2, counter.z + counter.depth / 2 + 0.015);
      pMesh.receiveShadow = true;
      this.furnitureGroup.add(pMesh);
    }

    // Grinder object on back counter
    const grinder = ModelFactory.createGrinder();
    grinder.position.set(LAYOUT.grinder.x, backCounter.height, LAYOUT.grinder.z);
    this.furnitureGroup.add(grinder);
  }

  private buildTablesAndChairs(): void {
    // LAYOUT.tables has 8 tables
    for (let i = 0; i < LAYOUT.tables.length; i++) {
      const pos = LAYOUT.tables[i];
      const tableGroup = new THREE.Group();
      tableGroup.name = `table-group-${i}`;
      tableGroup.position.set(pos.x, 0, pos.z);

      const table = ModelFactory.createTable();
      tableGroup.add(table);

      // Two chairs facing table
      const [leftSeat, rightSeat] = seatPositions(i);

      // Left chair (at x - 0.75, facing +X toward table)
      const leftChair = ModelFactory.createChair();
      leftChair.position.set(-LAYOUT.seatOffset, 0, 0);
      leftChair.rotation.y = Math.PI / 2; // Face toward table (+X)
      tableGroup.add(leftChair);

      // Right chair (at x + 0.75, facing -X toward table)
      const rightChair = ModelFactory.createChair();
      rightChair.position.set(LAYOUT.seatOffset, 0, 0);
      rightChair.rotation.y = -Math.PI / 2; // Face toward table (-X)
      tableGroup.add(rightChair);

      this.tablesGroup.add(tableGroup);
      this.tableMeshes.push(tableGroup);
    }
  }

  private buildBaseDecor(): void {
    // 1. Large warm dining rug under dining tables
    const diningRug = ModelFactory.createLargeDiningRug(7.2, 5.8);
    diningRug.position.set(6.5, 0.004, 0.8);
    this.baseDecorGroup.add(diningRug);

    // 2. Large chalkboard menu on back wall behind service counter
    const menu = ModelFactory.createChalkboardMenu(4.2, 1.25);
    menu.position.set(-3.5, 2.3, LAYOUT.room.minZ + 0.12);
    this.baseDecorGroup.add(menu);

    // 3. Floating wooden shelves above back counter with syrups, cups, jars
    const shelf1 = ModelFactory.createWallShelfWithItems(4.2);
    shelf1.position.set(-3.5, 1.55, LAYOUT.room.minZ + 0.18);
    this.baseDecorGroup.add(shelf1);

    const shelf2 = ModelFactory.createWallShelfWithItems(3.6);
    shelf2.position.set(-3.5, 1.95, LAYOUT.room.minZ + 0.18);
    this.baseDecorGroup.add(shelf2);

    // 4. Entrance door frame with glass door & OPEN sign
    const door = ModelFactory.createDoorWithOpenSign();
    door.position.set(5, 0, LAYOUT.room.maxZ);
    this.baseDecorGroup.add(door);

    // 5. Always-on base plants
    const entranceFern = ModelFactory.createEntrancePlant();
    entranceFern.position.set(3.8, 0, 7.2);
    this.baseDecorGroup.add(entranceFern);

    const cornerFig = ModelFactory.createDecorItem(2);
    cornerFig.position.set(-9.2, 0, 6.8);
    cornerFig.visible = true;
    this.baseDecorGroup.add(cornerFig);

    const counterSucculent = ModelFactory.createCounterSucculent();
    counterSucculent.position.set(1.8, LAYOUT.counter.height, LAYOUT.counter.z);
    this.baseDecorGroup.add(counterSucculent);

    // 6. Wall sconces (warm glowing lamps)
    // Left wall sconces
    const sconce1 = ModelFactory.createWallSconce();
    sconce1.position.set(LAYOUT.room.minX + 0.1, 2.1, -2.5);
    sconce1.rotation.y = Math.PI / 2;
    this.baseDecorGroup.add(sconce1);

    const sconce2 = ModelFactory.createWallSconce();
    sconce2.position.set(LAYOUT.room.minX + 0.1, 2.1, 3.5);
    sconce2.rotation.y = Math.PI / 2;
    this.baseDecorGroup.add(sconce2);

    // Back wall sconces
    const sconce3 = ModelFactory.createWallSconce();
    sconce3.position.set(3.5, 2.3, LAYOUT.room.minZ + 0.1);
    this.baseDecorGroup.add(sconce3);

    const sconce4 = ModelFactory.createWallSconce();
    sconce4.position.set(8.5, 2.3, LAYOUT.room.minZ + 0.1);
    this.baseDecorGroup.add(sconce4);
  }

  private buildDecor(): void {
    for (let i = 0; i < LAYOUT.decorSpots.length; i++) {
      const spot = LAYOUT.decorSpots[i];
      const decorItem = ModelFactory.createDecorItem(i);
      decorItem.position.set(spot.x, 0, spot.z);
      decorItem.visible = false; // Toggled by decor upgrade level
      this.decorGroup.add(decorItem);
      this.decorMeshes.push(decorItem);
    }
  }

  private buildPendantLights(): void {
    // 3 pendant lights over front counter
    const counterPendants = [-6, -3, 0];
    for (const px of counterPendants) {
      const pendant = ModelFactory.createPendantLight(1.4);
      pendant.position.set(px, 3.2, LAYOUT.counter.z);
      this.roomGroup.add(pendant);

      // Warm point light under each pendant
      const light = new THREE.PointLight(0xFFE082, 18, 6, 2);
      light.position.set(px, 2.0, LAYOUT.counter.z);
      this.pointLights.push(light);
      this.scene.add(light);
    }

    // 2 pendant lights over dining table area
    const diningPendants = [
      { x: 6.5, z: -1 },
      { x: 6.5, z: 2.5 },
    ];
    for (const dp of diningPendants) {
      const pendant = ModelFactory.createPendantLight(0.85);
      pendant.position.set(dp.x, 2.35, dp.z);
      this.roomGroup.add(pendant);

      const light = new THREE.PointLight(0xFFE082, 16, 7, 2);
      light.position.set(dp.x, 2.2, dp.z);
      this.pointLights.push(light);
      this.scene.add(light);
    }
  }

  /** Sync active tables and decor visibility with sim state */
  public updateState(sim: ISim): void {
    const state = sim.state;

    // Tables: show first N tables where N = seats.length / 2 (or base + upgrade)
    const activeTables = Math.min(
      this.tableMeshes.length,
      Math.max(2, Math.floor((state.seats?.length ?? 4) / 2))
    );

    for (let i = 0; i < this.tableMeshes.length; i++) {
      this.tableMeshes[i].visible = i < activeTables;
    }

    // Decor: revealed progressively by state.upgrades.decor (0..8)
    const decorLevel = state.upgrades?.decor ?? 0;
    for (let i = 0; i < this.decorMeshes.length; i++) {
      this.decorMeshes[i].visible = i < decorLevel;
    }
  }

  /** Apply graphics quality */
  public setQuality(quality: 'low' | 'medium' | 'high'): void {
    if (quality === 'low') {
      this.sunLight.castShadow = false;
      for (const pl of this.pointLights) {
        pl.visible = false;
      }
    } else if (quality === 'medium') {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 1024;
      this.sunLight.shadow.mapSize.height = 1024;
      for (const pl of this.pointLights) {
        pl.visible = true;
        pl.intensity = 12;
      }
    } else {
      // high
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      for (const pl of this.pointLights) {
        pl.visible = true;
        pl.intensity = 18;
      }
    }
  }
}

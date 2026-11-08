import * as THREE from 'three';
import { LAYOUT } from '../config/layout';
import { DRINKS } from '../config/balance';
import { ModelFactory } from './ModelFactory';
import { TextureGenerator } from './TextureGenerator';
import type { DrinkId, ISim, MachineSnap } from '../types';

interface MachineView {
  id: number;
  group: THREE.Group;
  machineModel: THREE.Group;
  cupModel: THREE.Group;
  indicatorBillboard: THREE.Mesh;
  indicatorCanvas: HTMLCanvasElement;
  indicatorCtx: CanvasRenderingContext2D;
  indicatorTexture: THREE.CanvasTexture;
  hitBox: THREE.Mesh;
  scaleFactor: number;
  targetScale: number;
  scaleVelocity: number;
  popTimer: number;
  lastProgress: number;
  lastStatus: string;
  lastDrink: string | null;
}

export class StationView {
  public group = new THREE.Group();
  public hitTargets: THREE.Mesh[] = [];

  private machines: MachineView[] = [];
  private grinderHitBox: THREE.Mesh;
  private registerHitBox: THREE.Mesh;
  private counterHitBox: THREE.Mesh;
  private tableHitBoxes: THREE.Mesh[] = [];

  private hoveredStationId: string | null = null;
  private hoverEmissiveTime = 0;
  private lastActiveCount = -1;
  private lastSimTime = -1;

  private hoverRingMesh: THREE.Mesh;
  private hoverRingMat: THREE.MeshBasicMaterial;

  // Station world positions for screen projection
  private stationPositions = new Map<string, THREE.Vector3>();

  constructor() {
    this.group.name = 'stations';

    // Build machines (up to 4)
    for (let i = 0; i < LAYOUT.machineSlots.length; i++) {
      const slotPos = LAYOUT.machineSlots[i];
      const mv = this.createMachineView(i, slotPos.x, slotPos.z);
      this.machines.push(mv);
      this.group.add(mv.group);
      this.hitTargets.push(mv.hitBox);
      this.stationPositions.set(`machine:${i}`, new THREE.Vector3(slotPos.x, LAYOUT.backCounter.height + 0.4, slotPos.z));
    }

    // Grinder station
    this.grinderHitBox = this.createHitBox('grinder', 0.6, 0.9, 0.6);
    this.grinderHitBox.position.set(LAYOUT.grinder.x, LAYOUT.backCounter.height + 0.45, LAYOUT.grinder.z);
    this.group.add(this.grinderHitBox);
    this.hitTargets.push(this.grinderHitBox);
    this.stationPositions.set('grinder', new THREE.Vector3(LAYOUT.grinder.x, LAYOUT.backCounter.height + 0.5, LAYOUT.grinder.z));

    // Register station
    this.registerHitBox = this.createHitBox('register', 0.7, 0.7, 0.7);
    this.registerHitBox.position.set(LAYOUT.registerObj.x, LAYOUT.counter.height + 0.35, LAYOUT.registerObj.z);
    this.group.add(this.registerHitBox);
    this.hitTargets.push(this.registerHitBox);
    this.stationPositions.set('register', new THREE.Vector3(LAYOUT.registerObj.x, LAYOUT.counter.height + 0.4, LAYOUT.registerObj.z));

    // Counter station (long service counter)
    const counterW = LAYOUT.counter.maxX - LAYOUT.counter.minX; // 10
    const counterCenterX = (LAYOUT.counter.minX + LAYOUT.counter.maxX) / 2;
    this.counterHitBox = this.createHitBox('counter', counterW, 1.2, 1.2);
    this.counterHitBox.position.set(counterCenterX, LAYOUT.counter.height / 2, LAYOUT.counter.z);
    this.group.add(this.counterHitBox);
    this.hitTargets.push(this.counterHitBox);
    this.stationPositions.set('counter', new THREE.Vector3(LAYOUT.servePoint.x, LAYOUT.counter.height + 0.2, LAYOUT.servePoint.z));

    // Table stations
    for (let i = 0; i < LAYOUT.tables.length; i++) {
      const pos = LAYOUT.tables[i];
      const tableHit = this.createHitBox(`table:${i}`, 1.8, 1.2, 1.8);
      tableHit.position.set(pos.x, 0.6, pos.z);
      this.group.add(tableHit);
      this.hitTargets.push(tableHit);
      this.tableHitBoxes.push(tableHit);
      this.stationPositions.set(`table:${i}`, new THREE.Vector3(pos.x, 0.8, pos.z));
    }

    // Reusable golden glowing hover ring (allocated once to prevent resource leaks)
    const ringGeo = new THREE.RingGeometry(0.45, 0.56, 24);
    this.hoverRingMat = new THREE.MeshBasicMaterial({
      color: 0xF3C951,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hoverRingMesh = new THREE.Mesh(ringGeo, this.hoverRingMat);
    this.hoverRingMesh.rotation.x = -Math.PI / 2;
    this.hoverRingMesh.name = 'hover-ring';
    this.hoverRingMesh.renderOrder = 50;
    this.hoverRingMesh.visible = false;
    this.group.add(this.hoverRingMesh);
  }

  private createHitBox(stationId: string, w: number, h: number, d: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    // Invisible material for raycasting
    const mat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `hit-${stationId}`;
    mesh.userData.stationId = stationId;
    return mesh;
  }

  private createMachineView(id: number, x: number, z: number): MachineView {
    const group = new THREE.Group();
    group.name = `machine-view-${id}`;
    group.position.set(x, LAYOUT.backCounter.height, z);

    // Espresso machine model
    const machineModel = ModelFactory.createEspressoMachine();
    group.add(machineModel);

    // Cup on machine (visible when status === 'ready')
    const cupModel = ModelFactory.createCup();
    cupModel.position.set(0, 0.12, 0.32);
    cupModel.visible = false;
    group.add(cupModel);

    // Progress ring & status indicator billboard above machine
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const billboardMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    const billboardGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const indicatorBillboard = new THREE.Mesh(billboardGeo, billboardMat);
    indicatorBillboard.position.set(0, 0.95, 0);
    group.add(indicatorBillboard);

    // Hit box for picking
    const hitBox = this.createHitBox(`machine:${id}`, 1.0, 1.0, 0.9);
    hitBox.position.set(0, 0.5, 0.1);
    group.add(hitBox);

    return {
      id,
      group,
      machineModel,
      cupModel,
      indicatorBillboard,
      indicatorCanvas: canvas,
      indicatorCtx: ctx,
      indicatorTexture: tex,
      hitBox,
      scaleFactor: 1.0,
      targetScale: 1.0,
      scaleVelocity: 0,
      popTimer: 0,
      lastProgress: -1,
      lastStatus: 'idle',
      lastDrink: null,
    };
  }

  public update(dt: number, sim: ISim, camera: THREE.Camera): void {
    const state = sim.state;
    const activeCount = state.machines.length;
    this.hoverEmissiveTime += dt * 4;

    const isFirstRunOrJump = this.lastActiveCount === -1 || state.time < this.lastSimTime;
    const prevActiveCount = this.lastActiveCount;

    // Update table hitboxes disabled state based on active table count
    const activeTables = Math.min(
      this.tableHitBoxes.length,
      Math.max(2, Math.floor((state.seats?.length ?? 4) / 2))
    );
    for (let i = 0; i < this.tableHitBoxes.length; i++) {
      this.tableHitBoxes[i].userData.disabled = i >= activeTables;
    }

    for (let i = 0; i < this.machines.length; i++) {
      const mv = this.machines[i];
      const snap: MachineSnap | undefined = state.machines[i];

      if (i < activeCount && snap) {
        // Machine is active in sim
        mv.group.visible = true;
        mv.hitBox.userData.disabled = false;

        // Snap scale for initial/loaded machines or animate pop-in for newly bought mid-session
        if (isFirstRunOrJump) {
          mv.scaleFactor = 1.0;
          mv.scaleVelocity = 0;
        } else if (prevActiveCount >= 0 && i >= prevActiveCount && mv.scaleFactor < 0.65) {
          mv.scaleFactor = state.phase === 'playing' ? 0.65 : 1.0;
          mv.scaleVelocity = 0;
        }

        // Smooth scale-in animation when first added
        if (mv.scaleFactor < 0.999) {
          mv.scaleVelocity += (mv.targetScale - mv.scaleFactor) * 25 * dt;
          mv.scaleVelocity *= Math.max(0, 1 - 10 * dt);
          mv.scaleFactor += mv.scaleVelocity * dt;
        } else {
          mv.scaleFactor = 1.0;
          mv.scaleVelocity = 0;
        }
        mv.scaleFactor = Math.min(1.15, Math.max(0.001, mv.scaleFactor));

        // Pop tween handling
        let finalScale = mv.scaleFactor;
        if (mv.popTimer > 0) {
          mv.popTimer -= dt;
          const popRatio = Math.max(0, mv.popTimer / 0.25);
          finalScale *= 1.0 + Math.sin(popRatio * Math.PI) * 0.18;
        }

        // Gentle +4% hover lift on machine model when hovered during active gameplay
        const isHovered = this.hoveredStationId === `machine:${i}` && state.phase === 'playing';
        const hoverBoost = isHovered ? 1.04 : 1.0;
        finalScale *= hoverBoost;
        mv.machineModel.scale.set(finalScale, finalScale, finalScale);

        // Cup visibility on ready
        mv.cupModel.visible = snap.status === 'ready';

        // Indicator billboard facing camera
        mv.indicatorBillboard.quaternion.copy(camera.quaternion);

        // Draw progress or ready indicator
        const statusChanged = snap.status !== mv.lastStatus;
        const drinkChanged = snap.drink !== mv.lastDrink;
        const progressChanged = Math.abs(snap.progress - mv.lastProgress) > 0.02;

        if (statusChanged || drinkChanged || progressChanged || snap.status === 'ready') {
          mv.lastStatus = snap.status;
          mv.lastDrink = snap.drink;
          mv.lastProgress = snap.progress;
          this.drawMachineIndicator(mv, snap);
        }
      } else {
        // Machine inactive
        mv.group.visible = false;
        mv.hitBox.userData.disabled = true;
        mv.scaleFactor = 0.001;
        mv.scaleVelocity = 0;
      }
    }

    // 3D Hover highlight ring footprint update (no allocations)
    let showRing = false;
    if (this.hoveredStationId && state.phase === 'playing') {
      const hid = this.hoveredStationId;
      let posX = 0;
      let posY = 0;
      let posZ = 0;
      let baseScale = 1.0;
      let valid = false;

      if (hid.startsWith('machine:')) {
        const mIdx = parseInt(hid.split(':')[1], 10);
        if (mIdx >= 0 && mIdx < LAYOUT.machineSlots.length && mIdx < activeCount) {
          const slotPos = LAYOUT.machineSlots[mIdx];
          posX = slotPos.x;
          posY = LAYOUT.backCounter.height + 0.02;
          posZ = slotPos.z;
          baseScale = 1.05;
          valid = true;
        }
      } else if (hid === 'grinder') {
        posX = LAYOUT.grinder.x;
        posY = LAYOUT.backCounter.height + 0.02;
        posZ = LAYOUT.grinder.z;
        baseScale = 0.65;
        valid = true;
      } else if (hid === 'register') {
        posX = LAYOUT.registerObj.x;
        posY = LAYOUT.counter.height + 0.02;
        posZ = LAYOUT.registerObj.z;
        baseScale = 0.75;
        valid = true;
      } else if (hid === 'counter') {
        posX = LAYOUT.servePoint.x;
        posY = LAYOUT.counter.height + 0.02;
        posZ = LAYOUT.servePoint.z;
        baseScale = 1.3;
        valid = true;
      } else if (hid.startsWith('table:')) {
        const tIdx = parseInt(hid.split(':')[1], 10);
        if (tIdx >= 0 && tIdx < activeTables) {
          const tPos = LAYOUT.tables[tIdx];
          posX = tPos.x;
          posY = 0.025;
          posZ = tPos.z;
          baseScale = 1.45;
          valid = true;
        }
      }

      if (valid) {
        showRing = true;
        const pulse = 1.0 + 0.04 * Math.sin(this.hoverEmissiveTime * 2);
        const finalRingScale = baseScale * pulse;
        this.hoverRingMesh.position.set(posX, posY, posZ);
        this.hoverRingMesh.scale.set(finalRingScale, finalRingScale, finalRingScale);
        this.hoverRingMat.opacity = 0.55 + 0.3 * Math.sin(this.hoverEmissiveTime * 2);
        this.hoverRingMesh.visible = true;
      }
    }

    if (!showRing) {
      this.hoverRingMesh.visible = false;
    }

    this.lastActiveCount = activeCount;
    this.lastSimTime = state.time;
  }

  private drawMachineIndicator(mv: MachineView, snap: MachineSnap): void {
    const ctx = mv.indicatorCtx;
    const c = 64;
    ctx.clearRect(0, 0, 128, 128);

    if (snap.status === 'idle') {
      mv.indicatorBillboard.visible = false;
      return;
    }

    mv.indicatorBillboard.visible = true;

    if (snap.status === 'brewing') {
      const def = snap.drink ? DRINKS[snap.drink] : null;
      const color = def ? def.color : '#E69F00';

      // Background ring track
      ctx.beginPath();
      ctx.arc(c, c, 44, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 14;
      ctx.stroke();

      // Progress arc
      const progress = Math.min(1.0, Math.max(0, snap.progress));
      ctx.beginPath();
      ctx.arc(c, c, 44, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Center circular backdrop
      ctx.beginPath();
      ctx.arc(c, c, 32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 30, 30, 0.7)';
      ctx.fill();

      // Drink emoji icon in center
      if (def?.icon) {
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, c, c + 2);
      }
    } else if (snap.status === 'ready') {
      // Pulsing green check badge
      const pulse = 1.0 + Math.sin(this.hoverEmissiveTime * 2) * 0.08;
      const r = 44 * pulse;

      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 6;
      ctx.stroke();

      // White checkmark
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(42, 64);
      ctx.lineTo(58, 80);
      ctx.lineTo(88, 48);
      ctx.stroke();
    }

    mv.indicatorTexture.needsUpdate = true;
  }

  /** Trigger pop tween on machine (brew start or done) */
  public popMachine(machineId: number): void {
    if (machineId >= 0 && machineId < this.machines.length) {
      this.machines[machineId].popTimer = 0.25;
    }
  }

  public setHoveredStation(stationId: string | null): void {
    this.hoveredStationId = stationId;
  }

  public getStationWorldPos(stationId: string): THREE.Vector3 | null {
    const p = this.stationPositions.get(stationId);
    return p ? p.clone() : null;
  }
}

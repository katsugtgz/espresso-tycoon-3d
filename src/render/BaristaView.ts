import * as THREE from 'three';
import { ModelFactory, type HumanCharacterMeshes } from './ModelFactory';
import type { BaristaSnap, ISim } from '../types';

interface BaristaMeshEntry {
  id: number;
  meshes: HumanCharacterMeshes;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentFacing: number;
  bobPhase: number;
}

export class BaristaView {
  public group = new THREE.Group();
  private baristas = new Map<number, BaristaMeshEntry>();

  constructor() {
    this.group.name = 'baristas';
  }

  private createBarista(id: number): BaristaMeshEntry {
    const meshes = ModelFactory.createCharacter(true);
    meshes.root.name = `barista-${id}`;

    // Distinct apron color variety
    const apronColors = [0x334E3C, 0x5C3A21, 0x2A3B4C];
    if (meshes.apron) {
      const mat = (meshes.apron.material as THREE.MeshStandardMaterial).clone();
      mat.color.setHex(apronColors[id % apronColors.length]);
      meshes.apron.material = mat;
    }

    this.group.add(meshes.root);

    return {
      id,
      meshes,
      currentPos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      currentFacing: 0,
      bobPhase: Math.random() * Math.PI * 2,
    };
  }

  public update(dt: number, sim: ISim): void {
    const snaps: BaristaSnap[] = sim.state.baristas ?? [];
    const activeIds = new Set<number>();

    for (const snap of snaps) {
      activeIds.add(snap.id);
      let b = this.baristas.get(snap.id);
      if (!b) {
        b = this.createBarista(snap.id);
        b.currentPos.set(snap.pos.x, 0, snap.pos.z);
        b.targetPos.set(snap.pos.x, 0, snap.pos.z);
        this.baristas.set(snap.id, b);
      }

      // Smooth interpolation toward target pos
      b.targetPos.set(snap.pos.x, 0, snap.pos.z);
      const dist = b.currentPos.distanceTo(b.targetPos);
      const isMoving = dist > 0.03;

      if (dist > 3.0) {
        b.currentPos.copy(b.targetPos);
      } else {
        b.currentPos.lerp(b.targetPos, Math.min(1.0, dt * 10));
      }

      // Calculate facing direction
      let targetAngle = b.currentFacing;
      if (snap.task === 'brewing') {
        // Face back counter (-Z)
        targetAngle = Math.PI;
      } else if (snap.task === 'serving') {
        // Face service counter (+Z)
        targetAngle = 0;
      } else if (isMoving) {
        const dx = b.targetPos.x - b.currentPos.x;
        const dz = b.targetPos.z - b.currentPos.z;
        targetAngle = Math.atan2(dx, dz);
      }

      let diffAngle = targetAngle - b.currentFacing;
      while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
      while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
      b.currentFacing += diffAngle * Math.min(1.0, dt * 12);

      // Poses based on task
      let yBob = 0;
      if (isMoving || snap.task === 'walking') {
        b.bobPhase += dt * 12;
        yBob = Math.abs(Math.sin(b.bobPhase)) * 0.05;

        const armSwing = Math.sin(b.bobPhase) * 0.4;
        const legSwing = Math.sin(b.bobPhase) * 0.45;
        b.meshes.leftArm.rotation.x = armSwing;
        b.meshes.rightArm.rotation.x = -armSwing;
        b.meshes.leftLeg.rotation.x = -legSwing;
        b.meshes.rightLeg.rotation.x = legSwing;
      } else if (snap.task === 'brewing') {
        // Brewing pose: arms raised working on espresso machine
        b.bobPhase += dt * 6;
        const subtleMotion = Math.sin(b.bobPhase) * 0.1;
        b.meshes.leftArm.rotation.x = -1.2 + subtleMotion;
        b.meshes.rightArm.rotation.x = -1.1 - subtleMotion;
        b.meshes.leftLeg.rotation.x = 0;
        b.meshes.rightLeg.rotation.x = 0;
      } else if (snap.task === 'serving') {
        // Serving pose: arms held forward holding cup
        b.meshes.leftArm.rotation.x = -0.9;
        b.meshes.rightArm.rotation.x = -0.9;
        b.meshes.leftLeg.rotation.x = 0;
        b.meshes.rightLeg.rotation.x = 0;
      } else {
        // Idle
        b.meshes.leftArm.rotation.x = 0;
        b.meshes.rightArm.rotation.x = 0;
        b.meshes.leftLeg.rotation.x = 0;
        b.meshes.rightLeg.rotation.x = 0;
      }

      b.meshes.root.position.set(b.currentPos.x, yBob, b.currentPos.z);
      b.meshes.root.rotation.y = b.currentFacing;
    }

    // Clean up removed baristas
    for (const [id, b] of this.baristas.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(b.meshes.root);
        this.baristas.delete(id);
      }
    }
  }
}

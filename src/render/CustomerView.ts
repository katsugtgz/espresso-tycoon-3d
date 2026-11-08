import * as THREE from 'three';
import { ModelFactory, type HumanCharacterMeshes } from './ModelFactory';
import { TextureGenerator } from './TextureGenerator';
import type { CustomerSnap, DrinkId, ISim, OrderSnap } from '../types';

interface PooledCustomer {
  id: number;
  meshes: HumanCharacterMeshes;
  hitBox: THREE.Mesh;
  patienceGroup: THREE.Group;
  patienceFill: THREE.Mesh;
  patienceFillMat: THREE.MeshBasicMaterial;
  orderSprite: THREE.Sprite;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentFacing: number;
  bobPhase: number;
  isSeated: boolean;
  active: boolean;
  lastDrink: DrinkId | null;
}

export class CustomerView {
  public group = new THREE.Group();
  public customerHitTargets: THREE.Mesh[] = [];

  private activeCustomers = new Map<number, PooledCustomer>();
  private customerPool: PooledCustomer[] = [];

  // Shared geometry for patience bar (size ~0.6m, depthTest off, renderOrder high)
  private patienceBgMat = new THREE.MeshBasicMaterial({
    color: 0x1A1A1A,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  });
  private patienceBgGeo = new THREE.PlaneGeometry(0.62, 0.09);
  private patienceFillGeo = new THREE.PlaneGeometry(0.58, 0.065);

  constructor() {
    this.group.name = 'customers';
  }

  private createPooledCustomer(): PooledCustomer {
    const meshes = ModelFactory.createCharacter(false);

    // Hit box for raycasting
    const hitGeo = new THREE.BoxGeometry(0.7, 1.8, 0.7);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitGeo, hitMat);
    hitBox.position.y = 0.9;
    meshes.root.add(hitBox);

    // Patience bar billboard (depthTest false, renderOrder 998/999)
    const patienceGroup = new THREE.Group();
    patienceGroup.position.set(0, 2.05, 0);

    const bgMesh = new THREE.Mesh(this.patienceBgGeo, this.patienceBgMat);
    bgMesh.renderOrder = 998;
    patienceGroup.add(bgMesh);

    const patienceFillMat = new THREE.MeshBasicMaterial({
      color: 0x4CAF50,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const patienceFill = new THREE.Mesh(this.patienceFillGeo, patienceFillMat);
    patienceFill.renderOrder = 999;
    patienceFill.position.z = 0.005;
    patienceGroup.add(patienceFill);

    meshes.root.add(patienceGroup);

    // Order sprite (size ~0.6m, depthTest false, renderOrder 1000)
    const spriteMat = new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const orderSprite = new THREE.Sprite(spriteMat);
    orderSprite.renderOrder = 1000;
    orderSprite.scale.set(0.58, 0.58, 1.0);
    orderSprite.position.set(0, 2.45, 0);
    orderSprite.visible = false;
    meshes.root.add(orderSprite);

    const pooled: PooledCustomer = {
      id: -1,
      meshes,
      hitBox,
      patienceGroup,
      patienceFill,
      patienceFillMat,
      orderSprite,
      currentPos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      currentFacing: 0,
      bobPhase: Math.random() * Math.PI * 2,
      isSeated: false,
      active: false,
      lastDrink: null,
    };

    return pooled;
  }

  private acquireCustomer(snap: CustomerSnap): PooledCustomer {
    let pooled = this.customerPool.pop();
    if (!pooled) {
      pooled = this.createPooledCustomer();
    }

    pooled.id = snap.id;
    pooled.active = true;
    pooled.currentPos.set(snap.pos.x, 0, snap.pos.z);
    pooled.targetPos.set(snap.pos.x, 0, snap.pos.z);
    pooled.currentFacing = snap.facing;
    pooled.bobPhase = 0;
    pooled.isSeated = snap.state === 'seated';
    pooled.lastDrink = null;
    pooled.hitBox.userData.customerId = snap.id;
    pooled.hitBox.userData.isCustomer = true;

    // Apply color variant to shirt (0..5)
    const shirtColor = ModelFactory.customerShirtColors[snap.variant % ModelFactory.customerShirtColors.length];
    pooled.meshes.torsoMat.color.setHex(shirtColor);

    // Hair color variety
    const hairColor = ModelFactory.hairColors[(snap.id + snap.variant) % ModelFactory.hairColors.length];
    pooled.meshes.hairMat.color.setHex(hairColor);

    // VIP hat
    if (pooled.meshes.vipHat) {
      pooled.meshes.vipHat.visible = snap.kind === 'vip';
    }

    // Picky glasses
    if (pooled.meshes.glasses) {
      pooled.meshes.glasses.visible = snap.kind === 'picky';
    }

    // Place in world
    pooled.meshes.root.position.copy(pooled.currentPos);
    pooled.meshes.root.rotation.y = pooled.currentFacing;
    pooled.meshes.root.visible = true;

    this.group.add(pooled.meshes.root);
    this.customerHitTargets.push(pooled.hitBox);

    return pooled;
  }

  private releaseCustomer(pooled: PooledCustomer): void {
    pooled.active = false;
    pooled.meshes.root.visible = false;
    this.group.remove(pooled.meshes.root);

    const hitIdx = this.customerHitTargets.indexOf(pooled.hitBox);
    if (hitIdx !== -1) {
      this.customerHitTargets.splice(hitIdx, 1);
    }

    this.customerPool.push(pooled);
  }

  public update(dt: number, sim: ISim, camera: THREE.Camera): void {
    const state = sim.state;
    const currentSnaps = state.customers ?? [];
    const activeIds = new Set<number>();

    // Index active orders by customerId
    const customerOrders = new Map<number, OrderSnap>();
    for (const ord of state.orders ?? []) {
      customerOrders.set(ord.customerId, ord);
    }

    // Sync snaps with active customers
    for (const snap of currentSnaps) {
      activeIds.add(snap.id);
      let customer = this.activeCustomers.get(snap.id);
      if (!customer) {
        customer = this.acquireCustomer(snap);
        this.activeCustomers.set(snap.id, customer);
      }

      // Smooth interpolation toward target pos
      customer.targetPos.set(snap.pos.x, 0, snap.pos.z);
      const dist = customer.currentPos.distanceTo(customer.targetPos);
      const isMoving = dist > 0.03;

      if (dist > 3.0) {
        // Teleport on big jump
        customer.currentPos.copy(customer.targetPos);
      } else {
        const lerpSpeed = Math.min(1.0, dt * 10);
        customer.currentPos.lerp(customer.targetPos, lerpSpeed);
      }

      // Smooth facing rotation
      let diffAngle = snap.facing - customer.currentFacing;
      while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
      while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
      customer.currentFacing += diffAngle * Math.min(1.0, dt * 12);

      // Walk bob vs sitting vs idle
      const isSeated = snap.state === 'seated';
      customer.isSeated = isSeated;

      if (isSeated) {
        // Seated pose: lower root, bend legs forward, arms on table
        customer.meshes.root.position.set(customer.currentPos.x, -0.12, customer.currentPos.z);
        customer.meshes.root.rotation.y = customer.currentFacing;

        customer.meshes.leftLeg.rotation.x = -Math.PI / 2;
        customer.meshes.rightLeg.rotation.x = -Math.PI / 2;
        customer.meshes.leftLeg.position.set(-0.1, 0.44, 0.2);
        customer.meshes.rightLeg.position.set(0.1, 0.44, 0.2);

        customer.meshes.leftArm.rotation.x = -0.4;
        customer.meshes.rightArm.rotation.x = -0.4;
        customer.meshes.torso.position.y = 0.88;
      } else {
        // Standing / walking pose
        let yBob = 0;
        if (isMoving) {
          customer.bobPhase += dt * 11;
          yBob = Math.abs(Math.sin(customer.bobPhase)) * 0.06;

          const armSwing = Math.sin(customer.bobPhase) * 0.4;
          const legSwing = Math.sin(customer.bobPhase) * 0.45;
          customer.meshes.leftArm.rotation.x = armSwing;
          customer.meshes.rightArm.rotation.x = -armSwing;
          customer.meshes.leftLeg.rotation.x = -legSwing;
          customer.meshes.rightLeg.rotation.x = legSwing;
        } else {
          // Standing still
          customer.meshes.leftArm.rotation.x = 0;
          customer.meshes.rightArm.rotation.x = 0;
          customer.meshes.leftLeg.rotation.x = 0;
          customer.meshes.rightLeg.rotation.x = 0;
        }

        customer.meshes.leftLeg.position.set(-0.1, 0.44, 0);
        customer.meshes.rightLeg.position.set(0.1, 0.44, 0);
        customer.meshes.torso.position.y = 0.96;

        customer.meshes.root.position.set(customer.currentPos.x, yBob, customer.currentPos.z);
        customer.meshes.root.rotation.y = customer.currentFacing;
      }

      // ---------------------------------------------------------------------
      // Patience bar billboard
      // ---------------------------------------------------------------------
      const showPatience = snap.state === 'queueing' || snap.state === 'ordering' || snap.state === 'waiting';
      customer.patienceGroup.visible = showPatience;

      if (showPatience) {
        customer.patienceGroup.quaternion.copy(camera.quaternion);

        const p = Math.max(0.001, Math.min(1.0, snap.patience));
        customer.patienceFill.scale.x = p;
        customer.patienceFill.position.x = -0.29 + (0.58 * p) / 2;

        // Color coding: Green -> Yellow -> Red
        if (p > 0.55) {
          customer.patienceFillMat.color.setHex(0x4CAF50);
        } else if (p > 0.28) {
          customer.patienceFillMat.color.setHex(0xFFC107);
        } else {
          customer.patienceFillMat.color.setHex(0xE53935);
        }
      }

      // ---------------------------------------------------------------------
      // Order drink bubble
      // ---------------------------------------------------------------------
      const order = customerOrders.get(snap.id);
      const showOrder = (snap.state === 'waiting' || snap.state === 'ordering') && !!order;

      if (showOrder && order) {
        customer.orderSprite.visible = true;
        if (customer.lastDrink !== order.drink) {
          customer.lastDrink = order.drink;
          customer.orderSprite.material.map = TextureGenerator.getDrinkBadgeTexture(order.drink);
          customer.orderSprite.material.needsUpdate = true;
        }
        // Subtle floating bob
        customer.orderSprite.position.y = 2.45 + Math.sin(state.time * 3 + snap.id) * 0.04;
      } else {
        customer.orderSprite.visible = false;
      }
    }

    // Clean up customers that left
    for (const [id, customer] of this.activeCustomers.entries()) {
      if (!activeIds.has(id)) {
        this.releaseCustomer(customer);
        this.activeCustomers.delete(id);
      }
    }
  }

  public getCustomerSnapById(id: number, sim: ISim): CustomerSnap | undefined {
    return sim.state.customers?.find((c) => c.id === id);
  }
}

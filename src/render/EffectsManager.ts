import * as THREE from 'three';
import { EventBus } from '../core/events';
import { LAYOUT } from '../config/layout';
import { TextureGenerator } from './TextureGenerator';
import type { GameEvents, ISim, Vec2 } from '../types';
import type { StationView } from './StationView';

interface ActiveParticle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
  gravity: number;
  active: boolean;
}

export class EffectsManager {
  public group = new THREE.Group();

  private coinPool: ActiveParticle[] = [];
  private steamPool: ActiveParticle[] = [];
  private angryPool: ActiveParticle[] = [];

  private quality: 'low' | 'medium' | 'high' = 'high';
  private steamTimer = 0;

  private coinMat: THREE.SpriteMaterial;
  private steamMat: THREE.SpriteMaterial;
  private angryMat: THREE.SpriteMaterial;

  constructor(bus: EventBus<GameEvents>, stationView: StationView, sim: ISim) {
    this.group.name = 'effects';

    // Materials
    this.coinMat = new THREE.SpriteMaterial({
      map: TextureGenerator.getCoinTexture(),
      transparent: true,
      depthWrite: false,
    });

    this.steamMat = new THREE.SpriteMaterial({
      map: TextureGenerator.getSteamTexture(),
      transparent: true,
      depthWrite: false,
    });

    this.angryMat = new THREE.SpriteMaterial({
      map: TextureGenerator.getAngryTexture(),
      transparent: true,
      depthWrite: false,
    });

    // Pre-allocate pools
    this.initPools();

    // Event bus listeners
    bus.on('order:served', (payload) => {
      const pos = payload.pos ?? LAYOUT.servePoint;
      this.spawnCoinBurst(pos);
    });

    bus.on('customer:leave', (payload) => {
      if (payload.angry) {
        // Find customer pos or use exit door pos
        const cust = sim.state.customers?.find((c) => c.id === payload.id);
        const pos = cust ? cust.pos : LAYOUT.door;
        this.spawnAngryPuff(pos);
      }
    });

    bus.on('brew:start', (payload) => {
      stationView.popMachine(payload.machineId);
    });

    bus.on('brew:done', (payload) => {
      stationView.popMachine(payload.machineId);
    });
  }

  private initPools(): void {
    // 50 coins
    for (let i = 0; i < 50; i++) {
      const s = new THREE.Sprite(this.coinMat.clone());
      s.visible = false;
      this.group.add(s);
      this.coinPool.push({
        sprite: s,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        startScale: 0.35,
        endScale: 0.25,
        baseOpacity: 1.0,
        gravity: -9.8,
        active: false,
      });
    }

    // 40 steam puffs
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(this.steamMat.clone());
      s.visible = false;
      this.group.add(s);
      this.steamPool.push({
        sprite: s,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.2,
        startScale: 0.12,
        endScale: 0.45,
        baseOpacity: 0.8,
        gravity: 0.15, // rises
        active: false,
      });
    }

    // 30 angry puffs
    for (let i = 0; i < 30; i++) {
      const s = new THREE.Sprite(this.angryMat.clone());
      s.visible = false;
      this.group.add(s);
      this.angryPool.push({
        sprite: s,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.8,
        startScale: 0.15,
        endScale: 0.5,
        baseOpacity: 0.85,
        gravity: 0.5,
        active: false,
      });
    }
  }

  public setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.quality = quality;
  }

  public spawnCoinBurst(pos: Vec2): void {
    const count = this.quality === 'low' ? 6 : this.quality === 'medium' ? 12 : 18;

    for (let i = 0; i < count; i++) {
      const p = this.coinPool.find((c) => !c.active);
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.7 + Math.random() * 0.4;
      p.startScale = 0.32 + Math.random() * 0.08;
      p.endScale = 0.2;
      p.baseOpacity = 1.0;
      p.gravity = -8.5;

      // Start slightly above counter
      p.sprite.position.set(pos.x + (Math.random() - 0.5) * 0.3, LAYOUT.counter.height + 0.2, pos.z + (Math.random() - 0.5) * 0.3);
      p.sprite.visible = true;

      // Cone explosion upwards
      const angle = Math.random() * Math.PI * 2;
      const speedH = 1.2 + Math.random() * 2.0;
      p.vel.set(
        Math.cos(angle) * speedH,
        3.5 + Math.random() * 2.5,
        Math.sin(angle) * speedH
      );
    }
  }

  public spawnAngryPuff(pos: Vec2): void {
    const count = this.quality === 'low' ? 4 : this.quality === 'medium' ? 8 : 12;

    for (let i = 0; i < count; i++) {
      const p = this.angryPool.find((c) => !c.active);
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.6 + Math.random() * 0.4;
      p.startScale = 0.15;
      p.endScale = 0.55;
      p.baseOpacity = 0.9;
      p.gravity = 0.8;

      p.sprite.position.set(pos.x + (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * 0.4);
      p.sprite.visible = true;

      const angle = Math.random() * Math.PI * 2;
      const speedH = 0.8 + Math.random() * 1.2;
      p.vel.set(Math.cos(angle) * speedH, 1.2 + Math.random() * 1.0, Math.sin(angle) * speedH);
    }
  }

  private spawnSteamPuff(slotPos: Vec2): void {
    const p = this.steamPool.find((c) => !c.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.maxLife = 1.0 + Math.random() * 0.4;
    p.startScale = 0.12;
    p.endScale = 0.42;
    p.baseOpacity = 0.75;
    p.gravity = 0.25;

    // Position above espresso machine group head
    p.sprite.position.set(
      slotPos.x + (Math.random() - 0.5) * 0.25,
      LAYOUT.backCounter.height + 0.65,
      slotPos.z + 0.2 + (Math.random() - 0.5) * 0.1
    );
    p.sprite.visible = true;

    p.vel.set((Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2);
  }

  public update(dt: number, sim: ISim): void {
    // 1. Steam emission from brewing machines
    const interval = this.quality === 'low' ? 0.35 : this.quality === 'medium' ? 0.18 : 0.1;
    this.steamTimer += dt;
    if (this.steamTimer >= interval) {
      this.steamTimer = 0;
      const machines = sim.state.machines ?? [];
      for (let i = 0; i < machines.length; i++) {
        if (machines[i].status === 'brewing' && i < LAYOUT.machineSlots.length) {
          this.spawnSteamPuff(LAYOUT.machineSlots[i]);
        }
      }
    }

    // 2. Advance active particles
    this.updatePool(this.coinPool, dt);
    this.updatePool(this.steamPool, dt);
    this.updatePool(this.angryPool, dt);
  }

  private updatePool(pool: ActiveParticle[], dt: number): void {
    for (const p of pool) {
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }

      const progress = p.life / p.maxLife;

      // Apply velocity and gravity
      p.vel.y += p.gravity * dt;
      p.sprite.position.x += p.vel.x * dt;
      p.sprite.position.y += p.vel.y * dt;
      p.sprite.position.z += p.vel.z * dt;

      // Scale expansion
      const currentScale = THREE.MathUtils.lerp(p.startScale, p.endScale, progress);
      p.sprite.scale.set(currentScale, currentScale, 1.0);

      // Fade out
      const opacity = p.baseOpacity * (1 - progress);
      p.sprite.material.opacity = Math.max(0, opacity);
    }
  }
}

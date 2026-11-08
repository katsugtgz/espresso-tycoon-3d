import * as THREE from 'three';
import type { IRenderer } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents, ISim, Settings, Vec2 } from '../types';
import { CameraControls } from './CameraControls';
import { SceneBuilder } from './SceneBuilder';
import { StationView } from './StationView';
import { CustomerView } from './CustomerView';
import { BaristaView } from './BaristaView';
import { EffectsManager } from './EffectsManager';
import { PickingManager } from './PickingManager';

export class GameRenderer implements IRenderer {
  private canvas: HTMLCanvasElement;
  private sim: ISim;
  private bus: EventBus<GameEvents>;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private webglRenderer: THREE.WebGLRenderer;

  private cameraControls: CameraControls;
  private sceneBuilder: SceneBuilder;
  private stationView: StationView;
  private customerView: CustomerView;
  private baristaView: BaristaView;
  private effectsManager: EffectsManager;
  private pickingManager: PickingManager;

  private quality: Settings['quality'] = 'high';
  private tempVec3 = new THREE.Vector3();

  public onStationClick: ((stationId: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, sim: ISim, bus: EventBus<GameEvents>) {
    this.canvas = canvas;
    this.sim = sim;
    this.bus = bus;

    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 100);

    // 2. WebGL Renderer
    this.webglRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.05;
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Subsystem instances
    this.sceneBuilder = new SceneBuilder(this.scene);
    this.stationView = new StationView();
    this.customerView = new CustomerView();
    this.baristaView = new BaristaView();
    this.effectsManager = new EffectsManager(this.bus, this.stationView, this.sim);

    this.scene.add(this.stationView.group);
    this.scene.add(this.customerView.group);
    this.scene.add(this.baristaView.group);
    this.scene.add(this.effectsManager.group);

    // 4. Picking
    this.pickingManager = new PickingManager(
      this.canvas,
      this.camera,
      this.sim,
      this.bus,
      this.stationView,
      this.customerView
    );
    this.pickingManager.onStationClick = (id) => this.onStationClick?.(id);

    // 5. Camera Controls
    this.cameraControls = new CameraControls({
      domElement: this.canvas,
      camera: this.camera,
      onClick: (x, y) => this.pickingManager.onClick(x, y),
      onPointerMove: (x, y) => this.pickingManager.onPointerMove(x, y),
    });

    // 6. Set initial size
    this.resize();
  }

  public update(dt: number): void {
    this.cameraControls.update(dt);
    this.sceneBuilder.updateState(this.sim);
    this.stationView.update(dt, this.sim, this.camera);
    this.customerView.update(dt, this.sim, this.camera);
    this.baristaView.update(dt, this.sim);
    this.effectsManager.update(dt, this.sim);

    this.webglRenderer.render(this.scene, this.camera);
  }

  public resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    let dpr = 1;
    if (this.quality === 'low') {
      dpr = 1;
    } else if (this.quality === 'medium') {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    } else {
      dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    }

    this.webglRenderer.setPixelRatio(dpr);
    this.webglRenderer.setSize(width, height, false);
  }

  public setQuality(q: Settings['quality']): void {
    this.quality = q;

    if (q === 'low') {
      this.webglRenderer.shadowMap.enabled = false;
      this.sceneBuilder.setQuality('low');
      this.effectsManager.setQuality('low');
    } else if (q === 'medium') {
      this.webglRenderer.shadowMap.enabled = true;
      this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
      this.sceneBuilder.setQuality('medium');
      this.effectsManager.setQuality('medium');
    } else {
      // high
      this.webglRenderer.shadowMap.enabled = true;
      this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.sceneBuilder.setQuality('high');
      this.effectsManager.setQuality('high');
    }

    this.resize();
  }

  public resetCamera(): void {
    this.cameraControls.resetCamera();
  }

  /** Project floor pos (+height y) to CSS pixels relative to canvas/viewport */
  public worldToScreen(pos: Vec2, y = 0): { x: number; y: number; visible: boolean } {
    this.tempVec3.set(pos.x, y, pos.z);
    this.tempVec3.project(this.camera);

    const rect = this.canvas.getBoundingClientRect();
    const screenX = (this.tempVec3.x * 0.5 + 0.5) * rect.width;
    const screenY = (-(this.tempVec3.y * 0.5) + 0.5) * rect.height;
    const visible =
      this.tempVec3.z < 1.0 &&
      this.tempVec3.x >= -1.1 &&
      this.tempVec3.x <= 1.1 &&
      this.tempVec3.y >= -1.1 &&
      this.tempVec3.y <= 1.1;

    return { x: screenX, y: screenY, visible };
  }

  /** Screen-space center of a station (for tutorial arrows); null if unknown */
  public stationScreenPos(stationId: string): { x: number; y: number } | null {
    const worldPos = this.stationView.getStationWorldPos(stationId);
    if (!worldPos) return null;
    const screen = this.worldToScreen({ x: worldPos.x, z: worldPos.z }, worldPos.y);
    return { x: screen.x, y: screen.y };
  }

  public getHoveredStation(): string | null {
    return this.pickingManager.getHoveredStation();
  }

  public getStats(): {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    meshes: number;
  } {
    let meshes = 0;
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes++;
    });

    const info = this.webglRenderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      meshes,
    };
  }

  public dispose(): void {
    this.cameraControls.dispose();
    this.webglRenderer.dispose();
  }
}

import * as THREE from 'three';
import { EventBus } from '../core/events';
import type { GameEvents, ISim, StationId } from '../types';
import type { StationView } from './StationView';
import type { CustomerView } from './CustomerView';

export class PickingManager {
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private camera: THREE.Camera;
  private sim: ISim;
  private bus: EventBus<GameEvents>;
  private stationView: StationView;
  private customerView: CustomerView;

  private hoveredStationId: StationId | null = null;
  public onStationClick: ((stationId: StationId) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    sim: ISim,
    bus: EventBus<GameEvents>,
    stationView: StationView,
    customerView: CustomerView
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.sim = sim;
    this.bus = bus;
    this.stationView = stationView;
    this.customerView = customerView;

    // Reset hover when leaving active play phase
    this.bus.on('day:end', () => this.clearHover());
    this.bus.on('game:over', () => this.clearHover());
    this.bus.on('game:new', () => this.clearHover());
  }

  public clearHover(): void {
    if (this.hoveredStationId !== null) {
      this.hoveredStationId = null;
      this.canvas.style.cursor = 'default';
      this.bus.emit('ui:hover', { stationId: null });
      this.stationView.setHoveredStation(null);
    }
  }

  public onPointerMove(screenX: number, screenY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Immediately clear hover state and cursor if game is not in active playing phase
    if (this.sim.state.phase !== 'playing') {
      this.clearHover();
      return;
    }

    this.pointerNdc.x = (screenX / rect.width) * 2 - 1;
    this.pointerNdc.y = -(screenY / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    let nextHovered: StationId | null = null;

    // 1. First check waiting customers (clicking waiting customer -> 'counter')
    const customerHits = this.raycaster.intersectObjects(this.customerView.customerHitTargets, false);
    if (customerHits.length > 0) {
      const hitObj = customerHits[0].object;
      const custId = hitObj.userData.customerId;
      const custSnap = this.customerView.getCustomerSnapById(custId, this.sim);
      if (custSnap && custSnap.state === 'waiting') {
        nextHovered = 'counter';
      }
    }

    // 2. If no waiting customer hovered, check station hit targets
    if (!nextHovered) {
      const activeTargets = this.stationView.hitTargets.filter((t) => !t.userData.disabled);
      const stationHits = this.raycaster.intersectObjects(activeTargets, false);
      if (stationHits.length > 0) {
        const hitStationId: StationId | null = stationHits[0].object.userData.stationId ?? null;
        if (hitStationId && hitStationId.startsWith('table:')) {
          const tableIdx = parseInt(hitStationId.split(':')[1], 10);
          const activeTables = Math.max(2, Math.floor((this.sim.state.seats?.length ?? 4) / 2));
          if (tableIdx >= 0 && tableIdx < activeTables) {
            nextHovered = hitStationId;
          }
        } else {
          nextHovered = hitStationId;
        }
      }
    }

    // Update if changed
    if (nextHovered !== this.hoveredStationId) {
      this.hoveredStationId = nextHovered;
      this.canvas.style.cursor = nextHovered ? 'pointer' : 'default';
      this.bus.emit('ui:hover', { stationId: nextHovered });
      this.stationView.setHoveredStation(nextHovered);
    }
  }

  public onClick(screenX: number, screenY: number): void {
    if (this.sim.state.phase !== 'playing') {
      this.clearHover();
      return;
    }

    // Update hovered station at click point to ensure up-to-date target
    this.onPointerMove(screenX, screenY);

    if (this.hoveredStationId) {
      this.onStationClick?.(this.hoveredStationId);
    }
  }

  public getHoveredStation(): StationId | null {
    if (this.sim.state.phase !== 'playing') {
      return null;
    }
    return this.hoveredStationId;
  }
}

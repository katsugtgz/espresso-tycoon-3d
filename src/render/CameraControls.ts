import * as THREE from 'three';

export interface CameraControlsOptions {
  domElement: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  onClick?: (screenX: number, screenY: number) => void;
  onPointerMove?: (screenX: number, screenY: number) => void;
}

export class CameraControls {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLCanvasElement;
  private onClick?: (screenX: number, screenY: number) => void;
  private onPointerMove?: (screenX: number, screenY: number) => void;

  // Defaults: closer & lower (~45 deg polar), tightly framing counter, queue, and tables
  private readonly defaultTarget = new THREE.Vector3(0.5, 0.8, -0.2);
  private readonly defaultRadius = 15.5;
  private readonly defaultPhi = THREE.MathUtils.degToRad(46); // ~46 deg elevation
  private readonly defaultTheta = 0; // facing straight along -Z

  // Current state
  private target = new THREE.Vector3(0.5, 0.8, -0.2);
  private radius = 15.5;
  private phi = THREE.MathUtils.degToRad(46);
  private theta = 0;

  // Clamps
  private readonly minRadius = 8;
  private readonly maxRadius = 24;
  private readonly minPhi = THREE.MathUtils.degToRad(20);
  private readonly maxPhi = THREE.MathUtils.degToRad(68);
  private readonly maxAzimuth = THREE.MathUtils.degToRad(50); // +/- 50 deg

  // Bounds for pan target
  private readonly minTargetX = -6;
  private readonly maxTargetX = 6;
  private readonly minTargetZ = -5;
  private readonly maxTargetZ = 5;

  // Drag tracking
  private isPointerDown = false;
  private isDragging = false;
  private startPointer = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private pointerButton = 0;
  private ctrlKey = false;
  private dragThreshold = 5;

  // Multi-touch tracking
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist = 0;
  private initialRadius = 22;

  // Keyboard state
  private keysDown = new Set<string>();

  // Reset tween state
  private isTweening = false;
  private tweenStart = { radius: 22, phi: 0, theta: 0, target: new THREE.Vector3() };
  private tweenProgress = 0;
  private readonly tweenDuration = 0.5;

  constructor(options: CameraControlsOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.onClick = options.onClick;
    this.onPointerMove = options.onPointerMove;

    this.updateCameraTransform();
    this.bindEvents();
  }

  private bindEvents(): void {
    const el = this.domElement;

    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMoveWindow);
    window.addEventListener('pointerup', this.onPointerUpWindow);
    window.addEventListener('pointercancel', this.onPointerUpWindow);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose(): void {
    const el = this.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMoveWindow);
    window.removeEventListener('pointerup', this.onPointerUpWindow);
    window.removeEventListener('pointercancel', this.onPointerUpWindow);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      this.isPointerDown = true;
      this.isDragging = false;
      this.pointerButton = e.button;
      this.ctrlKey = e.ctrlKey || e.metaKey;
      this.startPointer = { x: e.clientX, y: e.clientY };
      this.lastPointer = { x: e.clientX, y: e.clientY };
    } else if (this.activePointers.size === 2) {
      // Start 2-finger pinch
      const pts = Array.from(this.activePointers.values());
      this.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.initialRadius = this.radius;
      this.isDragging = true;
    }
  };

  private onPointerMoveWindow = (e: PointerEvent): void => {
    // Notify picking manager of pointer move
    const rect = this.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px >= 0 && px <= rect.width && py >= 0 && py <= rect.height) {
      this.onPointerMove?.(px, py);
    }

    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2) {
      // 2-finger pinch zoom & midpoint pan
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.initialPinchDist > 0) {
        const factor = this.initialPinchDist / Math.max(currentDist, 1);
        this.radius = THREE.MathUtils.clamp(this.initialRadius * factor, this.minRadius, this.maxRadius);
      }
      return;
    }

    if (!this.isPointerDown) return;

    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    const totalDist = Math.hypot(e.clientX - this.startPointer.x, e.clientY - this.startPointer.y);
    if (totalDist > this.dragThreshold) {
      this.isDragging = true;
    }

    if (!this.isDragging) return;

    const isRotate = this.pointerButton === 2 || (this.pointerButton === 0 && this.ctrlKey);

    if (isRotate) {
      // Rotate azimuth (theta) and elevation (phi)
      this.theta -= dx * 0.005;
      this.phi += dy * 0.005;
      this.theta = THREE.MathUtils.clamp(this.theta, -this.maxAzimuth, this.maxAzimuth);
      this.phi = THREE.MathUtils.clamp(this.phi, this.minPhi, this.maxPhi);
    } else {
      // Pan target
      this.pan(dx, dy);
    }

    this.updateCameraTransform();
  };

  private onPointerUpWindow = (e: PointerEvent): void => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.delete(e.pointerId);
    }

    if (this.activePointers.size === 0 && this.isPointerDown) {
      this.isPointerDown = false;

      if (!this.isDragging) {
        // Pure click without drag
        const rect = this.domElement.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (px >= 0 && px <= rect.width && py >= 0 && py <= rect.height) {
          this.onClick?.(px, py);
        }
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.02;
    this.radius = THREE.MathUtils.clamp(this.radius + zoomDelta, this.minRadius, this.maxRadius);
    this.updateCameraTransform();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].includes(k)) {
      this.keysDown.add(k);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.key.toLowerCase());
  };

  private pan(screenDx: number, screenDy: number): void {
    // Pan in camera plane
    const panSpeed = this.radius * 0.0018;
    const cosT = Math.cos(this.theta);
    const sinT = Math.sin(this.theta);

    // Right vector in world XZ
    const rightX = cosT;
    const rightZ = -sinT;

    // Forward vector in world XZ (looking toward -Z when theta=0)
    const forwardX = -sinT;
    const forwardZ = -cosT;

    // Moving screen left (dx < 0) pans target right in world
    this.target.x -= (screenDx * rightX - screenDy * forwardX) * panSpeed;
    this.target.z -= (screenDx * rightZ - screenDy * forwardZ) * panSpeed;

    this.target.x = THREE.MathUtils.clamp(this.target.x, this.minTargetX, this.maxTargetX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.minTargetZ, this.maxTargetZ);
  }

  public resetCamera(): void {
    this.isTweening = true;
    this.tweenProgress = 0;
    this.tweenStart = {
      radius: this.radius,
      phi: this.phi,
      theta: this.theta,
      target: this.target.clone(),
    };
  }

  public update(dt: number): void {
    // Keyboard navigation
    if (this.keysDown.size > 0) {
      const panSpeed = 12 * dt;
      const cosT = Math.cos(this.theta);
      const sinT = Math.sin(this.theta);
      const rightX = cosT;
      const rightZ = -sinT;
      const fwdX = -sinT;
      const fwdZ = -cosT;

      if (this.keysDown.has('w') || this.keysDown.has('arrowup')) {
        this.target.x += fwdX * panSpeed;
        this.target.z += fwdZ * panSpeed;
      }
      if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) {
        this.target.x -= fwdX * panSpeed;
        this.target.z -= fwdZ * panSpeed;
      }
      if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
        this.target.x -= rightX * panSpeed;
        this.target.z -= rightZ * panSpeed;
      }
      if (this.keysDown.has('d') || this.keysDown.has('arrowright')) {
        this.target.x += rightX * panSpeed;
        this.target.z += rightZ * panSpeed;
      }
      if (this.keysDown.has('q')) {
        this.theta = THREE.MathUtils.clamp(this.theta + 1.8 * dt, -this.maxAzimuth, this.maxAzimuth);
      }
      if (this.keysDown.has('e')) {
        this.theta = THREE.MathUtils.clamp(this.theta - 1.8 * dt, -this.maxAzimuth, this.maxAzimuth);
      }

      this.target.x = THREE.MathUtils.clamp(this.target.x, this.minTargetX, this.maxTargetX);
      this.target.z = THREE.MathUtils.clamp(this.target.z, this.minTargetZ, this.maxTargetZ);
      this.updateCameraTransform();
    }

    // Reset camera tween
    if (this.isTweening) {
      this.tweenProgress += dt / this.tweenDuration;
      if (this.tweenProgress >= 1.0) {
        this.tweenProgress = 1.0;
        this.isTweening = false;
      }

      // Smooth cubic ease-out
      const t = 1 - Math.pow(1 - this.tweenProgress, 3);

      this.radius = THREE.MathUtils.lerp(this.tweenStart.radius, this.defaultRadius, t);
      this.phi = THREE.MathUtils.lerp(this.tweenStart.phi, this.defaultPhi, t);
      this.theta = THREE.MathUtils.lerp(this.tweenStart.theta, this.defaultTheta, t);
      this.target.lerpVectors(this.tweenStart.target, this.defaultTarget, t);

      this.updateCameraTransform();
    }
  }

  public updateCameraTransform(): void {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    const x = this.target.x + this.radius * sinPhi * sinTheta;
    const y = this.target.y + this.radius * cosPhi;
    const z = this.target.z + this.radius * sinPhi * cosTheta;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  public getTarget(): THREE.Vector3 {
    return this.target;
  }
}

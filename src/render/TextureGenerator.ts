import * as THREE from 'three';
import { DRINKS } from '../config/balance';
import type { DrinkId } from '../types';

export class TextureGenerator {
  private static drinkBadgeCache = new Map<DrinkId, THREE.CanvasTexture>();
  private static checkmarkTexture: THREE.CanvasTexture | null = null;
  private static coinTexture: THREE.CanvasTexture | null = null;
  private static steamTexture: THREE.CanvasTexture | null = null;
  private static angryTexture: THREE.CanvasTexture | null = null;

  /** Create procedural wood planks texture */
  static createFloorWoodTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base warm oak color
    ctx.fillStyle = '#C89D6A';
    ctx.fillRect(0, 0, 512, 512);

    const plankHeight = 32;
    const numRows = 512 / plankHeight;
    const plankWidth = 128;

    for (let r = 0; r < numRows; r++) {
      const y = r * plankHeight;
      const xOffset = (r % 2 === 0) ? 0 : plankWidth * 0.5;

      for (let x = -plankWidth; x < 512 + plankWidth; x += plankWidth) {
        const px = x + xOffset;
        // Varied warm plank tones
        const toneVariations = ['#BA8D59', '#C59966', '#CB9F6C', '#B58854', '#D1A673'];
        const tone = toneVariations[Math.abs(Math.floor(px * 13 + y * 7)) % toneVariations.length];
        ctx.fillStyle = tone;
        ctx.fillRect(px, y, plankWidth, plankHeight);

        // Plank subtle inner grain lines
        ctx.strokeStyle = 'rgba(70, 45, 20, 0.08)';
        ctx.lineWidth = 1;
        for (let g = 4; g < plankHeight; g += 6) {
          ctx.beginPath();
          ctx.moveTo(px, y + g);
          ctx.lineTo(px + plankWidth, y + g);
          ctx.stroke();
        }

        // Vertical plank seam
        ctx.strokeStyle = 'rgba(50, 30, 10, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + plankHeight);
        ctx.stroke();
      }

      // Horizontal plank seam
      ctx.strokeStyle = 'rgba(50, 30, 10, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Create procedural warm plaster wall texture */
  static createWallPlasterTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Warm cream plaster
    ctx.fillStyle = '#F4EDE2';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle stucco stippling
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 16;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Create drink badge texture with drink color & colorblind shape cue */
  static getDrinkBadgeTexture(drinkId: DrinkId): THREE.CanvasTexture {
    const cached = this.drinkBadgeCache.get(drinkId);
    if (cached) return cached;

    const def = DRINKS[drinkId];
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const center = 64;
    const radius = 54;

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Outer white circular border
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Inner circle with drink color
    ctx.fillStyle = def ? def.color : '#8D6E63';
    ctx.beginPath();
    ctx.arc(center, center, radius - 6, 0, Math.PI * 2);
    ctx.fill();

    // White icon / secondary shape cue in center
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';

    const shape = def ? def.shape : 'circle';
    const s = 24;

    switch (shape) {
      case 'circle': {
        ctx.beginPath();
        ctx.arc(center, center, s * 0.75, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'square': {
        ctx.beginPath();
        const half = s * 0.65;
        ctx.roundRect(center - half, center - half, half * 2, half * 2, 4);
        ctx.fill();
        break;
      }
      case 'triangle': {
        ctx.beginPath();
        ctx.moveTo(center, center - s * 0.8);
        ctx.lineTo(center + s * 0.8, center + s * 0.65);
        ctx.lineTo(center - s * 0.8, center + s * 0.65);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'diamond': {
        ctx.beginPath();
        ctx.moveTo(center, center - s * 0.85);
        ctx.lineTo(center + s * 0.8, center);
        ctx.lineTo(center, center + s * 0.85);
        ctx.lineTo(center - s * 0.8, center);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'star': {
        ctx.beginPath();
        const spikes = 5;
        const outerR = s * 0.85;
        const innerR = s * 0.4;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;
        ctx.moveTo(center, center - outerR);
        for (let i = 0; i < spikes; i++) {
          let x = center + Math.cos(rot) * outerR;
          let y = center + Math.sin(rot) * outerR;
          ctx.lineTo(x, y);
          rot += step;
          x = center + Math.cos(rot) * innerR;
          y = center + Math.sin(rot) * innerR;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'hexagon': {
        ctx.beginPath();
        const r = s * 0.8;
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const x = center + r * Math.cos(a);
          const y = center + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.drinkBadgeCache.set(drinkId, tex);
    return tex;
  }

  /** Checkmark badge texture for ready machines */
  static getCheckmarkTexture(): THREE.CanvasTexture {
    if (this.checkmarkTexture) return this.checkmarkTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const center = 64;

    // Green disc
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(center, center, 54, 0, Math.PI * 2);
    ctx.fill();

    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.stroke();

    // White checkmark
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(42, 64);
    ctx.lineTo(58, 80);
    ctx.lineTo(88, 48);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.checkmarkTexture = tex;
    return tex;
  }

  /** Golden coin particle texture */
  static getCoinTexture(): THREE.CanvasTexture {
    if (this.coinTexture) return this.coinTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const c = 32;

    // Outer gold ring
    const grad = ctx.createRadialGradient(c, c, 5, c, c, 30);
    grad.addColorStop(0, '#FFE57F');
    grad.addColorStop(0.7, '#FFC107');
    grad.addColorStop(1, '#FFA000');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFF8E1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Centered dollar/star symbol
    ctx.fillStyle = '#FF6F00';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', c, c + 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.coinTexture = tex;
    return tex;
  }

  /** Steam particle soft puff texture */
  static getSteamTexture(): THREE.CanvasTexture {
    if (this.steamTexture) return this.steamTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const c = 32;

    const grad = ctx.createRadialGradient(c, c, 0, c, c, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.4, 'rgba(240, 240, 240, 0.5)');
    grad.addColorStop(0.8, 'rgba(220, 220, 220, 0.15)');
    grad.addColorStop(1, 'rgba(200, 200, 200, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 30, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    this.steamTexture = tex;
    return tex;
  }

  /** Angry puff particle texture */
  static getAngryTexture(): THREE.CanvasTexture {
    if (this.angryTexture) return this.angryTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const c = 32;

    const grad = ctx.createRadialGradient(c, c, 0, c, c, 30);
    grad.addColorStop(0, 'rgba(230, 50, 50, 0.85)');
    grad.addColorStop(0.5, 'rgba(180, 40, 40, 0.4)');
    grad.addColorStop(1, 'rgba(120, 20, 20, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 30, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    this.angryTexture = tex;
    return tex;
  }
}

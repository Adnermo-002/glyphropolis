// HUD: status line, shard counter, compass strip, banner, hints, toasts, grapple line.

import type { LandmarkSpot } from '../world/world';

export class Hud {
  private statusLine: HTMLElement;
  private shardLine: HTMLElement;
  private banner: HTMLElement;
  private hintLine: HTMLElement;
  private toasts: HTMLElement;
  private crosshair: HTMLElement;
  private grapple: HTMLCanvasElement;
  private compass: HTMLCanvasElement;
  private hintTimer: number | null = null;

  constructor() {
    this.statusLine = document.getElementById('statusLine')!;
    this.shardLine = document.getElementById('shardLine')!;
    this.banner = document.getElementById('banner')!;
    this.hintLine = document.getElementById('hintLine')!;
    this.toasts = document.getElementById('toasts')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.grapple = document.getElementById('grappleLine') as HTMLCanvasElement;
    this.compass = document.getElementById('compass') as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.compass.width = 300 * dpr;
    this.compass.height = 22 * dpr;
    this.compass.style.width = '300px';
    this.compass.style.height = '22px';
    this.grapple.width = window.innerWidth;
    this.grapple.height = window.innerHeight;
    window.addEventListener('resize', () => {
      this.grapple.width = window.innerWidth;
      this.grapple.height = window.innerHeight;
    });
  }

  show(): void { document.getElementById('hud')?.classList.remove('hidden'); }
  hide(): void { document.getElementById('hud')?.classList.add('hidden'); }

  setStatus(text: string): void { this.statusLine.textContent = text; }
  setShards(text: string): void { this.shardLine.textContent = text; }

  setBanner(text: string | null): void {
    if (text) {
      this.banner.textContent = text;
      this.banner.classList.remove('hidden');
    } else {
      this.banner.classList.add('hidden');
    }
  }

  setHint(text: string, ms = 0): void {
    this.hintLine.textContent = text;
    this.hintLine.style.opacity = '1';
    if (this.hintTimer) window.clearTimeout(this.hintTimer);
    if (ms > 0) {
      this.hintTimer = window.setTimeout(() => { this.hintLine.style.opacity = '0'; }, ms);
    }
  }

  setCrosshair(on: boolean): void {
    this.crosshair.style.display = on ? 'block' : 'none';
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => el.classList.add('fade'), 3200);
    window.setTimeout(() => el.remove(), 4100);
  }

  drawCompass(yaw: number, landmarks: LandmarkSpot[], px: number, pz: number): void {
    const ctx = this.compass.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.compass.width, h = this.compass.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4,10,12,0.55)';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const range = 60; // degrees shown
    // ticks
    for (let d = -60; d <= 60; d += 10) {
      const world = ((yawDeg(yaw) + d) % 360 + 360) % 360;
      if (Math.abs(d) > range) continue;
      const x = cx + (d / range) * (w / 2 - 8);
      const major = world % 90 === 0;
      ctx.strokeStyle = major ? 'rgba(200,247,232,0.9)' : 'rgba(200,247,232,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, major ? 4 : 9);
      ctx.lineTo(x, 13);
      ctx.stroke();
      if (major) {
        const labels = ['N', 'E', 'S', 'W'];
        const li = Math.round(((world % 360) / 90)) % 4;
        ctx.fillStyle = 'rgba(200,247,232,0.85)';
        ctx.font = `${9 * dpr}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(labels[li], x, 8 * dpr + 2);
      }
    }
    // center marker
    ctx.fillStyle = '#35e0b8';
    ctx.fillRect(cx - 1, 0, 2, h);
    // landmark markers
    ctx.fillStyle = '#ffcf6e';
    for (const l of landmarks) {
      const dx = l.x - px, dz = l.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > 600) continue;
      const bearing = Math.atan2(-dx, -dz); // yaw where landmark is ahead
      let rel = yaw - bearing;             // positive = to the right
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > range * Math.PI / 180 + 0.1) continue;
      const x = cx + (rel / (range * Math.PI / 180)) * (w / 2 - 8);
      ctx.beginPath();
      ctx.moveTo(x, h - 3);
      ctx.lineTo(x - 3, h);
      ctx.lineTo(x + 3, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawGrapple(target: [number, number, number] | null, camPos: [number, number, number], yaw: number, pitch: number, w: number, h: number): void {
    const ctx = this.grapple.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!target) return;
    const dx = target[0] - camPos[0], dy = target[1] - camPos[1], dz = target[2] - camPos[2];
    // rotate into camera space (YXZ: yaw then pitch)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = dx * cy - dz * sy;
    const z1 = dx * sy + dz * cy;
    const y2 = dy * cp + z1 * sp;
    const depth = dy * sp - z1 * cp;        // camera looks down -Z
    if (depth < 0.5) return;
    const fy = 1 / Math.tan((58 * Math.PI) / 360); // matches the pipeline camera fov
    const fx = fy / (w / h);
    const sx = w / 2 + (x1 / depth) * fx * (w / 2);
    const sy2 = h / 2 - (y2 / depth) * fy * (h / 2);
    if (sx < -50 || sx > w + 50 || sy2 < -50 || sy2 > h + 50) return;
    ctx.strokeStyle = 'rgba(53,224,184,0.65)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(sx, sy2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(sx, sy2, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function yawDeg(yaw: number): number {
  const d = (-yaw * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

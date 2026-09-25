// Tab map: district colors, roads, landmarks, player, shards, beacons, train line.

import { CFG, DISTRICT } from '../config';
import { districtAt, groundInfoAt } from '../world/districts';
import type { World } from '../world/world';

const DIST_COLOR: Record<number, string> = {
  [DISTRICT.DOWNTOWN]: '#17323f',
  [DISTRICT.MDTOWN]: '#1e3d43',
  [DISTRICT.OLD]: '#41331f',
  [DISTRICT.RESI]: '#22392c',
  [DISTRICT.IND]: '#3d3a2c',
  [DISTRICT.PARK]: '#1d3a20',
  [DISTRICT.HARBOR]: '#14293a',
};

export class MapOverlay {
  canvas: HTMLCanvasElement;
  visible = false;

  constructor() {
    this.canvas = document.getElementById('map') as HTMLCanvasElement;
    this.canvas.width = 520;
    this.canvas.height = 520;
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.canvas.classList.toggle('hidden', !this.visible);
    if (this.visible) return true;
    return false;
  }

  show(on: boolean): void {
    this.visible = on;
    this.canvas.classList.toggle('hidden', !on);
  }

  draw(
    world: World,
    px: number, pz: number,
    yaw: number,
    collected: Set<string>,
    beaconIdx: number,
  ): void {
    const ctx = this.canvas.getContext('2d')!;
    const W = this.canvas.width, H = this.canvas.height;
    const [pbx, pbz] = world.playerBlock(px, pz);
    const span = 6; // blocks each side
    const cell = W / (span * 2 + 1);
    ctx.fillStyle = '#050b0e';
    ctx.fillRect(0, 0, W, H);
    for (let j = -span; j <= span; j++) {
      for (let i = -span; i <= span; i++) {
        const bx = pbx + i, bz = pbz + j;
        const d = districtAt(bx, bz, world.seed);
        const [gt, gp] = groundInfoAt(bx, bz, world.seed);
        const x = (i + span) * cell, y = (j + span) * cell;
        ctx.fillStyle = DIST_COLOR[d] ?? '#222';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        if (gt === 3) { ctx.fillStyle = '#12314a'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
        else if (gt === 1) { ctx.fillStyle = 'rgba(200,200,190,0.14)'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
        else if (gt === 2) {
          if (gp > 1.5) { ctx.fillStyle = '#1d4a6e'; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.19, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = 'rgba(120,190,110,0.16)';
          ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
        }
      }
    }
    // roads
    ctx.strokeStyle = '#0a1114';
    ctx.lineWidth = 2;
    for (let i = -span; i <= span; i++) {
      const x = (i + span) * cell;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      const y = (i + span) * cell;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // train line
    const txX = ((-72 - (pbx - span) * CFG.P) / (CFG.P * (span * 2 + 1))) * W;
    if (txX > 0 && txX < W) {
      ctx.strokeStyle = 'rgba(255,90,80,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(txX, 0); ctx.lineTo(txX, H); ctx.stroke();
      ctx.setLineDash([]);
    }
    // landmarks
    for (const l of world.landmarks) {
      const dx = l.x - (pbx * CFG.P), dz = l.z - (pbz * CFG.P);
      const x = W / 2 + (dx / (CFG.P * (span * 2 + 1))) * W;
      const y = H / 2 + (dz / (CFG.P * (span * 2 + 1))) * H;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      ctx.fillStyle = '#ffcf6e';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,207,110,0.9)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(l.name, x, y - 9);
    }
    // shards
    for (const s of world.shards) {
      const id = `${s.chunkKey}:${s.idx}`;
      if (collected.has(id)) continue;
      const x = W / 2 + ((s.x - pbx * CFG.P) / (CFG.P * (span * 2 + 1))) * W;
      const y = H / 2 + ((s.z - pbz * CFG.P) / (CFG.P * (span * 2 + 1))) * H;
      ctx.fillStyle = 'rgba(53,224,184,0.9)';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // beacons
    world.beacons.forEach((b, i) => {
      const x = W / 2 + ((b.x - pbx * CFG.P) / (CFG.P * (span * 2 + 1))) * W;
      const y = H / 2 + ((b.z - pbz * CFG.P) / (CFG.P * (span * 2 + 1))) * H;
      ctx.strokeStyle = i === beaconIdx ? '#ffd166' : 'rgba(53,224,184,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
    });
    // player arrow
    const pcx = W / 2, pcy = H / 2;
    ctx.save();
    ctx.translate(pcx, pcy);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // frame
    ctx.strokeStyle = 'rgba(53,224,184,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}

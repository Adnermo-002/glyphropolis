import { CITY } from "../config";
import type { Player } from "../player/player";
import type { World } from "../world/world";

export interface HudInfo {
  seed: string; hour: number; state: string; crt: boolean;
  player: Player; world: World;
}

// HUD: corner minimap (buildings + player arrow + north), status line,
// fading controls hint. Plain DOM + 2D canvas, terminal styling.
export class Hud {
  private status: HTMLDivElement;
  private help: HTMLDivElement;
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private acc = 0;
  private helpVisible = true;
  private helpTimer = 14;

  constructor(el: HTMLDivElement) {
    el.innerHTML = `
      <div class="hud-tl"></div>
      <canvas id="minimap" width="170" height="170"></canvas>
      <div class="hud-bl">WASD move · Shift run · Mouse look · C crt · R new city · H help · Esc release</div>
    `;
    this.status = el.querySelector(".hud-tl")!;
    this.help = el.querySelector(".hud-bl")!;
    this.mini = el.querySelector("#minimap")!;
    this.mctx = this.mini.getContext("2d")!;
  }

  toggleHelp() { this.helpVisible = !this.helpVisible; this.help.style.display = this.helpVisible ? "" : "none"; }

  update(dt: number, info: HudInfo) {
    this.helpTimer -= dt;
    if (this.helpTimer < 0 && this.helpVisible) { this.helpVisible = false; this.help.style.display = "none"; }
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;

    const hh = Math.floor(info.hour), mm = Math.floor((info.hour - hh) * 60);
    this.status.textContent =
      `GLYPHROPOLIS\nseed: ${info.seed}\ntime: ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}  ${info.state}\ncrt: ${info.crt ? "ON" : "off"}`;

    // minimap
    const ctx = this.mctx, S = 170, half = S / 2;
    const viewM = CITY.blockPitch * 5 * 2;
    const sc = S / viewM;
    ctx.fillStyle = "rgba(0,8,3,0.85)";
    ctx.fillRect(0, 0, S, S);
    const boxes = info.world.minimapBoxes(info.player.x, info.player.z, 5);
    ctx.fillStyle = "rgba(125,255,169,0.5)";
    for (let i = 0; i < boxes.length; i += 4) {
      const bx = (boxes[i] - info.player.x) * sc + half;
      const bz = (boxes[i + 1] - info.player.z) * sc + half;
      const bw = Math.max(1.5, boxes[i + 2] * sc), bh = Math.max(1.5, boxes[i + 3] * sc);
      ctx.fillRect(bx - bw / 2, bz - bh / 2, bw, bh);
    }
    // player arrow
    const yaw = Math.atan2(-Math.sin(thisArrowYaw(info.player)), -Math.cos(thisArrowYaw(info.player)));
    void yaw;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-info.player.yaw);
    ctx.fillStyle = "#eafff0";
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(3.4, 4); ctx.lineTo(0, 2.2); ctx.lineTo(-3.4, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // north marker
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(0);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", half - half * Math.sin(0), 10 - 0);
    ctx.restore();
  }
}

function thisArrowYaw(p: Player): number { return p.yaw; }

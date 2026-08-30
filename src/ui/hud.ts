import { CITY, SHUTTLE } from "../config";
import type { Player } from "../player/player";
import type { World } from "../world/world";

export interface HudInfo {
  seed: string; hour: number; state: string; crt: boolean;
  player: Player; world: World;
}

// HUD: corner minimap (buildings + player arrow + north), status line,
// fading controls hint, altitude rail + eject charge bar (shuttle mode),
// vignette while charging. Plain DOM + 2D canvases, terminal styling.
export class Hud {
  private status: HTMLDivElement;
  private help: HTMLDivElement;
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private rail: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D;
  private chargeEl: HTMLDivElement;
  private fillEl: HTMLDivElement;
  private txtEl: HTMLDivElement;
  private vigEl: HTMLDivElement;
  private acc = 0;
  private helpVisible = true;
  private helpTimer = 14;

  constructor(el: HTMLDivElement) {
    el.innerHTML = `
      <div class="hud-tl"></div>
      <canvas id="minimap" width="170" height="170"></canvas>
      <canvas id="rail" width="64" height="380"></canvas>
      <div id="charge"><div id="chargeTxt"></div><div id="chargeFill"></div></div>
      <div id="vig"></div>
      <div class="hud-bl">WASD move · Shift run/thrust · hold E to charge eject · Mouse look · C crt · R new city · H help · Esc release</div>
    `;
    this.status = el.querySelector(".hud-tl")!;
    this.help = el.querySelector(".hud-bl")!;
    this.mini = el.querySelector("#minimap")!;
    this.mctx = this.mini.getContext("2d")!;
    this.rail = el.querySelector("#rail")!;
    this.rctx = this.rail.getContext("2d")!;
    this.chargeEl = el.querySelector("#charge")!;
    this.fillEl = el.querySelector("#chargeFill")!;
    this.txtEl = el.querySelector("#chargeTxt")!;
    this.vigEl = el.querySelector("#vig")!;
    this.rail.style.display = "none";
    this.chargeEl.style.display = "none";
  }

  toggleHelp() { this.helpVisible = !this.helpVisible; this.help.style.display = this.helpVisible ? "" : "none"; }

  update(dt: number, info: HudInfo) {
    this.helpTimer -= dt;
    if (this.helpTimer < 0 && this.helpVisible) { this.helpVisible = false; this.help.style.display = "none"; }

    // --- every frame: altitude rail (shuttle), charge bar + vignette (eject)
    const p = info.player;
    const shuttling = p.mode === "shuttle";
    this.rail.style.display = shuttling ? "" : "none";
    if (shuttling) this.drawRail(p);
    this.chargeEl.style.display = p.charging ? "" : "none";
    if (p.charging) {
      this.fillEl.style.height = (p.charge * 100).toFixed(1) + "%";
      this.txtEl.textContent = Math.round(SHUTTLE.hMin + (SHUTTLE.hMax - SHUTTLE.hMin) * p.charge) + "m";
    }
    this.vigEl.style.opacity = (p.charge * 0.8).toFixed(2);

    // --- throttled: status text + minimap
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;

    const hh = Math.floor(info.hour), mm = Math.floor((info.hour - hh) * 60);
    let status =
      `GLYPHROPOLIS\nseed: ${info.seed}\ntime: ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}  ${info.state}\ncrt: ${info.crt ? "ON" : "off"}`;
    if (shuttling) status += `\nSHUTTLE: ALT ${Math.round(p.altitude)}M  VEL ${Math.round(p.hSpeed)}M/S`;
    this.status.textContent = status;

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
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-info.player.yaw);
    ctx.fillStyle = "#eafff0";
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(3.4, 4); ctx.lineTo(0, 2.2); ctx.lineTo(-3.4, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // north marker
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", half, 10);
  }

  // Altitude Rail (ADR 0002): right-edge vertical scale, absolute altitude,
  // street = 0 m; tick every 10 m, labelled line every 50 m, pointer at player.
  private drawRail(p: Player) {
    const ctx = this.rctx, W = 64, H = 380;
    ctx.clearRect(0, 0, W, H);
    const alt = p.altitude;
    const ppm = 3.0; // pixels per metre
    ctx.strokeStyle = "rgba(125,255,169,0.8)";
    ctx.fillStyle = "rgba(125,255,169,0.9)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.beginPath(); ctx.moveTo(W - 12, 0); ctx.lineTo(W - 12, H); ctx.stroke();
    const span = H / 2 / ppm;
    for (let m = Math.max(0, Math.floor((alt - span) / 10) * 10); m <= alt + span + 10; m += 10) {
      const yy = H / 2 - (m - alt) * ppm;
      if (yy < 8 || yy > H - 2) continue;
      const major = m % 50 === 0;
      ctx.beginPath();
      ctx.moveTo(W - 12, yy); ctx.lineTo(W - (major ? 30 : 20), yy);
      ctx.stroke();
      if (major) ctx.fillText(m + "m", W - 34, yy + 3);
    }
    // pointer at the current altitude
    ctx.fillStyle = "#eafff0";
    ctx.beginPath();
    ctx.moveTo(W - 12, H / 2); ctx.lineTo(W - 2, H / 2 - 4); ctx.lineTo(W - 2, H / 2 + 4);
    ctx.closePath(); ctx.fill();
  }
}

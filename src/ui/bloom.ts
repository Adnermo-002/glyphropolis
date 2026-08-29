import type { Textmode } from "../render/textmode";
import type { World } from "../world/world";
import { PLAYER } from "../config";

// Bloom: the reveal. Holds the wave front until the chunks under it are
// ready (loading IS the animation), then sweeps to the screen edge.
export class Bloom {
  active = false;
  done = false;
  private r = 0;
  private maxR = 1;
  private speed = 60; // cells per second
  private hold = false;

  start(gridW: number, gridH: number, tm: Textmode, fast = false) {
    this.active = true;
    // match the shader's aspect-corrected metric (x scaled by cellW/cellH ≈ 0.5)
    const ar = 8 / 16;
    this.maxR = Math.hypot((gridW / 2) * ar, gridH / 2) + 6;
    this.speed = fast ? 4000 : this.maxR / 2.6;
    tm.u.uRevealOn.value = 1;
    tm.u.uRevealC.value.set(gridW / 2, gridH / 2);
  }

  update(dt: number, tm: Textmode, world: World, px: number, pz: number) {
    if (!this.active || this.done) return;
    const wantHold = this.hold || !world.readyAround(px, pz, 3);
    if (!wantHold) this.r += this.speed * dt;
    tm.u.uRevealR.value = this.r;
    if (!this.hold && this.r >= this.maxR) {
      this.done = true;
      tm.u.uRevealOn.value = 0;
    }
  }

  // ?wave=0..1 debug: freeze the wave front at a fraction of the sweep
  freezeAt(f: number) {
    this.hold = true;
    this.r = this.maxR * Math.min(Math.max(f, 0.01), 0.999);
  }

  get controlUnlocked(): boolean {
    return this.done;
  }
  get moveUnlocked(): boolean {
    return this.r > Math.max(30, PLAYER.walk * 6);
  }
}

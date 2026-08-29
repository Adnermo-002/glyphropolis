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

  start(gridW: number, gridH: number, tm: Textmode, fast = false) {
    this.active = true;
    this.maxR = Math.hypot(gridW, gridH) / 2 + 8;
    this.speed = fast ? 4000 : this.maxR / 4.6;
    tm.u.uRevealOn.value = 1;
    tm.u.uRevealC.value.set(gridW / 2, gridH / 2);
  }

  update(dt: number, tm: Textmode, world: World, px: number, pz: number) {
    if (!this.active || this.done) return;
    const wantHold = !world.readyAround(px, pz, 3);
    if (!wantHold) this.r += this.speed * dt;
    tm.u.uRevealR.value = this.r;
    if (this.r >= this.maxR) {
      this.done = true;
      tm.u.uRevealOn.value = 0;
    }
  }

  get controlUnlocked(): boolean {
    return this.done;
  }
  get moveUnlocked(): boolean {
    return this.r > Math.max(30, PLAYER.walk * 6);
  }
}

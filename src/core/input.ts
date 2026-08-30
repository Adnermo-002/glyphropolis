import { clamp } from "./rng";

// Pointer-lock first-person input.
export class Input {
  keys = new Set<string>();
  yaw = 0; pitch = 0;
  locked = false;
  private dx = 0; private dy = 0;

  constructor(el: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKey?.(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    el.addEventListener("click", () => { if (!this.locked) el.requestPointerLock(); });
    void el;
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
    });
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
  }

  onKey: ((code: string) => void) | null = null;

  mouseDelta(): [number, number] {
    const d: [number, number] = [this.dx, this.dy];
    this.dx = 0; this.dy = 0;
    return d;
  }

  lookSens = 0.0023;
  applyLook() {
    const [dx, dy] = this.mouseDelta();
    this.yaw -= dx * this.lookSens;
    this.pitch = clamp(this.pitch - dy * this.lookSens, -1.45, 1.45);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  moveAxis(): [number, number] {
    let f = 0, s = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) f += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) f -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) s += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) s -= 1;
    return [f, s];
  }

  get running(): boolean { return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"); }

  // Shuttle: holding E on a solid surface charges an Eject; in the air it
  // deliberately does nothing (ADR 0002).
  get ejectHeld(): boolean { return this.keys.has("KeyE"); }
}

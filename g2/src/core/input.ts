// Keyboard + mouse with pointer-lock. Edge-triggered key events are buffered per frame.

export class Input {
  keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  lmb = false;
  rmb = false;
  locked = false;
  /** set true by UI when a click should request pointer lock */
  wantLock = false;
  private onLockChange: () => void;
  private onKey: (e: KeyboardEvent, down: boolean) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouse: (e: MouseEvent, down: boolean) => void;

  constructor(onLockChange: () => void, onKey: (e: KeyboardEvent, down: boolean) => void, onMouseMove: (e: MouseEvent) => void, onMouse: (e: MouseEvent, down: boolean) => void) {
    this.onLockChange = onLockChange;
    this.onKey = onKey;
    this.onMouseMove = onMouseMove;
    this.onMouse = onMouse;
  }

  attach(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.onKey(e, true);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.onKey(e, false);
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) this.onMouseMove(e);
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.lmb = true; this.onMouse(e, true); }
      if (e.button === 2) { this.rmb = true; this.onMouse(e, true); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.lmb = false; this.onMouse(e, false); }
      if (e.button === 2) { this.rmb = false; this.onMouse(e, false); }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    // alt-tab / focus loss swallows keyup events: drop held keys so the player doesn't keep running
    window.addEventListener('blur', () => { this.keys.clear(); this.lmb = false; this.rmb = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (!this.locked) { this.lmb = false; this.rmb = false; }
      this.onLockChange();
    });
  }

  requestLock(canvas: HTMLCanvasElement): void {
    this.wantLock = false;
    try {
      // newer browsers return a promise that rejects without a user gesture; that's expected
      const r = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => undefined);
    } catch { /* ignored: the next click retries */ }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** consume accumulated mouse delta (call once per frame). */
  consumeMouse(): [number, number] {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  was(code: string): boolean {
    return this.pressed.has(code);
  }

  /** end of frame: clear edge buffer. */
  endFrame(): void {
    this.pressed.clear();
  }

  move(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }
}

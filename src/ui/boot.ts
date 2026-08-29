import { TEXTMODE } from "../config";

// Boot: black screen, geek glyph decode of the project name, then a blinking
// prompt. Resolves when done or skipped (click/key). Runs on its own 2D
// canvas at full resolution, terminal green, 8x16 cell rhythm.
export function runBoot(canvas: HTMLCanvasElement, seed: string, fast = false): Promise<void> {
  return new Promise((resolve) => {
    if (fast) return resolve();
    const ctx = canvas.getContext("2d")!;
    const fit = () => {
      canvas.width = innerWidth; canvas.height = innerHeight;
      canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    };
    fit();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const NAME = "GLYPHROPOLIS";
    const SUB = "AN INFINITE ASCII CITY";
    const SCRAM = TEXTMODE.ramp + "|/-+<>*:.";
    const t0 = performance.now();
    let done = false;
    let raf = 0;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener("keydown", skip);
      canvas.removeEventListener("click", skip);
      resolve();
    };
    const skip = () => { finish(); };
    addEventListener("keydown", skip);
    canvas.addEventListener("click", skip);

    const cell = 14;
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `bold ${cell * 2}px ${TEXTMODE.fontStack}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";

      const cx = innerWidth / 2, cy = innerHeight / 2 - cell;
      const revealN = Math.min(NAME.length, Math.floor(Math.max(0, t - 0.35) * 7));
      let out = "";
      for (let i = 0; i < NAME.length; i++) {
        out += i < revealN ? NAME[i]
          : i < revealN + 3 ? SCRAM[Math.floor(Math.random() * SCRAM.length)]
          : i % 2 === 0 ? SCRAM[Math.floor(Math.random() * SCRAM.length)] : " ";
      }
      ctx.fillStyle = "#7dffa9";
      ctx.fillText(out, cx, cy);
      ctx.fillStyle = "#3fa06a";
      ctx.font = `${cell}px ${TEXTMODE.fontStack}`;
      if (t > 1.9) ctx.fillText(SUB, cx, cy + cell * 2.2);

      // boot log
      ctx.textAlign = "left";
      ctx.font = `${Math.floor(cell * 0.8)}px ${TEXTMODE.fontStack}`;
      ctx.fillStyle = "#2c7c4a";
      const logs = [
        "> init seed=\"" + seed + "\"",
        "> world: infinite / chunked / deterministic",
        "> renderer: gpu textmode pass",
        "> weather: rain_02.fog heavy",
      ];
      const logN = Math.min(logs.length, Math.floor(t * 2.2));
      for (let i = 0; i < logN; i++) ctx.fillText(logs[i], 24, innerHeight - 24 - (logs.length - 1 - i) * cell);

      if (t > 2.4 && Math.floor(t * 2) % 2 === 0) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#7dffa9";
        ctx.fillText("[ CLICK TO ENTER ]", cx, cy + cell * 4.4);
      }
      if (t > 2.6) { finish(); return; }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
}

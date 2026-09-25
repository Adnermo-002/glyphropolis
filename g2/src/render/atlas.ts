// Glyph atlas: printable ASCII (32..126) plus special glyphs (128..). The atlas is rebuilt at
// the exact device-pixel cell size, so the screen pass can sample it 1:1 with NEAREST filtering
// and every cell shows a crisp terminal glyph.

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 8; // 128 tiles: 95 ASCII + up to 33 specials

/** special codes above ASCII (must stay < 128 + 33) */
export const SP = {
  BLOCK_1: 128, BLOCK_2: 129, BLOCK_3: 130, BLOCK_4: 131,
  BLOCK_5: 132, BLOCK_6: 133, BLOCK_7: 134, BLOCK_8: 135,
  SHADE_25: 136, SHADE_50: 137, SHADE_75: 138,
  DIAMOND: 139, TRI: 140, DOT: 141, RING: 142,
  APPROX: 143, OVERLINE: 144, MIDDOT: 145, BULLET: 146,
} as const;

export function codeToAtlasIndex(code: number): number {
  if (code >= 32 && code < 127) return code - 32;
  return 95 + (code - 128);
}

export interface Atlas {
  texture: HTMLCanvasElement;
  tileW: number;
  tileH: number;
  cols: number;
  rows: number;
}

const FONT_STACK = '"Cascadia Mono", Consolas, "DejaVu Sans Mono", "Menlo", monospace';

/** Build the atlas for a cell of tileW x tileH device pixels. White glyph on black. */
export function buildAtlas(tileW: number, tileH: number): Atlas {
  tileW = Math.max(3, Math.round(tileW));
  tileH = Math.max(6, Math.round(tileH));
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * tileW;
  cv.height = ATLAS_ROWS * tileH;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';

  const origin = (code: number): [number, number] => {
    const idx = codeToAtlasIndex(code);
    return [(idx % ATLAS_COLS) * tileW, Math.floor(idx / ATLAS_COLS) * tileH];
  };

  // font glyphs: bold, sized to the cell height, baseline placed so '_' sits at the bottom
  const fontPx = Math.max(6, Math.floor(tileH * 0.8));
  ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = Math.round(tileH * 0.76);
  const text = (code: number, ch: string) => {
    const [x, y] = origin(code);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, tileW, tileH);
    ctx.clip();
    ctx.fillText(ch, x + tileW / 2, y + baseline);
    ctx.restore();
  };
  for (let c = 33; c < 127; c++) text(c, String.fromCharCode(c));
  text(SP.APPROX, '\u2248');

  // procedural specials (font independent, pixel exact)
  const rect = (code: number, fx: number, fy: number, fw: number, fh: number) => {
    const [x, y] = origin(code);
    ctx.fillRect(x + Math.round(fx * tileW), y + Math.round(fy * tileH),
      Math.max(1, Math.round(fw * tileW)), Math.max(1, Math.round(fh * tileH)));
  };
  for (let k = 1; k <= 8; k++) rect(SP.BLOCK_1 + k - 1, 0, 1 - k / 8, 1, k / 8);
  const dither = (code: number, on: (px: number, py: number) => boolean) => {
    const [x, y] = origin(code);
    for (let py = 0; py < tileH; py++) for (let px = 0; px < tileW; px++) if (on(px, py)) ctx.fillRect(x + px, y + py, 1, 1);
  };
  dither(SP.SHADE_25, (px, py) => px % 2 === 0 && py % 2 === 0);
  dither(SP.SHADE_50, (px, py) => (px + py) % 2 === 0);
  dither(SP.SHADE_75, (px, py) => !(px % 2 === 1 && py % 2 === 1));
  rect(SP.OVERLINE, 0, 0.06, 1, 0.09);
  const shape = (code: number, draw: (cx: number, cy: number, r: number) => void) => {
    const [x, y] = origin(code);
    draw(x + tileW / 2, y + tileH / 2, Math.min(tileW, tileH) * 0.5);
  };
  shape(SP.DIAMOND, (cx, cy, r) => {
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.95); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + r * 0.95); ctx.lineTo(cx - r * 0.8, cy); ctx.closePath(); ctx.fill();
  });
  shape(SP.TRI, (cx, cy, r) => {
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx + r * 0.85, cy + r * 0.7); ctx.lineTo(cx - r * 0.85, cy + r * 0.7); ctx.closePath(); ctx.fill();
  });
  shape(SP.DOT, (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.fill(); });
  shape(SP.RING, (cx, cy, r) => { ctx.lineWidth = Math.max(1, r * 0.25); ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke(); });
  shape(SP.MIDDOT, (cx, cy, r) => { const s = Math.max(1, Math.round(r * 0.35)); ctx.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s); });
  shape(SP.BULLET, (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.fill(); });

  return { texture: cv, tileW, tileH, cols: ATLAS_COLS, rows: ATLAS_ROWS };
}

/** Fill-glyph ramps per material: 8 steps dark -> bright. Indexing: mat * 8 + step. */
export const RAMP_STEPS = 8;
export function buildRampTable(): Uint8Array {
  const S = (s: string | number[]): number[] => {
    const arr = typeof s === 'string' ? Array.from(s).map((c) => c.charCodeAt(0)) : s;
    const out: number[] = [];
    for (let i = 0; i < RAMP_STEPS; i++) out.push(arr[Math.min(i, arr.length - 1)]);
    return out;
  };
  const B8 = SP.BLOCK_8, S75 = SP.SHADE_75, APX = SP.APPROX, DIA = SP.DIAMOND;
  const c = (ch: string) => ch.charCodeAt(0);
  // order matches the MAT enum in config.ts
  const ramps: Record<number, number[]> = {
    1: S(' ..,:;=+'),                                   // GROUND
    2: S(' .:-=+#@'),                                   // CONCRETE
    3: S(' .-=+#%@'),                                   // GLASS
    4: S(' .,:;=#%'),                                   // BRICK
    5: S(' .-~==##'),                                   // ROOF
    6: S(' .:-=+%@'),                                   // METAL
    7: S(' .,:;+=#'),                                   // WOOD
    8: S(' .,;*%&@'),                                   // LEAF
    9: S(' .:!||I#'),                                   // TRUNK
    10: S(' .,\'";*%'),                                 // GRASS
    11: S([c(' '), c('.'), c('-'), c('~'), c('~'), APX, APX, c('#')]), // WATER
    12: S([c('.'), c('-'), c('='), c('='), c('#'), c('#'), S75, B8]),  // NEON
    13: S([c('.'), c(':'), c('='), c('#'), c('#'), S75, B8, B8]),     // SIGN
    14: S('.ooOO@@@'),                                  // LAMP
    15: S('.:iiI&&@'),                                  // PERSON
    16: S([c('+'), c('+'), c('*'), c('*'), DIA, DIA, DIA, DIA]),     // SHARD
    17: S('.:==##8@'),                                  // CAR
    18: S('.ooO@@@@'),                                  // LIGHT
    19: S(' .:==##@'),                                  // TRAIN
    20: S('.:||!|||'),                                  // FOUNTAIN
  };
  const table = new Uint8Array(21 * RAMP_STEPS).fill(32);
  for (const [k, v] of Object.entries(ramps)) {
    const m = Number(k);
    for (let i = 0; i < RAMP_STEPS; i++) table[m * RAMP_STEPS + i] = v[i];
  }
  return table;
}

/** glyphs the cell pass may pick by shape when a surface has strong internal detail */
export const MATCH_CODES: number[] = [
  ...Array.from('|-_/\\\'.,:=+[]()').map((c) => c.charCodeAt(0)),
  SP.OVERLINE,
];

/**
 * Coverage of each MATCH_CODES glyph on the cell pass's TX x TY sample grid (bottom row first),
 * measured from the real font at a reference size and normalised to max 1. Packed as
 * TX*TY floats per glyph padded to a multiple of 4, plus the squared norms.
 */
export function buildCoverage(tx: number, ty: number): { cov: Float32Array; sq: Float32Array; stride: number } {
  const sub = 4;
  const atlas = buildAtlas(tx * sub, ty * sub);
  const ctx = atlas.texture.getContext('2d')!;
  const img = ctx.getImageData(0, 0, atlas.texture.width, atlas.texture.height).data;
  const nt = tx * ty;
  const stride = Math.ceil(nt / 4) * 4;
  const cov = new Float32Array(MATCH_CODES.length * stride);
  const sq = new Float32Array(MATCH_CODES.length);
  MATCH_CODES.forEach((code, g) => {
    const idx = codeToAtlasIndex(code);
    const ox = (idx % ATLAS_COLS) * atlas.tileW, oy = Math.floor(idx / ATLAS_COLS) * atlas.tileH;
    const c = new Float32Array(nt);
    for (let j = 0; j < ty; j++) {
      for (let i = 0; i < tx; i++) {
        let s = 0;
        const y0 = oy + (ty - 1 - j) * sub; // sample row j counts from the bottom
        for (let y = y0; y < y0 + sub; y++) for (let x = ox + i * sub; x < ox + (i + 1) * sub; x++) s += img[(y * atlas.texture.width + x) * 4];
        c[j * tx + i] = s / (sub * sub * 255);
      }
    }
    const mx = Math.max(...c, 1e-3);
    let q = 0;
    for (let k = 0; k < nt; k++) { const v = c[k] / mx; cov[g * stride + k] = v; q += v * v; }
    sq[g] = q;
  });
  return { cov, sq, stride };
}

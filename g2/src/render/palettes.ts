// Hand-tuned glyph palettes. The cell pass tone-maps the scene, then grades it towards the
// palette stops. `grade` is how strongly: NEON keeps the city's true colours with a slight
// cyan cast, while the monochrome terminals (CRT / AMBER / BLUEPRINT) remap all luminance onto
// their phosphor ramp. PAPER is a light mode: dark ink glyphs on rice paper.

import { PALETTES, type PaletteId } from '../config';

export interface Palette {
  id: PaletteId;
  name: string;
  /** dark mode: [shadow, mid, light, glowAccent, bg]; light mode: [paper, midInk, darkInk, accent, bg] */
  stops: [string, string, string, string, string];
  /** paper mode: dark glyphs on a light background */
  light: boolean;
  /** 0 = true colour, 1 = fully remapped onto the stops */
  grade: number;
  /** CRT scanlines */
  scan: boolean;
  /** bloom multiplier */
  bloom: number;
}

export const PALETTE_DATA: Record<PaletteId, Palette> = {
  NEON: {
    id: 'NEON', name: PALETTES[0].name,
    stops: ['#06101a', '#3f7d86', '#e6fff7', '#35e0b8', '#04070a'],
    light: false, grade: 0.14, scan: false, bloom: 1.0,
  },
  CRT: {
    id: 'CRT', name: PALETTES[1].name,
    stops: ['#021a0c', '#1f9a5a', '#c8ffe4', '#2aff9e', '#010604'],
    light: false, grade: 1.0, scan: true, bloom: 1.1,
  },
  AMBER: {
    id: 'AMBER', name: PALETTES[2].name,
    stops: ['#1c0e02', '#a8661c', '#ffe2b0', '#ffb347', '#0a0501'],
    light: false, grade: 1.0, scan: true, bloom: 1.1,
  },
  PAPER: {
    id: 'PAPER', name: PALETTES[3].name,
    stops: ['#f3eee2', '#8a7f6e', '#231e19', '#b0302a', '#ece5d6'],
    light: true, grade: 1.0, scan: false, bloom: 0.0,
  },
  VAPOR: {
    id: 'VAPOR', name: PALETTES[4].name,
    stops: ['#1a0b2e', '#8a45b8', '#ffd6f2', '#ff6ec7', '#0b0517'],
    light: false, grade: 0.55, scan: false, bloom: 1.2,
  },
  BLUEPRINT: {
    id: 'BLUEPRINT', name: PALETTES[5].name,
    stops: ['#0a1d3a', '#3a78b0', '#e0f0ff', '#7fd4ff', '#061530'],
    light: false, grade: 1.0, scan: false, bloom: 0.8,
  },
};

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** returns the five stops as flat rgb triplets */
export function paletteStops(id: PaletteId): number[] {
  const p = PALETTE_DATA[id];
  const out: number[] = [];
  for (const s of p.stops) out.push(...hexToRgb01(s));
  return out;
}

// Per-seed progress in localStorage.

export interface SaveData {
  shards: string[];
  landmarks: string[];
  best: Record<string, number>;
  palette: string;
  cell: number;
  sound: boolean;
  /** render quality: -1 auto, else tier index (config.ts QUALITY_PRESET) */
  quality: number;
}

const keyFor = (seed: string) => `glyphropolis2:${seed}`;

export function loadSave(seed: string): SaveData {
  const def: SaveData = { shards: [], landmarks: [], best: {}, palette: 'NEON', cell: 2, sound: true, quality: -1 };
  try {
    const raw = localStorage.getItem(keyFor(seed));
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...def, ...parsed };
  } catch {
    return def;
  }
}

export function writeSave(seed: string, data: SaveData): void {
  try {
    localStorage.setItem(keyFor(seed), JSON.stringify(data));
  } catch {
    // storage full or blocked — ignore
  }
}

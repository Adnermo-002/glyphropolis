// Central tunables. All lengths in meters, times in seconds.
export const CITY = {
  blockPitch: 52,      // block (40m) + road (12m) => chunk pitch
  blockHalf: 20,       // half of buildable block
  roadHalf: 6,         // half road width (roads occupy [0,6) and [46,52) mod pitch)
  sidewalk: 2.6,
  chunkLoadRadius: 6,  // in chunks (~312m ahead)
  chunkUnloadRadius: 8,
  genBudgetPerFrameMs: 6,
  viewFar: 460,
};

export const PLAYER = {
  eye: 1.7,
  walk: 4.4,
  run: 8.2,
  radius: 0.38,
  bobFreq: 8.6,
  bobAmp: 0.045,
};

export const TIME = {
  dayLengthSec: 540,       // full 24h cycle in 9 real minutes
  startHour: 21.6,         // rainy neon night at spawn
};

export const TEXTMODE = {
  cellW: 8,
  cellH: 16,
  supersample: 2,
  fontStack: '"Cascadia Mono", Consolas, "JetBrains Mono", Menlo, "DejaVu Sans Mono", monospace',
  ramp: " .':;~-+=coxzm#%&@",  // 17 levels, dark -> dense
  edgeBandCells: 5,            // bloom scramble band thickness
};

export const WEATHER = {
  clear:  { fogMul: 0.55, dim: 1.0,  rain: 0,   wet: 0 },
  overcast:{ fogMul: 1.4, dim: 0.82, rain: 0,   wet: 0.35 },
  rain:   { fogMul: 2.0, dim: 0.68, rain: 1,   wet: 1 },
  dwellMin: 80, dwellMax: 220, lerpSec: 18,
};

export const TRAFFIC = { carCount: 130, laneOff: 1.55, minSpeed: 7, maxSpeed: 13 };

export function seedFromURL(): string {
  const s = new URLSearchParams(location.search).get("seed");
  return s && s.trim() ? s.trim() : "NEON-2049";
}

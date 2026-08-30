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

// Shuttle movement (ADR 0002, amended): soft-gravity glide after an Eject.
export const SHUTTLE = {
  gravity: 4.0,      // m/s^2 soft gravity
  liftK: 0.085,      // lift per horizontal m/s (caps at 85% of gravity)
  thrust: 26,        // Space thrust along the look direction (m/s^2)
  accelF: 15,        // W/S pitch-plane accel
  grip: 3.5,         // lateral damping: velocity follows the nose
  brake: 30,         // Shift active brake (m/s^2 against velocity)
  dragH: 0.5, dragV: 0.22,
  capH: 40, capHBoost: 65, capV: 55, // speed caps (m/s)
  ceiling: 300, ceilingFade: 45,     // soft ceiling + fade band (m)
  chargeTime: 1.15,  // seconds to a full charge
  hMin: 9, hMax: 66, // eject apex range (m)
  heavyLandV: 15,    // hard contact: stronger shake (landing always cancels)
  bankMax: 0.12,     // camera roll into turns (rad, ~7 deg)
  camLag: 9,         // camera yaw spring rate (rad/s follow)
};

export const TIME = {
  dayLengthSec: 540,       // full 24h cycle in 9 real minutes
  startHour: 19.3,         // dusk: neon flickering on, horizon still warm
};

// Canonical street cross-section, shared by citygen, world and (interpolated
// into GLSL) the ground shader. A 12m carriageway sits centered on every grid
// line; sidewalks stretch `walk` metres beyond its edge; buildings start 0.6m
// into the block proper.
export const ROAD = {
  half: 6,      // carriageway half width (metres)
  walk: 4.2,    // sidewalk width beyond the road edge
  crossLen: 2.3, // crosswalk band width
  get line() { return this.half + this.walk; },           // sidewalk outer edge (10.2)
  get treeLine() { return this.half + this.walk - 1.0; }, // street tree centerline (9.2)
};

export const CAMERA = {
  fovY: 52,                // VERTICAL fov; ~82 deg horizontal at 16:9
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

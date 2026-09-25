// Global tuning constants & material registry.

export const CFG = {
  /** block pitch in meters (roads centered on multiples of P) */
  P: 72,
  /** half width of a road */
  ROAD: 6,
  /** sidewalk width (from road edge) */
  SIDE: 4,
  /** buildable inner edge from block corner */
  INNER: 10,
  /** chunk radius: (2*R+1)^2 chunks */
  RADIUS: 3,
  /** full day length in seconds */
  DAY_SECONDS: 240,
  /** starting time-of-day fraction (0 = midnight) */
  START_T: 0.42,
  /** street lamps stand on the sidewalk this far from the block edge (corners + mid-block) */
  LAMP_INSET: 7.0,
  PLAYER: {
    EYE: 1.62, R: 0.34,
    SPEED: 6.4, SPRINT: 10.2,
    GRAV: -25, JUMP: 8.8,
    MANTLE_H: 0.95,
  },
  /** superman flight: cruise / boost speed (m/s), how fast velocity follows input (1/s), how fast
   *  it settles into a hover with no input (1/s), vertical share of Space / C */
  FLY: { SPEED: 18, BOOST: 44, ACCEL: 3.2, BOOST_ACCEL: 1.6, DRAG: 2.6, VERT: 0.8, CEIL: 320 },
  GRAPPLE: { RANGE: 62, STIFF: 26, DAMP: 7.6 },
  CAM: { DIST: 5.4, RISE: 0.6, SIDE: 0.7, PITCH_MIN: -1.25, PITCH_MAX: 1.35, NEAR: 0.12 },
  SHARD_TOTAL_CHUNKS: 1,
} as const;

/** Material ids written into the info texture (byte 0..255). */
export const MAT = {
  SKY: 0,
  GROUND: 1,
  CONCRETE: 2,
  GLASS: 3,
  BRICK: 4,
  ROOF: 5,
  METAL: 6,
  WOOD: 7,
  LEAF: 8,
  TRUNK: 9,
  GRASS: 10,
  WATER: 11,
  NEON: 12,
  SIGN: 13,
  LAMP: 14,
  PERSON: 15,
  SHARD: 16,
  CAR: 17,
  LIGHT: 18,
  TRAIN: 19,
  FOUNTAIN: 20,
} as const;
export const MAT_COUNT = 21;

export const DISTRICT = {
  DOWNTOWN: 0,
  MDTOWN: 1,
  OLD: 2,
  RESI: 3,
  IND: 4,
  PARK: 5,
  HARBOR: 6,
} as const;

export const DISTRICT_NAME = ['中央商业区', '河岸新镇', '老城', '住宅区', '工业带', '绿园', '港区'];

export const PALETTES = [
  { id: 'NEON', name: '霓虹 NEON' },
  { id: 'CRT', name: '绿夜 CRT' },
  { id: 'AMBER', name: '琥珀 AMBER' },
  { id: 'PAPER', name: '宣纸 PAPER' },
  { id: 'VAPOR', name: '蒸汽波 VAPOR' },
  { id: 'BLUEPRINT', name: '蓝图 BLUEPRINT' },
] as const;
export type PaletteId = (typeof PALETTES)[number]['id'];

export const CELL_SIZES = [
  { w: 5, h: 10, label: '5×10' },
  { w: 6, h: 12, label: '6×12' },
  { w: 8, h: 16, label: '8×16' },
  { w: 10, h: 20, label: '10×20' },
] as const;

/** Ground block types (packed in the blockmap texture). */
export const GROUND = {
  BUILDING: 0,
  PLAZA: 1,
  PARK: 2,
  WATER: 3,
  YARD: 4,
} as const;

export const WEATHER = { CLEAR: 0, OVERCAST: 1, RAIN: 2, STORM: 3, FOG: 4 } as const;
export const WEATHER_NAME = ['晴', '多云', '细雨', '雷雨', '雾'];

export const DAYNAME = ['凌晨', '清晨', '上午', '正午', '午后', '黄昏', '入夜', '深夜'];

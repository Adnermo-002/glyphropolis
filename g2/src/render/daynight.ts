// Day/night cycle: computes sun/moon directions, sky colors, light intensities, window lit
// probability and lamp intensity for a normalized time-of-day t in [0,1) (0 = midnight).

export interface DayNight {
  t: number;
  hour: number;
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  sunColor: [number, number, number];
  sunI: number;
  ambI: number;
  ambColor: [number, number, number];
  night: number; // 0 day, 1 night
  skyTop: [number, number, number];
  skyHorizon: [number, number, number];
  starI: number;
  cloudTint: [number, number, number];
  windowLit: number;
  lampI: number;
  fogColor: [number, number, number];
}

function norm3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function computeDayNight(t: number, overcast: number, fog: number): DayNight {
  const hour = t * 24;
  // sun elevation: 0 at 6:00, max at 12:00, -max at 0:00
  const ang = (t - 0.25) * Math.PI * 2;
  const elev = Math.sin(ang);
  const az = t * Math.PI * 2 * 0.9 + 0.7;
  const sunDir = norm3([Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)]);
  const moonDir = norm3([-sunDir[0], -sunDir[1] * 0.8 + 0.25, -sunDir[2]]);

  const night = smooth(0.05, -0.1, elev);
  const duskBand = Math.pow(1 - Math.min(1, Math.abs(elev) / 0.4), 2); // 1 near horizon (golden hour starts ~1.5 h before sunset)

  const dayTop: [number, number, number] = [0.09, 0.3, 0.7];
  const dayHor: [number, number, number] = [0.6, 0.76, 0.9];
  const duskTop: [number, number, number] = [0.2, 0.2, 0.42];
  const duskHor: [number, number, number] = [1.0, 0.5, 0.26];
  const nightTop: [number, number, number] = [0.012, 0.02, 0.045];
  const nightHor: [number, number, number] = [0.05, 0.07, 0.12];

  let skyTop = lerp3(nightTop, dayTop, 1 - night);
  let skyHor = lerp3(nightHor, dayHor, 1 - night);
  skyTop = lerp3(skyTop, duskTop, duskBand * (1 - night) * 0.55);
  skyHor = lerp3(skyHor, duskHor, duskBand * 0.85);

  const warm = Math.pow(clamp01(1 - Math.abs(elev) / 0.5), 1.4);
  const sunColor = lerp3([1, 0.94, 0.83], [1, 0.5, 0.2], warm * (1 - night));
  const sunI = smooth(-0.08, 0.18, elev) * (1 - overcast * 0.75) * (1 - fog * 0.55);
  const ambI = (0.34 + 0.3 * (1 - night)) * (1 - overcast * 0.3) * (1 - fog * 0.35);
  // ambient: cool blue at night, neutral sky light by day, a lilac/peach cast in the golden hour
  const ambColor = lerp3(lerp3([0.55, 0.62, 0.78], [0.75, 0.8, 0.9], 1 - night), [0.85, 0.7, 0.72], duskBand * (1 - night) * 0.6);

  const starI = night * (1 - overcast * 0.9) * (1 - fog);
  let cloudTint = lerp3([0.85, 0.88, 0.95], [0.1, 0.12, 0.18], night);
  cloudTint = lerp3(cloudTint, [1.0, 0.55, 0.42], duskBand * (1 - night * 0.6) * (1 - overcast * 0.6) * 0.85); // pink-orange sunset clouds
  const windowLit = lerp(0.13, 0.62, night);
  const lampI = lerp(0.18, 1.2, night);
  const fogColor = lerp3(skyHor, [0.5, 0.55, 0.6], 0.35 - 0.2 * (1 - night) * (1 - overcast));

  return {
    t, hour, sunDir, moonDir, sunColor, sunI, ambI, ambColor, night,
    skyTop, skyHorizon: skyHor, starI, cloudTint, windowLit, lampI, fogColor,
  };
}

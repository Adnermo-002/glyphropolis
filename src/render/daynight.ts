import * as THREE from "three";
import { TIME } from "../config";
import { lerp, clamp } from "../core/rng";

// Keyframe table: hour -> sky/fog/light state (asciicity-style: one ambient
// scalar lerped through everything keeps the whole city coherent).
interface SkyKey {
  h: number;                        // hour
  top: number; horizon: number;     // sky gradient colors
  sun: number; sunI: number;        // sun color, intensity
  amb: number;                      // ambient scalar 0..1
  fogD: number;                     // fog density
  stars: number;                    // star alpha
}

const K: SkyKey[] = [
  { h: 0,  top: 0x02040c, horizon: 0x0a0f1e, sun: 0x8090c0, sunI: 0.05, amb: 0.3, fogD: 1.05, stars: 0.9 },
  { h: 4,  top: 0x02040c, horizon: 0x0a0f1e, sun: 0x8090c0, sunI: 0.05, amb: 0.3, fogD: 1.05, stars: 0.9 },
  { h: 6,  top: 0x1a1e3a, horizon: 0x6e3a4a, sun: 0xff9060, sunI: 0.5,  amb: 0.34, fogD: 0.9,  stars: 0.15 },
  { h: 8,  top: 0x3a6a9e, horizon: 0x9db8c8, sun: 0xfff0d8, sunI: 1.5,  amb: 0.62, fogD: 0.55, stars: 0 },
  { h: 12, top: 0x4a86c0, horizon: 0xb8cfd8, sun: 0xffffff, sunI: 1.75, amb: 0.72, fogD: 0.45, stars: 0 },
  { h: 17, top: 0x3a5c96, horizon: 0xc08a5a, sun: 0xffc890, sunI: 1.3,  amb: 0.58, fogD: 0.6,  stars: 0 },
  { h: 19, top: 0x201a3e, horizon: 0x8a4a3e, sun: 0xff7850, sunI: 0.4,  amb: 0.34, fogD: 0.9,  stars: 0.3 },
  { h: 21, top: 0x050814, horizon: 0x141a2c, sun: 0x8090c0, sunI: 0.06, amb: 0.3, fogD: 1.0,  stars: 0.8 },
  { h: 24, top: 0x02040c, horizon: 0x0a0f1e, sun: 0x8090c0, sunI: 0.05, amb: 0.3, fogD: 1.05, stars: 0.9 },
];

const cA = new THREE.Color(), cB = new THREE.Color();

export class DayNight {
  hour = TIME.startHour;
  top = new THREE.Color(); horizon = new THREE.Color();
  sunColor = new THREE.Color(); sunI = 0; amb = 0; fogD = 0; stars = 0;
  sunDir = new THREE.Vector3(0.4, 0.8, 0.3);

  update(dt: number) {
    this.hour = (this.hour + (dt * 24) / TIME.dayLengthSec) % 24;
    let i = 0;
    while (i < K.length - 2 && K[i + 1].h <= this.hour) i++;
    const a = K[i], b = K[i + 1];
    const t = clamp((this.hour - a.h) / (b.h - a.h), 0, 1);
    this.top.setHex(a.top).lerp(cA.setHex(b.top), t);
    this.horizon.setHex(a.horizon).lerp(cB.setHex(b.horizon), t);
    this.sunColor.setHex(a.sun).lerp(cB.setHex(b.sun), t);
    this.sunI = lerp(a.sunI, b.sunI, t);
    this.amb = lerp(a.amb, b.amb, t);
    this.fogD = lerp(a.fogD, b.fogD, t);
    this.stars = lerp(a.stars, b.stars, t);
    // sun arcs east->west; at night the "sun" is moonlight (dim blue, from above)
    const ang = ((this.hour - 6) / 12) * Math.PI; // 6h->0, 18h->PI
    const day = this.sunI > 0.2;
    this.sunDir.set(Math.cos(ang), Math.max(day ? Math.sin(ang) * 0.9 + 0.25 : 0.75, 0.2), 0.35).normalize();
  }
}

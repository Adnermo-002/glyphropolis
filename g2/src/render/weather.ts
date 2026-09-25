// Weather state machine: clear / overcast / rain / storm / fog with smooth transitions.
// Emits scalar uniforms consumed by the shaders + audio.

import { WEATHER } from '../config';
import type { Rng } from '../core/rng';

export class Weather {
  kind: number = WEATHER.CLEAR;
  rain = 0;
  overcast = 0.15;
  fog = 0;
  flash = 0;
  audioRain = 0;
  wind = 0.3;
  private nextSwitch = 45;
  private nextBolt = 20;
  private clock = 0;

  constructor(private rng: Rng) {}

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= this.nextSwitch) {
      this.nextSwitch = this.clock + 40 + this.rng() * 60;
      const r = this.rng();
      const cur = this.kind;
      let next: number;
      if (r < 0.3) next = WEATHER.CLEAR;
      else if (r < 0.5) next = WEATHER.OVERCAST;
      else if (r < 0.75) next = WEATHER.RAIN;
      else if (r < 0.88) next = WEATHER.STORM;
      else next = WEATHER.FOG;
      if (next === cur && this.rng() < 0.5) next = cur === WEATHER.CLEAR ? WEATHER.OVERCAST : WEATHER.CLEAR;
      this.kind = next;
    }
    // targets
    const tRain = this.kind === WEATHER.RAIN ? 0.65 : this.kind === WEATHER.STORM ? 1 : 0;
    const tOcc = this.kind === WEATHER.OVERCAST ? 0.85 : this.kind === WEATHER.STORM ? 0.95 : this.kind === WEATHER.RAIN ? 0.5 : 0.12;
    const tFog = this.kind === WEATHER.FOG ? 0.85 : 0;
    const k = 1 - Math.exp(-dt / 12);
    this.rain += (tRain - this.rain) * k;
    this.overcast += (tOcc - this.overcast) * k;
    this.fog += (tFog - this.fog) * k;
    this.audioRain = this.rain;
    this.wind = 0.25 + this.rain * 0.4 + this.overcast * 0.15;

    // lightning
    if (this.kind === WEATHER.STORM && this.clock > this.nextBolt) {
      this.flash = 1;
      this.nextBolt = this.clock + 4 + this.rng() * 14;
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
  }
}

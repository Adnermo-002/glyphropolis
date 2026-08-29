import * as THREE from "three";
import { WEATHER } from "../config";
import { U } from "../render/materials";
import { clamp, lerp, valueNoise } from "../core/rng";
import type { DayNight } from "../render/daynight";

type StateName = "clear" | "overcast" | "rain";

// Weather state machine (clear/overcast/rain) with smooth parameter lerps,
// GPU-animated rain streaks in a box around the camera, and lightning that
// spikes the shared flash uniform (asciicity's thunder, simplified).
export class Weather {
  state: StateName = "rain";
  fogMul = WEATHER.rain.fogMul; dim = WEATHER.rain.dim; rain = WEATHER.rain.rain; wet = WEATHER.rain.wet;
  private target = WEATHER.rain;
  private dwell = 140;
  private flashTimer = 8;
  private inited = false;
  private rainMesh: THREE.LineSegments;
  private rmat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, seed: number, startHour = 21.6) {
    const N = 1000;
    const pos = new Float32Array(N * 2 * 3);
    const aStart = new Float32Array(N * 2 * 3);
    const aTip = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (valueNoise(seed, i, 7, 0.13) - 0.5) * 80;
      const y = valueNoise(seed, i, 13, 0.11) * 44;
      const z = (valueNoise(seed, i, 29, 0.17) - 0.5) * 80;
      const len = 0.55 + valueNoise(seed, i, 41, 0.9) * 0.75;
      for (let v = 0; v < 2; v++) {
        aStart.set([x, y, z], (i * 2 + v) * 3);
        aTip[i * 2 + v] = v; // 1 = bottom tip
        pos.set([0, 0, 0], (i * 2 + v) * 3);
      }
      void len;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aStart", new THREE.BufferAttribute(aStart, 3));
    geo.setAttribute("aTip", new THREE.BufferAttribute(aTip, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.rmat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; uniform float uRain;
        attribute vec3 aStart; attribute float aTip;
        varying float vA;
        void main(){
          vec3 box = vec3(80.0, 44.0, 80.0);
          float fall = 26.0 + fract(aStart.x) * 8.0;
          vec3 p = aStart;
          p.y = aStart.y - uTime * fall;
          p.x += sin(uTime * 0.7 + aStart.z) * 1.5;          // sway
          p = uCam + mod(p - uCam + box * 0.5, box) - box * 0.5;
          p.y -= aTip * (0.5 + fract(aStart.y));              // streak length
          vA = uRain;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying float vA;
        void main(){ gl_FragColor = vec4(vec3(0.72, 0.8, 0.92) * vA, vA * 0.5); }
      `,
    });
    this.rainMesh = new THREE.LineSegments(geo, this.rmat);
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);
    // day spawns clear, night spawns rainy (the Q12 rainy-neon-night opening)
    this.state = startHour > 6.5 && startHour < 18 ? "clear" : "rain";
    this.target = WEATHER[this.state];
    this.fogMul = this.target.fogMul; this.dim = this.target.dim;
    this.rain = this.target.rain; this.wet = this.target.wet;
  }

  update(dt: number, dn: DayNight, camPos: THREE.Vector3) {
    if (!this.inited) {
      this.inited = true;
      this.state = dn.hour > 6.5 && dn.hour < 18 ? "clear" : "rain";
      this.target = WEATHER[this.state];
      this.fogMul = this.target.fogMul; this.dim = this.target.dim;
      this.rain = this.target.rain; this.wet = this.target.wet;
    }
    this.dwell -= dt;
    if (this.dwell <= 0) {
      const order: StateName[] = ["clear", "overcast", "rain"];
      const i = order.indexOf(this.state);
      this.state = order[(i + 1 + Math.floor(Math.random() * 2)) % 3];
      this.target = WEATHER[this.state];
      this.dwell = WEATHER.dwellMin + Math.random() * (WEATHER.dwellMax - WEATHER.dwellMin);
    }
    const k = clamp(dt / WEATHER.lerpSec, 0, 1);
    this.fogMul = lerp(this.fogMul, this.target.fogMul, k);
    this.dim = lerp(this.dim, this.target.dim, k);
    this.rain = lerp(this.rain, this.target.rain, k);
    this.wet = lerp(this.wet, this.target.wet, k * 0.6);

    U.uDim.value = this.dim;
    U.uWet.value = this.wet;
    U.uFogD.value = dn.fogD * this.fogMul;
    U.uLitP.value = Math.pow(1 - dn.amb, 1.6) * 0.42 + 0.03;

    // lightning during real rain
    this.flashTimer -= dt * this.rain;
    if (this.flashTimer <= 0 && this.rain > 0.7) {
      U.uFlash.value = 0.9 + Math.random() * 0.6;
      this.flashTimer = 6 + Math.random() * 22;
    }
    U.uFlash.value *= Math.exp(-dt * 5.5);

    this.rmat.uniforms.uCam.value.copy(camPos);
    this.rmat.uniforms.uRain.value = this.rain;
    this.rainMesh.visible = this.rain > 0.03;
  }
}

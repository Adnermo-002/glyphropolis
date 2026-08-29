import * as THREE from "three";
import { TRAFFIC, CITY } from "../config";
import { mulberry32 } from "../core/rng";
import { U } from "../render/materials";

const glowVert = `
  attribute vec3 aColor; varying vec3 vColor; varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz; vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const glowFrag = `
  uniform vec3 uFogColor; uniform float uFogD; uniform float uFlash;
  varying vec3 vColor; varying vec3 vWorld;
  void main(){
    float d = distance(vWorld, cameraPosition);
    float k = uFogD * 0.0032;
    float f = 1.0 - exp(-d*d*k*k);
    vec3 col = mix(vColor, uFogColor, clamp(f, 0.0, 1.0)) + uFlash * 0.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Car { axis: 0 | 1; dir: 1 | -1; lane: number; roadIdx: number; along: number; speed: number; }

// Cars flow along the road grid (centerlines at i*P+3 on the perpendicular
// axis). Each car owns an absolute road line so positions are stable; cars
// too far from the player respawn onto a road near them.
export class Traffic {
  private cars: Car[] = [];
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private tails: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private rng: () => number;

  constructor(scene: THREE.Scene, seed: number) {
    this.rng = mulberry32(seed ^ 0xcafe);
    const bodyGeo = new THREE.BoxGeometry(1.9, 1.35, 4.4);
    const lightGeo = new THREE.BoxGeometry(1.5, 0.22, 0.12);
    const glowMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: glowVert, fragmentShader: glowFrag });
    const n = TRAFFIC.carCount;

    const mkInst = (geo: THREE.BufferGeometry, fill: [number, number, number] | null) => {
      const g = geo.clone();
      const arr = new Float32Array(n * 3);
      if (fill) for (let i = 0; i < n; i++) arr.set(fill, i * 3);
      g.setAttribute("aColor", new THREE.InstancedBufferAttribute(arr, 3));
      return new THREE.InstancedMesh(g, glowMat, n);
    };
    this.bodies = mkInst(bodyGeo, null);
    this.heads = mkInst(lightGeo, [1.0, 0.96, 0.85]);
    this.tails = mkInst(lightGeo, [1.0, 0.07, 0.05]);
    const palette = [[0.75, 0.12, 0.16], [0.1, 0.3, 0.65], [0.75, 0.72, 0.7], [0.08, 0.08, 0.1], [0.85, 0.65, 0.1], [0.15, 0.4, 0.3], [0.6, 0.1, 0.5]];
    const bodyCol = this.bodies.geometry.getAttribute("aColor") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < n; i++) {
      const c = palette[Math.floor(this.rng() * palette.length)];
      bodyCol.setXYZ(i, c[0], c[1], c[2]);
      this.cars.push(this.spawn(0, 0, true));
    }
    scene.add(this.bodies, this.heads, this.tails);
  }

  private spawn(pAlong: number, pPerp: number, initial: boolean): Car {
    const axis = this.rng() < 0.5 ? 0 : 1;
    const dir = this.rng() < 0.5 ? 1 : -1;
    const P = CITY.blockPitch;
    const baseIdx = Math.round((axis === 0 ? pPerp : pPerp) / P);
    const spread = initial ? 9 : 5;
    const roadIdx = baseIdx + Math.floor(this.rng() * (spread * 2 + 1)) - spread;
    return {
      axis, dir,
      lane: (dir === 1 ? 1 : -1) * TRAFFIC.laneOff,
      roadIdx,
      along: pAlong + (this.rng() * 2 - 1) * (initial ? 240 : 30),
      speed: TRAFFIC.minSpeed + this.rng() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed),
    };
  }

  update(dt: number, px: number, pz: number) {
    const P = CITY.blockPitch;
    const n = this.cars.length;
    for (let i = 0; i < n; i++) {
      const c = this.cars[i];
      c.along += c.dir * c.speed * dt;
      const pAlong = c.axis === 0 ? pz : px;
      const pPerp = c.axis === 0 ? px : pz;
      if (Math.abs(c.along - pAlong) > 250) {
        this.cars[i] = this.spawn(pAlong, pPerp, false);
        continue;
      }
      const roadC = c.roadIdx * P + 3 + c.lane;
      const wx = c.axis === 0 ? roadC : c.along;
      const wz = c.axis === 0 ? c.along : roadC;
      const rotY = c.axis === 0 ? (c.dir === 1 ? 0 : Math.PI) : (c.dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      this.e.set(0, rotY, 0); this.q.setFromEuler(this.e);
      this.fwd.set(0, 0, 1).applyQuaternion(this.q);

      this.v.set(wx, 0.68, wz);
      this.m.compose(this.v, this.q, new THREE.Vector3(1, 1, 1));
      this.bodies.setMatrixAt(i, this.m);
      this.v.set(wx, 0.45, wz).addScaledVector(this.fwd, 2.26);
      this.m.compose(this.v, this.q, new THREE.Vector3(1, 1, 1));
      this.heads.setMatrixAt(i, this.m);
      this.v.set(wx, 0.48, wz).addScaledVector(this.fwd, -2.26);
      this.m.compose(this.v, this.q, new THREE.Vector3(1, 1, 1));
      this.tails.setMatrixAt(i, this.m);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
  }
}

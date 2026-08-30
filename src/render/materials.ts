import * as THREE from "three";
import { CITY, ROAD } from "../config";

// Global uniforms shared by every custom material; daynight.ts + weather write them.
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
  uSunColor: { value: new THREE.Color(0xffffff) },
  uSunI: { value: 0 },
  uAmbient: { value: 0.2 },
  uFogColor: { value: new THREE.Color(0x0a0f1e) },
  uFogD: { value: 1.0 },
  uWet: { value: 0 },
  uFlash: { value: 0 },
  uDim: { value: 1 },
  uLitP: { value: 0 },          // window lit probability (driven by ambient)
  uSkyTop: { value: new THREE.Color(0x02040c) },
  uSkyHorizon: { value: new THREE.Color(0x0a0f1e) },
  uStars: { value: 0 },
  uExposure: { value: 1.3 },
};

const GLSL_HASH = `
float h11(float n){ return fract(sin(n)*43758.5453123); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453123); }
`;

const GLSL_FOG = `
vec3 applyFog(vec3 col, vec3 worldPos, vec3 camPos, vec3 fogColor, float fogD, float flash){
  float d = distance(worldPos, camPos);
  float k = fogD * 0.0032;
  float f = 1.0 - exp(-d*d*k*k);
  f = floor(f * 8.0 + 0.5) / 8.0; // stepped fog: distance walks the palette
  col = mix(col, fogColor * (1.0 + flash*2.5), clamp(f, 0.0, 1.0));
  return col;
}
`;

// ---------------------------------------------------------------- buildings
export function makeBuildingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      attribute float aSeed;
      attribute float aStyle;
      attribute vec3 aOrigin;
      attribute vec3 aScale;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      varying float vSeed; varying vec3 vOrigin; varying vec3 vScale; varying float vStyle;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 ln = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          ln = mat3(instanceMatrix) * ln;
        #endif
        vec4 wp = modelMatrix * lp;
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * ln);
        vSeed = aSeed; vOrigin = aOrigin; vScale = aScale; vStyle = aStyle;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(0.62, 0.65, 0.7);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
      uniform float uAmbient; uniform vec3 uFogColor; uniform float uFogD; uniform float uFlash;
      uniform float uDim; uniform float uLitP; uniform vec3 uSkyHorizon; uniform float uWet;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      varying float vSeed; varying vec3 vOrigin; varying vec3 vScale; varying float vStyle;
      ${GLSL_HASH}
      ${GLSL_FOG}
      const vec3 NEON[5] = vec3[5](
        vec3(1.0,0.18,0.47), vec3(0.18,0.89,1.0), vec3(1.0,0.6,0.18),
        vec3(0.32,1.0,0.42), vec3(0.71,0.3,1.0));

      void main(){
        vec3 n = normalize(vNormal);
        vec3 base = vColor;
        vec3 emissive = vec3(0.0);
        vec3 rel = vWorld - vOrigin; // local coords within building, [-s/2, s/2]

        if (abs(n.y) > 0.5) {
          // roof: dark gravel + AC-unit speckle
          float speck = h21(floor(vWorld.xz * 1.7) + vSeed);
          base *= 0.36 + 0.1 * speck;
        } else {
          // facade: pick tangent axes from normal
          bool xFace = abs(n.x) > abs(n.z);
          float u = xFace ? vWorld.z : vWorld.x;
          float lu = xFace ? rel.z : rel.x;
          float halfU = (xFace ? vScale.z : vScale.x) * 0.5;
          float v = vWorld.y;

          // per-style window grammar (ADR 0003 remix): rowhouses get tall
          // wide windows on banded floors, towers a glassier grid
          float cw = vStyle > 0.5 && vStyle < 1.5 ? 2.7 : 3.4;
          float ch = vStyle > 0.5 && vStyle < 1.5 ? 2.7 : 3.05;
          float winL = vStyle > 0.5 && vStyle < 1.5 ? 0.1 : 0.16;
          float winR = vStyle > 0.5 && vStyle < 1.5 ? 0.92 : 0.84;
          vec2 cell = vec2(u / cw, v / ch);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          bool glass = f.x > winL && f.x < winR && f.y > 0.22 && f.y < 0.82;
          // keep ground floor mostly solid (lobby)
          if (v - vOrigin.y < 3.2) glass = glass && h21(id + vSeed) > 0.72;

          float wh = h21(id * 7.31 + vSeed * 3.7);
          float lp2 = uLitP * (vStyle > 2.5 ? 1.3 : 1.0); // antenna towers: more glass lit
          float lit = step(wh, lp2);
          // flicker + the slow window-breathing pulse (asciicity remix)
          float flick = 0.82 + 0.28 * sin(uTime * (1.0 + 5.0 * wh) + wh * 61.0);
          flick *= 0.88 + 0.12 * sin(uTime * 0.9 + wh * 40.0);
          if (h21(id + vSeed + 4.2) < 0.06) flick *= step(0.4, fract(uTime * 0.7 + wh * 9.0));
          vec3 winCol = wh > 0.93 ? NEON[int(wh * 71.0) % 5] * 0.9
                      : wh > 0.62 ? vec3(1.0, 0.78, 0.5)
                      : wh > 0.4 ? vec3(0.9, 0.72, 0.42) : vec3(0.62, 0.74, 1.0);
          if (glass) {
            // unlit glass reflects sky; lit glass emits
            vec3 refl = mix(uSkyHorizon * 0.34, vec3(0.05, 0.07, 0.1), 0.4 + 0.6 * abs(dot(n, vec3(0,0,1))));
            refl *= 0.72 + 0.55 * h21(id * 13.7 + vSeed);
            base = mix(refl, winCol, lit * flick);
          } else {
            base *= 0.66 + 0.12 * h21(floor(cell) + vSeed); // mullion variation
          }
          // floor-slab band darkens each storey line -> '=' glyphs in textmode
          if (f.y < 0.09) base *= 0.72;

          // vertical neon sign strip near one facade edge (~35% of buildings;
          // rowhouses skip it)
          float sh = h11(vSeed * 5.13);
          if (sh < 0.45 && !(vStyle > 0.5 && vStyle < 1.5)) {
            float side = sh < 0.175 ? 1.0 : -1.0;
            float bandU = side * (halfU - 0.65 - lu);
            vec3 vDir = xFace ? vec3(0,1,0) : vec3(0,1,0);
            if (abs(bandU) < 0.65 && rel.y > 2.0 && rel.y < vScale.y - 1.5) {
              float seg = step(0.25, fract((rel.y - vOrigin.y) * 0.5 + sh * 9.0));
              float pulse = 0.62 + 0.38 * sin(uTime * 2.2 + sh * 40.0 + rel.y * 0.8);
              emissive += NEON[int(sh * 99.0) % 5] * seg * pulse * (0.5 + 0.9 * (1.0 - uAmbient));
            }
          }
        }

        float diff = max(dot(n, uSunDir), 0.0);
        vec3 col = base * (uAmbient * uDim * vec3(0.9, 0.95, 1.05) + uSunColor * uSunI * diff * 0.85 * uDim);
        col += emissive;
        col += uFlash * vec3(0.9, 0.95, 1.1) * (0.35 + 0.4 * abs(n.y));
        col = applyFog(col, vWorld, cameraPosition, uFogColor, uFogD, uFlash);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------- street lamp heads
export function makeLampGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      varying vec3 vWorld;
      void main(){
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
        #endif
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uAmbient; uniform float uFlash; uniform vec3 uFogColor; uniform float uFogD;
      varying vec3 vWorld;
      ${GLSL_FOG}
      void main(){
        float night = 1.0 - smoothstep(0.3, 0.55, uAmbient);
        vec3 col = vec3(1.0, 0.78, 0.45) * (0.18 + 1.5 * night) + uFlash * 0.3;
        col = applyFog(col, vWorld, cameraPosition, uFogColor, uFogD, uFlash);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------- props (trees, park ground)
export function makePropsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 ln = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          ln = mat3(instanceMatrix) * ln;
        #endif
        vec4 wp = modelMatrix * lp;
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * ln);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(0.5);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
      uniform float uAmbient; uniform vec3 uFogColor; uniform float uFogD; uniform float uFlash; uniform float uDim;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      ${GLSL_FOG}
      void main(){
        // wrap lighting: foliage keeps a soft floor on its unlit side so a
        // whole tree never drops to empty cells from certain sun angles
        float diff = clamp(dot(normalize(vNormal), uSunDir) * 0.55 + 0.5, 0.07, 1.0);
        vec3 col = vColor * (uAmbient * uDim * vec3(0.9, 0.98, 0.92) + uSunColor * uSunI * diff * 0.8 * uDim);
        col += uFlash * 0.4;
        col = applyFog(col, vWorld, cameraPosition, uFogColor, uFogD, uFlash);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------- ground
export function makeGroundMaterial(): THREE.ShaderMaterial {
  const P = CITY.blockPitch;
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uPitch: { value: P } },
    vertexShader: `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
      uniform float uAmbient; uniform vec3 uFogColor; uniform float uFogD; uniform float uFlash;
      uniform float uDim; uniform float uWet; uniform vec3 uSkyHorizon; uniform float uPitch;
      varying vec3 vWorld;
      ${GLSL_HASH}
      ${GLSL_FOG}

      void main(){
        vec3 p = vWorld;
        float rx = mod(p.x, uPitch);   // vertical roads: rx in [0,6)
        float rz = mod(p.z, uPitch);   // horizontal roads: rz in [0,6)
        bool roadX = rx < ${ROAD.half.toFixed(1)};         // runs along z
        bool roadZ = rz < ${ROAD.half.toFixed(1)};
        float spec = 0.0;
        vec3 col;

        float grain = h21(floor(p.xz * 0.7)) * 0.05;

        if (roadX || roadZ) {
          // asphalt
          col = vec3(0.115, 0.118, 0.125) * (0.85 + grain);
          bool inInter = roadX && roadZ;
          float lane = roadX ? p.x : p.z;         // across-lane coord
          float along = roadX ? p.z : p.x;
          float rAcross = roadX ? rx : rz;
          // dashed center line
          if (!inInter && rAcross > 2.55 && rAcross < 3.05 && mod(along, uPitch / 12.0) < uPitch / 24.0) {
            col = vec3(0.45, 0.43, 0.36);
          }
          // crosswalks near intersection approaches
          float qA = roadX ? rz : rx;   // crossing road coord
          bool nearCross = (qA > ${ROAD.line.toFixed(1)} && qA < ${(ROAD.line + ROAD.crossLen).toFixed(1)}) || (qA > uPitch - ${(ROAD.line + ROAD.crossLen).toFixed(1)} && qA < uPitch - ${ROAD.line.toFixed(1)});
          if (!inInter && nearCross && mod(lane, uPitch / 26.0) < uPitch / 52.0) col = vec3(0.4, 0.39, 0.34);
          spec = 1.0;
        } else if (rx < ${ROAD.line.toFixed(1)} || rx > uPitch - ${ROAD.line.toFixed(1)} || rz < ${ROAD.line.toFixed(1)} || rz > uPitch - ${ROAD.line.toFixed(1)}) {
          // wide sidewalk + expansion joints
          col = vec3(0.2, 0.2, 0.21) * (0.9 + grain * 1.6);
          if (mod(p.x, 4.0) < 0.06 || mod(p.z, 4.0) < 0.06) col *= 0.8;
          // curb: darker strip along the road edge
          float curbD = min(min(rx - ${ROAD.half.toFixed(1)}, uPitch - ${ROAD.half.toFixed(1)} - rx), min(rz - ${ROAD.half.toFixed(1)}, uPitch - ${ROAD.half.toFixed(1)} - rz));
          if (curbD < 0.4) col *= 0.62;
          spec = 0.4;
        } else {
          // block interior concrete
          col = vec3(0.14, 0.14, 0.15) * (0.85 + grain * 1.3);
        }

        // lamp glow pools at intersection corners (warm, wet-boosted)
        vec2 cellI = floor(p.xz / uPitch);
        float pool = 0.0;
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
          vec2 inter = (cellI + vec2(float(i), float(j))) * uPitch + vec2(3.0);
          for (int s = 0; s < 4; s++) {
            vec2 off = vec2(s < 2 ? -3.6 : 3.6, (s == 0 || s == 3) ? -3.6 : 3.6);
            float d2 = dot(p.xz - (inter + off), p.xz - (inter + off));
            pool += exp(-d2 / 10.0);
          }
        }
        float night = 1.0 - smoothstep(0.25, 0.55, uAmbient);
        vec3 poolCol = vec3(1.0, 0.72, 0.38) * pool * night * (0.16 + 0.4 * uWet);
        col += poolCol;

        // wet asphalt: darker + sky reflection
        col *= 1.0 - uWet * 0.45 * spec;
        col += uSkyHorizon * uWet * 0.14 * spec;
        col += vec3(0.05, 0.07, 0.09) * uWet * spec * night;

        float diff = max(dot(vec3(0,1,0), uSunDir), 0.0);
        col *= uAmbient * uDim + uSunColor * uSunI * diff * 0.55 * uDim;
        col += uFlash * 0.5;
        col = applyFog(col, vWorld, cameraPosition, uFogColor, uFogD, uFlash);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------- sky
export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.NoBlending, // writes the alpha=0 sky flag raw for the textmode pass
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
      uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform float uAmbient; uniform float uFlash;
      uniform float uStars;
      varying vec3 vDir;
      ${GLSL_HASH}
      void main(){
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.1, 1.0);
        vec3 col = mix(uSkyHorizon, uSkyTop, pow(max(up, 0.0), 0.55));
        // light pollution dome at night
        col += vec3(1.0, 0.5, 0.22) * pow(1.0 - abs(d.y), 6.0) * (1.0 - uAmbient) * 0.16;
        // sun disc (day; the sun IS the moonlight source at night)
        float sd = dot(d, uSunDir);
        col += uSunColor * (smoothstep(0.9992, 0.9997, sd) * 2.2 + pow(max(sd, 0.0), 90.0) * 0.22) * uSunI;

        // milky way: a tilted band of faint nebulosity and dense faint stars
        vec3 gmN = normalize(vec3(0.45, 0.62, -0.35));
        float gmb = exp(-pow(dot(d, gmN) * 3.4, 2.0));
        float neb = h31(floor(d * 14.0)) * 0.6 + h31(floor(d * 31.0)) * 0.4;
        col += mix(vec3(0.35, 0.45, 0.75), vec3(0.55, 0.4, 0.7), neb) * gmb * (0.07 + 0.1 * neb) * uStars;
        float dense = step(0.9973, h31(floor(d * 260.0))) * gmb;
        col += vec3(0.75, 0.8, 0.95) * dense * 0.7 * uStars;

        // stars: dim common layer + rare bright tinted giants, twinkle
        vec3 sd3 = floor(d * 220.0);
        float sh = h31(sd3);
        float st = step(0.9985, sh) * uStars;
        st *= 0.7 + 0.3 * sin(uTime * 3.0 + h31(sd3 + 7.0) * 40.0);
        vec3 stCol = mix(vec3(0.9, 0.95, 1.0), h31(sd3 + 3.0) > 0.5 ? vec3(1.0, 0.85, 0.62) : vec3(0.68, 0.82, 1.0), step(0.3, sh));
        col += stCol * st * 1.35;
        float big = step(0.99988, h31(sd3 + 11.0)) * uStars;
        big *= 0.82 + 0.18 * sin(uTime * 1.7 + h31(sd3) * 50.0);
        col += mix(vec3(1.0, 0.88, 0.66), vec3(0.72, 0.85, 1.0), h31(sd3 + 5.0)) * big * 2.4;

        // moon: disc + phase terminator + maria blotches + halo
        vec3 mDir = normalize(vec3(-uSunDir.x, max(uSunDir.y, 0.35), -uSunDir.z));
        float md = dot(d, mDir);
        float disc = smoothstep(0.99900, 0.99935, md);
        vec3 tx = normalize(cross(mDir, vec3(0.0, 1.0, 0.0)));
        vec3 ty = cross(tx, mDir);
        vec2 loc = vec2(dot(d, tx), dot(d, ty)) / 0.04;
        float term = smoothstep(-0.75, 0.45, loc.x * 1.15 + loc.y * 0.2);
        float maria = 0.82 + 0.18 * h21(floor(loc * 3.0) + 17.0);
        col += vec3(1.0, 0.97, 0.9) * disc * (0.18 + 0.82 * term) * maria * max(uStars, 0.15);
        col += vec3(0.75, 0.8, 0.95) * (pow(max(md, 0.0), 60.0) * 0.14 + pow(max(md, 0.0), 350.0) * 0.3) * uStars;

        // shooting star: one every ~26s, a fast spark with a short trail
        float cyc = uTime / 26.0;
        float mid = floor(cyc);
        float mph = fract(cyc);
        float live = step(mph, 0.028) * uStars * step(0.25, h21(vec2(mid, 9.0)));
        if (live > 0.0) {
          vec3 m0 = normalize(vec3(h21(vec2(mid, 1.0)) * 2.0 - 1.0, 0.3 + h21(vec2(mid, 2.0)) * 0.55, h21(vec2(mid, 3.0)) * 2.0 - 1.0));
          vec3 mvel = normalize(vec3(h21(vec2(mid, 4.0)) - 0.5, -0.7, h21(vec2(mid, 5.0)) - 0.5));
          float tt = mph / 0.028;
          vec3 head = normalize(m0 + mvel * tt * 0.16);
          float spark = smoothstep(0.99993, 0.99999, dot(d, head));
          vec3 tailP = normalize(m0 + mvel * max(tt - 0.011, 0.0) * 0.16);
          float trail = smoothstep(0.99985, 0.99997, dot(d, tailP)) * 0.55;
          col += vec3(1.0, 0.98, 0.9) * spark * 2.2 * live + vec3(0.8, 0.85, 1.0) * trail * live;
        }

        col += uFlash * vec3(0.8, 0.85, 1.0);
        gl_FragColor = vec4(col, 0.0);
      }
    `,
  });
}

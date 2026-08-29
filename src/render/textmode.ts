import * as THREE from "three";
import { TEXTMODE } from "../config";
import { buildAtlas, GLYPHS } from "./atlas";

// The textmode pipeline: render the 3D scene into a low-resolution target
// (cell grid x supersample), then convert it to glyphs in one fullscreen
// pass. The RT alpha channel carries a binary flag: 0 = sky, 1 = world.
// Edges come from a luminance Sobel; glyph = f(luminance), fg/bg from cell
// color (the asciicker dual-color scheme). Also owns the Bloom reveal
// (radial wave + scramble front) and the CRT filter.
export class Textmode {
  gridW = 2; gridH = 2;
  private rt: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private atlasTex: THREE.Texture | null = null;
  private atlasCell = [0, 0];

  readonly u = {
    tScene: { value: null as THREE.Texture | null },
    tAtlas: { value: null as THREE.Texture | null },
    uGrid: { value: new THREE.Vector2(2, 2) },
    uCellPx: { value: new THREE.Vector2(8, 16) },
    uAtlasGrid: { value: new THREE.Vector2(1, 1) },
    uRampLen: { value: TEXTMODE.ramp.length },
    uEdgeV: { value: GLYPHS.indexOf("|") },
    uEdgeH: { value: GLYPHS.indexOf("-") },
    uGlyphCount: { value: GLYPHS.length },
    uTime: { value: 0 },
    uRevealOn: { value: 0 },
    uRevealR: { value: 0 },
    uRevealC: { value: new THREE.Vector2(0, 0) },
    uBand: { value: TEXTMODE.edgeBandCells },
    uCrt: { value: 0 },
    uExposure: { value: 1.3 },
  };

  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: FRAG,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }

  resize(wCSS: number, hCSS: number, dpr: number) {
    const w = Math.max(2, Math.round(wCSS * dpr));
    const h = Math.max(2, Math.round(hCSS * dpr));
    this.gridW = Math.max(8, Math.ceil(w / TEXTMODE.cellW));
    this.gridH = Math.max(6, Math.ceil(h / TEXTMODE.cellH));
    const cw = w / this.gridW, ch = h / this.gridH;
    this.u.uGrid.value.set(this.gridW, this.gridH);
    this.u.uCellPx.value.set(cw, ch);
    this.rt.setSize(this.gridW * TEXTMODE.supersample, this.gridH * TEXTMODE.supersample);
    // rebuild atlas only when the device-pixel cell size changed materially
    const rw = Math.round(cw), rh = Math.round(ch);
    if (!this.atlasTex || Math.abs(rw - this.atlasCell[0]) > 0 || Math.abs(rh - this.atlasCell[1]) > 0) {
      const a = buildAtlas(rw, rh);
      this.atlasTex?.dispose();
      this.atlasTex = a.tex;
      this.atlasCell = [rw, rh];
      this.u.tAtlas.value = a.tex;
      this.u.uAtlasGrid.value.set(a.cols, a.rows);
    }
    return { gridW: this.gridW, gridH: this.gridH };
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0); // alpha 0 = sky until sky dome writes its flag
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.u.tScene.value = this.rt.texture;
    renderer.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.rt.dispose(); this.mat.dispose(); this.atlasTex?.dispose();
  }
}

const FRAG = `
  uniform sampler2D tScene; uniform sampler2D tAtlas;
  uniform vec2 uGrid; uniform vec2 uCellPx; uniform vec2 uAtlasGrid;
  uniform float uRampLen; uniform float uEdgeV; uniform float uEdgeH; uniform float uGlyphCount;
  uniform float uTime; uniform float uRevealOn; uniform float uRevealR;
  uniform vec2 uRevealC; uniform float uBand; uniform float uCrt; uniform float uExposure;

  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  void main(){
    vec2 cid = floor(gl_FragCoord.xy / uCellPx);
    cid = min(cid, uGrid - 1.0);
    vec2 g = uGrid;
    vec2 uvA = (cid + vec2(0.25, 0.25)) / g;
    vec2 uvB = (cid + vec2(0.75, 0.25)) / g;
    vec2 uvC = (cid + vec2(0.25, 0.75)) / g;
    vec2 uvD = (cid + vec2(0.75, 0.75)) / g;
    vec4 sA = texture2D(tScene, uvA); vec4 sB = texture2D(tScene, uvB);
    vec4 sC = texture2D(tScene, uvC); vec4 sD = texture2D(tScene, uvD);
    vec3 c = (sA.rgb + sB.rgb + sC.rgb + sD.rgb) * 0.25;
    c = pow(c, vec3(0.72)) * uExposure; // exposure: lifted at night, tamed by day
    float a = (sA.a + sB.a + sC.a + sD.a) * 0.25;
    float lA = dot(sA.rgb, vec3(0.2126, 0.7152, 0.0722));
    float lB = dot(sB.rgb, vec3(0.2126, 0.7152, 0.0722));
    float lC = dot(sC.rgb, vec3(0.2126, 0.7152, 0.0722));
    float lD = dot(sD.rgb, vec3(0.2126, 0.7152, 0.0722));
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722));

    // glyph selection
    float gi;
    bool sky = a < 0.5;
    if (sky) {
      // sparse sky: bright areas stay blank, faint gradients get light glyphs
      gi = L > 0.55 ? 0.0 : L > 0.28 ? 3.0 : L > 0.12 ? 1.0 : 0.0;
    } else {
      float gx = (lB + lD) - (lA + lC);
      float gy = (lC + lD) - (lA + lB);
      float edge = max(abs(gx), abs(gy)) * 3.4;
      if (edge > 0.22) gi = abs(gx) > abs(gy) ? uEdgeV : uEdgeH;
      else gi = floor(clamp(L, 0.0, 1.0) * uRampLen);
    }

    // fg/bg from cell color (hue kept, brightness shaped)
    float cmax = max(c.r, max(c.g, c.b));
    vec3 hue = c / max(cmax, 0.12);
    vec3 fg = clamp(c * (0.7 + 1.5 * L) + hue * 0.22, 0.0, 1.0);
    vec3 bg = c * c * (sky ? 0.35 : 0.3);
    if (sky) { fg *= 0.9; }

    // Bloom reveal: radial wave from screen center; front band scrambles
    if (uRevealOn > 0.5) {
      float r = distance(cid, uRevealC);
      if (r > uRevealR) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      if (r > uRevealR - uBand) {
        float hh = h21(cid * 1.7 + floor(uTime * 16.0));
        gi = floor(hh * uGlyphCount * 0.999);
        vec3 neon[5] = vec3[5](vec3(1.0,0.18,0.47), vec3(0.18,0.89,1.0), vec3(1.0,0.6,0.18), vec3(0.32,1.0,0.42), vec3(0.71,0.3,1.0));
        fg = neon[int(hh * 41.0) % 5] * (0.6 + 0.4 * h21(cid + 3.1));
        bg = fg * 0.08;
      }
    }

    // CRT mode: monochrome phosphor + scanline + shimmer
    if (uCrt > 0.001) {
      float lum = L;
      vec3 phosphor = vec3(0.36, 1.0, 0.58);
      vec3 cfg = phosphor * (0.14 + lum * 1.2);
      vec3 cbg = phosphor * (0.015 + lum * 0.06);
      float scan = 0.84 + 0.16 * sin(gl_FragCoord.y * 3.14159);
      fg = mix(fg, cfg * scan, uCrt);
      bg = mix(bg, cbg, uCrt);
      fg *= mix(1.0, 0.96 + 0.04 * h21(cid + floor(uTime * 7.0)), uCrt);
    }

    // atlas lookup: tile origin + in-cell pixel offset, canvas flipY handled
    vec2 inCell = fract(gl_FragCoord.xy / uCellPx);
    float col = mod(gi, uAtlasGrid.x);
    float row = uAtlasGrid.y - 1.0 - floor(gi / uAtlasGrid.x);
    vec2 auv = (vec2(col, row) + inCell) / uAtlasGrid;
    float mask = texture2D(tAtlas, auv).r;

    vec3 colF = fg * mask + bg * (1.0 - mask);
    colF = pow(colF, vec3(0.85)); // mild grade lift
    gl_FragColor = vec4(colF, 1.0);
  }
`;

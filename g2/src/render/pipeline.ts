// Rendering pipeline (glyph renderer v2.1)
//  1. scene pass  -> MRT target sampled TX x TY times per text cell:
//                    color RGBA16F (lit rgb, a = log2 linear depth; sky = 1)
//                    info  RGBA8   (material, glyph override, normal code + 32 * object id, emissive)
//  2. glow passes -> emissive extraction + separable blur at 1/2, plus a 1/8 downsample
//  3. cell pass   -> one fragment per text cell: picks the glyph (outline / fill / sky / rain)
//                    and the fg/bg colours, then grades them to the palette
//  4. screen pass -> per pixel: glyph atlas lookup at the exact cell size, background, glow
import * as THREE from 'three';
import { PALETTE_DATA, paletteStops } from './palettes';
import { ATLAS_COLS, ATLAS_ROWS, MATCH_CODES, RAMP_STEPS, buildAtlas, buildCoverage, buildRampTable } from './atlas';
import { CFG, QUALITY_PRESET, type PaletteId, type QualityTier } from '../config';

/** scene samples per text cell (a 1:2 cell gets square samples) */
const TX = 3;
const TY = 6;
const DEPTH_K = (1 / Math.log2(1401)).toFixed(7);
const LAMP = CFG.LAMP_INSET.toFixed(2);
const NM = MATCH_CODES.length;
const COV_STRIDE = Math.ceil((TX * TY) / 4);

const VERT_WORLD = /* glsl */ `
invariant gl_Position; // depth pre-pass and colour pass must agree exactly
in vec4 aColor;
in float aMat;
in vec4 aParams;
in vec4 aFacade;
out vec3 vW;
out vec3 vN;
out vec4 vCol;
out float vMat;
out vec4 vPar;
out vec4 vFac;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vCol = aColor;
  vMat = aMat;
  vPar = aParams;
  vFac = aFacade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// sun shadow map: depth-only pass from an orthographic sun camera that follows the player
// (resolution comes from the quality preset, see config.ts QUALITY_PRESET)
const SHADOW_HALF = 170;
const FRAG_SHADOW = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 outColor;
void main() { outColor = vec4(1.0); }
`;

const FRAG_WORLD = /* glsl */ `
precision highp float;
in vec3 vW;
in vec3 vN;
in vec4 vCol;
in float vMat;
in vec4 vPar;
in vec4 vFac;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;

uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunI;
uniform float uAmbI;
uniform vec3 uAmbColor;
uniform float uNight;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform float uStarI;
uniform vec3 uCloudTint;
uniform float uOvercast;
uniform float uRain;
uniform float uFogD;
uniform vec3 uFogColor;
uniform float uFlash;
uniform float uWindowLit;
uniform float uLampI;
uniform vec3 uLampColor;
uniform sampler2D uBlockMap;
uniform vec2 uBlockOrigin;
uniform float uBlockMapSize;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform int uQ; // quality tier 0..2 (a uniform, not a define: switching tiers must not recompile)

float em = 0.0;
bool gLit = false; // ground already lit (water)
// deferred surface requests, resolved once at the end of main() (see windows())
float gWin = 0.0;                 // pane coverage of this fragment
vec2 gCs = vec2(1.9, 3.05);       // pane / room size
float gF0 = 0.08;                 // glass reflectivity at normal incidence
float gPLit = 0.0;                // room lit?
float gH = 0.0;                   // per-room hash
vec3 gTint = vec3(0.8, 0.9, 0.95);
float gSpand = 0.0, gSpandK = 0.0; // curtain-wall spandrel bands (see main)
float gEmK = 0.0;                 // emissive per lit pane
bool gWater = false;              // shade as water (resolved once in main)

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  int oct = uQ >= 2 ? 4 : 2;
  for (int i = 0; i < oct; i++) { v += a * noise2(p); p *= 2.03; a *= 0.5; }
  return v;
}

// quantized normal -> code 0..17 (6 axes + 12 edge dirs)
int normalCode(vec3 n) {
  float ax = abs(n.x), ay = abs(n.y), az = abs(n.z);
  vec3 s = sign(n);
  if (ax >= ay && ax >= az) {
    if (az > ay && az > 0.42 * ax) return 10 + (s.x < 0.0 ? 1 : 0) + (s.z < 0.0 ? 2 : 0);
    if (ay > 0.42 * ax) return 6 + (s.x < 0.0 ? 1 : 0) + (s.y < 0.0 ? 2 : 0);
    return s.x > 0.0 ? 0 : 1;
  }
  if (ay >= ax && ay >= az) {
    if (az > ax && az > 0.42 * ay) return 14 + (s.y < 0.0 ? 1 : 0) + (s.z < 0.0 ? 2 : 0);
    if (ax > 0.42 * ay) return 6 + (s.x < 0.0 ? 1 : 0) + (s.y < 0.0 ? 2 : 0);
    return s.y > 0.0 ? 2 : 3;
  }
  if (ax > ay && ax > 0.42 * az) return 10 + (s.x < 0.0 ? 1 : 0) + (s.z < 0.0 ? 2 : 0);
  if (ay > 0.42 * az) return 14 + (s.y < 0.0 ? 1 : 0) + (s.z < 0.0 ? 2 : 0);
  return s.z > 0.0 ? 4 : 5;
}

// box-filtered indicator of x in [a, b]: thin markings fade with distance instead of aliasing
float band(float x, float a, float b) {
  float w = max(fwidth(x), 1e-4);
  return clamp((min(x + 0.5 * w, b) - max(x - 0.5 * w, a)) / w, 0.0, 1.0);
}
// same for a periodic stripe pattern (duty = on fraction), fading to its mean when unresolved
float stripes(float x, float period, float duty) {
  float w = fwidth(x) / period;
  float on = step(1.0 - duty, fract(x / period));
  return mix(on, duty, clamp(w * 2.0 - 0.5, 0.0, 1.0));
}

vec3 waterCol(vec3 pos, vec3 n) {
  float t = uTime;
  vec2 wv = vec2(
    sin(pos.x * 0.8 + t * 1.7) + sin(pos.z * 0.7 - t * 1.3),
    cos(pos.x * 0.6 - t * 1.1) + sin(pos.z * 0.9 + t * 1.9)
  );
  vec3 wn = normalize(vec3(n.x, n.y + wv.x * 0.035, n.z + wv.y * 0.035));
  float diff = max(dot(wn, uSunDir), 0.0) * uSunI;
  float fres = pow(1.0 - max(wn.y, 0.0), 3.0);
  vec3 deep = vec3(0.02, 0.1, 0.17);
  vec3 sky = mix(uSkyHor, uSkyTop, 0.65);
  // wave bands give the ASCII pass something to draw (~) and keep open water from reading as flat ground
  float band = smoothstep(0.55, 0.95, sin(pos.x * 0.35 + pos.z * 0.22 + t * 1.2 + 2.0 * noise2(pos.xz * 0.08)) * 0.5 + 0.5);
  vec3 col = deep * (1.0 + 0.6 * band) + sky * fres * (0.25 + 0.35 * uSunI) + uAmbColor * uAmbI * vec3(0.2, 0.32, 0.45);
  vec3 hv = normalize(uSunDir + normalize(cameraPosition - pos));
  col += uSunColor * pow(max(dot(wn, hv), 0.0), 90.0) * uSunI * 0.9;
  col += vec3(0.35, 0.6, 0.7) * pow(noise2(pos.xz * 1.3 + t * 0.4), 8.0) * 0.18 * uSunI;
  return col;
}

void ground(out vec3 col, int nc) {
  vec2 bz = floor(vW.xz / 72.0);
  vec2 bId = bz - uBlockOrigin;
  vec4 bm = texture(uBlockMap, (bId + 0.5) / uBlockMapSize);
  float btype = bm.r * 255.0;
  float bpar = bm.g * 255.0;
  float bhash = bm.b * 255.0;
  vec2 g = mod(vW.xz, 72.0);
  float rx = min(g.x, 72.0 - g.x);
  float rz = min(g.y, 72.0 - g.y);
  vec2 pc = vW.xz - (bz * 72.0 + 36.0);

  nc = 2;
  em = 0.0;

  if (btype > 2.5) { // full water block
    col = vec3(0.0); gWater = true; gLit = true;
    return;
  }

  if (rx < 6.0 || rz < 6.0) {
    float n1 = noise2(vW.xz * 0.9 + bhash);
    col = vec3(0.095, 0.10, 0.112) * (0.75 + 0.55 * n1);
    if (rx >= 6.0 || rz >= 6.0) {
      // a road runs along z where rx < 6 (lateral offset rx) and along x where rz < 6
      bool alongZ = rx < 6.0;
      float lat = alongZ ? rx : rz;
      float along = alongZ ? vW.z : vW.x;
      float fromJunction = alongZ ? rz : rx;
      float cl = band(lat, 0.2, 0.44);
      col = mix(col, vec3(0.8, 0.62, 0.2), cl * 0.85);                       // double yellow centre line
      float ln = band(lat, 2.9, 3.14) * stripes(along, 6.0, 0.45);
      col = mix(col, vec3(0.62, 0.62, 0.6), ln * 0.7);                       // dashed lane divider
      float el = band(lat, 5.3, 5.55);
      col = mix(col, vec3(0.55, 0.55, 0.55), el * 0.6);                      // edge line
      if (fromJunction > 6.4 && fromJunction < 9.4 && lat < 5.2) {           // zebra crossing
        col = mix(col, vec3(0.72, 0.72, 0.7), stripes(lat + 0.275, 1.1, 0.5) * 0.85);
      }
    }
    col += uSkyHor * (0.16 * (1.0 - 0.5 * noise2(vW.xz * 0.5)) ) * uRain;
    return;
  }

  if (btype > 0.5 && btype < 1.5) { // PLAZA
    float n1 = noise2(vW.xz * 0.35 + bhash * 3.1);
    col = vec3(0.30, 0.295, 0.285) * (0.85 + 0.35 * n1);
    // diamond paving: light stone joints (box-filtered so they fade, not alias, with distance)
    vec2 dg = mod(vW.xz, 12.0) - 6.0;
    float dia = abs(dg.x) + abs(dg.y);
    col += vec3(0.15, 0.15, 0.155) * band(dia, 5.62, 6.0);
    vec2 ctr = abs(dg);
    col *= 1.0 - 0.18 * band(max(ctr.x, ctr.y), 0.0, 0.9); // dark inlay at each diamond centre
    if (bpar > 2.5) {
      float edgeBand = min(min(g.x, 72.0 - g.x), min(g.y, 72.0 - g.y));
      float pad = step(9.5, edgeBand) * (1.0 - step(13.5, edgeBand)) * step(16.0, max(g.x, g.y)) * (1.0 - step(56.0, max(g.x, g.y)));
      col = mix(col, vec3(0.95, 0.36, 0.08), pad * 0.92);
      em += 1.25 * pad * (0.8 + 0.2 * sin(uTime * 3.0));
    }
  } else if (btype > 1.5 && btype < 2.5) { // PARK
    float n1 = noise2(vW.xz * 0.5 + bhash * 2.0);
    float n2 = noise2(vW.xz * 2.2);
    col = mix(vec3(0.06, 0.2, 0.07), vec3(0.15, 0.32, 0.09), n1) * (0.9 + 0.25 * n2);
    float path = 1.0 - step(1.4, min(abs(pc.x), abs(pc.y)));
    float dr = abs(length(pc) - 22.0);
    path = max(path, 1.0 - step(1.3, dr));
    if (bpar > 1.5) {
      float dpc = length(pc) - 13.0;
      if (dpc < 0.0) { col = vec3(0.0); gWater = true; gLit = true; return; }
      path *= 1.0 - smoothstep(14.0, 15.5, length(pc));
    }
    col = mix(col, vec3(0.4, 0.36, 0.29) * (0.85 + 0.3 * n2), path);
  } else if (btype > 3.5) { // YARD
    float n1 = noise2(vW.xz * 0.4);
    col = vec3(0.075, 0.08, 0.088) * (0.8 + 0.45 * n1);
    float eb = min(min(g.x, 72.0 - g.x), min(g.y, 72.0 - g.y));
    col = mix(col, vec3(0.55, 0.42, 0.07), step(10.0, eb) * (1.0 - step(11.5, eb)) * 0.65);
  } else { // BUILDING lot: sidewalk + apron
    float sb = min(min(g.x, 72.0 - g.x), min(g.y, 72.0 - g.y));
    float n1 = noise2(vW.xz * 0.8 + bhash);
    if (sb < 10.0) {
      col = vec3(0.21, 0.21, 0.225) * (0.85 + 0.3 * n1);
      // paving slabs: joints across the walk every 2 m
      float alongW = (min(g.x, 72.0 - g.x) < min(g.y, 72.0 - g.y)) ? vW.z : vW.x;
      col *= 1.0 - 0.35 * band(fract(alongW * 0.5) * 2.0, 0.0, 0.12);
      col += vec3(0.12) * band(sb, 6.0, 6.3);                                 // curb at the road edge
      float curb = smoothstep(9.55, 9.8, sb) * (1.0 - smoothstep(9.9, 10.15, sb));
      col += vec3(0.09, 0.09, 0.1) * curb;
      col += uSkyHor * 0.06 * uRain;
    } else {
      col = vec3(0.17, 0.166, 0.16) * (0.85 + 0.35 * n1);
      // courtyard apron: 3 m square tiles with dark joints
      vec2 tq = abs(fract(vW.xz / 3.0) - 0.5) * 3.0;
      col *= 1.0 - 0.12 * max(band(tq.x, 1.38, 1.5), band(tq.y, 1.38, 1.5));
    }
  }
}


// ---- glass: reflection of sky / clouds / sun / a distant skyline / the street, plus the room behind it ----
vec3 envRefl(vec3 R, float seed, float sh) {
  float dayK = 1.0 - uNight;
  vec3 c;
  if (R.y >= 0.0) {
    float up = sqrt(clamp(R.y, 0.0, 1.0));
    c = mix(uSkyHor, uSkyTop, up);
    // clouds projected on a sky plane (low tier: just the average cloud cover)
    float cl = 0.15 + 0.35 * uOvercast;
    if (uQ >= 1) {
      vec2 cp = R.xz / (R.y + 0.12) * 1.4 + vec2(uTime * 0.01, 0.0);
      cl = smoothstep(0.45, 0.8, fbm(cp + seed * 0.01));
    }
    c = mix(c, uCloudTint * (0.55 + 0.6 * uSunI) + uSkyHor * 0.2, cl * (0.55 + 0.4 * uOvercast) * smoothstep(0.0, 0.08, R.y));
    // sun disc + halo (killed where the pane itself is in shadow only for the sharp part)
    float sd = max(dot(R, uSunDir), 0.0);
    c += uSunColor * (pow(sd, 900.0) * 14.0 * sh + pow(sd, 24.0) * 0.35 + pow(sd, 4.0) * 0.08) * uSunI;
    // a skyline across the street: blocky towers by azimuth, windows lit at night
    float az = atan(R.z, R.x) * 9.0 + seed * 0.37;
    float col = floor(az);
    float hgt = 0.03 + 0.24 * hash21(vec2(col, 7.0 + floor(seed * 0.1))) * step(0.2, hash21(vec2(col, 3.0)));
    if (R.y < hgt) {
      float fx = fract(az), fy = R.y / max(hgt, 1e-3);
      float side = 0.55 + 0.45 * hash21(vec2(col, 11.0));
      vec3 bld = mix(uAmbColor * 0.6, uSkyHor * 0.9, 0.6) * side * (0.35 + 0.75 * dayK);
      // sunlit towers glow warm when the sun is behind the viewer
      bld += uSunColor * 0.3 * uSunI * side;
      vec2 wc = vec2(floor(fx * 6.0), floor(fy * hgt * 60.0));
      float wlit = step(0.62, hash21(wc + col * 3.1)) * step(0.25, fract(fx * 6.0)) * step(0.3, fract(fy * hgt * 60.0));
      bld += vec3(1.0, 0.75, 0.45) * wlit * 0.5 * uLampI;
      c = mix(c, bld, 0.92);
    }
  } else {
    // street below: dark asphalt with lamp pools at night, bright pavement by day
    // the city below: pavement and lower roofs, hazed toward the horizon colour
    vec3 gnd = vec3(0.24, 0.24, 0.25) * (uAmbI * 1.5 + uSunI * max(uSunDir.y, 0.0) * 1.1);
    gnd = mix(gnd, uSkyHor * (0.5 + 0.5 * (1.0 - uNight)), 0.3 * smoothstep(-0.5, 0.0, R.y));
    float lamps = step(0.8, hash21(floor(R.xz / (R.y - 0.05) * 3.0)));
    gnd += uLampColor * lamps * 0.25 * uLampI;
    c = gnd;
  }
  return c;
}

// interior mapping: trace the view ray into a box room behind the pane (cell = room size)
vec3 roomCol(vec3 n, vec3 vdir, vec2 cs, float lit, float h) {
  vec3 T = normalize(vec3(-n.z, 0.0, n.x) + vec3(1e-4, 0.0, 0.0));
  vec3 rd = -vdir;
  vec3 ro = vec3(dot(vW, T), vW.y, 0.0);
  vec2 cmin = floor(ro.xy / cs) * cs;
  vec3 wall = mix(vec3(0.55, 0.5, 0.44), vec3(0.42, 0.46, 0.5), fract(h * 5.3));
  float fy = (ro.y - cmin.y) / cs.y;
  vec3 c;
  if (uQ == 0) {
    // low tier: a flat back wall with the same daylight / lamp terms (no per-pixel ray march)
    vec3 alb = wall * 0.9;
    if (fy < 0.32 && fract(h * 29.0) > 0.35) alb *= 0.55;      // furniture band
    vec3 day = (uAmbColor * uAmbI * 1.4 + uSunColor * uSunI * 0.45) * 0.7;
    vec3 lamp = vec3(1.0, 0.76, 0.48) * lit * uLampI * 1.2;
    c = alb * (day * 0.85 + lamp * 1.7);
  } else {
    vec3 r = vec3(dot(rd, T), rd.y, max(-dot(rd, n), 0.05));
    float depth = 4.5 + 2.0 * fract(h * 17.0);
    float tx = (r.x > 0.0 ? (cmin.x + cs.x - ro.x) : (cmin.x - ro.x)) / (abs(r.x) > 1e-4 ? r.x : 1e-4);
    float ty = (r.y > 0.0 ? (cmin.y + cs.y - ro.y) : (cmin.y - ro.y)) / (abs(r.y) > 1e-4 ? r.y : 1e-4);
    float tz = depth / r.z;
    float t = min(min(abs(tx), abs(ty)), tz);
    vec3 hp = ro + r * t;
    float dz = clamp(hp.z / depth, 0.0, 1.0);
    vec3 alb;
    if (t == tz) alb = wall * 0.95;                              // back wall
    else if (t == abs(ty)) alb = r.y > 0.0 ? vec3(0.7) : vec3(0.3, 0.24, 0.2); // ceiling / floor
    else alb = wall * 0.8;                                       // side walls
    // furniture silhouette on the back half of the floor
    if (t == tz && hp.y - cmin.y < cs.y * 0.32 && fract(h * 29.0) > 0.35) alb *= 0.45;
    // daylight falls off into the room; lit rooms get warm ceiling light
    vec3 day = (uAmbColor * uAmbI * 1.4 + uSunColor * uSunI * 0.45) * (1.0 - 0.5 * dz);
    vec3 lamp = vec3(1.0, 0.76, 0.48) * lit * uLampI * (0.9 + 0.6 * step(0.0, r.y) * (1.0 - dz));
    c = alb * (day * 0.85 + lamp * 1.7);
  }
  // blinds on some panes (at the glass plane)
  float blind = step(0.72, fract(h * 13.0)) * step(1.0 - fract(h * 41.0) * 0.8, fy);
  vec3 bl = vec3(0.62, 0.58, 0.5) * (uAmbI * 0.6 + uSunI * 0.3 + lit * uLampI * 0.8) * (0.8 + 0.2 * step(0.5, fract(fy * cs.y * 6.0)));
  return mix(c, bl, blind);
}

// a window pane: Fresnel mix of the reflection and the (tinted) room behind it
vec3 gRefl = vec3(0.0); // reflection of the last pane (reused by the spandrel bands of curtain walls)
vec3 paneCol(vec3 n, vec2 cs, float F0, float lit, float h, float sh, vec3 tint) {
  vec3 vdir = normalize(cameraPosition - vW);
  vec3 T = normalize(vec3(-n.z, 0.0, n.x) + vec3(1e-4, 0.0, 0.0));
  // panes are never perfectly flat: a tiny per-pane tilt breaks the reflection up panel by panel
  vec3 np = normalize(n + T * (h - 0.5) * 0.07 + vec3(0.0, 1.0, 0.0) * (fract(h * 7.13) - 0.5) * 0.05);
  float ndv = clamp(dot(np, vdir), 0.0, 1.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  vec3 refl = envRefl(reflect(-vdir, np), h * 97.0 + vPar.w, sh);
  gRefl = refl;
  // tinted glass passes ~60% of the daylight room, but lit rooms at night shine through almost fully
  vec3 room = roomCol(n, vdir, cs, lit, h) * tint * mix(0.6, 1.0, uNight) * mix(vec3(1.0), vec3(0.8, 0.95, 1.1), 1.0 - uNight);
  return mix(room, refl * mix(vec3(1.0), tint * 1.15, 0.7), F);
}

// Window panes are not shaded here: the branches only describe the pane (size, tint, lit room,
// coverage) and main() resolves it once. With every branch calling paneCol() the driver inlined the
// large reflection + room code a dozen times, which made the shader take ~10 s to compile on D3D.

void windows(inout vec3 col) {
  float variant = vPar.z;
  vec2 cell = vec2(floor(vPar.x / 1.9), floor(vPar.y / 3.05));
  float h = hash21(cell + vPar.w * 0.37);
  float lit = step(1.0 - uWindowLit, h);
  if (variant < 0.5) {
    vec2 f = fract(vec2(vPar.x / 1.9, vPar.y / 3.05));
    float win = step(0.18, f.x) * (1.0 - step(0.82, f.x)) * step(0.3, f.y) * (1.0 - step(0.82, f.y));
    gWin = win; gPLit = lit; gH = h; gEmK = 0.34;
  } else if (variant < 1.5) {
    vec2 f = fract(vec2(vPar.x / 3.4, vPar.y / 3.4));
    float gx = min(f.x, 1.0 - f.x), gy = min(f.y, 1.0 - f.y);
    float mull = smoothstep(0.05, 0.09, gx) * smoothstep(0.05, 0.09, gy);
    vec2 id = vec2(floor(vPar.x / 3.4), floor(vPar.y / 3.4));
    float hl = hash21(id + vPar.w * 0.37);
    float llit = step(1.0 - uWindowLit * 1.15, hl);
    gWin = mull; gCs = vec2(3.4); gF0 = 0.12; gPLit = llit; gH = hl; gTint = vec3(0.75, 0.88, 0.95); gEmK = 0.3;
  } else if (variant < 2.5) {
    // balcony slabs
    float fy = fract(vPar.y / 3.05);
    float slab = (1.0 - smoothstep(0.05, 0.11, fy)) + smoothstep(0.93, 0.99, fy);
    col = mix(col, col * 0.5 + vec3(0.015), clamp(slab, 0.0, 1.0));
    float win = step(0.22, fy) * (1.0 - step(0.86, fy));
    gWin = win * 0.92; gPLit = lit; gH = h; gEmK = 0.35;
  } else {
    // spandrel bands
    float fy = fract(vPar.y / 3.05);
    float band = step(0.5, fy) * (1.0 - step(0.95, fy));
    col = mix(col, vCol.rgb * (0.75 + 0.3 * uSunI), band);
    float win = (1.0 - band) * step(0.22, fy) * (1.0 - step(0.9, fy));
    gWin = win; gPLit = lit; gH = h; gEmK = 0.32;
  }
}


// light pools under the street lamps. Lamps stand on the sidewalks at every block corner and
// mid-block (citygen.ts, CFG.LAMP_INSET), so the pools are computed analytically.
float lampPool(vec2 xz) {
  vec2 g = mod(xz, 72.0);
  vec2 q = min(g, 72.0 - g);
  float d = min(length(q - vec2(${LAMP}, ${LAMP})), min(length(q - vec2(36.0, ${LAMP})), length(q - vec2(${LAMP}, 36.0))));
  return exp(-d * d * 0.035);
}

// sun visibility 0..1 (soft PCF over the shadow map; 1 outside the shadowed area)
float sunShadow(vec3 pos, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  float ndl = dot(n, uSunDir);
  vec4 sc = uShadowMat * vec4(pos + n * (0.08 + 0.25 * (1.0 - abs(ndl))), 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  vec2 edge = min(c.xy, 1.0 - c.xy);
  float fade = smoothstep(0.0, 0.06, min(edge.x, edge.y));
  if (fade <= 0.0 || c.z >= 1.0) return 1.0;
  // hardware PCF: every tap is already a 2x2 bilinear comparison, so a few taps give a soft edge
  float z = c.z - 0.0004;
  float s = 0.0;
  if (uQ >= 2) {
    float r = uShadowTexel * 1.5;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) s += texture(uShadowMap, vec3(c.xy + vec2(float(i), float(j)) * r, z));
    }
    s /= 9.0;
  } else if (uQ == 1) {
    float r = uShadowTexel * 0.9;
    s = 0.25 * (texture(uShadowMap, vec3(c.xy + vec2(-r, -r), z)) + texture(uShadowMap, vec3(c.xy + vec2(r, -r), z))
              + texture(uShadowMap, vec3(c.xy + vec2(-r, r), z)) + texture(uShadowMap, vec3(c.xy + vec2(r, r), z)));
  } else {
    s = texture(uShadowMap, vec3(c.xy, z));
  }
  return mix(1.0, s, fade);
}

float depthEnc(float d) { return min(log2(1.0 + d) * ${DEPTH_K}, 0.998); }

void main() {
  vec3 n = normalize(vN);
  vec3 base = vCol.rgb;
  vec3 col;
  int nc = normalCode(n);
  float obj = 0.0;

  // sun visibility (one lookup for every material: keeps the PCF code in the shader once)
  float sh = 1.0;
  if (uSunI > 0.01 && (vMat < 1.5 || dot(n, uSunDir) > 0.0)) sh = sunShadow(vW, vMat < 1.5 ? vec3(0.0, 1.0, 0.0) : n);

  if (vMat < 1.5) { // ground
    ground(col, nc);
    if (!gLit) {
      float pool = lampPool(vW.xz) * uLampI;
      // shadowed ground is lit by the blue sky only; sunlit ground gets the warm sun on top
      vec3 skyAmb = mix(uAmbColor, uSkyTop * 1.6 + 0.12, 0.35 * (1.0 - uNight));
      vec3 gLight = uSunColor * max(uSunDir.y, 0.0) * uSunI * sh + skyAmb * uAmbI * (1.0 + 0.25 * (1.0 - uNight));
      col = col * (gLight * 1.45 + uLampColor * pool * 3.2) + uLampColor * pool * 0.04;
    }
  } else {
    obj = 1.0 + mod(vPar.w, 7.0);
    float diff = max(dot(n, uSunDir), 0.0) * uSunI * sh;
    // fixed per-face shading keeps the faces of a box distinct under any sun angle
    float face = 0.84 + 0.1 * n.x + 0.05 * n.z + 0.16 * max(n.y, 0.0) - 0.3 * max(-n.y, 0.0);
    // hemisphere ambient: cool sky light from above, warm bounce light from the street below
    float dayK = 1.0 - uNight;
    vec3 skyL = mix(uAmbColor, uSkyTop * 1.5 + 0.15, 0.4 * dayK);
    vec3 bounce = mix(uAmbColor, vec3(0.78, 0.66, 0.52), 0.45 * dayK) * 0.8;
    vec3 amb = mix(bounce, skyL, 0.5 + 0.5 * n.y);
    // contact darkening where walls meet the street (cheap ambient occlusion)
    float ao = mix(0.62, 1.0, smoothstep(0.0, 5.0, vW.y)) * (1.0 - 0.25 * max(-n.y, 0.0));
    vec3 light = uSunColor * diff * 1.3 + amb * uAmbI * face * ao * (0.86 + 0.22 * dayK);
    col = base * light;
    {
      vec3 vd = normalize(cameraPosition - vW);
      float rim = pow(1.0 - clamp(dot(n, vd), 0.0, 1.0), 4.0);
      col += mix(uSkyHor, uSkyTop, 0.5) * rim * 0.12 * dayK * uAmbI;
    }
    em = 0.0;
    float mf = vMat;
    if (mf < 2.5) { // concrete
      if (vPar.y > 0.0) windows(col);
    } else if (mf < 3.5) { // glass
      // curtain wall: 1.7 m panels, a spandrel band at every floor, thin mullions
      // coated curtain-wall glass: blue-green tint on both what passes through and what it reflects
      vec3 tint = mix(vec3(0.55, 0.78, 0.95), clamp(base * 1.8, 0.0, 1.0), 0.35);
      if (abs(n.y) > 0.5) {                     // glass roofs / skylights: reflection only
        col *= 0.4 * tint;
        gWin = 0.7; gF0 = 1.0; gTint = tint; gH = fract(vPar.w * 0.173); gCs = vec2(3.4, 3.4);
      } else {
        vec2 cs = vec2(1.7, 3.05);
        vec2 q = vec2(vPar.x, vPar.y) / cs;
        vec2 f = fract(q);
        vec2 id = floor(q);
        float gx = min(f.x, 1.0 - f.x) * cs.x, gy = f.y * cs.y;
        float mull = smoothstep(0.03, 0.07, gx);
        float spand = step(cs.y - 0.55, gy) + (1.0 - step(0.08, gy));
        float h = hash21(vec2(floor(id.x / 2.0), id.y) + vPar.w * 0.37); // rooms span two panels
        float lit = step(1.0 - uWindowLit * 1.1, h);
        col = base * light * 0.8;               // mullion frame
        gWin = mull; gCs = vec2(cs.x * 2.0, cs.y); gF0 = mix(0.45, 0.2, uNight); gPLit = lit; gH = h; gTint = tint;
        gSpand = clamp(spand, 0.0, 1.0); gSpandK = 0.55; gEmK = 0.3;
      }
    } else if (mf < 4.5) { // brick
      if (vPar.y > 0.0) windows(col);
    } else if (mf < 5.5) { // roof
      col *= 0.85;
    } else if (mf < 6.5) { // metal
      vec3 vdir = normalize(cameraPosition - vW);
      float spec = pow(max(dot(reflect(-uSunDir, n), vdir), 0.0), 48.0);
      col += uSunColor * spec * uSunI * 0.5;
    } else if (mf < 7.5) { // wood
      if (vPar.y > 0.0) windows(col);
    } else if (mf < 8.5) { // leaf
      float nv = noise2(vW.xz * 0.8 + vW.y * 0.5 + vPar.w);
      col = base * light * (0.8 + 0.4 * nv) + base * diff * 0.3;
    } else if (mf < 10.5) { // trunk / grass
      col = base * light * (0.88 + 0.22 * noise2(vW.xz * 1.6 + vW.y));
    } else if (mf < 11.5) { // water mesh
      gWater = true;
    } else if (mf < 12.5) { // neon
      float fl = 0.85 + 0.15 * sin(uTime * 9.0 + vW.x * 2.1 + vPar.w * 7.0);
      em = 1.6 * uLampI * fl;
      col = base * 0.22 + base * em;
    } else if (mf < 13.5) { // sign
      em = 1.25 * uLampI;
      col = base * 0.18 + base * em;
    } else if (mf < 14.5) { // lamp
      em = 1.5 * uLampI;
      col = uLampColor * 0.18 + uLampColor * em;
    } else if (mf < 16.5) { // person / shard
      if (mf > 15.5) {
        float pul = 0.75 + 0.35 * sin(uTime * 2.4 + vW.y * 3.0);
        em = 1.9 * pul;
        col = base * 0.2 + base * em;
      }
    } else if (mf < 18.5) { // car / light
      if (mf > 17.5) {
        em = 1.7 * (0.45 + 0.55 * uLampI);
        col = base * 0.3 + base * em;
      } else {
        float spec = pow(max(dot(reflect(-uSunDir, n), normalize(cameraPosition - vW)), 0.0), 32.0);
        col += uSunColor * spec * uSunI * 0.32;
      }
    } else if (mf < 19.5) { // train
      float spec = pow(max(dot(reflect(-uSunDir, n), normalize(cameraPosition - vW)), 0.0), 24.0);
      col += uSunColor * spec * uSunI * 0.28;
    } else { // fountain
      float wv = 0.55 + 0.45 * sin(uTime * 7.0 - vW.y * 3.0);
      em = 0.9 * wv;
      col = vec3(0.5, 0.75, 0.9) * 0.18 + vec3(0.62, 0.82, 1.0) * em;
    }
  }


  // resolve the deferred surfaces (each inlined exactly once)
  if (gWater) col = waterCol(vW, vMat < 1.5 ? vec3(0.0, 1.0, 0.0) : n);
  if (gWin > 0.0) {
    vec3 pane = paneCol(n, gCs, gF0, gPLit, gH, sh, gTint);
    // curtain walls: spandrel bands show the frame colour with a weaker reflection
    vec3 alt = mix(col, gRefl * gTint * 0.7, gSpandK);
    col = mix(col, mix(pane, alt, gSpand), gWin);
    em += gWin * (1.0 - gSpand) * gPLit * gEmK * uLampI;
  }

  float dist = length(cameraPosition - vW);
  float ff = 1.0 - exp(-dist * dist * uFogD);
  // aerial perspective: haze glows warm when looking toward the sun
  vec3 vray = (vW - cameraPosition) / max(dist, 1e-3);
  float toSun = max(dot(vray, uSunDir), 0.0);
  vec3 fogC = uFogColor + uSunColor * (pow(toSun, 6.0) * 0.35 + pow(toSun, 32.0) * 0.35) * uSunI * (1.0 - uNight);
  col = mix(col, fogC, ff);
  em = mix(em, 0.0, ff * 0.85);
  outColor = vec4(col, depthEnc(dist));
  // sea blocks are part of the ground plane but must pick water glyphs (~), not pavement dots
  float matOut = (vMat < 1.5 && gLit) ? 11.0 : vMat;
  outInfo = vec4(matOut / 255.0, 0.0, (float(nc) + 32.0 * obj) / 255.0, clamp(em * 0.5, 0.0, 1.0));
}
`;

const FRAG_SKY = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uFov;
uniform mat3 uCamMat;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunI;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform float uStarI;
uniform vec3 uCloudTint;
uniform vec3 uMoonDir;
uniform float uOvercast;
uniform vec3 uFogColor;
uniform float uFlash;
uniform int uQ;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash13(vec3(i, 7.0)), hash13(vec3(i + vec2(1.0, 0.0), 7.0)), f.x),
    mix(hash13(vec3(i + vec2(0.0, 1.0), 7.0)), hash13(vec3(i + vec2(1.0, 1.0), 7.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  // rotated octaves: no axis-aligned lattice artefacts
  const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
  float v = 0.0, a = 0.5;
  int oct = uQ >= 2 ? 5 : (uQ == 1 ? 4 : 3);
  for (int i = 0; i < oct; i++) { v += a * noise2(p); p = R * p; a *= 0.5; }
  return v;
}

void main() {
  vec2 px = (2.0 * gl_FragCoord.xy - uRes) / uRes;
  vec3 d = normalize(uCamMat * vec3(px * uFov, -1.0));
  float y = d.y;
  vec3 col = mix(uSkyHor, uSkyTop, pow(clamp(y, 0.0, 1.0), 0.5));
  if (y < 0.0) col = uSkyHor * max(0.5, 1.0 + y * 1.4);
  // info: feature 1 star, 2 moon, 3 sun (glyph hints for the cell pass)
  float feat = 0.0, featI = 0.0;

  float sd = clamp(dot(d, uSunDir), 0.0, 1.0);
  float sunDisc = smoothstep(0.99955, 0.99972, sd) * smoothstep(-0.06, 0.02, uSunDir.y);
  col += uSunColor * (sunDisc * 1.4 + pow(sd, 160.0) * 0.28 + pow(sd, 24.0) * 0.07) * max(uSunI, 0.05);
  if (sunDisc > 0.02) { feat = 3.0; featI = sunDisc * (0.45 + 0.55 * uSunI); }

  float md = clamp(dot(d, uMoonDir), 0.0, 1.0);
  float moonDisc = smoothstep(0.99962, 0.99976, md);
  col += vec3(0.75, 0.8, 0.95) * (moonDisc * 1.1 + pow(md, 90.0) * 0.12) * uStarI;
  if (moonDisc * uStarI > 0.05 && feat < 0.5) { feat = 2.0; featI = moonDisc * uStarI; }

  if (uStarI > 0.02 && y > 0.03) {
    vec3 sp = d * 260.0;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float h = hash13(id);
    float star = smoothstep(0.3, 0.05, length(f)) * step(0.9925, h);
    float tw = 0.6 + 0.4 * sin(uTime * 2.5 + h * 44.0);
    float si = star * uStarI * tw * (0.35 + 0.65 * fract(h * 173.3));
    col += vec3(0.85, 0.9, 1.0) * si;
    if (si > 0.04 && feat < 0.5) { feat = 1.0; featI = si; }
  }

  float cov = 0.0;
  if (y > 0.012) {
    vec2 cuv = d.xz / (y + 0.18);
    vec2 cp = cuv * 0.55 + vec2(uTime * 0.006, uTime * 0.0023);
    if (uQ >= 1) cp += 0.6 * vec2(noise2(cp * 0.7 + 3.1), noise2(cp * 0.7 + 8.7)); // light domain warp
    float cn = fbm(cp);
    cov = smoothstep(0.6 - uOvercast * 0.38, 0.8, cn) * smoothstep(0.012, 0.14, y) * (0.25 + 0.75 * uOvercast);
    vec3 ccol = uCloudTint * (0.45 + 0.45 * uSunI) + uFogColor * 0.25;
    col = mix(col, ccol, cov * 0.85);
    featI *= 1.0 - cov; // clouds hide stars / moon
  }

  col = mix(col, vec3(1.0, 0.97, 0.92), uFlash * 0.5);
  outColor = vec4(col, 1.0);
  outInfo = vec4(0.0, feat / 255.0, cov, clamp(featI, 0.0, 1.0));
}
`;

const FRAG_BEAM = /* glsl */ `
precision highp float;
in vec3 vW;
in vec4 vCol;
in vec4 vPar;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
uniform vec3 uFogColor;
uniform float uFogD;
uniform float uBeamI;
void main() {
  float fade = 1.0 - clamp(vPar.y, 0.0, 1.0);
  vec3 col = vCol.rgb * (0.16 + 0.84 * fade) * vCol.a * uBeamI * 0.16;
  float dist = length(cameraPosition - vW);
  float ff = 1.0 - exp(-dist * dist * uFogD * 0.6);
  col *= 1.0 - ff;
  // additive light only: alpha (depth) and the info target are preserved by the blend state
  outColor = vec4(col, 0.0);
  outInfo = vec4(0.0);
}
`;

// sky: fullscreen triangle pushed to the far plane, drawn after the opaque city so early-z skips
// every pixel already covered by geometry (the cloud fbm is the most expensive shader per pixel)
const VERT_SKY = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const VERT_FS = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = (position.xy + 1.0) * 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG_GLOW = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uInfo;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uMode; // 0 threshold, 1 blur
void main() {
  if (uMode < 0.5) {
    vec4 s = vec4(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = uTexel * vec2(i == 0 || i == 3 ? -0.7 : 0.7, i < 2 ? -0.7 : 0.7);
      s += vec4(texture(uSrc, vUv + o).rgb, texture(uInfo, vUv + o).a);
    }
    s *= 0.25;
    float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
    float m = smoothstep(0.3, 0.8, s.a) * smoothstep(0.1, 0.45, lum);
    outColor = vec4(min(s.rgb, vec3(3.0)) * m * 0.9, 1.0);
  } else {
    vec3 c = texture(uSrc, vUv).rgb * 0.227027;
    vec2 o1 = uDir * uTexel * 1.384573;
    vec2 o2 = uDir * uTexel * 3.230769;
    c += texture(uSrc, vUv + o1).rgb * 0.316216;
    c += texture(uSrc, vUv - o1).rgb * 0.316216;
    c += texture(uSrc, vUv + o2).rgb * 0.070270;
    c += texture(uSrc, vUv - o2).rgb * 0.070270;
    outColor = vec4(c, 1.0);
  }
}
`;

const FRAG_DOWN = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      c += texture(uSrc, vUv + uTexel * (vec2(float(i), float(j)) - 1.5)).rgb;
    }
  }
  outColor = vec4(c * 0.0625, 1.0);
}
`;

// tone mapping + palette grading shared by the cell and screen passes
const GLSL_GRADE = /* glsl */ `
uniform float uExposure;
uniform vec3 uStop[5];
uniform float uGrade;
uniform float uLight;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 tonemap(vec3 c) { return vec3(1.0) - exp(-max(c, vec3(0.0)) * uExposure); }
vec3 gradeDark(vec3 c) {
  float t = luma(c);
  vec3 g = mix(uStop[0], uStop[1], smoothstep(0.0, 0.4, t));
  g = mix(g, uStop[2], smoothstep(0.35, 1.0, t));
  return mix(c, g, uGrade);
}
// daytime look for the true-colour palettes: a little more saturation and a warm/cool split
// (sunlit tones lean warm, shadows lean blue); fades out at night and on the mono palettes
vec3 gradeDay(vec3 c, float k) {
  float l = luma(c);
  vec3 s = mix(vec3(l), c, 1.28);
  vec3 tint = mix(vec3(0.97, 1.0, 1.05), vec3(1.06, 1.0, 0.9), smoothstep(0.2, 0.7, l));
  return mix(c, clamp(s * tint, 0.0, 1.0), k);
}
vec3 paperBg(float l) { return uStop[4] * (0.9 + 0.1 * clamp(l * 2.0, 0.0, 1.0)); }
vec3 skyBg(vec3 sceneRgb) {
  vec3 c = tonemap(sceneRgb);
  return uLight > 0.5 ? paperBg(luma(c)) : gradeDark(c);
}
`;

const FRAG_CELL = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out vec4 oFg;
layout(location = 1) out vec4 oBg;
uniform sampler2D uScene;
uniform sampler2D uInfo;
uniform sampler2D uRampTex;
uniform float uTime;
uniform float uRain;
uniform float uNight;
uniform vec4 uCov[${NM * COV_STRIDE}];
uniform float uCovSq[${NM}];
uniform float uCovCode[${NM}];
uniform int uNM; // = ${NM}; a uniform bound keeps the driver from unrolling the glyph loop ${NM}x (slow compiles)
${GLSL_GRADE}
#define TX ${TX}
#define TY ${TY}
#define NT ${TX * TY}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
int dec8(float v) { return int(v * 255.0 + 0.5); }

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  ivec2 b0 = cell * ivec2(TX, TY);
  vec4 C[NT];
  vec4 I[NT];
  // reference sample: nearest non-ground geometry (walls win over the street they stand on)
  int ref = -1;
  float refD = 9.0;
  bool refGround = true;
  int geoN = 0;
  for (int j = 0; j < TY; j++) {
    for (int i = 0; i < TX; i++) {
      int k = j * TX + i;
      C[k] = texelFetch(uScene, b0 + ivec2(i, j), 0);
      I[k] = texelFetch(uInfo, b0 + ivec2(i, j), 0);
      int m = dec8(I[k].r);
      if (m > 0) {
        geoN++;
        bool gnd = m == 1;
        if (ref < 0 || (refGround && !gnd) || (gnd == refGround && C[k].a < refD)) { ref = k; refD = C[k].a; refGround = gnd; }
      }
    }
  }

  int code = 32;
  vec3 fg = vec3(0.0), bg = vec3(0.0);
  // cell background keeps more of the surface colour by day (airy), less at night (glyph contrast)
  float bgK = mix(0.8, 0.44, uNight);
  float skyFlag = 0.0;
  float emMax = 0.0;

  if (geoN == 0) {
    // ---------------- sky: stars, moon, sun, cloud texture over a smooth gradient
    vec3 avg = vec3(0.0);
    float cov = 0.0, featI = 0.0;
    int feat = 0;
    vec3 featC = vec3(0.0);
    for (int k = 0; k < NT; k++) {
      vec3 c = tonemap(C[k].rgb);
      avg += c;
      cov += I[k].b;
      int f = dec8(I[k].g);
      if (f > 0 && I[k].a > featI) { featI = I[k].a; feat = f; featC = c; }
    }
    avg /= float(NT);
    cov /= float(NT);
    if (feat == 3 && featI > 0.2) code = featI > 0.55 ? 64 : 79;                            // sun  @ O
    else if (feat == 2 && featI > 0.12) code = featI > 0.5 ? 64 : (featI > 0.25 ? 79 : 111); // moon @ O o
    else if (feat == 1 && featI > 0.05) code = featI > 0.4 ? 42 : (featI > 0.18 ? 43 : 46);  // star * + .
    else if (cov > 0.14) code = cov < 0.24 ? 46 : (cov < 0.36 ? 45 : (cov < 0.5 ? 126 : (cov < 0.66 ? 61 : 143)));
    fg = (feat > 0 && code != 32) ? max(featC, avg) * 1.15 + 0.08 : avg * 1.22 + 0.035;
    bg = avg;
    skyFlag = 1.0;
    emMax = featI;
  } else {
    int refM = dec8(I[ref].r);
    int refB = dec8(I[ref].b);
    bool refUp = (refB % 32) == 2;
    // region = samples of the same surface as the reference (material, facing, object, depth)
    bool R[NT];
    for (int k = 0; k < NT; k++) {
      bool same = dec8(I[k].r) == refM && dec8(I[k].b) == refB;
      if (same && !refUp) same = abs(C[k].a - refD) < 0.016;
      R[k] = same;
    }
    float n = 0.0, nSky = 0.0, nOth = 0.0, bn = 0.0;
    vec3 regC = vec3(0.0), skyC = vec3(0.0), othC = vec3(0.0);
    vec2 rs = vec2(0.0), bs = vec2(0.0);
    vec3 bss = vec3(0.0);
    for (int j = 0; j < TY; j++) {
      for (int i = 0; i < TX; i++) {
        int k = j * TX + i;
        vec3 c = tonemap(C[k].rgb);
        C[k].rgb = c;
        // sample position in screen units (cell width 1, height 2), centred on the cell
        vec2 p = vec2((float(i) + 0.5) / float(TX) - 0.5, ((float(j) + 0.5) / float(TY) - 0.5) * 2.0);
        if (R[k]) {
          n += 1.0;
          regC += c;
          rs += p;
          emMax = max(emMax, I[k].a);
          bool bnd = (i > 0 && !R[k - 1]) || (i < TX - 1 && !R[k + 1]) || (j > 0 && !R[k - TX]) || (j < TY - 1 && !R[k + TX]);
          if (bnd) { bn += 1.0; bs += p; bss += vec3(p.x * p.x, p.y * p.y, p.x * p.y); }
        } else if (dec8(I[k].r) == 0) { nSky += 1.0; skyC += c; }
        else { nOth += 1.0; othC += c; }
      }
    }
    vec3 rc = regC / n;
    float L = luma(rc);
    float F = n / float(NT);
    if (F < 0.84 && bn > 0.5) {
      // ---------------- outline: orientation of the boundary samples picks | - _ / \\ . '
      vec2 mu = bs / bn;
      vec2 rcen = rs / n;
      float sxx = bss.x / bn - mu.x * mu.x;
      float syy = bss.y / bn - mu.y * mu.y;
      float sxy = bss.z / bn - mu.x * mu.y;
      float disc = sqrt(max(0.25 * (sxx - syy) * (sxx - syy) + sxy * sxy, 0.0));
      float l1 = 0.5 * (sxx + syy) + disc, l2 = 0.5 * (sxx + syy) - disc;
      float ang = (bn < 1.5 || l1 < 1e-4) ? atan(rcen.y, rcen.x) + 1.5707963 : 0.5 * atan(2.0 * sxy, sxx - syy);
      float deg = degrees(mod(ang, 3.1415927));
      if (bn > 2.5 && l2 > 0.5 * l1) code = rcen.y < 0.0 ? 46 : 39;           // corner . '
      else if (deg < 24.0 || deg > 156.0) {
        float yEdge = mu.y + (rcen.y < mu.y ? 1.0 : -1.0) / float(TY);
        code = yEdge < -0.4 ? 95 : (yEdge > 0.5 ? 144 : 45);                  // _ - overline
      } else if (deg > 66.0 && deg < 114.0) code = 124;                       // |
      else code = deg < 90.0 ? 47 : 92;                                       // / backslash
      if (nSky >= nOth) { bg = skyC / max(nSky, 1.0); skyFlag = 1.0; }
      else bg = othC / max(nOth, 1.0) * bgK;
      fg = max(rc * 1.3 + 0.02, bg * 1.35 + 0.07 * (0.35 + 0.65 * uNight));
    } else {
      // ---------------- surface interior
      float lo = 9.0, hi = -9.0;
      for (int k = 0; k < NT; k++) if (R[k]) { float l = luma(C[k].rgb); lo = min(lo, l); hi = max(hi, l); }
      // (only for nearby surfaces: far detail is sub-sample and would just alias into noise)
      bool matched = false;
      float thr = refM == 1 ? 0.09 + 0.2 * L : 0.12 + 0.3 * L; // ground: flat, so lower threshold
      if (hi - lo > thr && refD < 0.62) {
        // strong detail (lit windows, road markings, lamps): match the sample pattern against
        // the measured coverage of real glyph shapes
        float inv = 1.0 / (hi - lo);
        float t[NT];
        vec3 hiC = vec3(0.0), loC = vec3(0.0);
        float nh = 0.0, nl = 0.0;
        for (int k = 0; k < NT; k++) {
          float tk = R[k] ? (luma(C[k].rgb) - lo) * inv : 0.0;
          t[k] = tk;
          if (R[k]) {
            if (tk > 0.5) { hiC += C[k].rgb; nh += 1.0; } else { loC += C[k].rgb; nl += 1.0; }
          }
        }
        // two polarities: bright detail on a dark surface (t) or dark detail on a bright one (u)
        float u[NT];
        float stt = 0.0, suu = 0.0;
        for (int k = 0; k < NT; k++) {
          u[k] = R[k] ? 1.0 - t[k] : 0.0;
          stt += t[k] * t[k];
          suu += u[k] * u[k];
        }
        float bestB = 1e9, bestD = 1e9;
        int bB = 0, bD = 0;
        for (int g = 0; g < uNM; g++) {
          float db = 0.0, dd = 0.0;
          for (int k = 0; k < NT; k++) {
            float c = uCov[g * ${COV_STRIDE} + k / 4][k % 4];
            db += t[k] * c;
            dd += u[k] * c;
          }
          float eb = uCovSq[g] - 2.0 * db, ed = uCovSq[g] - 2.0 * dd;
          if (eb < bestB) { bestB = eb; bB = g; }
          if (ed < bestD) { bestD = ed; bD = g; }
        }
        // accept only a good fit (relative squared error), otherwise fall back to the ramp
        float rB = (stt + bestB) / max(stt, 1e-3);
        // dark ink only on buildings (mullions, frames); on the flat ground it just adds blotches
        float rD = refM == 1 ? 9.0 : (suu + bestD) / max(suu, 1e-3) + 0.1;
        if (min(rB, rD) < 0.55) {
          matched = true;
          bool darkInk = rD < rB;
          code = int(uCovCode[darkInk ? bD : bB] + 0.5);
          vec3 hc = hiC / max(nh, 1.0), lc = loC / max(nl, 1.0);
          if (uLight > 0.5) {
            fg = clamp(lc * 1.2 + 0.03, 0.0, 1.0);
            bg = hc * bgK;
          } else if (darkInk) {
            fg = lc * 0.8;                       // dark ink line on the lit surface
            bg = hc * mix(0.86, 0.6, uNight);
          } else {
            fg = clamp(hc * 1.2 + 0.03, 0.0, 1.0);
            bg = lc * bgK;
          }
        }
      }
      if (!matched) {
        // uniform: per-material luminance ramp
        float Ls = uLight > 0.5 ? 1.0 - L : L;
        int lvl = int(clamp(Ls * 8.6 - 0.2, refM == 1 ? 0.0 : 1.0, 7.0));
        code = dec8(texelFetch(uRampTex, ivec2(refM * ${RAMP_STEPS} + lvl, 0), 0).r);
        vec3 hue = rc / max(max(rc.r, max(rc.g, rc.b)), 0.06);
        fg = clamp(rc * (mix(1.28, 1.05, uNight) + 0.55 * L) + hue * 0.04, 0.0, 1.0);
        bg = rc * bgK;
      }
    }
    // emissive surfaces glow in their own saturated colour
    fg = mix(fg, min(rc * 1.7, vec3(1.0)), clamp(emMax * 1.4, 0.0, 1.0));
    int ov = dec8(I[ref].g);
    if (ov > 0) code = ov;
  }

  // ---------------- ASCII rain: falling streaks in front of everything
  if (uRain > 0.02) {
    float cs = hash21(vec2(float(cell.x), 17.0));
    float yy = float(cell.y) + uTime * (26.0 + 16.0 * cs) + cs * 131.0;
    float seg = floor(yy / 9.0);
    float hr = hash21(vec2(float(cell.x) * 1.37, seg));
    if (hr < uRain * 0.16 && fract(yy / 9.0) < 0.24) {
      code = 124;
      fg = vec3(0.55, 0.65, 0.78) * (0.5 + 0.4 * (1.0 - uNight)) + fg * 0.25;
    }
  }

  if (uLight > 0.5) {
    // paper: ink glyphs on rice paper, darker ink for darker surfaces, red seal for light sources
    vec3 ink = mix(uStop[2], uStop[1], clamp(luma(fg) * 1.1, 0.0, 1.0));
    fg = mix(ink, uStop[3], clamp(emMax * 1.5, 0.0, 1.0));
    bg = paperBg(luma(bg)) * (skyFlag > 0.5 ? 1.0 : 0.97);
  } else {
    fg = gradeDark(fg);
    bg = gradeDark(bg);
    float dayK = (1.0 - uNight) * (1.0 - smoothstep(0.3, 0.6, uGrade));
    fg = gradeDay(fg, dayK);
    bg = gradeDay(bg, dayK);
  }
  oFg = vec4(fg, float(code) / 255.0);
  oBg = vec4(bg, skyFlag);
}
`;

const FRAG_SCREEN = /* glsl */ `
precision highp float;
precision highp int;
out vec4 outColor;
uniform sampler2D uCellFg;
uniform sampler2D uCellBg;
uniform sampler2D uAtlas;
uniform sampler2D uScene;
uniform sampler2D uGlowA;
uniform sampler2D uGlowB;
uniform vec2 uCellPx;
uniform vec2 uGrid;
uniform vec2 uScreen;
uniform float uBloom;
uniform float uScan;
${GLSL_GRADE}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 cf = px / uCellPx;
  vec2 cellF = min(floor(cf), uGrid - 1.0);
  ivec2 cell = ivec2(cellF);
  vec4 A = texelFetch(uCellFg, cell, 0);
  vec4 B = texelFetch(uCellBg, cell, 0);
  int code = int(A.a * 255.0 + 0.5);
  vec2 inCell = clamp(cf - cellF, 0.0, 0.9999);
  float mask = 0.0;
  if (code > 32) {
    int idx = code < 127 ? code - 32 : code - 33;
    vec2 tile = vec2(float(idx % ${ATLAS_COLS}), float(idx / ${ATLAS_COLS}));
    vec2 auv = vec2((tile.x + inCell.x) / ${ATLAS_COLS}.0, 1.0 - (tile.y + 1.0 - inCell.y) / ${ATLAS_ROWS}.0);
    mask = texture(uAtlas, auv).r;
  }
  vec2 suv = px / uScreen;
  vec3 bg = B.a > 0.5 ? skyBg(texture(uScene, suv).rgb) : B.rgb;
  vec3 c = mix(bg, A.rgb, mask);
  c += (texture(uGlowA, suv).rgb * 0.6 + texture(uGlowB, suv).rgb * 0.9) * uBloom;
  if (uScan > 0.5) c *= 0.87 + 0.13 * step(0.5, fract(px.y * 0.5));
  vec2 vq = suv - 0.5;
  c *= 1.0 - 0.5 * dot(vq, vq);
  outColor = vec4(c, 1.0);
}
`;

const FRAG_RAW = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform sampler2D uSrc;
uniform float uMode;
void main() {
  vec4 s = texture(uSrc, vUv);
  if (uMode < 0.5) outColor = vec4(vec3(1.0) - exp(-s.rgb * 1.3), 1.0);
  else outColor = vec4(vec3(s.a), 1.0);
}
`;

export interface EnvState {
  time: number;
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  sunI: number;
  ambI: number;
  ambColor: [number, number, number];
  night: number;
  skyTop: [number, number, number];
  skyHor: [number, number, number];
  starI: number;
  moonDir: [number, number, number];
  cloudTint: [number, number, number];
  overcast: number;
  rain: number;
  fogD: number;
  fogColor: [number, number, number];
  flash: number;
  windowLit: number;
  lampI: number;
  beamI: number;
}

export class Pipeline {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  halfFloat = false;
  worldMat: THREE.ShaderMaterial;
  beamMat: THREE.ShaderMaterial;
  groundMesh: THREE.Mesh;
  blockMapTex: THREE.DataTexture;

  /** cell size in CSS pixels */
  cellW = 6;
  cellH = 12;
  bloom = 1.0;
  palette: PaletteId = 'NEON';
  gridW = 1;
  gridH = 1;
  dpr = 1;
  debugScene = false;
  debugDepth = false;
  lastRenderError = '';
  renderFrameCount = 0;

  private rtScene: THREE.WebGLRenderTarget;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private rtB2: THREE.WebGLRenderTarget;
  private rtCell: THREE.WebGLRenderTarget;
  private rtShadow!: THREE.WebGLRenderTarget;
  private shadowSize = 0;
  private shadowCam = new THREE.OrthographicCamera(-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, 1, 1200);
  private shadowMat: THREE.ShaderMaterial;
  /** depth-only pre-pass: the expensive world shader then runs once per pixel instead of once per
   *  overdraw layer. Off by default: measured on a Radeon 610M it cost more (extra geometry pass)
   *  than it saved; kept for very fill-bound setups (debug hook __city.prepass(true)) */
  private prepassMat: THREE.ShaderMaterial;
  prepass = false;
  private shadowMatrix = new THREE.Matrix4();
  /** current quality tier (see config.ts QUALITY_PRESET) */
  quality: QualityTier = 2;
  private dprCap = 2;
  private shadowEvery = 1;
  private shadowAge = 99;
  /** GPU description from WEBGL_debug_renderer_info ('' if hidden) */
  gpuName = '';
  /** boot timings (ms): background shader compile, warm-up frame (driver-side compiles) */
  compileMs = 0;
  warmupMs = 0;
  /** world point the shadow map is centred on (player position; falls back to the camera) */
  shadowFocus: THREE.Vector3 | null = null;
  private skyMesh: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private cellMat: THREE.ShaderMaterial;
  private screenMat: THREE.ShaderMaterial;
  private rawMat: THREE.ShaderMaterial;
  private u: Record<string, THREE.IUniform>;
  private atlasTex: THREE.Texture | null = null;
  private atlasKey = '';
  private rampTex: THREE.DataTexture;
  private blockOrigin = new THREE.Vector2(-16, -16);
  private cssW = 2;
  private cssH = 2;

  constructor(canvas: HTMLCanvasElement) {
    // ?lowgpu in the URL asks for the power-saving GPU (dual-GPU laptops): lets us test the weak one
    const lowGpu = typeof location !== 'undefined' && /[?&]lowgpu/.test(location.search);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: lowGpu ? 'low-power' : 'high-performance',
    });
    const gl = this.renderer.getContext();
    this.halfFloat = gl instanceof WebGL2RenderingContext && !!gl.getExtension('EXT_color_buffer_float');
    this.renderer.setPixelRatio(1);
    // every pass clears (or covers) its target itself
    this.renderer.autoClear = false;
    // all shaders write final colours themselves; a linear output space also means one program
    // serves both the render targets and the canvas (no second compile of the same shader)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch { this.gpuName = ''; }

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.12, 1400);
    this.scene = new THREE.Scene();

    const V = (v: unknown) => ({ value: v });
    const stops = paletteStops(this.palette);
    this.u = {
      uTime: V(0), uSunDir: V(new THREE.Vector3(0, 1, 0)), uSunColor: V(new THREE.Vector3(1, 1, 0.9)),
      uSunI: V(1), uAmbI: V(0.5), uAmbColor: V(new THREE.Vector3(0.7, 0.75, 0.85)), uNight: V(0),
      uSkyTop: V(new THREE.Vector3(0.2, 0.4, 0.6)), uSkyHor: V(new THREE.Vector3(0.6, 0.7, 0.8)),
      uStarI: V(0), uCloudTint: V(new THREE.Vector3(0.9, 0.9, 0.95)), uOvercast: V(0.1),
      uRain: V(0), uFogD: V(0.00012), uFogColor: V(new THREE.Vector3(0.5, 0.55, 0.6)), uFlash: V(0),
      uWindowLit: V(0.15), uLampI: V(0.2), uLampColor: V(new THREE.Vector3(1, 0.72, 0.42)),
      uMoonDir: V(new THREE.Vector3(0, 1, 0)),
      uBlockOrigin: V(this.blockOrigin), uBlockMapSize: V(32),
      uRes: V(new THREE.Vector2(1, 1)), uFov: V(new THREE.Vector2(1, 1)),
      uCamMat: V(new THREE.Matrix3()), uBeamI: V(1),
      uExposure: V(1.3), uGrade: V(0.15), uLight: V(0), uQ: V(QUALITY_PRESET[2].shader),
      uStop: V([0, 1, 2, 3, 4].map((i) => new THREE.Vector3(stops[i * 3], stops[i * 3 + 1], stops[i * 3 + 2]))),
    };

    this.u.uShadowMap = V(null);
    this.u.uShadowMat = V(this.shadowMatrix);
    this.u.uShadowOn = V(0);
    this.u.uShadowTexel = V(1 / 4096);
    this.makeShadowTarget(QUALITY_PRESET[this.quality].shadowSize);
    this.shadowMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_WORLD,
      fragmentShader: FRAG_SHADOW,
      side: THREE.DoubleSide,
      colorWrite: false,
    });
    this.prepassMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_WORLD,
      fragmentShader: FRAG_SHADOW,
      side: THREE.FrontSide,
      colorWrite: false,
    });

    const bm = new Uint8Array(32 * 32 * 4);
    this.blockMapTex = new THREE.DataTexture(bm, 32, 32, THREE.RGBAFormat);
    this.blockMapTex.magFilter = THREE.NearestFilter;
    this.blockMapTex.minFilter = THREE.NearestFilter;
    this.blockMapTex.needsUpdate = true;

    this.worldMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_WORLD,
      fragmentShader: FRAG_WORLD,
      uniforms: { ...this.u, uBlockMap: V(this.blockMapTex) },
      side: THREE.FrontSide,
    });

    // ground plane follows the camera (snapped to whole blocks; the shader works in world space)
    const gGeo = new THREE.PlaneGeometry(1400, 1400);
    gGeo.rotateX(-Math.PI / 2);
    this.fillGeo(gGeo, 1, [0.5, 0.5, 0.5, 1], 0, 0);
    this.groundMesh = new THREE.Mesh(gGeo, this.worldMat);
    this.groundMesh.renderOrder = 0;
    this.groundMesh.frustumCulled = false;
    this.scene.add(this.groundMesh);

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_SKY,
      fragmentShader: FRAG_SKY,
      uniforms: this.u,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(sGeo, skyMat);
    this.skyMesh.renderOrder = 10;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    this.beamMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_WORLD,
      fragmentShader: FRAG_BEAM,
      uniforms: this.u,
      transparent: true,
      // additive RGB; destination alpha (depth) and the info target stay untouched
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // render targets (sized in resize())
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, {
      count: 2,
      type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const info = this.rtScene.textures[1];
    info.type = THREE.UnsignedByteType;
    info.format = THREE.RGBAFormat;
    info.minFilter = THREE.NearestFilter;
    info.magFilter = THREE.NearestFilter;
    this.rtCell = new THREE.WebGLRenderTarget(2, 2, {
      count: 2,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    const mk = () => new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
      type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    this.rtA = mk();
    this.rtB = mk();
    this.rtB2 = mk();

    const ramp = buildRampTable();
    this.rampTex = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.rampTex.needsUpdate = true;

    this.glowMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_FS,
      fragmentShader: FRAG_GLOW,
      uniforms: {
        uSrc: V(this.rtScene.textures[0]),
        uInfo: V(info),
        uTexel: V(new THREE.Vector2(1, 1)),
        uDir: V(new THREE.Vector2(1, 0)),
        uMode: V(0),
      },
      depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_FS,
      fragmentShader: FRAG_DOWN,
      uniforms: { uSrc: V(this.rtA.texture), uTexel: V(new THREE.Vector2(1, 1)) },
      depthTest: false, depthWrite: false,
    });
    this.cellMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_FS,
      fragmentShader: FRAG_CELL,
      uniforms: {
        ...this.u,
        uScene: V(this.rtScene.textures[0]),
        uInfo: V(info),
        uRampTex: V(this.rampTex),
        uCov: V([] as THREE.Vector4[]),
        uCovSq: V([] as number[]),
        uCovCode: V(MATCH_CODES.slice()),
        uNM: V(NM),
      },
      depthTest: false, depthWrite: false,
    });
    this.screenMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_FS,
      fragmentShader: FRAG_SCREEN,
      uniforms: {
        ...this.u,
        uCellFg: V(this.rtCell.textures[0]),
        uCellBg: V(this.rtCell.textures[1]),
        uAtlas: V(null),
        uScene: V(this.rtScene.textures[0]),
        uGlowA: V(this.rtA.texture),
        uGlowB: V(this.rtB2.texture),
        uCellPx: V(new THREE.Vector2(6, 12)),
        uGrid: V(new THREE.Vector2(1, 1)),
        uScreen: V(new THREE.Vector2(1, 1)),
        uBloom: V(this.bloom),
        uScan: V(0),
      },
      depthTest: false, depthWrite: false,
    });
    this.rawMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT_FS,
      fragmentShader: FRAG_RAW,
      uniforms: { uSrc: V(this.rtScene.textures[0]), uMode: V(0) },
      depthTest: false, depthWrite: false,
    });

    const cv = buildCoverage(TX, TY);
    const vecs: THREE.Vector4[] = [];
    for (let i = 0; i < cv.cov.length; i += 4) vecs.push(new THREE.Vector4(cv.cov[i], cv.cov[i + 1], cv.cov[i + 2], cv.cov[i + 3]));
    this.cellMat.uniforms.uCov.value = vecs;
    this.cellMat.uniforms.uCovSq.value = Array.from(cv.sq);

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.setPalette(this.palette);
  }

  private makeShadowTarget(size: number): void {
    if (size === this.shadowSize) return;
    this.shadowSize = size;
    this.rtShadow?.dispose();
    this.rtShadow = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false, type: THREE.UnsignedByteType,
      format: THREE.RedFormat, // colour is never written (colorWrite false): keep it 1 byte/texel
    });
    const dt = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    // linear + compare mode = hardware 2x2 percentage-closer filtering per tap
    dt.minFilter = THREE.LinearFilter;
    dt.magFilter = THREE.LinearFilter;
    dt.compareFunction = THREE.LessEqualCompare;
    this.rtShadow.depthTexture = dt;
    this.u.uShadowMap.value = dt;
    this.u.uShadowTexel.value = 1 / size;
    this.shadowAge = 99;
  }

  /** switch the quality tier: shadow resolution / filtering, shader detail, output resolution */
  setQuality(q: QualityTier): void {
    if (q === this.quality) return;
    this.quality = q;
    const pr = QUALITY_PRESET[q];
    this.makeShadowTarget(pr.shadowSize);
    this.shadowEvery = pr.shadowEvery;
    this.dprCap = pr.dprCap;
    this.u.uQ.value = pr.shader;
    this.resize(this.cssW, this.cssH);
  }

  /**
   * Compile every shader program up front (in the background where the driver allows it) so the
   * first real frame does not freeze the page. Resolves when all programs are ready.
   */
  async precompile(): Promise<void> {
    const tmp = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.fillGeo(box, 2, [0.5, 0.5, 0.5, 1], 0, 0);
    const inst = (m: THREE.Material) => { const im = new THREE.InstancedMesh(box, m, 1); im.frustumCulled = false; return im; };
    const one = (m: THREE.Material) => { const mm = new THREE.Mesh(box, m); mm.frustumCulled = false; return mm; };
    for (const m of [this.worldMat, this.beamMat, this.shadowMat, this.prepassMat]) { tmp.add(one(m)); tmp.add(inst(m)); }
    // the world objects above take part in the warm-up frame; the full-screen passes are only
    // compiled here (renderImpl runs them for real) - drawing them into the scene target would be
    // a feedback loop
    const worldObjs = tmp.children.slice();
    for (const m of [this.skyMesh.material as THREE.Material, this.glowMat, this.downMat, this.cellMat, this.screenMat, this.rawMat]) tmp.add(one(m));
    const t0 = performance.now();
    try {
      await this.renderer.compileAsync(tmp, this.camera);
      // compileAsync only watches one program per material; wait for the instanced variants too
      const progs = (this.renderer.info.programs ?? []) as unknown as { isReady?: () => boolean }[];
      for (let i = 0; i < 600 && !progs.every((p) => !p.isReady || p.isReady()); i++) await new Promise((r) => setTimeout(r, 20));
    } catch (e) {
      this.lastRenderError = 'compile: ' + String(e);
    }
    this.compileMs = Math.round(performance.now() - t0);
    // warm-up frame: drivers build their final per-target shader variants at the first real draw,
    // so draw everything once now (the boot overlay hides the canvas) instead of in the first frame
    await new Promise<void>((resolve) => requestAnimationFrame(() => {
      const t1 = performance.now();
      for (const o of worldObjs) this.scene.add(o);
      try { this.renderImpl(); } catch (e) { this.lastRenderError = 'warmup: ' + String(e); }
      for (const o of worldObjs) this.scene.remove(o);
      // a tiny read-back makes the GPU process finish (and therefore compile) everything now
      try {
        const probe = new THREE.WebGLRenderTarget(1, 1);
        this.renderer.setRenderTarget(probe);
        this.renderer.clear();
        this.renderer.readRenderTargetPixels(probe, 0, 0, 1, 1, new Uint8Array(4));
        this.renderer.setRenderTarget(null);
        probe.dispose();
      } catch { /* fine */ }
      this.warmupMs = Math.round(performance.now() - t1);
      resolve();
    }));
    box.dispose();
  }

  debugView(scene: boolean, depth = false): void {
    this.debugScene = scene;
    this.debugDepth = depth;
  }

  private fillGeo(geo: THREE.BufferGeometry, mat: number, color: number[], variant: number, facade: number): void {
    const n = geo.attributes.position.count;
    const colorA = new Float32Array(n * 4);
    const matA = new Float32Array(n);
    const parA = new Float32Array(n * 4);
    const facA = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colorA.set(color, i * 4);
      matA[i] = mat;
      parA[i * 4 + 2] = variant;
      facA[i * 4 + 3] = facade;
    }
    geo.setAttribute('aColor', new THREE.BufferAttribute(colorA, 4));
    geo.setAttribute('aMat', new THREE.BufferAttribute(matA, 1));
    geo.setAttribute('aParams', new THREE.BufferAttribute(parA, 4));
    geo.setAttribute('aFacade', new THREE.BufferAttribute(facA, 4));
  }

  /** cssW/cssH: canvas size in CSS pixels. Renders at device resolution (capped at 2x). */
  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(2, cssW);
    this.cssH = Math.max(2, cssH);
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), this.dprCap);
    this.dpr = dpr;
    const w = Math.max(16, Math.round(this.cssW * dpr));
    const h = Math.max(16, Math.round(this.cssH * dpr));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);

    const gw = Math.max(16, Math.round(w / (this.cellW * dpr)));
    const gh = Math.max(8, Math.round(h / (this.cellH * dpr)));
    this.gridW = gw;
    this.gridH = gh;
    const cpx = w / gw, cpy = h / gh;
    const sw = gw * TX, sh = gh * TY;
    this.rtScene.setSize(sw, sh);
    this.rtCell.setSize(gw, gh);
    const aw = Math.max(2, sw >> 1), ah = Math.max(2, sh >> 1);
    this.rtA.setSize(aw, ah);
    this.rtB.setSize(aw, ah);
    this.rtB2.setSize(Math.max(2, sw >> 3), Math.max(2, sh >> 3));
    (this.glowMat.uniforms.uTexel.value as THREE.Vector2).set(1 / aw, 1 / ah);
    (this.downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / aw, 1 / ah);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const fovY = THREE.MathUtils.degToRad(this.camera.fov);
    (this.u.uFov.value as THREE.Vector2).set(Math.tan(fovY / 2) * this.camera.aspect, Math.tan(fovY / 2));
    (this.u.uRes.value as THREE.Vector2).set(sw, sh);

    const su = this.screenMat.uniforms;
    (su.uCellPx.value as THREE.Vector2).set(cpx, cpy);
    (su.uGrid.value as THREE.Vector2).set(gw, gh);
    (su.uScreen.value as THREE.Vector2).set(w, h);

    const tw = Math.round(cpx), th = Math.round(cpy);
    const key = `${tw}x${th}`;
    if (key !== this.atlasKey) {
      this.atlasKey = key;
      const atlas = buildAtlas(tw, th);
      const tex = new THREE.CanvasTexture(atlas.texture);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.flipY = true;
      this.atlasTex?.dispose();
      this.atlasTex = tex;
      su.uAtlas.value = tex;
    }
  }

  addMesh(m: THREE.Object3D): void { this.scene.add(m); }
  removeMesh(m: THREE.Object3D): void { this.scene.remove(m); }

  setCamera(pos: [number, number, number], quat: [number, number, number, number]): void {
    this.camera.position.set(...pos);
    this.camera.quaternion.set(...quat);
    this.camera.updateMatrixWorld();
    (this.u.uCamMat.value as THREE.Matrix3).setFromMatrix4(this.camera.matrixWorld);
    this.groundMesh.position.set(Math.round(pos[0] / CFG.P) * CFG.P, 0, Math.round(pos[2] / CFG.P) * CFG.P);
  }

  /** point the camera at a target (cinematic / screenshot mode) */
  lookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void {
    this.camera.position.set(px, py, pz);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(tx, ty, tz);
    const q = this.camera.quaternion;
    this.setCamera([px, py, pz], [q.x, q.y, q.z, q.w]);
  }

  setEnv(e: EnvState): void {
    const u = this.u;
    u.uTime.value = e.time;
    (u.uSunDir.value as THREE.Vector3).set(...e.sunDir);
    (u.uSunColor.value as THREE.Vector3).set(...e.sunColor);
    u.uSunI.value = e.sunI;
    u.uAmbI.value = e.ambI;
    (u.uAmbColor.value as THREE.Vector3).set(...e.ambColor);
    u.uNight.value = e.night;
    (u.uSkyTop.value as THREE.Vector3).set(...e.skyTop);
    (u.uSkyHor.value as THREE.Vector3).set(...e.skyHor);
    u.uStarI.value = e.starI;
    (u.uMoonDir.value as THREE.Vector3).set(...e.moonDir);
    (u.uCloudTint.value as THREE.Vector3).set(...e.cloudTint);
    u.uOvercast.value = e.overcast;
    u.uRain.value = e.rain;
    u.uFogD.value = e.fogD;
    (u.uFogColor.value as THREE.Vector3).set(...e.fogColor);
    u.uFlash.value = e.flash;
    u.uWindowLit.value = e.windowLit;
    u.uLampI.value = e.lampI;
    u.uBeamI.value = e.beamI;
    // night scenes are exposed up so dim facades still resolve into glyphs
    u.uExposure.value = 1.3 + 0.9 * e.night;
  }

  setPalette(id: PaletteId): void {
    this.palette = id;
    const p = PALETTE_DATA[id];
    const stops = paletteStops(id);
    const arr = this.u.uStop.value as THREE.Vector3[];
    for (let i = 0; i < 5; i++) arr[i].set(stops[i * 3], stops[i * 3 + 1], stops[i * 3 + 2]);
    this.u.uLight.value = p.light ? 1 : 0;
    this.u.uGrade.value = p.grade;
    this.screenMat.uniforms.uScan.value = p.scan ? 1 : 0;
    this.screenMat.uniforms.uBloom.value = this.bloom * p.bloom;
  }

  setCell(w: number, h: number): void {
    this.cellW = w;
    this.cellH = h;
    this.resize(this.cssW, this.cssH);
  }

  setBloom(b: number): void {
    this.bloom = b;
    this.screenMat.uniforms.uBloom.value = b * PALETTE_DATA[this.palette].bloom;
  }

  /** block coordinates of blockmap texel (0, 0) */
  setBlockOrigin(ox: number, oz: number): void {
    this.blockOrigin.set(ox, oz);
  }

  setBlockData(data: Uint8Array): void {
    (this.blockMapTex.image.data as Uint8Array).set(data);
    this.blockMapTex.needsUpdate = true;
  }

  render(): void {
    try {
      this.renderImpl();
      this.lastRenderError = '';
    } catch (e) {
      this.lastRenderError = String(e);
    }
    this.renderFrameCount++;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** dev: per-pass GPU time (ms) measured with gl.finish() fences */
  profile(): Record<string, number> {
    const gl = this.renderer.getContext();
    const out: Record<string, number> = {};
    const r = this.renderer;
    const probe = new THREE.WebGLRenderTarget(1, 1);
    const px = new Uint8Array(4);
    const sync = () => { r.setRenderTarget(probe); r.clear(); r.readRenderTargetPixels(probe, 0, 0, 1, 1, px); void gl; };
    const t = (name: string, f: () => void) => { sync(); const a = performance.now(); f(); sync(); out[name] = +(performance.now() - a).toFixed(2); };
    t('shadow', () => { this.shadowAge = 99; this.renderShadow(); });
    t('prepass', () => { r.setRenderTarget(this.rtScene); r.setClearColor(0x000000, 1); r.clear(); this.renderPrepass(); });
    const sky = this.skyMesh;
    t('world', () => { sky.visible = false; r.setRenderTarget(this.rtScene); r.render(this.scene, this.camera); sky.visible = true; });
    t('sky', () => {
      // sky alone (over the depth already in the target)
      const hid = this.scene.children.filter((o) => o !== sky && o.visible);
      for (const o of hid) o.visible = false;
      r.setRenderTarget(this.rtScene); r.render(this.scene, this.camera);
      for (const o of hid) o.visible = true;
    });
    const g = this.glowMat.uniforms;
    t('glow', () => {
      g.uSrc.value = this.rtScene.textures[0]; g.uMode.value = 0; this.pass(this.glowMat, this.rtA);
      g.uSrc.value = this.rtA.texture; g.uMode.value = 1; (g.uDir.value as THREE.Vector2).set(1, 0); this.pass(this.glowMat, this.rtB);
      g.uSrc.value = this.rtB.texture; (g.uDir.value as THREE.Vector2).set(0, 1); this.pass(this.glowMat, this.rtA);
      this.pass(this.downMat, this.rtB2);
    });
    t('cell', () => this.pass(this.cellMat, this.rtCell));
    t('screen', () => this.pass(this.screenMat, null));
    probe.dispose();
    return out;
  }

  /** depth from the sun, centred on the player; skipped at night */
  private renderShadow(): void {
    const u = this.u;
    if ((u.uSunI.value as number) < 0.02) { u.uShadowOn.value = 0; return; }
    const sun = u.uSunDir.value as THREE.Vector3;
    if (sun.y < 0.03) { u.uShadowOn.value = 0; return; }
    // low tier: reuse the map for a frame (the sun and the player move little in 1/30 s)
    if (++this.shadowAge < this.shadowEvery && u.uShadowOn.value === 1) return;
    this.shadowAge = 0;
    const cam = this.shadowCam;
    const f = this.shadowFocus ?? this.camera.position;
    // sun-space basis; snap the centre to whole texels so shadow edges don't crawl
    const fwd = sun.clone().negate();
    const up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const texel = (SHADOW_HALF * 2) / this.shadowSize;
    const cx = Math.round(f.dot(right) / texel) * texel;
    const cy = Math.round(f.dot(up2) / texel) * texel;
    const cz = f.dot(fwd);
    const centre = right.clone().multiplyScalar(cx).addScaledVector(up2, cy).addScaledVector(fwd, cz);
    cam.position.copy(centre).addScaledVector(sun, 600);
    cam.up.copy(up2);
    cam.lookAt(centre);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    this.shadowMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    // only solid world geometry casts: hide sky, ground plane and additive light beams
    const hidden: THREE.Object3D[] = [];
    for (const o of this.scene.children) {
      const m = (o as THREE.Mesh).material;
      if (o.visible && (o === this.skyMesh || o === this.groundMesh || m === this.beamMat)) { o.visible = false; hidden.push(o); }
    }
    const r = this.renderer;
    this.scene.overrideMaterial = this.shadowMat;
    r.setRenderTarget(this.rtShadow);
    r.setClearColor(0xffffff, 1);
    r.clear();
    r.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    for (const o of hidden) o.visible = true;
    u.uShadowOn.value = 1;
  }

  /** depth-only pass over the opaque city (everything except sky and additive beams) */
  private renderPrepass(): void {
    if (!this.prepass) return;
    const hidden: THREE.Object3D[] = [];
    for (const o of this.scene.children) {
      const m = (o as THREE.Mesh).material;
      if (o.visible && (o === this.skyMesh || m === this.beamMat || (m as THREE.Material)?.transparent)) { o.visible = false; hidden.push(o); }
    }
    this.scene.overrideMaterial = this.prepassMat;
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    for (const o of hidden) o.visible = true;
  }

  private renderImpl(): void {
    const r = this.renderer;
    this.renderShadow();
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear();
    this.renderPrepass();
    r.render(this.scene, this.camera);

    // glow: threshold -> blur H -> blur V -> 1/8 downsample
    const g = this.glowMat.uniforms;
    g.uSrc.value = this.rtScene.textures[0];
    g.uMode.value = 0;
    this.pass(this.glowMat, this.rtA);
    g.uSrc.value = this.rtA.texture;
    g.uMode.value = 1;
    (g.uDir.value as THREE.Vector2).set(1, 0);
    this.pass(this.glowMat, this.rtB);
    g.uSrc.value = this.rtB.texture;
    (g.uDir.value as THREE.Vector2).set(0, 1);
    this.pass(this.glowMat, this.rtA);
    this.pass(this.downMat, this.rtB2);

    if (this.debugScene) {
      this.rawMat.uniforms.uMode.value = this.debugDepth ? 1 : 0;
      this.pass(this.rawMat, null);
      return;
    }
    this.pass(this.cellMat, this.rtCell);
    this.pass(this.screenMat, null);
  }
}

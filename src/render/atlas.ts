import * as THREE from "three";
import { TEXTMODE } from "../config";

// All glyphs that can ever appear on the textmode screen.
export const GLYPHS: string[] = Array.from(new Set(
  (TEXTMODE.ramp + "|-/+'^~<>*.:o=,") .split("")
));

// Renders a white-on-black glyph atlas, one glyph per cell, and returns
// the texture plus grid metrics. Glyph cells are drawn 1:1 with screen cells
// so the shader can sample with NEAREST for crisp terminals.
export function buildAtlas(cellW: number, cellH: number): { tex: THREE.Texture; cols: number; rows: number; count: number } {
  const count = GLYPHS.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.floor(cellH * 0.82)}px ${TEXTMODE.fontStack}`;
  for (let i = 0; i < count; i++) {
    const cx = (i % cols) * cellW + cellW / 2;
    const cy = Math.floor(i / cols) * cellH + cellH / 2 + 1;
    ctx.fillText(GLYPHS[i], cx, cy);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return { tex, cols, rows, count };
}

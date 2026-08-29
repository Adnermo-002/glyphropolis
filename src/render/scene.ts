import * as THREE from "three";
import { CITY, CAMERA } from "../config";

// Builds the persistent parts of the scene: renderer, camera, procedural
// ground plane and sky dome. City chunks, traffic and weather are added by
// their own modules. All materials are custom (unlit) and read the shared
// uniforms in materials.ts; scene fog is handled per-material.
export function buildScene(
  glCanvas: HTMLCanvasElement,
  groundMat: THREE.ShaderMaterial,
  skyMat: THREE.ShaderMaterial,
) {
  // Colors are picked in display space on purpose; the textmode pass does the
  // final grade, so Three's color management must not silently convert them.
  THREE.ColorManagement.enabled = false;

  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fovY, 1, 0.1, CITY.viewFar);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 24, 14), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  return { renderer, scene, camera, ground, sky };
}

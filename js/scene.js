import * as THREE from 'three';
import { createEnvironment } from './environment.js';

/**
 * Builds the base Three.js scene: ambient + directional lighting with
 * dynamic shadows, atmospheric fog, a styled ground plane with a reference
 * grid, and the full driving environment (road, trees, traffic lights,
 * clouds) from environment.js.
 *
 * @returns {{ scene: THREE.Scene, sun: THREE.DirectionalLight, ambient: THREE.AmbientLight, hemi: THREE.HemisphereLight, environment: ReturnType<typeof createEnvironment> }}
 */
export function createScene() {
  const scene = new THREE.Scene();

  const backgroundColor = 0x05070a;
  scene.background = new THREE.Color(backgroundColor);
  scene.fog = new THREE.Fog(backgroundColor, 60, 420);

  // Soft ambient fill so shadows are never pure black.
  const ambient = new THREE.AmbientLight(0x8fa2b8, 0.5);
  scene.add(ambient);

  // Subtle sky/ground color bounce.
  const hemi = new THREE.HemisphereLight(0x3a4a5c, 0x0b0f14, 0.55);
  scene.add(hemi);

  // Primary directional "sun" light with dynamic shadow casting.
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(-40, 60, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Ground plane.
  const groundGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x11161c,
    roughness: 0.96,
    metalness: 0.04,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Reference grid, styled to sit subtly above the ground plane.
  const grid = new THREE.GridHelper(2000, 400, 0x2a3540, 0x171e26);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  scene.add(grid);

  const environment = createEnvironment(scene);

  return { scene, sun, ambient, hemi, environment };
}
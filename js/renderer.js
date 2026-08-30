import * as THREE from 'three';

/**
 * Creates and configures the WebGLRenderer used for the entire experience.
 * Handles soft shadow mapping, pixel-ratio adaptation, and automatic
 * responsive resizing on window resize events.
 *
 * @param {HTMLElement} container - The DOM element the canvas will be appended to.
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // Shadows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Color / tone mapping for a filmic, modern look
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  container.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return renderer;
}

/**
 * Keeps a perspective camera's aspect ratio and the renderer's output size
 * in sync with the current window dimensions. Call this from any resize
 * handler that also needs to update the camera.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.PerspectiveCamera} camera
 */
export function resizeRendererToCamera(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
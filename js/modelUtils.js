import * as THREE from 'three';

/**
 * Normalizes an arbitrary loaded GLTF scene to a target real-world length
 * (in meters) and re-centers its pivot on the ground (x/z centered, y=0
 * at the model's lowest point). Works regardless of what scale/units or
 * origin the model was originally exported with.
 *
 * Mutates `model` directly (its position and scale) and returns the scale
 * factor that was applied, mostly useful for debug logging.
 *
 * @param {THREE.Object3D} model
 * @param {number} targetLength - Desired length in meters (its longest
 *   horizontal dimension, x or z, is scaled to match this).
 * @returns {number} The scale factor applied.
 */
export function normalizeModelScale(model, targetLength) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const referenceLength = Math.max(size.x, size.z) || Math.max(size.x, size.y, size.z) || 1;
  const scale = targetLength / referenceLength;
  model.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;

  return scale;
}

/** Recursively enables cast/receive shadows on every mesh in a model. */
export function enableShadows(model) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
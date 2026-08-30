import * as THREE from 'three';

/**
 * Creates the third-person perspective camera used to view the vehicle.
 * Initial position sits behind and above the origin; actual per-frame
 * positioning is handled by updateFollowCamera().
 *
 * @returns {THREE.PerspectiveCamera}
 */
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 3.2, -6);
  camera.lookAt(0, 1.1, 3.5);
  return camera;
}

// Reused scratch objects to avoid per-frame garbage collection.
const _offset = new THREE.Vector3(0, 2.6, -5.4);
const _lookAtOffset = new THREE.Vector3(0, 1.15, 4.0);
const _rotationMatrix = new THREE.Matrix4();
const _desiredPosition = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.15, 4.0);

/**
 * Smoothly (lerp-interpolated, frame-rate independent) moves the camera to
 * trail behind the given target object, matching its yaw rotation so the
 * camera always sits behind the car regardless of heading.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} target - The car group to follow.
 * @param {number} dt - Delta time in seconds.
 * @param {number} [smoothing=10] - Higher = snappier, lower = floatier.
 */
export function updateFollowCamera(camera, target, dt, smoothing = 10) {
  _rotationMatrix.makeRotationY(target.rotation.y);

  _desiredPosition.copy(_offset).applyMatrix4(_rotationMatrix).add(target.position);
  _desiredLookAt.copy(_lookAtOffset).applyMatrix4(_rotationMatrix).add(target.position);

  // Frame-rate independent exponential smoothing.
  const alpha = 1 - Math.exp(-smoothing * dt);

  camera.position.lerp(_desiredPosition, alpha);
  _currentLookAt.lerp(_desiredLookAt, alpha);
  camera.lookAt(_currentLookAt);
}
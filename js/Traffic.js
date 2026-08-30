import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ONCOMING_LANE_CENTERS } from './roadConfig.js';
import { normalizeModelScale, enableShadows } from './modelUtils.js';

// Point these at your own files. Both are optional independently — if one
// fails to load (missing file, bad path, parse error), that vehicle type
// just falls back to a procedural shape while the other still uses your
// real model.
const CAR_MODEL_URL = '/assets/models/traffic-car.glb';
const TRUCK_MODEL_URL = '/assets/models/truck.glb';
const CAR_TARGET_LENGTH = 4.2; // meters
const TRUCK_TARGET_LENGTH = 6.8; // meters

const SPAWN_AHEAD_MIN = 140; // meters ahead of the player when spawned
const SPAWN_AHEAD_MAX = 220;
const DESPAWN_BEHIND_DISTANCE = 30; // meters behind the player before recycling
const SPAWN_INTERVAL_MIN = 3.0; // seconds between spawns, per lane
const SPAWN_INTERVAL_MAX = 6.5;
const VEHICLE_SPEED_MIN = 9; // m/s, closing speed toward the player
const VEHICLE_SPEED_MAX = 16;
const TRUCK_CHANCE = 0.3;

const FALLBACK_COLORS = [0x2e6fd6, 0xd63b3b, 0xe0e0e0, 0x2e8b57, 0xf2c14e, 0x333333];

/**
 * Manages oncoming traffic: cars and trucks that spawn ahead of the player
 * in the two oncoming lanes, drive straight toward them, and get recycled
 * once they've passed behind. Vehicle appearance comes from your own
 * traffic-car.glb / truck.glb models when available (loaded once, then
 * cloned per spawn), falling back to simple procedural shapes if a model
 * is missing or fails to load. Exposes simple axis-aligned bounding data
 * per vehicle so main.js can run collision checks without this module
 * needing to know anything about the player.
 */
export class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Traffic';
    scene.add(this.group);

    this.vehicles = [];
    this.spawnTimers = ONCOMING_LANE_CENTERS.map(() => _randomRange(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX));

    // Populated asynchronously once (if) the GLB models finish loading.
    // Until then — and permanently, if loading fails — spawns use the
    // procedural fallback shapes below.
    this.carTemplate = null;
    this.truckTemplate = null;
    this._loadTemplates();
  }

  update(dt, playerZ) {
    ONCOMING_LANE_CENTERS.forEach((laneX, laneIndex) => {
      this.spawnTimers[laneIndex] -= dt;
      if (this.spawnTimers[laneIndex] <= 0) {
        this._spawnVehicle(laneIndex, playerZ);
        this.spawnTimers[laneIndex] = _randomRange(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
      }
    });

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const vehicle = this.vehicles[i];
      vehicle.mesh.position.z -= vehicle.speed * dt;

      if (vehicle.mesh.position.z < playerZ - DESPAWN_BEHIND_DISTANCE) {
        this.group.remove(vehicle.mesh);
        this.vehicles.splice(i, 1);
      }
    }
  }

  /** Current vehicles as simple world-space AABB descriptors (x/z plane). */
  getColliders() {
    return this.vehicles.map((v) => ({
      x: v.mesh.position.x,
      z: v.mesh.position.z,
      halfWidth: v.halfWidth,
      halfLength: v.halfLength,
      id: v.id,
    }));
  }

  _loadTemplates() {
    const loader = new GLTFLoader();

    loader.load(
      CAR_MODEL_URL,
      (gltf) => {
        this.carTemplate = _prepareTemplate(gltf.scene, CAR_TARGET_LENGTH);
        console.info(`[Traffic] Loaded car model from "${CAR_MODEL_URL}" — oncoming cars will use it from now on.`);
      },
      undefined,
      (error) => {
        console.warn(
          `[Traffic] Could not load "${CAR_MODEL_URL}" — oncoming cars will keep using the procedural fallback shape. ` +
            'Check the Network tab for a 404 if you expected your own model here.',
          error
        );
      }
    );

    loader.load(
      TRUCK_MODEL_URL,
      (gltf) => {
        this.truckTemplate = _prepareTemplate(gltf.scene, TRUCK_TARGET_LENGTH);
        console.info(`[Traffic] Loaded truck model from "${TRUCK_MODEL_URL}" — oncoming trucks will use it from now on.`);
      },
      undefined,
      (error) => {
        console.warn(
          `[Traffic] Could not load "${TRUCK_MODEL_URL}" — oncoming trucks will keep using the procedural fallback shape. ` +
            'Check the Network tab for a 404 if you expected your own model here.',
          error
        );
      }
    );
  }

  _spawnVehicle(laneIndex, playerZ) {
    const isTruck = Math.random() < TRUCK_CHANCE;
    const template = isTruck ? this.truckTemplate : this.carTemplate;

    const mesh = template ? template.clone(true) : isTruck ? _buildFallbackTruckMesh() : _buildFallbackCarMesh();

    const laneX = ONCOMING_LANE_CENTERS[laneIndex];
    const spawnZ = playerZ + _randomRange(SPAWN_AHEAD_MIN, SPAWN_AHEAD_MAX);

    mesh.position.set(laneX, 0, spawnZ);
    mesh.rotation.y = Math.PI; // face back toward the player (-Z direction)
    this.group.add(mesh);

    this.vehicles.push({
      mesh,
      speed: _randomRange(VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX),
      halfWidth: isTruck ? 1.15 : 0.95,
      halfLength: isTruck ? 3.4 : 2.1,
      id: mesh.uuid,
    });
  }
}

/**
 * Wraps a loaded/normalized model in an outer Group. The normalization
 * offsets (recentering the pivot) live on the inner child, so repeatedly
 * setting the outer wrapper's position at spawn time never disturbs them —
 * important since this same template gets cloned and repositioned many
 * times over the life of the game.
 */
function _prepareTemplate(model, targetLength) {
  enableShadows(model);
  normalizeModelScale(model, targetLength);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

function _randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function _pickColor() {
  return FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)];
}

function _buildFallbackCarMesh() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: _pickColor(), metalness: 0.4, roughness: 0.4 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.1, metalness: 0.2 });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3c4,
    emissive: 0xfff3c4,
    emissiveIntensity: 1.2,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.0), bodyMaterial);
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.9), glassMaterial);
  cabin.position.set(0, 1.0, -0.1);
  cabin.castShadow = true;
  group.add(cabin);

  [-0.6, 0.6].forEach((x) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), lightMaterial);
    light.position.set(x, 0.5, 2.02);
    group.add(light);
  });

  return group;
}

function _buildFallbackTruckMesh() {
  const group = new THREE.Group();
  const cabMaterial = new THREE.MeshStandardMaterial({ color: _pickColor(), metalness: 0.3, roughness: 0.5 });
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.15, roughness: 0.6 });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3c4,
    emissive: 0xfff3c4,
    emissiveIntensity: 1.2,
  });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 1.6), cabMaterial);
  cab.position.set(0, 0.75, 2.6);
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 4.6), boxMaterial);
  cargo.position.set(0, 1.15, -0.6);
  cargo.castShadow = true;
  cargo.receiveShadow = true;
  group.add(cargo);

  [-0.7, 0.7].forEach((x) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.08), lightMaterial);
    light.position.set(x, 0.55, 3.42);
    group.add(light);
  });

  return group;
}
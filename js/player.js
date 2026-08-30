import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CAR_MODEL_URL = '/assets/models/car.glb';
const FALLBACK_TIMEOUT_MS = 4000;

/**
 * Owns the vehicle's visual representation (GLTF model or procedural
 * fallback), its wheel references for spin/steer animation, and a
 * THREE.PositionalAudio engine sound anchored to the car for spatial
 * ("8D"-style) audio as the vehicle moves relative to the listener.
 */
export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.carGroup = new THREE.Group();
    this.carGroup.name = 'CarGroup';
    this.scene.add(this.carGroup);

    this.model = null;
    this.wheels = []; // [frontLeft, frontRight, rearLeft, rearRight]
    this.usingFallback = false;

    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    this.engineSound = null;
    this.audioUnlocked = false;

    this._loadModel();
    this._setupAudio();
    this._setupAudioUnlock();
  }

  _loadModel() {
    const loader = new GLTFLoader();
    let settled = false;

    console.info(`[Player] Loading vehicle model from "${CAR_MODEL_URL}" …`);

    loader.load(
      CAR_MODEL_URL,
      (gltf) => {
        if (settled) return; // Fallback timer already fired; ignore late success.
        settled = true;

        console.info('[Player] car.glb loaded successfully.', gltf);
        this.model = gltf.scene;

        // Auto-normalize scale/pivot: most exported GLBs come out at an
        // arbitrary scale (cm vs m units) and with an origin that isn't
        // centered on the ground, which makes the car invisible or
        // microscopic even though it "loaded successfully." We measure the
        // model's bounding box and correct both, so any reasonably-modeled
        // car ends up roughly 4.2m long and sitting flush on y = 0.
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.info(
          `[Player] Raw model bounding box: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} (units).`
        );

        const TARGET_LENGTH = 4.2; // meters, roughly a real car's length
        const largestDimension = Math.max(size.x, size.y, size.z) || 1;
        // Use the longest horizontal-ish dimension as the reference so we
        // don't over-shrink a model that's tall but not long (or vice versa).
        const referenceLength = Math.max(size.x, size.z) || largestDimension;
        const normalizedScale = TARGET_LENGTH / referenceLength;

        this.model.scale.setScalar(normalizedScale);

        // Recompute the box post-scale to correctly re-center the pivot.
        const scaledBox = new THREE.Box3().setFromObject(this.model);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);
        this.model.position.x -= scaledCenter.x;
        this.model.position.z -= scaledCenter.z;
        this.model.position.y -= scaledBox.min.y; // sit flush on the ground

        console.info(`[Player] Applied normalization scale: ${normalizedScale.toFixed(4)}`);

        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.carGroup.add(this.model);

        // Attempt to auto-detect wheel meshes by common naming conventions.
        const wheelNames = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
        const found = wheelNames
          .map((name) => this.model.getObjectByName(name))
          .filter(Boolean);
        if (found.length === 4) {
          this.wheels = found;
        }
      },
      undefined,
      (error) => {
        if (settled) return;
        settled = true;
        console.error(
          `[Player] Failed to load "${CAR_MODEL_URL}" — using procedural fallback vehicle. ` +
            'Check the Network tab: a 404 means the file is missing or the path is wrong ' +
            '(it must be at DSC/assets/models/car.glb, served from project root).',
          error
        );
        this._buildFallbackCar();
      }
    );

    // Safety net: some hosting setups fail silently (e.g. 404 with no
    // network error surfaced). If nothing has resolved in time, fall back.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn('[Player] car.glb load timed out — using procedural fallback vehicle.');
        this._buildFallbackCar();
      }
    }, FALLBACK_TIMEOUT_MS);
  }

  _buildFallbackCar() {
    if (this.model) return;
    this.usingFallback = true;

    const group = new THREE.Group();
    group.name = 'FallbackCar';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff6a1a,
      metalness: 0.55,
      roughness: 0.32,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      metalness: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.85,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x0d0f12,
      roughness: 0.85,
      metalness: 0.1,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26,
      metalness: 0.6,
      roughness: 0.4,
    });

    // Lower chassis
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), bodyMat);
    lowerBody.position.y = 0.55;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    group.add(lowerBody);

    // Cabin / glass greenhouse
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.0), glassMat);
    cabin.position.set(0, 1.05, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Front nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.45, 0.9), bodyMat);
    nose.position.set(0, 0.5, 2.35);
    nose.castShadow = true;
    group.add(nose);

    // Rear trim
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.5, 0.5), trimMat);
    rear.position.set(0, 0.55, -2.15);
    rear.castShadow = true;
    group.add(rear);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 22);
    const wheelPositions = [
      { x: -1.02, y: 0.38, z: 1.4 }, // front-left
      { x: 1.02, y: 0.38, z: 1.4 }, // front-right
      { x: -1.02, y: 0.38, z: -1.4 }, // rear-left
      { x: 1.02, y: 0.38, z: -1.4 }, // rear-right
    ];

    this.wheels = wheelPositions.map((p) => {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(p.x, p.y, p.z);

      const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wheelMesh.rotation.z = Math.PI / 2;
      wheelMesh.castShadow = true;
      wheelPivot.add(wheelMesh);

      group.add(wheelPivot);
      // Store the spinning mesh separately so steering (pivot) and spin
      // (mesh) rotations don't fight each other.
      wheelPivot.userData.spinMesh = wheelMesh;
      return wheelPivot;
    });

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.26, 0.15, 0.1);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xfff3c4,
      emissiveIntensity: 1.3,
    });
    [
      [-0.65, 0.55, 2.78],
      [0.65, 0.55, 2.78],
    ].forEach(([x, y, z]) => {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.position.set(x, y, z);
      group.add(hl);
    });

    // Taillights
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff2222,
      emissiveIntensity: 1.1,
    });
    [
      [-0.65, 0.55, -2.35],
      [0.65, 0.55, -2.35],
    ].forEach(([x, y, z]) => {
      const tl = new THREE.Mesh(lightGeo, taillightMat);
      tl.position.set(x, y, z);
      group.add(tl);
    });

    this.model = group;
    this.carGroup.add(this.model);
  }

  _setupAudio() {
    this.engineSound = new THREE.PositionalAudio(this.listener);
    this.engineSound.setRefDistance(4);
    this.engineSound.setMaxDistance(80);
    this.engineSound.setRolloffFactor(2);
    this.engineSound.setDistanceModel('exponential');
    this.engineSound.setLoop(true);
    this.engineSound.setVolume(0);
    this.carGroup.add(this.engineSound);

    // Synthesize a simple layered engine hum procedurally so the project
    // works without shipping a binary audio asset. Replace with a real
    // engine sample by loading it through THREE.AudioLoader if desired.
    const audioCtx = this.listener.context;
    const sampleRate = audioCtx.sampleRate;
    const duration = 2; // seconds, looped
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const fundamental = Math.sin(2 * Math.PI * 90 * t);
      const secondHarmonic = 0.5 * Math.sin(2 * Math.PI * 180 * t);
      const subRumble = 0.28 * Math.sin(2 * Math.PI * 45 * t);
      const noise = (Math.random() * 2 - 1) * 0.05;
      data[i] = (fundamental + secondHarmonic + subRumble) * 0.25 + noise;
    }

    this.engineSound.setBuffer(buffer);
  }

  /**
   * Browsers require a user gesture before audio contexts may play.
   * This attaches one-shot listeners for the first click / touch / keydown
   * to resume the AudioContext and start the (silent-until-then) engine loop.
   */
  _setupAudioUnlock() {
    const unlock = () => {
      if (this.audioUnlocked) return;
      const ctx = this.listener.context;

      const startPlayback = () => {
        console.info(`[Player] AudioContext state: "${ctx.state}". Starting engine sound.`);
        try {
          if (this.engineSound && !this.engineSound.isPlaying) {
            this.engineSound.play();
          }
          this.audioUnlocked = true;
        } catch (err) {
          console.error('[Player] engineSound.play() threw — audio will stay silent.', err);
        }
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(startPlayback).catch((err) => {
          console.error('[Player] AudioContext.resume() was rejected.', err);
        });
      } else {
        startPlayback();
      }

      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);
  }

  /**
   * Modulates engine volume and playback rate (pitch) based on normalized
   * speed (0..1), simulating RPM rise under acceleration.
   * @param {number} speedRatio
   */
  updateEngineAudio(speedRatio) {
    if (!this.engineSound || !this.audioUnlocked) return;
    const clamped = THREE.MathUtils.clamp(speedRatio, 0, 1);
    this.engineSound.setVolume(0.15 + clamped * 0.45);
    if (this.engineSound.source) {
      this.engineSound.source.playbackRate.value = 0.75 + clamped * 1.5;
    }
  }

  /**
   * Spins wheel meshes based on current linear speed (m/s).
   * @param {number} speed
   * @param {number} dt
   */
  updateWheelSpin(speed, dt) {
    if (!this.wheels || this.wheels.length === 0) return;
    const wheelRadius = 0.38;
    const angularVelocity = speed / wheelRadius;

    this.wheels.forEach((wheelPivot) => {
      const spinMesh = wheelPivot.userData.spinMesh;
      if (spinMesh) {
        spinMesh.rotation.x += angularVelocity * dt;
      }
    });
  }

  /**
   * Applies a steering angle (radians) to the front wheel pivots only.
   * @param {number} steerAngle
   */
  updateWheelSteer(steerAngle) {
    if (!this.wheels || this.wheels.length < 2) return;
    // Front-left, front-right are indices 0 and 1 by construction.
    this.wheels[0].rotation.y = steerAngle;
    this.wheels[1].rotation.y = steerAngle;
  }
}
import * as THREE from 'three';
import { createRenderer } from './renderer.js';
import { createCamera, updateFollowCamera } from './camera.js';
import { createScene } from './scene.js';
import { updateEnvironment } from './environment.js';
import { TrafficManager } from './traffic.js';
import { WeatherSystem, WEATHER_TYPES } from './weather.js';
import { CAR_HALF_WIDTH, CAR_HALF_LENGTH } from './roadConfig.js';
import { Player } from './player.js';
import { VehiclePhysics } from './physics.js';
import { HandTracking } from './handTracking.js';
import { TouchControls } from './touchControls.js';
import { UI } from './ui.js';

// --- DOM references ---
const gameContainer = document.getElementById('game');
const videoElement = document.getElementById('webcam');
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');
const playerNameInput = document.getElementById('player-name-input');
const touchControlsEl = document.getElementById('touch-controls');
const throttleButton = document.getElementById('throttle-button');
const calibrateButton = document.getElementById('calibrate-button');

// Hand gestures via a phone's own camera aren't practical while you're
// holding the phone to look at the screen, so mobile/touch devices get a
// tilt-to-steer + hold-to-drive scheme instead of webcam hand tracking.
const isMobile =
  /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches);

if (isMobile) {
  const instructions = document.querySelector('.start-card p');
  if (instructions) {
    instructions.textContent =
      'Tilt your device left/right to steer, and hold the on-screen button to accelerate. ' +
      'Use "Recenter Steering" any time to re-zero the tilt to how you\'re holding your phone.';
  }
}

// --- Core Three.js setup ---
const camera = createCamera();
const renderer = createRenderer(gameContainer);
const { scene, sun, ambient, hemi, environment } = createScene();

// --- Game systems ---
const player = new Player(scene, camera);
const physics = new VehiclePhysics();
const traffic = new TrafficManager(scene);
const weather = new WeatherSystem({
  scene,
  sun,
  ambient,
  hemi,
  skyMaterial: environment.skyMaterial,
  streetLampBulbs: environment.streetLampBulbs,
});
const ui = new UI();
const clock = new THREE.Clock();

// --- Weather auto-cycles through sunny -> rainy -> night -> repeat ---
const WEATHER_CYCLE_SECONDS = 75;
let weatherIndex = 0;
let weatherTimer = 0;

// --- Score: points accrue with distance driven forward (reverse doesn't
// subtract, so players aren't punished for reversing out of a mistake). ---
const POINTS_PER_METER = 8;
let score = 0;
let distanceMeters = 0;

// --- Collisions with oncoming traffic ---
const COLLISION_SCORE_PENALTY = 60;
const COLLISION_COOLDOWN_SECONDS = 1.4; // ignore further hits briefly after one
const COLLISION_FLASH_SECONDS = 0.9; // how long the HUD shows "COLLISION!"
let collisionCooldown = 0;
let collisionFlashTimer = 0;

let handTracking = null;
let touchControls = null;
let latestHandData = { steerNormalized: 0, throttleNormalized: 0, handsDetected: 0 };
let usingKeyboardFallback = false;

// Sun offset relative to the car, reused each frame to avoid allocations.
const SUN_OFFSET = new THREE.Vector3(-40, 60, -30);
const sunPositionScratch = new THREE.Vector3();

/**
 * The main requestAnimationFrame loop: advances physics from the latest
 * control inputs, syncs the visual car transform, updates wheels/audio,
 * follows with the camera, refreshes the HUD, and renders the frame.
 */
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  const steer = latestHandData.steerNormalized;
  const throttle = latestHandData.throttleNormalized;

  physics.setControls({ throttle, steer, brake: 0 });
  const state = physics.update(dt);

  player.carGroup.position.copy(state.position);
  player.carGroup.rotation.y = state.rotationY;

  player.updateWheelSteer(state.steerAngle);
  player.updateWheelSpin(state.speed, dt);
  player.updateEngineAudio(physics.getSpeedRatio());

  // Keep the directional light's shadow frustum centered on the car so
  // shadows remain crisp and in-frame as the player drives around.
  sunPositionScratch.copy(player.carGroup.position).add(SUN_OFFSET);
  sun.position.copy(sunPositionScratch);
  sun.target.position.copy(player.carGroup.position);

  updateFollowCamera(camera, player.carGroup, dt);
  updateEnvironment(environment, dt, clock.getElapsedTime());
  traffic.update(dt, player.carGroup.position.z);

  weather.update(dt);
  weather.followTarget(player.carGroup.position);
  weatherTimer += dt;
  if (weatherTimer >= WEATHER_CYCLE_SECONDS) {
    weatherTimer = 0;
    weatherIndex = (weatherIndex + 1) % WEATHER_TYPES.length;
    weather.setWeather(WEATHER_TYPES[weatherIndex]);
  }

  // --- Collision detection against oncoming traffic (simple AABB, x/z plane) ---
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  collisionFlashTimer = Math.max(0, collisionFlashTimer - dt);

  if (collisionCooldown <= 0) {
    const colliders = traffic.getColliders();
    for (const collider of colliders) {
      const dx = Math.abs(player.carGroup.position.x - collider.x);
      const dz = Math.abs(player.carGroup.position.z - collider.z);
      const overlapsX = dx < CAR_HALF_WIDTH + collider.halfWidth;
      const overlapsZ = dz < CAR_HALF_LENGTH + collider.halfLength;

      if (overlapsX && overlapsZ) {
        // Knock the car backward and kill forward speed rather than a full
        // physics response — keeps the "stay away from them" stakes real
        // without needing a full rigid-body solver.
        physics.speed = physics.speed > 0 ? -Math.min(physics.speed * 0.4, 6) : physics.speed;
        score = Math.max(0, score - COLLISION_SCORE_PENALTY);
        collisionCooldown = COLLISION_COOLDOWN_SECONDS;
        collisionFlashTimer = COLLISION_FLASH_SECONDS;
        break;
      }
    }
  }

  // Score: only forward movement counts toward distance/points.
  if (state.speed > 0) {
    const metersThisFrame = state.speed * dt;
    distanceMeters += metersThisFrame;
    score += metersThisFrame * POINTS_PER_METER;
  }

  ui.update({
    speedKmh: physics.getSpeedKmh(),
    steerDegrees: physics.getSteerDegrees(),
    accelerating: throttle > 0.05,
    handsDetected: latestHandData.handsDetected,
    speedRatio: physics.getSpeedRatio(),
    score,
    distanceMeters,
    collided: collisionFlashTimer > 0,
    usingTouchControls: !!touchControls,
  });

  renderer.render(scene, camera);
}

/**
 * Kicked off by the "START ENGINE" button: unlocks audio (a required user
 * gesture), hides the overlay, and attempts to start MediaPipe hand
 * tracking. Falls back to keyboard controls if the webcam/tracking
 * pipeline fails to initialize (e.g. no camera, permission denied).
 */
async function startExperience() {
  const enteredName = (playerNameInput?.value || '').trim();
  ui.setPlayerName(enteredName || 'DRIVER');

  startOverlay.classList.add('hidden');

  const audioCtx = player.listener.context;
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (err) {
      console.warn('[main] Could not resume AudioContext.', err);
    }
  }
  if (player.engineSound && !player.engineSound.isPlaying) {
    player.engineSound.play();
  }
  player.audioUnlocked = true;

  if (isMobile) {
    document.body.classList.add('mobile-touch-controls');
    touchControlsEl?.classList.remove('hidden');

    touchControls = new TouchControls({
      onUpdate: (data) => {
        latestHandData = data;
      },
    });
    await touchControls.start(throttleButton);
    calibrateButton?.addEventListener('click', () => touchControls.calibrate());
    return;
  }

  try {
    handTracking = new HandTracking(videoElement, {
      onResults: (data) => {
        latestHandData = data;
      },
    });
    await handTracking.start();
  } catch (err) {
    console.error('[main] Hand tracking unavailable — falling back to keyboard controls.', err);
    enableKeyboardFallback();
  }
}

// --- Keyboard fallback (arrow keys / WASD) ---
const keyState = { left: false, right: false, up: false };

function enableKeyboardFallback() {
  if (usingKeyboardFallback) return;
  usingKeyboardFallback = true;

  const handsPanel = document.getElementById('hud-hands-value');
  if (handsPanel) handsPanel.textContent = 'KEYBOARD MODE (WASD / ARROWS)';

  window.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyState.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keyState.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keyState.up = true;
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyState.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keyState.right = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keyState.up = false;
  });

  setInterval(() => {
    let steer = 0;
    if (keyState.left) steer -= 1;
    if (keyState.right) steer += 1;

    latestHandData = {
      steerNormalized: steer,
      throttleNormalized: keyState.up ? 1 : 0,
      handsDetected: 0,
    };
  }, 16);
}

startButton.addEventListener('click', startExperience, { once: true });

// --- Responsive resizing ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
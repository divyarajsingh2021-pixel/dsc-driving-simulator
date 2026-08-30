import * as THREE from 'three';
import { ROAD_HALF_WIDTH, CAR_HALF_WIDTH } from './roadConfig.js';

// --- Tunable vehicle constants ---
const MAX_SPEED = 42; // m/s forward (~151 km/h)
const MAX_REVERSE_SPEED = -8; // m/s
const ACCELERATION = 14; // m/s^2 at full throttle
const BRAKE_DECELERATION = 22; // m/s^2 at full brake
const NATURAL_FRICTION = 6; // m/s^2 rolling/engine drag when coasting

// Steering was previously too twitchy (tiny hand movements swinging the
// car hard side to side). Lowered max lock angle and slowed how quickly
// the steering angle can change to make the car feel more planted.
const MAX_STEER_ANGLE = THREE.MathUtils.degToRad(22); // radians
const STEER_RESPONSE_SPEED = 3.2; // how quickly steer angle tracks input
const STEER_RETURN_SPEED = 3.5; // how quickly steer angle self-centers
const WHEELBASE = 2.6; // meters, used by the bicycle model

// The car can't physically leave the road — this margin keeps the car's
// visual edge (not just its center point) from clipping through the curb.
const ROAD_BOUNDARY = ROAD_HALF_WIDTH - CAR_HALF_WIDTH;

/**
 * A lightweight bicycle-model vehicle simulation: takes normalized
 * throttle/steer/brake inputs each frame and integrates position (x, z)
 * and heading (rotation around Y) with inertia, friction, and steering
 * angle damping baked in.
 */
export class VehiclePhysics {
  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.rotationY = 0;

    this.speed = 0; // signed m/s: positive = forward, negative = reverse
    this.steerAngle = 0; // current steering angle, radians
    this.targetSteerAngle = 0;

    this.throttleInput = 0; // 0..1
    this.steerInput = 0; // -1 (left) .. 1 (right)
    this.brakeInput = 0; // 0..1

    this._forward = new THREE.Vector3();
  }

  /**
   * Feed normalized control inputs for the current frame. Call this once
   * per frame before update().
   */
  setControls({ throttle = 0, steer = 0, brake = 0 } = {}) {
    this.throttleInput = THREE.MathUtils.clamp(throttle, 0, 1);
    this.steerInput = THREE.MathUtils.clamp(steer, -1, 1);
    this.brakeInput = THREE.MathUtils.clamp(brake, 0, 1);
  }

  /**
   * Advances the simulation by dt seconds. Returns the resulting kinematic
   * state for convenience (also available via getters below).
   */
  update(dt) {
    dt = Math.min(dt, 0.05); // guard against large tab-switch spikes

    // --- Longitudinal dynamics (throttle / friction / braking) ---
    if (this.throttleInput > 0.01) {
      this.speed += ACCELERATION * this.throttleInput * dt;
    } else {
      const frictionDecel = NATURAL_FRICTION * dt;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - frictionDecel);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + frictionDecel);
      }
    }

    if (this.brakeInput > 0.01) {
      const brakeDecel = BRAKE_DECELERATION * this.brakeInput * dt;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - brakeDecel);
      } else {
        this.speed = Math.min(0, this.speed + brakeDecel);
      }
    }

    this.speed = THREE.MathUtils.clamp(this.speed, MAX_REVERSE_SPEED, MAX_SPEED);

    // --- Steering dynamics: smoothly track input, self-center when idle ---
    this.targetSteerAngle = this.steerInput * MAX_STEER_ANGLE;

    if (Math.abs(this.steerInput) > 0.01) {
      const responseAlpha = 1 - Math.exp(-STEER_RESPONSE_SPEED * dt);
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, this.targetSteerAngle, responseAlpha);
    } else {
      const returnAlpha = 1 - Math.exp(-STEER_RETURN_SPEED * dt);
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, 0, returnAlpha);
    }

    // --- Bicycle model: yaw rate depends on speed and steer angle ---
    if (Math.abs(this.speed) > 0.05) {
      const angularVelocity = (this.speed / WHEELBASE) * Math.tan(this.steerAngle);
      this.rotationY += angularVelocity * dt;
    }

    // --- Integrate position along current heading ---
    this._forward.set(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
    this.position.addScaledVector(this._forward, this.speed * dt);

    // --- Hard road boundary: the car cannot cross the curb ---
    this.position.x = THREE.MathUtils.clamp(this.position.x, -ROAD_BOUNDARY, ROAD_BOUNDARY);

    return {
      position: this.position,
      rotationY: this.rotationY,
      speed: this.speed,
      steerAngle: this.steerAngle,
    };
  }

  /** Current speed converted to km/h (signed). */
  getSpeedKmh() {
    return this.speed * 3.6;
  }

  /** Current steering angle in degrees (signed, + = right). */
  getSteerDegrees() {
    return THREE.MathUtils.radToDeg(this.steerAngle);
  }

  /** Absolute speed normalized against MAX_SPEED, clamped to 0..1. */
  getSpeedRatio() {
    return THREE.MathUtils.clamp(Math.abs(this.speed) / MAX_SPEED, 0, 1);
  }
}
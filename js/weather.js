import * as THREE from 'three';

export const WEATHER_TYPES = ['sunny', 'rainy', 'night'];

// How long a transition between weather states takes to fully blend, in
// seconds. Kept slow enough to read as weather actually rolling in rather
// than an abrupt cut.
const TRANSITION_DURATION = 5;

const RAIN_PARTICLE_COUNT = 700;
const RAIN_FALL_SPEED = 26; // meters/second
const RAIN_VOLUME_RADIUS = 45; // meters, spread around the follow target
const RAIN_VOLUME_HEIGHT = 40;

const PROFILES = {
  sunny: {
    skyTop: new THREE.Color(0x1c3a5e),
    skyHorizon: new THREE.Color(0x9fc8e8),
    skyBottom: new THREE.Color(0x0d1a26),
    fogColor: new THREE.Color(0x9fc8e8),
    fogNear: 80,
    fogFar: 480,
    sunColor: new THREE.Color(0xfff4d6),
    sunIntensity: 1.8,
    ambientColor: new THREE.Color(0x8fa2b8),
    ambientIntensity: 0.6,
    hemiIntensity: 0.6,
    lampIntensity: 0.4,
    rain: false,
  },
  rainy: {
    skyTop: new THREE.Color(0x1b1f26),
    skyHorizon: new THREE.Color(0x4a5560),
    skyBottom: new THREE.Color(0x05070a),
    fogColor: new THREE.Color(0x4a5560),
    fogNear: 30,
    fogFar: 220,
    sunColor: new THREE.Color(0xcfd6dc),
    sunIntensity: 0.65,
    ambientColor: new THREE.Color(0x6b7580),
    ambientIntensity: 0.55,
    hemiIntensity: 0.4,
    lampIntensity: 1.0,
    rain: true,
  },
  night: {
    skyTop: new THREE.Color(0x02030a),
    skyHorizon: new THREE.Color(0x131a2c),
    skyBottom: new THREE.Color(0x000000),
    fogColor: new THREE.Color(0x05070f),
    fogNear: 25,
    fogFar: 180,
    sunColor: new THREE.Color(0x8fa8ff),
    sunIntensity: 0.22,
    ambientColor: new THREE.Color(0x1c2436),
    ambientIntensity: 0.32,
    hemiIntensity: 0.18,
    lampIntensity: 1.8,
    rain: false,
  },
};

/**
 * Drives sky color, fog, sun/ambient/hemisphere lighting, street lamp
 * glow, and a rain particle system through three weather profiles —
 * sunny, rainy, and night — with smooth multi-second transitions between
 * them instead of hard cuts.
 */
export class WeatherSystem {
  constructor({ scene, sun, ambient, hemi, skyMaterial, streetLampBulbs = [] }) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;
    this.hemi = hemi;
    this.skyMaterial = skyMaterial;
    this.streetLampBulbs = streetLampBulbs;

    this.current = 'sunny';
    this.from = _cloneProfile(PROFILES.sunny);
    this.to = PROFILES.sunny;
    this.transitionT = 1; // 1 = fully arrived, no transition in progress

    this._buildRain();
    this._applyImmediate(PROFILES.sunny);
  }

  /** Begins a smooth transition to the named weather type. */
  setWeather(type) {
    if (!PROFILES[type] || type === this.current) return;
    this.from = this._snapshotCurrent();
    this.to = PROFILES[type];
    this.transitionT = 0;
    this.current = type;
  }

  /** Advances any in-progress transition and animates rain if active. */
  update(dt) {
    if (this.transitionT < 1) {
      this.transitionT = Math.min(1, this.transitionT + dt / TRANSITION_DURATION);
      this._applyBlended(this.from, this.to, this.transitionT);
    }

    if (this.rainGroup.visible) {
      this._updateRain(dt);
    }
  }

  /** Keeps the rain volume centered on the player so it always surrounds them. */
  followTarget(position) {
    this.rainGroup.position.set(position.x, 0, position.z);
  }

  _snapshotCurrent() {
    return {
      skyTop: this.skyMaterial.uniforms.topColor.value.clone(),
      skyHorizon: this.skyMaterial.uniforms.horizonColor.value.clone(),
      skyBottom: this.skyMaterial.uniforms.bottomColor.value.clone(),
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      sunColor: this.sun.color.clone(),
      sunIntensity: this.sun.intensity,
      ambientColor: this.ambient.color.clone(),
      ambientIntensity: this.ambient.intensity,
      hemiIntensity: this.hemi.intensity,
      lampIntensity: this._currentLampIntensity,
      rain: this.rainGroup.visible,
    };
  }

  _applyImmediate(profile) {
    this._applyBlended(profile, profile, 1);
  }

  _applyBlended(from, to, t) {
    this.skyMaterial.uniforms.topColor.value.copy(from.skyTop).lerp(to.skyTop, t);
    this.skyMaterial.uniforms.horizonColor.value.copy(from.skyHorizon).lerp(to.skyHorizon, t);
    this.skyMaterial.uniforms.bottomColor.value.copy(from.skyBottom).lerp(to.skyBottom, t);

    this.scene.fog.color.copy(from.fogColor).lerp(to.fogColor, t);
    this.scene.fog.near = THREE.MathUtils.lerp(from.fogNear, to.fogNear, t);
    this.scene.fog.far = THREE.MathUtils.lerp(from.fogFar, to.fogFar, t);
    this.scene.background.copy(from.skyBottom).lerp(to.skyBottom, t);

    this.sun.color.copy(from.sunColor).lerp(to.sunColor, t);
    this.sun.intensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, t);

    this.ambient.color.copy(from.ambientColor).lerp(to.ambientColor, t);
    this.ambient.intensity = THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, t);

    this.hemi.intensity = THREE.MathUtils.lerp(from.hemiIntensity, to.hemiIntensity, t);

    const lampIntensity = THREE.MathUtils.lerp(from.lampIntensity, to.lampIntensity, t);
    this._currentLampIntensity = lampIntensity;
    this.streetLampBulbs.forEach((bulb) => {
      bulb.material.emissiveIntensity = lampIntensity;
    });

    // Rain fades in/out visually across the transition rather than
    // popping on/off at the halfway point.
    const rainAmount = (from.rain ? 1 - t : 0) + (to.rain ? t : 0);
    this.rainGroup.visible = rainAmount > 0.02;
    this.rainMaterial.opacity = 0.55 * Math.min(1, rainAmount);
  }

  _buildRain() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(RAIN_PARTICLE_COUNT * 3);
    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * RAIN_VOLUME_RADIUS * 2;
      positions[i * 3 + 1] = Math.random() * RAIN_VOLUME_HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_VOLUME_RADIUS * 2;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xaac4e0,
      size: 0.12,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.rainPositions = positions;
    this.rainGroup = new THREE.Points(geometry, this.rainMaterial);
    this.rainGroup.visible = false;
    this.scene.add(this.rainGroup);
  }

  _updateRain(dt) {
    const positions = this.rainPositions;
    for (let i = 1; i < positions.length; i += 3) {
      positions[i] -= RAIN_FALL_SPEED * dt;
      if (positions[i] < 0) {
        positions[i] = RAIN_VOLUME_HEIGHT;
      }
    }
    this.rainGroup.geometry.attributes.position.needsUpdate = true;
  }
}

function _cloneProfile(profile) {
  return {
    ...profile,
    skyTop: profile.skyTop.clone(),
    skyHorizon: profile.skyHorizon.clone(),
    skyBottom: profile.skyBottom.clone(),
    fogColor: profile.fogColor.clone(),
    sunColor: profile.sunColor.clone(),
    ambientColor: profile.ambientColor.clone(),
  };
}
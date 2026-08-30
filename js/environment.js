import * as THREE from 'three';
import { LANE_WIDTH, ROAD_WIDTH, ROAD_HALF_WIDTH, ROAD_LENGTH, ROAD_START_Z } from './roadConfig.js';

const LANE_MARK_LENGTH = 3;
const LANE_MARK_GAP = 4;

// Traffic light cycle timing, in seconds.
const GREEN_DURATION = 5;
const YELLOW_DURATION = 1.5;
const RED_DURATION = 4;
const CYCLE_DURATION = GREEN_DURATION + YELLOW_DURATION + RED_DURATION;

/**
 * Builds the full driving environment: a 4-lane asphalt road with correct
 * lane markings (center double-yellow divider, dashed white lane splits,
 * solid white edges), roadside trees, street lamps, cycling traffic-light
 * fixtures, a gradient sky dome with distant hill silhouettes, and drifting
 * clouds.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, roadLength: number, trafficLights: Array, clouds: THREE.Group, skyMaterial: THREE.ShaderMaterial, streetLampBulbs: THREE.Mesh[] }}
 */
export function createEnvironment(scene) {
  const group = new THREE.Group();
  group.name = 'Environment';
  scene.add(group);

  const skyMaterial = _buildSky(scene);
  _buildHills(group);
  _buildRoad(group);
  _buildTrees(group);
  const streetLampBulbs = _buildStreetLamps(group);
  const trafficLights = _buildTrafficLights(group);
  const clouds = _buildClouds(group);

  return { group, roadLength: ROAD_LENGTH, trafficLights, clouds, skyMaterial, streetLampBulbs };
}

/**
 * Advances the environment's animated pieces: cycles traffic lights through
 * green/yellow/red, and slowly drifts clouds across the sky. Call once per
 * frame with the running elapsed time (e.g. THREE.Clock#getElapsedTime()).
 */
export function updateEnvironment(env, dt, elapsed) {
  env.trafficLights.forEach((tl) => {
    const t = (elapsed + tl.phaseOffset) % CYCLE_DURATION;
    if (t < GREEN_DURATION) {
      tl.green.emissiveIntensity = 1.6;
      tl.yellow.emissiveIntensity = 0;
      tl.red.emissiveIntensity = 0;
    } else if (t < GREEN_DURATION + YELLOW_DURATION) {
      tl.green.emissiveIntensity = 0;
      tl.yellow.emissiveIntensity = 1.6;
      tl.red.emissiveIntensity = 0;
    } else {
      tl.green.emissiveIntensity = 0;
      tl.yellow.emissiveIntensity = 0;
      tl.red.emissiveIntensity = 1.6;
    }
  });

  env.clouds.children.forEach((cloud, i) => {
    cloud.position.x += Math.sin(elapsed * 0.03 + i) * 0.015;
    cloud.position.z += 0.15 * dt * (1 + (i % 3) * 0.4);
  });
}

// ---------------------------------------------------------------------------

/**
 * Large inverted sphere with a vertical gradient shader — dark navy zenith
 * fading to a dusty horizon glow — instead of a flat background color, so
 * the sky reads as atmosphere rather than a void.
 */
function _buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x05070f) },
      horizonColor: { value: new THREE.Color(0x2a3548) },
      bottomColor: { value: new THREE.Color(0x05070a) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color = h > 0.0
          ? mix(horizonColor, topColor, clamp(h * 1.6, 0.0, 1.0))
          : mix(horizonColor, bottomColor, clamp(-h * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'SkyDome';
  scene.add(sky);
  return skyMat;
}

/** Low-poly hill silhouettes ringing the horizon for a sense of depth. */
function _buildHills(group) {
  const hillGroup = new THREE.Group();
  hillGroup.name = 'Hills';

  const hillMaterial = new THREE.MeshStandardMaterial({
    color: 0x131a22,
    roughness: 1,
    fog: true,
  });

  const ringRadius = 340;
  const hillCount = 22;
  for (let i = 0; i < hillCount; i++) {
    const angle = (i / hillCount) * Math.PI * 2;
    const radius = ringRadius + Math.random() * 90;
    const height = 30 + Math.random() * 55;
    const width = 60 + Math.random() * 70;

    const hill = new THREE.Mesh(new THREE.ConeGeometry(width, height, 5), hillMaterial);
    hill.position.set(Math.sin(angle) * radius, height * 0.32, Math.cos(angle) * radius);
    hill.rotation.y = Math.random() * Math.PI;
    hillGroup.add(hill);
  }

  group.add(hillGroup);
}

function _buildRoad(group) {
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c1f24,
    roughness: 0.92,
    metalness: 0.05,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, ROAD_START_Z + ROAD_LENGTH / 2);
  road.receiveShadow = true;
  group.add(road);

  const step = LANE_MARK_LENGTH + LANE_MARK_GAP;
  const markCount = Math.floor(ROAD_LENGTH / step);

  // Dashed white lines between same-direction lanes (at ±LANE_WIDTH).
  const dashMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0x1a1a1a,
    roughness: 0.5,
  });
  const dashGeometry = new THREE.PlaneGeometry(0.2, LANE_MARK_LENGTH);
  [-LANE_WIDTH, LANE_WIDTH].forEach((x) => {
    for (let i = 0; i < markCount; i++) {
      const mark = new THREE.Mesh(dashGeometry, dashMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0.03, ROAD_START_Z + i * step);
      group.add(mark);
    }
  });

  // Solid double-yellow center divider separating opposing traffic.
  const yellowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcf4d,
    emissive: 0x332200,
    emissiveIntensity: 0.4,
    roughness: 0.5,
  });
  const yellowLineGeometry = new THREE.PlaneGeometry(0.18, ROAD_LENGTH);
  [-0.12, 0.12].forEach((offset) => {
    const line = new THREE.Mesh(yellowLineGeometry, yellowMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.set(offset, 0.03, ROAD_START_Z + ROAD_LENGTH / 2);
    group.add(line);
  });

  // Solid white road edge lines.
  const edgeGeometry = new THREE.PlaneGeometry(0.2, ROAD_LENGTH);
  [-ROAD_HALF_WIDTH + 0.4, ROAD_HALF_WIDTH - 0.4].forEach((x) => {
    const edge = new THREE.Mesh(edgeGeometry, dashMaterial);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.03, ROAD_START_Z + ROAD_LENGTH / 2);
    group.add(edge);
  });

  // Curbs just outside the drivable width — these are the hard visual
  // boundary that matches the invisible physics wall in physics.js.
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.8 });
  [-ROAD_HALF_WIDTH - 0.4, ROAD_HALF_WIDTH + 0.4].forEach((x) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, ROAD_LENGTH), curbMaterial);
    curb.position.set(x, 0.15, ROAD_START_Z + ROAD_LENGTH / 2);
    curb.receiveShadow = true;
    curb.castShadow = true;
    group.add(curb);
  });
}

function _buildTrees(group) {
  const treeGroup = new THREE.Group();
  treeGroup.name = 'Trees';

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.85 });
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6);
  const leavesGeometry = new THREE.ConeGeometry(1.3, 2.6, 7);

  function makeTree(x, z, scale) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    tree.add(trunk);

    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 2.4;
    leaves.castShadow = true;
    tree.add(leaves);

    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    return tree;
  }

  for (let z = ROAD_START_Z; z < ROAD_START_Z + ROAD_LENGTH; z += 14) {
    if (Math.random() > 0.35) {
      const jitter = Math.random() * 6 - 3;
      const scale = 0.8 + Math.random() * 0.6;
      treeGroup.add(makeTree(-ROAD_HALF_WIDTH - 5 - Math.random() * 6, z + jitter, scale));
    }
    if (Math.random() > 0.35) {
      const jitter = Math.random() * 6 - 3;
      const scale = 0.8 + Math.random() * 0.6;
      treeGroup.add(makeTree(ROAD_HALF_WIDTH + 5 + Math.random() * 6, z + jitter, scale));
    }
  }

  group.add(treeGroup);
}

function _buildStreetLamps(group) {
  const lampGroup = new THREE.Group();
  lampGroup.name = 'StreetLamps';

  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x21252c, metalness: 0.6, roughness: 0.4 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3c4,
    emissive: 0xfff3c4,
    emissiveIntensity: 1.4,
  });
  const bulbs = [];

  function makeLamp(x, z) {
    const lamp = new THREE.Group();
    const facingIn = x < 0 ? 1 : -1;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5, 8), lampMaterial);
    pole.position.y = 2.25;
    pole.castShadow = true;
    lamp.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), lampMaterial);
    arm.position.set(facingIn * 0.6, 4.4, 0);
    lamp.add(arm);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), bulbMaterial.clone());
    bulb.position.set(facingIn * 1.15, 4.35, 0);
    lamp.add(bulb);
    bulbs.push(bulb);

    lamp.position.set(x, 0, z);
    return lamp;
  }

  for (let z = ROAD_START_Z; z < ROAD_START_Z + ROAD_LENGTH; z += 40) {
    lampGroup.add(makeLamp(-ROAD_HALF_WIDTH - 1.4, z));
    lampGroup.add(makeLamp(ROAD_HALF_WIDTH + 1.4, z + 20));
  }

  group.add(lampGroup);
  return bulbs;
}

function _buildTrafficLights(group) {
  const trafficLightGroup = new THREE.Group();
  trafficLightGroup.name = 'TrafficLights';

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1f24, metalness: 0.5, roughness: 0.5 });
  const lightGeometry = new THREE.SphereGeometry(0.16, 10, 10);
  const registry = [];

  function makeTrafficLight(x, z, phaseOffset) {
    const fixture = new THREE.Group();

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), poleMaterial);
    pole.position.y = 2.3;
    pole.castShadow = true;
    fixture.add(pole);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.4), poleMaterial);
    housing.position.y = 4.7;
    housing.castShadow = true;
    fixture.add(housing);

    const redMaterial = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0 });
    const yellowMaterial = new THREE.MeshStandardMaterial({ color: 0x332900, emissive: 0xffcc22, emissiveIntensity: 0 });
    const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x003310, emissive: 0x22ff66, emissiveIntensity: 0 });

    const redLight = new THREE.Mesh(lightGeometry, redMaterial);
    redLight.position.set(0, 5.15, 0.21);
    const yellowLight = new THREE.Mesh(lightGeometry, yellowMaterial);
    yellowLight.position.set(0, 4.7, 0.21);
    const greenLight = new THREE.Mesh(lightGeometry, greenMaterial);
    greenLight.position.set(0, 4.25, 0.21);

    fixture.add(redLight, yellowLight, greenLight);
    fixture.position.set(x, 0, z);
    trafficLightGroup.add(fixture);

    registry.push({
      group: fixture,
      red: redMaterial,
      yellow: yellowMaterial,
      green: greenMaterial,
      phaseOffset,
    });
  }

  let index = 0;
  for (let z = 150; z < ROAD_START_Z + ROAD_LENGTH - 150; z += 350) {
    makeTrafficLight(-ROAD_HALF_WIDTH - 1.6, z, index * 2.3);
    index++;
  }

  group.add(trafficLightGroup);
  return registry;
}

function _buildClouds(group) {
  const cloudGroup = new THREE.Group();
  cloudGroup.name = 'Clouds';

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xeef2f6,
    roughness: 1,
    emissive: 0x111a22,
    emissiveIntensity: 0.05,
    transparent: true,
    opacity: 0.92,
  });
  const puffGeometry = new THREE.IcosahedronGeometry(1.6, 0);

  function makeCloud(x, y, z, scale) {
    const cloud = new THREE.Group();
    const puffCount = 4 + Math.floor(Math.random() * 3);

    for (let i = 0; i < puffCount; i++) {
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2);
      const puffScale = 0.8 + Math.random() * 0.6;
      puff.scale.setScalar(puffScale);
      cloud.add(puff);
    }

    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);
    return cloud;
  }

  for (let i = 0; i < 26; i++) {
    const x = (Math.random() - 0.5) * 500;
    const y = 55 + Math.random() * 35;
    const z = ROAD_START_Z + Math.random() * ROAD_LENGTH;
    const scale = 1.5 + Math.random() * 2.5;
    cloudGroup.add(makeCloud(x, y, z, scale));
  }

  group.add(cloudGroup);
  return cloudGroup;
}
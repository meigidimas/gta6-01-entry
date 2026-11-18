// Neon Bay Heat — three.js scene setup and the third-person camera.
// The renderer, the sun, the sky and the fog live here, plus the camera
// rig: a smoothed follow camera the player orbits with the mouse, which
// eases back behind the car while driving.

import * as THREE from 'three';
import { CAMERA, PALETTE } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 420);
  return scene;
}

export function addLights(scene, extent) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(90, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = extent + 60;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      900,
    );
    this.yaw = Math.PI; // behind the player, looking north
    this.pitch = 0.34; // a flatter default view: more street, less roof
    this.position = new THREE.Vector3(0, 8, 14);
    this.lookTarget = new THREE.Vector3(0, 1.5, 0);
    this.idleTime = 0; // seconds since the player last orbited
    this.mode = 'foot';
    this.fov = CAMERA.fov;
    this.camera.position.copy(this.position);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // target: world position to follow. heading: the facing to fall in
  // behind while driving (radians, 0 = +x). mouseDelta: pixels dragged.
  // speedNorm in [0, 1] widens the field of view as the car goes faster.
  update(dt, target, heading, mode, mouseDelta, speedNorm = 0) {
    this.mode = mode;
    if (mouseDelta.dx !== 0 || mouseDelta.dy !== 0) {
      this.yaw -= mouseDelta.dx * CAMERA.orbitSpeed;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + mouseDelta.dy * CAMERA.orbitSpeed,
        CAMERA.pitchMin,
        CAMERA.pitchMax,
      );
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
    }
    // While driving, the camera falls in behind the car quickly once
    // the player stops orbiting — a slow drift leaves the car sliding
    // sideways out of frame at speed.
    if (mode === 'drive' && this.idleTime > 1) {
      const behind = heading + Math.PI;
      this.yaw = angleLerp(this.yaw, behind, Math.min(1, dt * 3.0));
    }
    const distance = mode === 'drive' ? CAMERA.driveDistance : CAMERA.onFootDistance;
    const height = mode === 'drive' ? CAMERA.driveHeight : CAMERA.onFootHeight;
    const eyeHeight = Math.sin(this.pitch) * distance + height * 0.6;
    const flat = Math.cos(this.pitch) * distance;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * flat,
      target.y + eyeHeight,
      target.z + Math.cos(this.yaw) * flat,
    );
    if (desired.y < 1.2) desired.y = 1.2; // never dip under the street
    // Driving needs a tighter leash than walking: at 30 m/s a lazy
    // camera trails so far back the car shrinks to a dot.
    const smooth = mode === 'drive' ? 10 : CAMERA.smooth;
    const k = 1 - Math.exp(-smooth * dt);
    this.position.lerp(desired, k);
    this.camera.position.copy(this.position);
    const look = new THREE.Vector3(target.x, target.y + 1.6, target.z);
    // At speed, look a little ahead of the car along its heading: the
    // car settles low-centre in frame instead of sliding off to a side
    // while the smoothed look target catches up. A short lead only —
    // a long one shrinks the car toward the horizon.
    if (mode === 'drive' && speedNorm > 0) {
      look.x += Math.sin(heading) * speedNorm * 2.5;
      look.z += Math.cos(heading) * speedNorm * 2.5;
    }
    const lk = 1 - Math.exp(-CAMERA.lookSmooth * dt);
    this.lookTarget.lerp(look, lk);
    this.camera.lookAt(this.lookTarget);
    // Speed widens the lens a touch while driving: the sense of pace
    // without touching the steering. Eased, so it never snaps.
    const targetFov = CAMERA.fov + (mode === 'drive' ? speedNorm * 6 : 0);
    if (Math.abs(targetFov - this.fov) > 0.01) {
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // Snap the rig (respawn, scene staging) instead of sweeping across town.
  snapTo(target, heading) {
    this.yaw = heading + Math.PI;
    this.pitch = 0.34;
    const distance = this.mode === 'drive' ? CAMERA.driveDistance : CAMERA.onFootDistance;
    const height = this.mode === 'drive' ? CAMERA.driveHeight : CAMERA.onFootHeight;
    this.position.set(
      target.x + Math.sin(this.yaw) * distance,
      target.y + height,
      target.z + Math.cos(this.yaw) * distance,
    );
    this.lookTarget.set(target.x, target.y + 1.6, target.z);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }
}

// A mission marker: a glowing ground ring and a vertical light beam the
// player can see from across the city. update() makes it pulse.
export function createMarker(scene, x, z) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.9, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: PALETTE.markerBeam, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 13;
  group.add(ring);
  group.add(beam);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    group,
    update(time) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
      ring.material.opacity = 0.6 + 0.35 * pulse;
      ring.scale.setScalar(1 + 0.08 * Math.sin(time * 3.2));
      beam.material.opacity = 0.22 + 0.18 * pulse;
    },
    dispose() {
      scene.remove(group);
    },
  };
}

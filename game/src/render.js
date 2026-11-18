// Neon Bay Heat — scene setup, the third-person camera rig and the
// pulsing objective marker. The rig keeps the camera behind the action with
// exponential smoothing so turns feel weighty instead of twitchy.

import * as THREE from 'three';
import { CAMERA, PALETTE } from './config.js';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 420);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
  camera.position.set(0, 30, 60);
  return { scene, camera, sun, hemi };
}

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function dampAngle(current, target, rate, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-rate * dt));
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = CAMERA.pitch;
    this.yawOffset = 0; // mouse drag offset, decays back to zero in a car
    this.position = new THREE.Vector3(0, 30, 60);
    this.lookAt = new THREE.Vector3();
    this.orbitAngle = 0;
  }

  update(dt, target, heading, mode, mouseDelta, speed) {
    // Mouse drag orbits the camera; in a car the offset slowly recentres
    // behind the car so the view stays useful while driving.
    this.yawOffset -= mouseDelta.x * 0.0035;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + mouseDelta.y * 0.0022, 0.08, 1.1,
    );
    if (mode === 'car') {
      this.yawOffset = damp(this.yawOffset, 0, 0.55, dt);
      const behind = heading + Math.PI;
      this.yaw = dampAngle(this.yaw, behind + this.yawOffset, CAMERA.yawSmooth, dt);
    } else {
      this.yaw -= mouseDelta.x * 0.0035;
      this.yaw = dampAngle(this.yaw, this.yaw + this.yawOffset, CAMERA.yawSmooth, dt);
      this.yawOffset = 0;
    }

    const baseDist = mode === 'car' ? CAMERA.carDistance : CAMERA.footDistance;
    const baseHeight = mode === 'car' ? CAMERA.carHeight : CAMERA.footHeight;
    const dist = baseDist + speed * CAMERA.speedPullback;
    const height = baseHeight + speed * 0.02;

    // Speed feel: the lens widens as the car picks up pace, so 130 km/h
    // looks fast instead of merely quick. Eases back as speed bleeds off.
    const targetFov = mode === 'car' ? 62 + Math.min(10, speed * 0.28) : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 3.5, dt);
      this.camera.updateProjectionMatrix();
    }

    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist,
      target.y + height + Math.sin(this.pitch) * dist * 0.6,
      target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist,
    );
    if (desired.y < 1.2) desired.y = 1.2;
    this.position.x = damp(this.position.x, desired.x, CAMERA.positionSmooth, dt);
    this.position.y = damp(this.position.y, desired.y, CAMERA.positionSmooth, dt);
    this.position.z = damp(this.position.z, desired.z, CAMERA.positionSmooth, dt);
    this.camera.position.copy(this.position);

    this.lookAt.set(target.x, target.y + 1.4, target.z);
    this.camera.lookAt(this.lookAt);
  }

  orbit(dt, centre, radius, height) {
    // Slow cinematic sweep used by the title screen.
    this.orbitAngle += CAMERA.orbitSpeed * dt;
    const x = centre.x + Math.sin(this.orbitAngle) * radius;
    const z = centre.z + Math.cos(this.orbitAngle) * radius;
    this.position.set(x, height, z);
    this.camera.position.copy(this.position);
    this.camera.lookAt(centre.x, 4, centre.z);
    this.yaw = this.orbitAngle + Math.PI;
  }

  snapTo(target, heading, mode) {
    this.yaw = heading + Math.PI;
    this.yawOffset = 0;
    this.pitch = CAMERA.pitch;
    const dist = mode === 'car' ? CAMERA.carDistance : CAMERA.footDistance;
    const height = mode === 'car' ? CAMERA.carHeight : CAMERA.footHeight;
    this.position.set(
      target.x + Math.sin(this.yaw) * dist,
      target.y + height,
      target.z + Math.cos(this.yaw) * dist,
    );
    this.camera.position.copy(this.position);
    this.camera.lookAt(target.x, target.y + 1.4, target.z);
  }
}

export class ObjectiveMarker {
  constructor(scene) {
    this.group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.marker,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 42, 16, 1, true), beamMat);
    this.beam.position.y = 21;
    this.group.add(this.beam);

    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.marker,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.25;
    this.group.add(this.ring);

    this.time = 0;
    this.group.visible = false;
    scene.add(this.group);
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3.2) * 0.09;
    this.ring.scale.set(pulse, pulse, 1);
    this.beam.material.opacity = 0.22 + Math.sin(this.time * 3.2) * 0.08;
    this.ring.rotation.z += dt * 0.6;
  }
}

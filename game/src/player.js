// Neon Bay Heat — Danny Cole on foot.
// A simple block-built character with a walk cycle, camera-relative
// movement, and building collision. Entering a car hands control to the
// vehicle; the character mesh hides while driving.

import * as THREE from 'three';
import { PLAYER } from './config.js';

function buildCharacterMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2b6fc2 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), hair);
  cap.position.y = 1.94;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legL.position.set(-0.17, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirt);
  armL.position.set(-0.42, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(torso, head, cap, legL, legR, armL, armR);
  return { group, legL, legR, armL, armR };
}

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class Player {
  constructor(scene, x, z) {
    const parts = buildCharacterMesh();
    this.group = parts.group;
    this.legL = parts.legL;
    this.legR = parts.legR;
    this.armL = parts.armL;
    this.armR = parts.armR;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI; // facing north, into the city
    this.walkCycle = 0;
    this.inCar = false;
    this.car = null;
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  // cameraYaw: the camera rig's yaw; movement is relative to the view.
  update(dt, input, cameraYaw, world) {
    if (this.inCar) return;
    const throttle = input.throttleAxis();
    const steer = input.steerAxis();
    // Forward is away from the camera; right is the camera's right.
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let mx = fx * throttle + rx * steer;
    let mz = fz * throttle + rz * steer;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const targetX = mx * speed;
    const targetZ = mz * speed;
    const k = 1 - Math.exp(-PLAYER.accel * dt / speed);
    this.vel.x += (targetX - this.vel.x) * k;
    this.vel.z += (targetZ - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveCircle(this.pos, PLAYER.radius);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (moving > 0.4) {
      const face = Math.atan2(this.vel.x, this.vel.z);
      this.heading = angleLerp(this.heading, face, Math.min(1, PLAYER.turnRate * dt));
      this.walkCycle += dt * moving * 1.35;
    }
    // Swing the limbs with the walk cycle; idle relaxes to neutral.
    const swing = Math.min(1, moving / PLAYER.walkSpeed) * 0.6;
    const s = Math.sin(this.walkCycle);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.armL.rotation.x = -s * swing * 0.8;
    this.armR.rotation.x = s * swing * 0.8;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  enterCar(car) {
    this.inCar = true;
    this.car = car;
    this.group.visible = false;
    this.vel.set(0, 0, 0);
  }

  // Step out beside the car, on the driver's side.
  exitCar(world) {
    if (!this.car) return;
    const car = this.car;
    this.inCar = false;
    this.car = null;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.pos.set(car.pos.x + sideX * 1.8, 0, car.pos.z + sideZ * 1.8);
    world.resolveCircle(this.pos, PLAYER.radius);
    this.heading = car.heading;
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  // Where the camera should look while on foot.
  get focus() {
    return this.pos;
  }
}

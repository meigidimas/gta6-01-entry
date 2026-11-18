// Neon Bay Heat — Danny Cole on foot.
// A low-poly figure with a swinging walk cycle, camera-relative movement,
// and the handoff into and out of a car. Danny's forward is
// (sin(heading), 0, cos(heading)); the mesh turns to match.

import * as THREE from 'three';
import { PALETTE, PLAYER } from './config.js';

export class Player {
  constructor(scene, spawn) {
    this.position = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.heading = Math.PI;
    this.speed = 0;
    this.walkPhase = 0;
    this.inCar = false;
    this.car = null;

    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const shirt = new THREE.MeshLambertMaterial({ color: PALETTE.playerShirt });
    const pants = new THREE.MeshLambertMaterial({ color: PALETTE.playerPants });
    const hair = new THREE.MeshLambertMaterial({ color: 0x2a1c12 });

    this.group = new THREE.Group();

    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
    this.torso.position.y = 1.12;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skin);
    this.head.position.y = 1.72;
    this.head.castShadow = true;
    this.group.add(this.head);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.42), hair);
    cap.position.y = 1.95;
    this.group.add(cap);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.28), pants);
    this.legL.geometry.translate(0, -0.39, 0);
    this.legL.position.set(-0.16, 0.78, 0);
    this.legL.castShadow = true;
    this.group.add(this.legL);

    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.28), pants);
    this.legR.geometry.translate(0, -0.39, 0);
    this.legR.position.set(0.16, 0.78, 0);
    this.legR.castShadow = true;
    this.group.add(this.legR);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.22), shirt);
    this.armL.geometry.translate(0, -0.33, 0);
    this.armL.position.set(-0.42, 1.44, 0);
    this.group.add(this.armL);

    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.22), shirt);
    this.armR.geometry.translate(0, -0.33, 0);
    this.armR.position.set(0.42, 1.44, 0);
    this.group.add(this.armR);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    scene.add(this.group);
  }

  focusPoint() {
    return new THREE.Vector3(this.position.x, this.position.y + 1.2, this.position.z);
  }

  update(dt, input, cameraYaw, world) {
    if (this.inCar) return;
    // Camera-relative movement: W walks away from the camera.
    const forward = input.axisY; // +1 forward, -1 back
    const strafe = input.axisX; // +1 right, -1 left
    const moving = Math.abs(forward) > 0.01 || Math.abs(strafe) > 0.01;
    const targetSpeed = moving
      ? (input.running ? PLAYER.runSpeed : PLAYER.walkSpeed)
      : 0;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-10 * dt));

    if (moving) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // Camera looks along -forward of its yaw, so forward is (-sin, -cos).
      const mx = -sin * forward + cos * strafe;
      const mz = -cos * forward - sin * strafe;
      const len = Math.hypot(mx, mz) || 1;
      const dirX = mx / len;
      const dirZ = mz / len;
      const targetHeading = Math.atan2(dirX, dirZ);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * (1 - Math.exp(-PLAYER.turnRate * dt));

      this.position.x += dirX * this.speed * dt;
      this.position.z += dirZ * this.speed * dt;
      world.resolveCircle(this.position, PLAYER.radius);
      this.walkPhase += (this.speed * dt) / PLAYER.stepLength;
    }

    // Walk cycle: legs and arms swing in opposition, easing to still.
    const swing = Math.min(1, this.speed / PLAYER.walkSpeed) * 0.55;
    const s = Math.sin(this.walkPhase * Math.PI * 2) * swing;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.8;
    this.armR.rotation.x = s * 0.8;
    // Slight bob while moving.
    this.torso.position.y = 1.12 + Math.abs(Math.cos(this.walkPhase * Math.PI * 2)) * 0.04 * swing;
    this.head.position.y = 1.72 + Math.abs(Math.cos(this.walkPhase * Math.PI * 2)) * 0.04 * swing;

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  enterCar(car) {
    this.inCar = true;
    this.car = car;
    this.group.visible = false;
    this.speed = 0;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    // Step out on the car's left side, clear of its body.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.position.set(
      car.position.x + sideX * 2.6,
      0,
      car.position.z + sideZ * 2.6,
    );
    this.heading = car.heading;
    this.inCar = false;
    this.car = null;
    this.group.visible = true;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  teleport(x, z, heading) {
    this.position.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }
}

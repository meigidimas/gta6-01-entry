// Neon Bay Heat — boot, the fixed-timestep loop, screens and saving.
// This file wires the systems together: the world, the player, the cars,
// the missions, the HUD and the sound. It owns the game state machine
// (title / playing / paused / game over), the wanted level, stealing,
// the save in localStorage, and the ?shot= staging hook for screenshots.

import * as THREE from 'three';
import { GAME, CITY, PLAYER, WANTED } from './config.js';
import { makeRng } from './random.js';
import { World } from './world.js';
import { createRenderer, createScene, addLights, CameraRig, createMarker } from './render.js';
import { Player } from './player.js';
import { Traffic, createParkedCars, nearestParkedCar, separateCars } from './vehicles.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { MissionManager } from './missions.js';
import { shotFromQuery, seedFromQuery, applyShotScene } from './shots.js';

class Game {
  constructor() {
    this.seed = seedFromQuery(GAME.defaultSeed);
    this.rng = makeRng(this.seed);
    this.canvas = document.getElementById('game');
    this.state = 'title'; // 'title' | 'playing' | 'paused' | 'gameover'
    this.time = 0;
    this.cash = 0;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.autopilot = false;
    this.overtaking = false; // autopilot is passing slow traffic
    // The autopilot's loop: road intersections it drives between.
    this.autoRoute = [
      { x: 0, z: 100 }, { x: 100, z: 100 }, { x: 100, z: -100 },
      { x: -100, z: -100 }, { x: -100, z: 100 },
    ];
    this.autoWp = 0;
    this.marker = null;
    this.markerTarget = null;
    this.saveTimer = 0;
    this.shot = shotFromQuery();

    this.renderer = createRenderer(this.canvas);
    this.scene = createScene();
    this.world = new World(this.scene, this.rng);
    addLights(this.scene, this.world.edge);
    this.cameraRig = new CameraRig();
    this.player = new Player(this.scene, this.world.spawn.x, this.world.spawn.z);
    this.parkedCars = createParkedCars(this.scene, this.world, this.rng.fork(), 12);
    this.traffic = new Traffic(this.scene, this.world, this.rng.fork(), 10);
    this.input = new Input(this.canvas);
    this.hud = new HUD(this.world);
    this.audio = new AudioEngine();
    this.missions = new MissionManager(this.world.dropOff);

    this.loadSave();
    this.bindScreens();
    this.bindWindow();
    this.cameraRig.snapTo(this.playerFocus(), this.playerHeading());

    if (this.shot) applyShotScene(this, this.shot);
    this.lastFrame = performance.now();
    this.accumulator = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // --- screens ------------------------------------------------------------

  bindScreens() {
    this.titleEl = document.getElementById('title-screen');
    this.pauseEl = document.getElementById('pause-screen');
    this.overEl = document.getElementById('gameover-screen');
    this.hudEl = document.getElementById('hud');
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());
    document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
    document.getElementById('restart-btn').addEventListener('click', () => this.resetRun());
    document.getElementById('retry-btn').addEventListener('click', () => this.resetRun());
    document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
    const save = this.loadSaveData();
    if (save && (save.cash > 0 || (save.missions && save.missions.completed.length > 0))) {
      document.getElementById('start-btn').textContent = 'CONTINUE';
      document.getElementById('save-note').textContent =
        `Save found — $${save.cash} in the pocket, ${save.missions.completed.length} job(s) done.`;
    }
  }

  bindWindow() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.cameraRig.resize();
    });
    // Any gesture unlocks the synthesised audio.
    window.addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    window.addEventListener('keydown', () => this.audio.unlock());
  }

  showTitle(staged) {
    this.state = 'title';
    this.titleEl.classList.remove('hidden');
    this.pauseEl.classList.add('hidden');
    this.overEl.classList.add('hidden');
    this.hudEl.classList.add('hidden');
    if (staged) this.titleEl.classList.add('staged');
  }

  startGame() {
    this.audio.unlock();
    this.audio.blip(660);
    this.state = 'playing';
    this.titleEl.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    this.overEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    if (!this.missions.started) {
      this.missions.start();
      this.hud.showToast(this.missions.current.intro, 5200);
    }
    this.updateMarker();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseEl.classList.remove('hidden');
    this.audio.setEngine(0, false);
    this.saveGame();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.audio.blip(660);
    this.state = 'playing';
    this.pauseEl.classList.add('hidden');
  }

  showGameOver(reason) {
    this.state = 'gameover';
    this.audio.setEngine(0, false);
    this.audio.thud();
    document.getElementById('gameover-reason').textContent = reason;
    this.titleEl.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    this.overEl.classList.remove('hidden');
    this.saveGame();
  }

  // Back on your feet at the spawn, car repaired, heat off. Cash and
  // finished jobs survive — only the current run resets.
  resetRun() {
    this.audio.blip(660);
    if (this.player.inCar) {
      this.player.car.state = 'parked';
      this.player.car.speed = 0;
      this.player.exitCar(this.world);
    }
    this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
    this.player.heading = Math.PI;
    this.player.group.position.copy(this.player.pos);
    for (const car of this.parkedCars) car.health = 100;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.autopilot = false;
    this.overtaking = false;
    this.autoWp = 0;
    this.cameraRig.snapTo(this.playerFocus(), this.playerHeading());
    this.startGame();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    document.getElementById('mute-btn').textContent = this.audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  // --- stealing -----------------------------------------------------------

  stealCar(car) {
    car.state = 'driven';
    car.speed = 0;
    this.player.enterCar(car);
    this.audio.blip(880, 0.12, 0.25);
    if (this.wanted < WANTED.maxStars) {
      this.wanted = Math.min(WANTED.maxStars, this.wanted + WANTED.stealStars);
      this.wantedTimer = 0;
      this.hud.showToast('STOLEN! The heat is on — 1 star wanted.', 3000);
    }
    this.cameraRig.mode = 'drive';
    this.cameraRig.snapTo(this.playerFocus(), this.playerHeading());
  }

  exitCar() {
    const car = this.player.car;
    car.state = 'parked';
    car.speed = 0;
    this.player.exitCar(this.world);
    this.audio.blip(520, 0.1, 0.2);
    this.cameraRig.mode = 'foot';
    this.cameraRig.snapTo(this.playerFocus(), this.playerHeading());
  }

  // --- mission marker -----------------------------------------------------

  updateMarker() {
    const target = this.missions.objectivePosition();
    const key = target ? `${target.x},${target.z}` : 'none';
    if (key === this.markerTarget) return;
    this.markerTarget = key;
    if (this.marker) {
      this.marker.dispose();
      this.marker = null;
    }
    if (target) this.marker = createMarker(this.scene, target.x, target.z);
  }

  // --- save / load --------------------------------------------------------

  loadSaveData() {
    try {
      const raw = window.localStorage.getItem(GAME.saveKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  loadSave() {
    if (this.shot) return; // staged scenes always start clean
    const save = this.loadSaveData();
    if (!save) return;
    this.cash = save.cash || 0;
    this.wanted = 0; // the heat cools off between sessions
    if (save.missions) this.missions.restore(save.missions);
    if (save.player) {
      this.player.pos.set(save.player.x, 0, save.player.z);
      this.player.heading = save.player.heading || Math.PI;
      this.player.group.position.copy(this.player.pos);
    }
  }

  saveGame() {
    if (this.shot) return; // never let a staged scene overwrite a save
    try {
      window.localStorage.setItem(GAME.saveKey, JSON.stringify({
        cash: this.cash,
        missions: this.missions.serialize(),
        player: {
          x: this.player.pos.x,
          z: this.player.pos.z,
          heading: this.playerHeading(),
        },
        seed: this.seed,
        savedAt: Date.now(),
      }));
    } catch {
      // Private mode or full storage: the game plays on without saving.
    }
  }

  // --- helpers ------------------------------------------------------------

  playerFocus() {
    return this.player.inCar ? this.player.car.pos : this.player.pos;
  }

  playerHeading() {
    return this.player.inCar ? this.player.car.heading : this.player.heading;
  }

  // --- the loop -----------------------------------------------------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= GAME.fixedStep && steps < 5) {
      this.step(GAME.fixedStep);
      this.accumulator -= GAME.fixedStep;
      steps += 1;
    }
    if (steps === 5) this.accumulator = 0; // drop time rather than spiral
    this.renderFrame(dt);
    this.input.endFrame();
  }

  step(dt) {
    this.time += dt;
    // Traffic always rolls, even behind the title screen.
    const driven = this.player.inCar ? this.player.car : null;
    this.traffic.update(dt, this.world, driven);
    if (this.marker) this.marker.update(this.time);
    if (this.state === 'title') return;
    if (this.state !== 'playing') return;

    // Wanted stars cool off after a quiet stretch.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      if (this.wantedTimer >= WANTED.decaySeconds) {
        this.wanted -= 1;
        this.wantedTimer = 0;
        if (this.wanted === 0) this.hud.showToast('You lost the heat. For now.', 2400);
      }
    }

    if (this.player.inCar) {
      const car = this.player.car;
      let throttle = this.input.throttleAxis();
      let steer = this.input.steerAxis();
      if (this.autopilot) {
        // Screenshot autopilot: follow a loop of road intersections so
        // the shot always shows the car in the city, never in a field.
        // It eases off for the corners, and when traffic ahead is slow
        // it swings into the next lane and passes instead of queuing.
        // A human input at any time hands the wheel straight back.
        const wp = this.autoRoute[this.autoWp];
        const fwdX = Math.sin(car.heading);
        const fwdZ = Math.cos(car.heading);
        const nearCar = (minAhead, maxAhead, maxSide) =>
          [...this.traffic.cars, ...this.parkedCars].some((other) => {
            if (other === car) return false;
            const ox = other.pos.x - car.pos.x;
            const oz = other.pos.z - car.pos.z;
            const forward = ox * fwdX + oz * fwdZ;
            const side = Math.abs(ox * fwdZ - oz * fwdX);
            return forward > minAhead && forward < maxAhead && side < maxSide;
          });
        if (!this.overtaking && nearCar(0, 12, 3)) this.overtaking = true;
        if (this.overtaking && !nearCar(-7, 12, 3.6)) this.overtaking = false;
        let aimX = wp.x;
        let aimZ = wp.z;
        if (this.overtaking) {
          // Aim at a point a car-length ahead in the left lane — but
          // only while running straight along a road, and keep the
          // passing line on the asphalt, never through the buildings.
          const straight = Math.abs(Math.sin(car.heading)) < 0.25
            || Math.abs(Math.cos(car.heading)) < 0.25;
          const wpDist = Math.hypot(wp.x - car.pos.x, wp.z - car.pos.z);
          if (straight && wpDist > 30) {
            const leftX = fwdZ;
            const leftZ = -fwdX;
            aimX = car.pos.x + fwdX * 16 + leftX * 4.8;
            aimZ = car.pos.z + fwdZ * 16 + leftZ * 4.8;
            if (Math.abs(Math.sin(car.heading)) < 0.25) {
              const roadX = this.world.nearestRoadPoint(car.pos.x, car.pos.z).x;
              aimX = THREE.MathUtils.clamp(aimX, roadX - 4.5, roadX + 4.5);
            } else {
              const roadZ = this.world.nearestRoadPoint(car.pos.x, car.pos.z).z;
              aimZ = THREE.MathUtils.clamp(aimZ, roadZ - 4.5, roadZ + 4.5);
            }
          } else {
            this.overtaking = false; // mid-turn: fall back to following
          }
        }
        const dx = aimX - car.pos.x;
        const dz = aimZ - car.pos.z;
        const dist = Math.hypot(dx, dz);
        if (!this.overtaking && dist < 12) {
          this.autoWp = (this.autoWp + 1) % this.autoRoute.length;
        } else {
          const desired = Math.atan2(dx, dz);
          let diff = desired - car.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          steer = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
          // Slow for the corner; full throttle while passing.
          throttle = this.overtaking ? 1 : (dist < 35 ? 0.45 : 1);
          if (!this.overtaking && nearCar(0, 9, 3)) throttle = Math.min(throttle, 0.35);
        }
        if (this.input.throttleAxis() !== 0 || this.input.steerAxis() !== 0) {
          this.autopilot = false; // a human took the wheel
        }
      }
      const event = car.drive(dt, throttle, steer, this.world);
      if (event === 'crash') {
        this.audio.thud();
        this.hud.showToast(`Crash! Car health ${Math.round(car.health)}%.`, 1800);
        if (car.health <= 0) {
          this.showGameOver('Your ride is wrecked — Danny walks away, but the job is blown.');
          return;
        }
      }
      separateCars([...this.parkedCars, ...this.traffic.cars]);
      if (this.input.wasPressed('KeyE')) this.exitCar();
    } else {
      this.player.update(dt, this.input, this.cameraRig.yaw, this.world);
      if (this.input.wasPressed('KeyE')) {
        const car = nearestParkedCar(
          this.parkedCars, this.player.pos.x, this.player.pos.z, PLAYER.enterCarRange,
        );
        if (car) this.stealCar(car);
      }
    }

    // Missions read the world and pay out.
    const events = this.missions.update({
      inCar: this.player.inCar,
      playerX: this.playerFocus().x,
      playerZ: this.playerFocus().z,
      dropOff: this.world.dropOff,
    });
    for (const event of events) {
      if (event.type === 'step') {
        this.audio.success();
        this.hud.showToast(`Nice wheels. Now: ${event.step.text}`, 3600);
      } else if (event.type === 'complete') {
        this.cash += event.reward;
        this.audio.success();
        this.hud.showToast(`${event.mission.title} complete! Rosa pays $${event.reward}.`, 4200);
        this.saveGame();
      }
    }
    this.updateMarker();

    // Engine note follows the driven car; silence on foot.
    const speedNorm = this.player.inCar
      ? Math.min(1, Math.abs(this.player.car.speed) / 34)
      : 0;
    this.audio.setEngine(speedNorm, this.player.inCar);

    // Autosave every 15 seconds of play.
    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.saveGame();
    }

    // Pause, mute, restart.
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP')) this.pauseGame();
    if (this.input.wasPressed('KeyM')) this.toggleMute();
  }

  renderFrame(dt) {
    const mouse = this.input.consumeMouseDelta();
    if (this.state === 'title') {
      // Slow cinematic orbit over the city behind the title screen.
      // High enough to clear even the tallest tower (88 m).
      const angle = this.time * 0.045;
      const radius = 150;
      this.cameraRig.camera.position.set(
        Math.cos(angle) * radius,
        96,
        Math.sin(angle) * radius,
      );
      this.cameraRig.camera.lookAt(20, 8, 0);
    } else {
      const mode = this.player.inCar ? 'drive' : 'foot';
      const speedNorm = this.player.inCar
        ? Math.min(1, Math.abs(this.player.car.speed) / 34)
        : 0;
      this.cameraRig.update(dt, this.playerFocus(), this.playerHeading(), mode, mouse, speedNorm);
    }
    // Enter starts the game from the title; Esc resumes from pause.
    if (this.state === 'title' && (this.input.wasPressed('Enter') || this.input.wasPressed('Space'))) {
      this.startGame();
    } else if (this.state === 'paused' && (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP'))) {
      this.resumeGame();
    }
    // HUD refresh.
    if (this.state === 'playing' || this.state === 'paused') {
      this.hud.setStars(this.wanted);
      this.hud.setCash(this.cash);
      this.hud.setObjective(this.missions.objectiveText());
      const inCar = this.player.inCar;
      this.hud.setSpeed(inCar ? this.player.car.speedKmh : 0, inCar);
      this.hud.setHealth(inCar ? this.player.car.health : 100, inCar);
      const near = !inCar && nearestParkedCar(
        this.parkedCars, this.player.pos.x, this.player.pos.z, PLAYER.enterCarRange,
      );
      this.hud.setHint(
        inCar ? 'W/S drive · A/D steer · E leave car · Esc pause'
          : near ? 'Press E to steal the car'
            : 'WASD move · Shift run · drag mouse to look · E near a car to steal it',
      );
      this.hud.drawMinimap({
        x: this.playerFocus().x,
        z: this.playerFocus().z,
        heading: this.playerHeading(),
        inCar,
        objective: this.missions.objectivePosition(),
        traffic: this.traffic.cars,
      }, this.time);
    }
    this.renderer.render(this.scene, this.cameraRig.camera);
  }
}

try {
  const game = new Game();
  window.__neonBayHeat = game; // handy for later phases and debugging
} catch (error) {
  // No WebGL (or another boot failure): say so instead of a black page.
  const note = document.getElementById('webgl-error');
  if (note) {
    note.classList.remove('hidden');
    note.textContent = `Neon Bay Heat could not start here: ${error.message}. Try desktop Chrome with WebGL enabled.`;
  }
  throw error;
}

// Neon Bay Heat — the game itself.
// Danny Cole, wheelman of Neon Bay: explore a procedural coastal city on
// foot and by car, steal cars, dodge the heat, and run missions. Fixed
// 1/60s timestep, a title/playing/paused/game-over state machine, wanted
// decay, localStorage saves, and a road-route autopilot with overtaking.

import * as THREE from 'three';
import { CAR, GAME, MISSION_ONE, PALETTE, PLAYER, WANTED } from './config.js';
import { createRng, seedFromString } from './random.js';
import { World } from './world.js';
import { CameraRig, ObjectiveMarker, createScene } from './render.js';
import { Player } from './player.js';
import { Traffic, createParkedCar, nearestParkedCar } from './vehicles.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { MissionManager } from './missions.js';
import { parseShotParams, stageShot } from './shots.js';

const BASE_SEED = seedFromString('neon-bay-heat');

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.shot = parseShotParams();
    const seed = this.shot ? this.shot.seed : BASE_SEED;
    this.rng = createRng(seed);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const { scene, camera } = createScene();
    this.scene = scene;
    this.camera = camera;
    this.world = new World(scene, this.rng);
    this.player = new Player(scene, this.world.spawn);
    this.cameraRig = new CameraRig(camera);
    this.marker = new ObjectiveMarker(scene);

    this.parked = this.world.parkingSpots.map((spot) =>
      createParkedCar(scene, spot, this.rng.pick(PALETTE.carPaints)),
    );
    this.traffic = new Traffic(scene, this.world, this.rng.fork());

    this.input = new Input(canvas);
    this.hud = new HUD();
    this.hud.buildStaticMap(this.world);
    this.audio = new AudioEngine();
    this.missions = new MissionManager();

    this.state = 'title';
    this.cash = 0;
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.playerCar = null;
    this.stolenCars = new Set();
    this.autopilot = null; // { waypoints, index, target }
    this.autosaveTimer = 0;
    this.lastObjective = '';
    this.titleTime = 0;

    this.accumulator = 0;
    this.lastTime = performance.now();
    this.rafId = 0;

    this._wireButtons();
    this._wireResize();
    this._applySaveToTitle();
    this.hud.showScreen('title');
    this.hud.setWanted(0);
    this.hud.setCash(0);
    this.hud.setHealth(this.health, PLAYER.maxHealth);

    window.__neonBay = { game: this, version: GAME.version };

    if (this.shot) {
      // Screenshot staging runs after the first frame so the world exists.
      requestAnimationFrame(() => stageShot(this, this.shot.shot));
    }
  }

  _wireButtons() {
    const play = document.getElementById('play-btn');
    if (play) play.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.startMusic();
      this.startGame();
    });
    const fresh = document.getElementById('newgame-btn');
    if (fresh) fresh.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.startMusic();
      this.clearSave();
      this.startGame();
    });
    const resume = document.getElementById('resume-btn');
    if (resume) resume.addEventListener('click', () => this.resume());
    const restart = document.getElementById('restart-btn');
    if (restart) restart.addEventListener('click', () => this.restartAfterWasted());
    const quit = document.getElementById('quit-btn');
    if (quit) quit.addEventListener('click', () => this.toTitle());
    const mute = document.getElementById('mute-btn');
    if (mute) mute.addEventListener('click', () => this.toggleMute());
  }

  _wireResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.save();
    });
  }

  _applySaveToTitle() {
    const play = document.getElementById('play-btn');
    if (play && this._readSave()) play.textContent = 'Continue';
  }

  start() {
    const loop = (now) => {
      this.rafId = requestAnimationFrame(loop);
      let dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (dt > GAME.maxFrameDt) dt = GAME.maxFrameDt;
      this.accumulator += dt;
      while (this.accumulator >= GAME.fixedDt) {
        this.update(GAME.fixedDt);
        this.accumulator -= GAME.fixedDt;
      }
      this.render();
      this.input.endFrame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // ----- state changes -----

  startGame() {
    const save = this._readSave();
    if (save) this._applySave(save);
    this.state = 'playing';
    this.hud.showScreen('playing');
    this.hud.toast(`Welcome back to Neon Bay, Danny.`, 2800);
    this.cameraRig.snapTo(
      this.player.inCar ? this.playerCar.position : this.player.position,
      this.player.heading,
      this.player.inCar ? 'car' : 'foot',
    );
    this.input.requestPointerLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showScreen('paused');
    this.input.releasePointerLock();
    this.audio.setEngine(0, false);
    this.save();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showScreen('playing');
    this.input.requestPointerLock();
  }

  toTitle() {
    this.state = 'title';
    this.titleTime = 0;
    this.hud.showScreen('title');
    this.marker.hide();
    this.audio.setEngine(0, false);
    this.input.releasePointerLock();
    this._applySaveToTitle();
  }

  gameOver() {
    this.state = 'gameover';
    this.hud.showScreen('gameover');
    this.audio.setEngine(0, false);
    this.audio.stopMusic();
    this.input.releasePointerLock();
    this.save();
  }

  restartAfterWasted() {
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.wantedTimer = 0;
    if (this.player.inCar) {
      this.player.exitCar();
      this.playerCar = null;
    }
    this.player.teleport(this.world.spawn.x, this.world.spawn.z, Math.PI);
    this.audio.ensure();
    this.audio.startMusic();
    this.state = 'playing';
    this.hud.showScreen('playing');
    this.cameraRig.snapTo(this.player.position, this.player.heading, 'foot');
  }

  toggleMute() {
    this.audio.ensure();
    this.audio.setMuted(!this.audio.muted);
    this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on', 1500);
  }

  // ----- screenshot staging -----

  stagePlayShot() {
    this.state = 'playing';
    this.hud.showScreen('playing');
    // Danny in a yellow car, one wanted star, autopilot to the marina.
    let car = nearestParkedCar(this.player.position, this.parked, 400);
    if (!car) return;
    car.setPaint(0xf2c230);
    // No other yellow cars in the shot: repaint any parked twin so the
    // hero car is unmistakably Danny's.
    for (const other of this.parked) {
      if (other !== car && other.paint === 0xf2c230) other.setPaint(0x2b6fd3);
    }
    car.parked = false;
    this.stolenCars.add(car);
    this.player.enterCar(car);
    this.playerCar = car;
    // Stage the car at the far north end of the coastal road, already
    // rolling toward the marina 245 m away: whatever moment the screenshot
    // catches, Danny is driving through the city, not sitting at the kerb
    // where he stole the car — and the route is long enough that the
    // autopilot cannot finish it before the shutter fires.
    car.position.set(152.4, 0, -120);
    car.heading = 0;
    car.speed = 11;
    car.group.position.copy(car.position);
    car.group.rotation.y = 0;
    this.player.position.copy(car.position);
    this.player.heading = 0;
    this.wanted = 1;
    this.wantedTimer = 0;
    this.missions.currentId = MISSION_ONE.id;
    this.missions.stepIndex = 1; // already has the car: drive to the marina
    this.setAutopilot(this.world.marina);
    this.cameraRig.snapTo(car.position, car.heading, 'car');
  }

  stageEndShot() {
    this.health = 0;
    this.gameOver();
    this.cameraRig.snapTo(this.player.position, this.player.heading, 'foot');
  }

  // ----- autopilot -----

  setAutopilot(target) {
    const from = this.playerCar ? this.playerCar.position : this.player.position;
    const start = this.world.nearestRoadPoint(from.x, from.z);
    const end = this.world.nearestRoadPoint(target.x, target.z);
    const waypoints = [
      start,
      { x: end.x, z: start.z },
      end,
      { x: target.x, z: target.z },
    ];
    this.autopilot = { waypoints, index: 0, target };
  }

  clearAutopilot() {
    this.autopilot = null;
  }

  _updateAutopilot(dt) {
    const car = this.playerCar;
    const ap = this.autopilot;
    if (!car || !ap) return;
    const wp = ap.waypoints[ap.index];
    if (!wp) {
      this.clearAutopilot();
      return;
    }
    // Lane offset: keep to the right side of the road.
    const leg = ap.waypoints[Math.min(ap.index + 1, ap.waypoints.length - 1)];
    const alongX = Math.abs(leg.x - wp.x) > Math.abs(leg.z - wp.z);
    let tx = wp.x;
    let tz = wp.z;
    if (alongX) tz += 2.4;
    else tx += 2.4;

    // Lane-aware overtake: a slow car ahead shifts the aim point left.
    // The shift is small (3.0 m) so the pass stays on the asphalt: from the
    // 2.4 m lane offset it puts the car just left of centre, never onto
    // the kerb.
    const f = car.forward();
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    for (const t of this.traffic.cars) {
      const dx = t.car.position.x - car.position.x;
      const dz = t.car.position.z - car.position.z;
      const ahead = dx * f.x + dz * f.z;
      const lateral = Math.abs(dx * rx + dz * rz);
      if (ahead > 0 && ahead < 10 && lateral < 2.8) {
        tx -= rx * 3.0;
        tz -= rz * 3.0;
        break;
      }
    }

    const dist = car.driveToward(dt, tx, tz, 13, this.world);
    if (dist < 4.5) {
      ap.index++;
      if (ap.index >= ap.waypoints.length) {
        this.clearAutopilot();
        this.hud.toast('Autopilot arrived.', 2200);
      }
    }
  }

  // ----- per-step update -----

  update(dt) {
    if (this.state === 'title') {
      this.titleTime += dt;
      this.cameraRig.orbit(dt, { x: 0, z: 0 }, 130, 60);
      this.traffic.update(dt, null);
      return;
    }
    if (this.state === 'paused' || this.state === 'gameover') {
      if (this.state === 'gameover') this.traffic.update(dt, null);
      return;
    }

    // Playing.
    if (this.input.pressed('Escape') || this.input.pressed('KeyP')) {
      this.pause();
      return;
    }
    if (this.input.pressed('KeyM')) this.toggleMute();

    this._updatePlayerAndCar(dt);
    this.traffic.update(dt, this.playerCar);
    this._updateWanted(dt);
    this._updateMissions();
    this.marker.update(dt);

    // Camera follows the player, or the car when driving.
    const inCar = this.player.inCar && this.playerCar;
    const target = inCar ? this.playerCar.position : this.player.focusPoint();
    const heading = inCar ? this.playerCar.heading : this.player.heading;
    const speed = inCar ? Math.abs(this.playerCar.speed) : this.player.speed;
    const mouse = this.input.mouseDelta();
    this.cameraRig.update(dt, target, heading, inCar ? 'car' : 'foot', mouse, speed);

    // Engine sound follows the car.
    this.audio.setEngine(inCar ? Math.abs(this.playerCar.speed) / CAR.maxSpeed : 0, inCar);

    // Autosave.
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= GAME.autosaveSeconds) {
      this.autosaveTimer = 0;
      this.save();
    }

    this._updateHud();
  }

  _updatePlayerAndCar(dt) {
    const cameraYaw = this.cameraRig.yaw;
    if (this.player.inCar && this.playerCar) {
      const car = this.playerCar;
      if (this.autopilot) {
        this._updateAutopilot(dt);
        // Any steering input hands control back to the player.
        if (this.input.throttle() !== 0 || this.input.steer() !== 0) {
          this.clearAutopilot();
        }
      } else {
        car.drive(dt, this.input.throttle(), this.input.steer(), this.world);
      }
      if (this.input.pressed('KeyE')) {
        this.clearAutopilot();
        this.player.exitCar();
        this.playerCar.parked = true;
        this.playerCar = null;
        this.audio.blip(520, 0.07);
        this.cameraRig.snapTo(this.player.position, this.player.heading, 'foot');
      }
      // Keep the player's logical position glued to the car.
      this.player.position.copy(car.position);
      this.player.heading = car.heading;
      return;
    }

    this.player.update(dt, this.input, cameraYaw, this.world);
    const near = nearestParkedCar(this.player.position, this.parked, PLAYER.enterRange);
    if (near) {
      this.hud.hint('Press E to steal the car');
      if (this.input.pressed('KeyE')) this._stealCar(near);
    } else {
      this.hud.hint('');
    }
  }

  _stealCar(car) {
    car.parked = false;
    this.player.enterCar(car);
    this.playerCar = car;
    this.cameraRig.snapTo(car.position, car.heading, 'car');
    if (!this.stolenCars.has(car)) {
      this.stolenCars.add(car);
      this.wanted = Math.min(WANTED.maxStars, this.wanted + WANTED.stealStars);
      this.wantedTimer = 0;
      this.hud.toast('Car stolen! The cops noticed — 1 star.', 3000);
      this.audio.blip(660, 0.12);
    } else {
      this.audio.blip(520, 0.07);
    }
  }

  _updateWanted(dt) {
    if (this.wanted <= 0) return;
    this.wantedTimer += dt;
    if (this.wantedTimer >= WANTED.decaySeconds) {
      this.wantedTimer = 0;
      this.wanted--;
      if (this.wanted === 0) this.hud.toast('You lost the heat.', 2500);
    }
  }

  _updateMissions() {
    const ctx = {
      player: this.player,
      world: this.world,
      parked: this.parked,
    };
    const event = this.missions.update(ctx);
    if (event && event.type === 'step') {
      this.hud.toast('Nice — next: drive to the marina.', 3000);
      this.audio.blip(880, 0.1);
    } else if (event && event.type === 'mission') {
      this.cash += event.mission.reward;
      this.hud.toast(MISSION_ONE.complete, 4500);
      this.audio.success();
      this.save();
    }
    const objective = this.missions.objectivePos(ctx);
    if (objective) this.marker.setPosition(objective.x, objective.z);
    else this.marker.hide();
  }

  _updateHud() {
    this.hud.setWanted(this.wanted);
    this.hud.setCash(this.cash);
    this.hud.setSpeed(this.playerCar ? this.playerCar.speedKmh : 0, !!this.playerCar);
    this.hud.setHealth(this.health, PLAYER.maxHealth);
    const text = this.missions.objectiveText();
    if (text !== this.lastObjective) {
      this.lastObjective = text;
      this.hud.setObjective(text);
    }
    const objective = this.missions.objectivePos({
      player: this.player, world: this.world, parked: this.parked,
    });
    this.hud.drawMinimap(
      this.world,
      this.player.position,
      this.player.heading,
      this.traffic.cars.map((t) => t.car),
      objective,
    );
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // ----- saves -----

  save() {
    try {
      const data = {
        version: 1,
        cash: this.cash,
        health: this.health,
        wanted: this.wanted,
        mission: this.missions.save(),
        player: {
          x: this.player.position.x,
          z: this.player.position.z,
          heading: this.player.heading,
        },
        savedAt: Date.now(),
      };
      window.localStorage.setItem(GAME.saveKey, JSON.stringify(data));
    } catch {
      // Storage can be unavailable (private mode); the game plays on.
    }
  }

  _readSave() {
    try {
      const raw = window.localStorage.getItem(GAME.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  _applySave(data) {
    this.cash = data.cash || 0;
    this.health = data.health ?? PLAYER.maxHealth;
    this.wanted = data.wanted || 0;
    this.wantedTimer = 0;
    if (data.mission) this.missions.load(data.mission);
    if (data.player) {
      this.player.teleport(data.player.x, data.player.z, data.player.heading);
    }
  }

  clearSave() {
    try {
      window.localStorage.removeItem(GAME.saveKey);
    } catch {
      // Ignore.
    }
    this.cash = 0;
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.missions = new MissionManager();
    this.player.teleport(this.world.spawn.x, this.world.spawn.z, Math.PI);
  }
}

// Boot: module scripts run after the document parses, so the DOM is ready.
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start();

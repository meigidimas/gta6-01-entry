// Neon Bay Heat — the HUD: wanted stars, cash, speed, health, objective,
// hints, toasts, and a live 2D minimap drawn on a canvas. The static map
// layer (sea, sand, roads, buildings) is painted once to an offscreen
// canvas; each frame only the moving dots are drawn on top.

import { CITY, WANTED } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'wanted', 'cash', 'speed', 'health-fill', 'health-text',
      'objective', 'hint', 'toasts', 'minimap',
      'title-screen', 'pause-screen', 'gameover-screen',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.staticMap = null;
    this.mapSize = 180;
    this.mapTime = 0;
  }

  setWanted(stars) {
    if (!this.el.wanted) return;
    let text = '';
    for (let i = 0; i < WANTED.maxStars; i++) text += i < stars ? '★' : '☆';
    this.el.wanted.textContent = text;
    this.el.wanted.classList.toggle('hot', stars > 0);
  }

  setCash(cash) {
    if (this.el.cash) this.el.cash.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setSpeed(kmh, inCar) {
    if (!this.el.speed) return;
    this.el.speed.textContent = inCar ? `${Math.round(kmh)} km/h` : '';
  }

  setHealth(hp, max) {
    if (this.el['health-fill']) {
      this.el['health-fill'].style.width = `${Math.max(0, (hp / max) * 100)}%`;
    }
    if (this.el['health-text']) {
      this.el['health-text'].textContent = `${Math.ceil(hp)}`;
    }
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text || '';
  }

  hint(text) {
    if (this.el.hint) this.el.hint.textContent = text || '';
  }

  toast(text, ms = 3600) {
    if (!this.el.toasts) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    window.setTimeout(() => {
      div.classList.add('fade');
      window.setTimeout(() => div.remove(), 600);
    }, ms);
  }

  showScreen(name) {
    // name: 'title' | 'playing' | 'paused' | 'gameover'
    for (const [key, id] of [
      ['title', 'title-screen'],
      ['paused', 'pause-screen'],
      ['gameover', 'gameover-screen'],
    ]) {
      if (this.el[id]) this.el[id].classList.toggle('visible', key === name);
    }
    if (this.el.hud) {
      this.el.hud.classList.toggle('visible', name === 'playing' || name === 'paused');
    }
  }

  buildStaticMap(world) {
    if (!this.mapCtx) return;
    const size = this.mapSize;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    const span = CITY.worldLimit * 2;
    const toMap = (x, z) => [
      ((x + CITY.worldLimit) / span) * size,
      ((z + CITY.worldLimit) / span) * size,
    ];
    // Land, then sand and sea on the east edge.
    ctx.fillStyle = '#4c8a3f';
    ctx.fillRect(0, 0, size, size);
    const [sandX] = toMap(CITY.coastX, 0);
    const [seaX] = toMap(CITY.waterX, 0);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(sandX, 0, seaX - sandX, size);
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(seaX, 0, size - seaX, size);
    // Roads.
    ctx.strokeStyle = '#33373d';
    ctx.lineWidth = 3;
    for (const line of world.roads) {
      const [x] = toMap(line, 0);
      const [, z] = toMap(0, line);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(size, z);
      ctx.stroke();
    }
    // Buildings as pale blocks.
    ctx.fillStyle = 'rgba(220, 215, 200, 0.85)';
    for (const b of world.buildings) {
      const [x0, z0] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const [x1, z1] = toMap(b.x + b.w / 2, b.z + b.d / 2);
      ctx.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
    }
    this.staticMap = off;
  }

  drawMinimap(world, playerPos, heading, trafficCars, objective) {
    if (!this.mapCtx || !this.staticMap) return;
    this.mapTime += 1 / 60;
    const ctx = this.mapCtx;
    const size = this.mapSize;
    const span = CITY.worldLimit * 2;
    const toMap = (x, z) => [
      ((x + CITY.worldLimit) / span) * size,
      ((z + CITY.worldLimit) / span) * size,
    ];
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.staticMap, 0, 0);

    // Objective diamond, pulsing.
    if (objective) {
      const [ox, oz] = toMap(objective.x, objective.z);
      const r = 5 + Math.sin(this.mapTime * 4) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(ox, oz - r);
      ctx.lineTo(ox + r, oz);
      ctx.lineTo(ox, oz + r);
      ctx.lineTo(ox - r, oz);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7a5b00';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#ffffff';
    for (const car of trafficCars) {
      const [tx, tz] = toMap(car.position.x, car.position.z);
      ctx.beginPath();
      ctx.arc(tx, tz, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated to the heading.
    const [px, pz] = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI / 2);
    ctx.fillStyle = '#1f8a70';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

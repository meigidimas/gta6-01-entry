// Neon Bay Heat — the DOM heads-up display and the 2D minimap.
// Wanted stars, cash, speed and the current objective are plain DOM;
// the minimap is a small canvas redrawn every frame from the world data:
// roads, the sea, the player arrow, traffic dots and the mission marker.

import { CITY } from './config.js';

export class HUD {
  constructor(world) {
    this.world = world;
    this.starsEl = document.getElementById('wanted-stars');
    this.cashEl = document.getElementById('cash');
    this.speedEl = document.getElementById('speed');
    this.speedWrap = document.getElementById('speed-box');
    this.objectiveEl = document.getElementById('objective-text');
    this.objectiveWrap = document.getElementById('objective-box');
    this.toastEl = document.getElementById('toast');
    this.healthEl = document.getElementById('health-fill');
    this.healthWrap = document.getElementById('health-box');
    this.hintEl = document.getElementById('hint');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = null;
    this.lastStars = -1;
    this.lastCash = -1;
  }

  setStars(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    let text = '';
    for (let i = 0; i < 5; i++) text += i < stars ? '★' : '☆';
    this.starsEl.textContent = text;
    this.starsEl.classList.toggle('hot', stars > 0);
  }

  setCash(cash) {
    if (cash === this.lastCash) return;
    this.lastCash = cash;
    this.cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setSpeed(kmh, inCar) {
    this.speedWrap.style.display = inCar ? 'block' : 'none';
    if (inCar) this.speedEl.textContent = `${Math.round(kmh)}`;
  }

  setHealth(health, inCar) {
    this.healthWrap.style.display = inCar ? 'block' : 'none';
    if (inCar) {
      this.healthEl.style.width = `${Math.max(0, health)}%`;
      this.healthEl.classList.toggle('low', health < 30);
    }
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  setHint(text) {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  showToast(text, ms = 3200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, ms);
  }

  // state: { x, z, heading, inCar, objective: {x, z} | null, traffic }
  drawMinimap(state, time) {
    const ctx = this.mapCtx;
    const size = this.map.width;
    const world = this.world;
    const span = (world.edge + CITY.coastOffset + 40) * 2;
    const toMapX = (x) => ((x + span / 2) / span) * size;
    const toMapY = (z) => ((z + span / 2) / span) * size;

    ctx.clearRect(0, 0, size, size);
    // Sea on the east edge, land everywhere else.
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(0, 0, size, size);
    const seaX = toMapX(world.edge + CITY.coastOffset);
    ctx.fillStyle = '#2a7f9e';
    ctx.fillRect(seaX, 0, size - seaX, size);
    // Roads as pale lines.
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = Math.max(2, (CITY.roadWidth / span) * size);
    for (const x of world.roadXs) {
      ctx.beginPath();
      ctx.moveTo(toMapX(x), 0);
      ctx.lineTo(toMapX(x), size);
      ctx.stroke();
    }
    for (const z of world.roadZs) {
      ctx.beginPath();
      ctx.moveTo(0, toMapY(z));
      ctx.lineTo(size, toMapY(z));
      ctx.stroke();
    }
    // Traffic as small white dots.
    ctx.fillStyle = '#ffffff';
    for (const car of state.traffic) {
      ctx.fillRect(toMapX(car.pos.x) - 1.5, toMapY(car.pos.z) - 1.5, 3, 3);
    }
    // Objective marker: a pulsing yellow diamond.
    if (state.objective) {
      const ox = toMapX(state.objective.x);
      const oy = toMapY(state.objective.z);
      const r = 5 + Math.sin(time * 4) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(ox, oy - r);
      ctx.lineTo(ox + r, oy);
      ctx.lineTo(ox, oy + r);
      ctx.lineTo(ox - r, oy);
      ctx.closePath();
      ctx.fill();
    }
    // Player arrow: a triangle rotated to the heading.
    const px = toMapX(state.x);
    const py = toMapY(state.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading + Math.PI);
    ctx.fillStyle = state.inCar ? '#37d67a' : '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', size / 2 - 4, 12);
  }
}

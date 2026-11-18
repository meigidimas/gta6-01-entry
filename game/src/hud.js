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
    this.prevStars = 0;
    this._trackerText = '';
    this._buildMissionChrome();
    this._listenForMissions();
    // The game loop never calls a tracker hook, so the tracker refreshes
    // itself twice a second from the published game handle. Integration
    // may replace this with a direct updateTracker() call per frame.
    this._trackerTimer = window.setInterval(() => {
      try {
        const game = window.__neonBay ? window.__neonBay.game : null;
        if (game && game.missions) this.updateTracker(game.missions);
      } catch {
        // The tracker is cosmetic; a stale read must never break the HUD.
      }
    }, 500);
  }

  _buildMissionChrome() {
    const hud = this.el.hud;
    if (!hud) return;
    // Mission tracker: sits under the wanted/cash panel.
    const tracker = document.createElement('div');
    tracker.id = 'mission-tracker';
    tracker.style.cssText = 'position:absolute;top:108px;left:14px;max-width:280px;'
      + 'background:rgba(8,12,18,0.55);border-radius:10px;padding:9px 13px;'
      + 'backdrop-filter:blur(2px);display:none;';
    const name = document.createElement('div');
    name.id = 'mission-tracker-name';
    name.style.cssText = 'font-size:13px;font-weight:800;letter-spacing:1px;color:#ffd23f;';
    const clock = document.createElement('div');
    clock.id = 'mission-tracker-clock';
    clock.style.cssText = 'font-size:20px;font-weight:800;margin-top:2px;color:#f2f2f2;';
    tracker.appendChild(name);
    tracker.appendChild(clock);
    hud.appendChild(tracker);
    this.el['mission-tracker'] = tracker;
    this.el['mission-tracker-name'] = name;
    this.el['mission-tracker-clock'] = clock;

    // Mission-complete banner, centre screen.
    const banner = document.createElement('div');
    banner.id = 'mission-banner';
    banner.style.cssText = 'position:absolute;top:26%;left:50%;transform:translateX(-50%);'
      + 'text-align:center;display:none;pointer-events:none;';
    const title = document.createElement('div');
    title.id = 'mission-banner-title';
    title.style.cssText = 'font-size:44px;font-weight:900;letter-spacing:3px;color:#ffd23f;'
      + 'text-shadow:0 0 28px rgba(255,210,63,0.55),0 2px 8px rgba(0,0,0,0.8);';
    title.textContent = 'MISSION COMPLETE';
    const detail = document.createElement('div');
    detail.id = 'mission-banner-detail';
    detail.style.cssText = 'font-size:20px;font-weight:700;margin-top:8px;color:#7be495;'
      + 'text-shadow:0 2px 8px rgba(0,0,0,0.8);';
    banner.appendChild(title);
    banner.appendChild(detail);
    hud.appendChild(banner);
    this.el['mission-banner'] = banner;
    this.el['mission-banner-detail'] = detail;

    // Wanted flash: a red vignette that pulses when the heat rises.
    const flash = document.createElement('div');
    flash.id = 'wanted-flash';
    flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;'
      + 'transition:opacity 0.7s ease-out;'
      + 'background:radial-gradient(ellipse at center, transparent 52%, rgba(255,42,32,0.55) 100%);';
    hud.appendChild(flash);
    this.el['wanted-flash'] = flash;
  }

  _listenForMissions() {
    window.addEventListener('neon-bay:mission', (event) => {
      const detail = event.detail || {};
      const mission = detail.mission;
      if (!mission) return;
      if (detail.type === 'mission') {
        this.showMissionBanner(mission.name, mission.reward);
      } else if (detail.type === 'fail') {
        this.toast(`Out of time — ${mission.name} resets. Try again!`, 4200);
      } else if (detail.type === 'start') {
        this.toast(`New mission: ${mission.name} — $${mission.reward}`, 4200);
      } else if (detail.type === 'ram') {
        this.toast(`Ram landed! ${detail.hits} / ${detail.total} hits`, 1800);
      }
    });
  }

  // Refresh the tracker panel from a MissionManager. Called on the
  // tracker's own interval; the game loop may call it directly instead.
  updateTracker(missions) {
    const tracker = this.el['mission-tracker'];
    if (!tracker || !missions) return;
    const current = missions.current;
    if (!current) {
      tracker.style.display = 'none';
      this._trackerText = '';
      return;
    }
    const remaining = typeof missions.timeRemaining === 'function'
      ? missions.timeRemaining()
      : null;
    const clockText = remaining === null ? '' : this._formatClock(remaining);
    const key = `${current.id}|${clockText}`;
    if (key === this._trackerText) return;
    this._trackerText = key;
    tracker.style.display = 'block';
    const number = missions.missionNumber || 0;
    const total = missions.totalMissions || 0;
    // Timed missions spend their second line on the clock, so the reward
    // rides on the name line instead and stays visible either way.
    const rewardSuffix = remaining === null ? '' : ` · $${current.reward}`;
    this.el['mission-tracker-name'].textContent = total
      ? `MISSION ${number}/${total} — ${current.name.toUpperCase()}${rewardSuffix}`
      : `${current.name.toUpperCase()}${rewardSuffix}`;
    const clockEl = this.el['mission-tracker-clock'];
    if (remaining === null) {
      clockEl.textContent = `$${current.reward} on completion`;
      clockEl.style.color = '#7be495';
      clockEl.style.fontSize = '15px';
    } else {
      clockEl.textContent = `⏱ ${clockText} left`;
      clockEl.style.color = remaining < 30 ? '#ff5a4e' : '#f2f2f2';
      clockEl.style.fontSize = '20px';
    }
  }

  _formatClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  showMissionBanner(name, reward) {
    const banner = this.el['mission-banner'];
    if (!banner) return;
    this.el['mission-banner-detail'].textContent = `${name} — +$${reward}`;
    banner.style.display = 'block';
    if (this._bannerTimer) window.clearTimeout(this._bannerTimer);
    this._bannerTimer = window.setTimeout(() => {
      banner.style.display = 'none';
    }, 4500);
  }

  flashWanted() {
    const flash = this.el['wanted-flash'];
    if (!flash) return;
    flash.style.transition = 'none';
    flash.style.opacity = '1';
    // Force the style to land before the fade-out transition is restored.
    void flash.offsetWidth;
    flash.style.transition = 'opacity 0.7s ease-out';
    flash.style.opacity = '0';
  }

  setWanted(stars) {
    if (!this.el.wanted) return;
    let text = '';
    for (let i = 0; i < WANTED.maxStars; i++) text += i < stars ? '★' : '☆';
    this.el.wanted.textContent = text;
    this.el.wanted.classList.toggle('hot', stars > 0);
    // The game loop calls this every frame, so a rise is detected here
    // with no extra wiring: toast plus a red flash at the screen edges.
    if (stars > this.prevStars && stars > 0) {
      this.toast(
        stars === 1
          ? '1 star — lay low and the heat fades.'
          : `Wanted level up — ${stars} stars! Lose the heat.`,
        3200,
      );
      this.flashWanted();
    }
    this.prevStars = stars;
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

// Neon Bay Heat — the procedural city of Neon Bay.
// A 7x7 grid of roads, blocks of window-lit buildings, parks, lamps, palms
// and a sandy east coast with a marina. Everything is generated from the
// seeded RNG, so the same seed always builds the same city.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeFacadeTexture(rng) {
  // One shared window texture, tinted per building by the material colour.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 10;
  const w = 128 / cols;
  const h = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.chance(0.28);
      ctx.fillStyle = lit ? '#ffe9a0' : '#33475e';
      ctx.fillRect(c * w + 5, r * h + 6, w - 10, h - 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  // Asphalt with a dashed centre line and pale edge lines, the dash
  // running along the texture's V axis (the road's length).
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#33373d';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(2, 0, 2, 64);
  ctx.fillRect(60, 0, 2, 64);
  ctx.fillStyle = '#f2e8c9';
  ctx.fillRect(30, 8, 4, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    // Road centrelines: -150, -100, -50, 0, 50, 100, 150.
    this.roads = [];
    for (let i = 0; i < CITY.grid; i++) {
      this.roads.push((i - (CITY.grid - 1) / 2) * CITY.pitch);
    }
    this.edge = CITY.edge;
    this.colliders = [];
    this.buildings = [];
    this.parkingSpots = [];
    this.marina = { x: 166, z: 125 };
    this.spawn = { x: 6, z: 6 };

    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildCoast();
    this._buildLamps();
    this._buildParking();
  }

  _buildGround() {
    const size = CITY.worldLimit * 2 + 60;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(20, -0.05, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildRoads() {
    // One road geometry and one texture for both directions: the along-X
    // roads are the same mesh rotated flat (rotation.z turns the plane in
    // its own plane before it is laid down, so the dash still runs along
    // the road's length instead of striping across it).
    const tex = makeRoadTexture();
    const length = CITY.edge * 2 + CITY.roadWidth;
    const geo = new THREE.PlaneGeometry(CITY.roadWidth, length);
    for (const line of this.roads) {
      const t1 = tex.clone();
      t1.needsUpdate = true;
      t1.repeat.set(1, length / 12);
      const alongX = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ map: t1 }),
      );
      alongX.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      alongX.position.set(0, 0.02, line);
      alongX.receiveShadow = true;
      this.scene.add(alongX);

      const t2 = tex.clone();
      t2.needsUpdate = true;
      t2.repeat.set(1, length / 12);
      const alongZ = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ map: t2 }),
      );
      alongZ.rotation.x = -Math.PI / 2;
      alongZ.position.set(line, 0.02, 0);
      alongZ.receiveShadow = true;
      this.scene.add(alongZ);
    }
  }

  _buildBlocks() {
    const facade = makeFacadeTexture(this.rng);
    const blockPitch = CITY.pitch;
    const inner = blockPitch - CITY.roadWidth - CITY.sidewalk * 2;
    for (let bx = 0; bx < CITY.grid - 1; bx++) {
      for (let bz = 0; bz < CITY.grid - 1; bz++) {
        const cx = this.roads[bx] + blockPitch / 2;
        const cz = this.roads[bz] + blockPitch / 2;
        // Raised sidewalk slab for the whole block.
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(blockPitch - CITY.roadWidth, 0.18, blockPitch - CITY.roadWidth),
          new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
        );
        slab.position.set(cx, 0.09, cz);
        slab.receiveShadow = true;
        this.scene.add(slab);

        if (this.rng.chance(CITY.parkChance)) {
          this._buildPark(cx, cz, inner);
          continue;
        }
        const count = this.rng.int(1, 2);
        for (let n = 0; n < count; n++) {
          const w = this.rng.range(inner * 0.4, inner * (count === 1 ? 0.9 : 0.45));
          const d = this.rng.range(inner * 0.4, inner * 0.9);
          const h = this.rng.range(8, 26);
          const ox = count === 1 ? 0 : (n === 0 ? -inner / 4 : inner / 4);
          const oz = this.rng.range(-inner / 6, inner / 6);
          this._addBuilding(cx + ox, cz + oz, w, d, h, facade);
        }
      }
    }
  }

  _addBuilding(x, z, w, d, h, facade) {
    const tint = this.rng.pick(PALETTE.buildings);
    const side = new THREE.MeshLambertMaterial({ map: facade, color: tint });
    const top = new THREE.MeshLambertMaterial({ color: 0x8a8f94 });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [side, side, top, top, side, side],
    );
    mesh.position.set(x, h / 2 + 0.18, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Rooftop box so the skyline reads less flat from above.
    if (this.rng.chance(0.5)) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4),
        new THREE.MeshLambertMaterial({ color: 0x6a6f74 }),
      );
      cap.position.set(x + w * 0.15, h + 0.9, z - d * 0.1);
      cap.castShadow = true;
      this.scene.add(cap);
    }
    this.buildings.push({ mesh, x, z, w, d, h });
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  _buildPark(cx, cz, inner) {
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(inner, inner),
      new THREE.MeshLambertMaterial({ color: PALETTE.park }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.2, cz);
    lawn.receiveShadow = true;
    this.scene.add(lawn);
    const palms = this.rng.int(3, 6);
    for (let i = 0; i < palms; i++) {
      const px = cx + this.rng.range(-inner / 2 + 3, inner / 2 - 3);
      const pz = cz + this.rng.range(-inner / 2 + 3, inner / 2 - 3);
      this._addPalm(px, pz);
    }
  }

  _addPalm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 5, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
    );
    trunk.position.y = 2.5;
    trunk.rotation.z = this.rng.range(-0.12, 0.12);
    trunk.castShadow = true;
    group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 3.4, 4),
        new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf }),
      );
      const angle = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(angle) * 1.1, 5.1, Math.sin(angle) * 1.1);
      frond.rotation.set(Math.sin(angle) * 1.9, 0, -Math.cos(angle) * 1.9);
      frond.scale.set(1, 1, 0.25);
      frond.castShadow = true;
      group.add(frond);
    }
    group.position.set(x, 0.18, z);
    this.scene.add(group);
  }

  _buildCoast() {
    // Sand strip, then the sea, on the east side of the city.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.waterX - CITY.coastX + 10, CITY.edge * 2 + 80),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set((CITY.coastX + CITY.waterX) / 2, 0.03, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(120, CITY.edge * 2 + 160),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(CITY.waterX + 55, -0.1, 0);
    this.scene.add(sea);

    // Boardwalk palms along the sand.
    for (let z = -160; z <= 160; z += 20) {
      this._addPalm(CITY.coastX + 4 + this.rng.range(0, 4), z + this.rng.range(-4, 4));
    }

    // Marina: a concrete pad and a wooden dock reaching into the water.
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.3, 24),
      new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
    );
    pad.position.set(this.marina.x, 0.15, this.marina.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const dock = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.4, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
    );
    dock.position.set(CITY.waterX + 8, 0.2, this.marina.z);
    this.scene.add(dock);
    for (const dz of [-8, 6]) {
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(7, 1.4, 2.4),
        new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
      );
      hull.position.set(CITY.waterX + 10, 0.3, this.marina.z + dz);
      this.scene.add(hull);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.2, 1.8),
        new THREE.MeshLambertMaterial({ color: 0x2b6fd3 }),
      );
      cabin.position.set(CITY.waterX + 10, 1.5, this.marina.z + dz);
      this.scene.add(cabin);
    }
  }

  _buildLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lampPole });
    const bulbGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const bulbMat = new THREE.MeshLambertMaterial({
      color: PALETTE.lampGlow,
      emissive: 0xffe9a8,
      emissiveIntensity: 0.6,
    });
    for (const x of this.roads) {
      for (const z of this.roads) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x + CITY.roadWidth / 2 + 1, 3, z + CITY.roadWidth / 2 + 1);
        pole.castShadow = true;
        this.scene.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x + CITY.roadWidth / 2 + 1, 6.2, z + CITY.roadWidth / 2 + 1);
        this.scene.add(bulb);
      }
    }
  }

  _buildParking() {
    // Parked cars sit parallel to the kerb, clear of the traffic lanes:
    // their centres ride 4.4 m off the road centreline, so a 1.9 m wide car
    // spans 3.45–5.35 m while traffic holds the 2.6 m lane.
    for (let i = 0; i < 16; i++) {
      const alongX = this.rng.chance(0.5);
      const line = this.rng.pick(this.roads);
      const along = this.rng.range(-CITY.edge + 15, CITY.edge - 15);
      const side = this.rng.chance(0.5) ? 1 : -1;
      const off = side * (CITY.roadWidth / 2 - 1.6);
      const spot = alongX
        ? { x: along, z: line + off, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 }
        : { x: line + off, z: along, heading: side > 0 ? Math.PI : 0 };
      this.parkingSpots.push(spot);
    }
  }

  nearestRoadPoint(x, z) {
    const nearest = (v) => this.roads.reduce(
      (best, line) => (Math.abs(line - v) < Math.abs(best - v) ? line : best),
      this.roads[0],
    );
    const nx = nearest(x);
    const nz = nearest(z);
    if (Math.abs(nx - x) <= Math.abs(nz - z)) return { x: nx, z };
    return { x, z: nz };
  }

  randomRoadPoint(rng) {
    const line = rng.pick(this.roads);
    const along = rng.range(-this.edge + 10, this.edge - 10);
    return rng.chance(0.5) ? { x: line, z: along } : { x: along, z: line };
  }

  resolveCircle(pos, radius) {
    // Push a circle (pos.x, pos.z) out of every building box it overlaps,
    // then clamp it inside the playable world. Returns true on any hit.
    let hit = false;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      hit = true;
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // Centre inside the box: shove out along the smallest overlap.
        const left = pos.x - c.minX + radius;
        const right = c.maxX - pos.x + radius;
        const top = pos.z - c.minZ + radius;
        const bottom = c.maxZ - pos.z + radius;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    const limit = CITY.worldLimit;
    if (pos.x < -limit) { pos.x = -limit; hit = true; }
    if (pos.x > CITY.waterX - 1.5) { pos.x = CITY.waterX - 1.5; hit = true; }
    if (pos.z < -limit) { pos.z = -limit; hit = true; }
    if (pos.z > limit) { pos.z = limit; hit = true; }
    return hit;
  }
}

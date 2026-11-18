// Neon Bay Heat — the procedural city of Neon Bay.
// One seeded build lays out a grid of roads and blocks, fills the blocks
// with buildings of varied height and colour, and adds sidewalks, lamps,
// palms and a coast edge with sand and water. It also owns the collision
// boxes and the road helpers the cars and the minimap read.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// A small canvas texture of lit and dark windows; tinted per building
// by its material colour so every facade reads as an office or a home.
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  const rows = 12;
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = ((r * 7 + c * 3) % 5) === 0;
      ctx.fillStyle = lit ? '#ffe9a8' : '#33505e';
      ctx.fillRect(8 + c * 24, 10 + r * 20, 16, 12);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 244, 128, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.pitch = CITY.pitch;
    // Road centrelines: 7 roads each way, centred on the origin.
    const half = (CITY.blocks - 1) / 2;
    this.roadXs = [];
    this.roadZs = [];
    for (let i = 0; i < CITY.blocks; i++) {
      this.roadXs.push((i - half) * this.pitch);
      this.roadZs.push((i - half) * this.pitch);
    }
    this.edge = half * this.pitch + CITY.roadWidth / 2; // outer road edge
    this.colliders = []; // { minX, maxX, minZ, maxZ }
    this.buildings = []; // { x, z, w, d, h } for the minimap
    this.parkSpots = []; // { x, z, heading } where parked cars sit
    this.dropOff = { x: this.edge + CITY.coastOffset * 0.55, z: -this.pitch };
    this.spawn = { x: 0, z: this.pitch * 0.5 + 4 };
    this.build();
  }

  build() {
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildLamps();
    this.buildPalms();
    this.buildCoast();
    this.buildParkSpots();
  }

  buildGround() {
    const size = this.edge * 2 + CITY.coastOffset + CITY.waterWidth + 220;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((CITY.coastOffset + CITY.waterWidth) / 2, 0, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildRoads() {
    const asphalt = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
    const lineMat = new THREE.MeshLambertMaterial({ color: PALETTE.roadLine });
    const length = this.edge * 2 + 24;
    const dashGeo = new THREE.PlaneGeometry(0.35, 3);
    const dashes = [];
    for (const x of this.roadXs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, length), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, 0);
      road.receiveShadow = true;
      this.scene.add(road);
      for (let z = -this.edge; z < this.edge; z += 8) dashes.push([x, z, 0]);
    }
    for (const z of this.roadZs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(length, CITY.roadWidth), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, z);
      road.receiveShadow = true;
      this.scene.add(road);
      for (let x = -this.edge; x < this.edge; x += 8) dashes.push([x, z, Math.PI / 2]);
    }
    // One instanced mesh for every dashed centre line.
    const instanced = new THREE.InstancedMesh(dashGeo, lineMat, dashes.length);
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    dashes.forEach(([x, z, yaw], i) => {
      euler.set(-Math.PI / 2, 0, yaw);
      quat.setFromEuler(euler);
      matrix.compose(new THREE.Vector3(x, 0.04, z), quat, scale);
      instanced.setMatrixAt(i, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    this.scene.add(instanced);
  }

  buildBlocks() {
    const windowTexture = makeWindowTexture();
    const facadeMats = PALETTE.facades.map(
      (color) => new THREE.MeshLambertMaterial({ color, map: windowTexture }),
    );
    const glassMat = new THREE.MeshLambertMaterial({ color: PALETTE.glass, map: windowTexture });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x4a9a58 });
    const half = (CITY.blocks - 1) / 2;
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    blockGeo.translate(0, 0.5, 0); // origin at the base, easy stacking

    for (let ix = 0; ix < CITY.blocks - 1; ix++) {
      for (let iz = 0; iz < CITY.blocks - 1; iz++) {
        const cx = (ix - half + 0.5) * this.pitch;
        const cz = (iz - half + 0.5) * this.pitch;
        // Sidewalk apron under the whole block.
        const walk = new THREE.Mesh(
          new THREE.BoxGeometry(CITY.blockSize + CITY.sidewalk * 2, 0.18, CITY.blockSize + CITY.sidewalk * 2),
          sidewalkMat,
        );
        walk.position.set(cx, 0.09, cz);
        walk.receiveShadow = true;
        this.scene.add(walk);

        // One block in eight is a park: grass, palms, no buildings.
        if (this.rng.chance(0.12)) {
          const park = new THREE.Mesh(
            new THREE.BoxGeometry(CITY.blockSize, 0.3, CITY.blockSize),
            parkMat,
          );
          park.position.set(cx, 0.15, cz);
          park.receiveShadow = true;
          this.scene.add(park);
          continue;
        }

        // Split the block into 1, 2 or 4 lots.
        const splitX = this.rng.chance(0.55) ? 2 : 1;
        const splitZ = this.rng.chance(0.55) ? 2 : 1;
        const lotW = CITY.blockSize / splitX;
        const lotD = CITY.blockSize / splitZ;
        for (let lx = 0; lx < splitX; lx++) {
          for (let lz = 0; lz < splitZ; lz++) {
            const w = lotW * this.rng.range(0.72, 0.92);
            const d = lotD * this.rng.range(0.72, 0.92);
            const isTower = this.rng.chance(CITY.towerChance);
            const h = isTower
              ? this.rng.range(CITY.towerMinHeight, CITY.towerMaxHeight)
              : this.rng.range(CITY.buildingMinHeight, CITY.buildingMaxHeight);
            const x = cx + (lx - (splitX - 1) / 2) * lotW;
            const z = cz + (lz - (splitZ - 1) / 2) * lotD;
            const mat = isTower && this.rng.chance(0.5) ? glassMat : this.rng.pick(facadeMats);
            const building = new THREE.Mesh(blockGeo, mat);
            building.scale.set(w, h, d);
            building.position.set(x, 0.18, z);
            building.castShadow = true;
            building.receiveShadow = true;
            this.scene.add(building);
            // A flat roof cap so towers read finished from above.
            const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.5, d * 0.94), roofMat);
            roof.position.set(x, 0.18 + h + 0.25, z);
            this.scene.add(roof);
            this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
            this.buildings.push({ x, z, w, d, h });
          }
        }
      }
    }
  }

  buildLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
    poleGeo.translate(0, 2.6, 0);
    const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lampPole });
    const headMat = new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow });
    const spots = [];
    for (const x of this.roadXs) {
      for (const z of this.roadZs) {
        if ((Math.round(x / this.pitch) + Math.round(z / this.pitch)) % 2 !== 0) continue;
        spots.push([x + CITY.roadWidth / 2 + 0.6, z + CITY.roadWidth / 2 + 0.6]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const matrix = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      matrix.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, matrix);
      matrix.makeTranslation(x, 5.3, z);
      heads.setMatrixAt(i, matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.scene.add(poles);
    this.scene.add(heads);
  }

  buildPalms() {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 4.6, 6);
    trunkGeo.translate(0, 2.3, 0);
    const leafGeo = new THREE.ConeGeometry(0.55, 2.6, 5);
    leafGeo.translate(0, 1.2, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
    const spots = [];
    // A palm row along the beach.
    for (let z = -this.edge; z <= this.edge; z += 12) {
      spots.push([this.edge + 6 + this.rng.range(0, 10), z + this.rng.range(-3, 3)]);
    }
    // A few palms scattered on park blocks.
    for (let i = 0; i < 26; i++) {
      spots.push([this.rng.range(-this.edge, this.edge), this.rng.range(-this.edge, this.edge)]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length * 5);
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const lean = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const tilt = this.rng.range(-0.14, 0.14);
      const spin = this.rng.range(0, Math.PI * 2);
      euler.set(tilt, spin, 0);
      quat.setFromEuler(euler);
      matrix.compose(new THREE.Vector3(x, 0, z), quat, scale);
      trunks.setMatrixAt(i, matrix);
      lean.set(Math.sin(tilt) * 4.4, 4.5, 0).applyQuaternion(quat);
      for (let f = 0; f < 5; f++) {
        const a = (f / 5) * Math.PI * 2 + spin;
        euler.set(0.9, a, 0);
        quat.setFromEuler(euler);
        matrix.compose(new THREE.Vector3(x + lean.x, lean.y, z + lean.z), quat, new THREE.Vector3(1, 1, 0.28));
        leaves.setMatrixAt(i * 5 + f, matrix);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true;
    this.scene.add(trunks);
    this.scene.add(leaves);
  }

  buildCoast() {
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.coastOffset + 8, this.edge * 2 + 160),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(this.edge + CITY.coastOffset / 2, 0.03, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.waterWidth, this.edge * 2 + 400),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(this.edge + CITY.coastOffset + CITY.waterWidth / 2, 0.05, 0);
    this.scene.add(water);
  }

  // Parked cars sit along the kerb of the roads nearest the spawn.
  buildParkSpots() {
    const near = this.roadXs.slice(2, 5);
    const nearZ = this.roadZs.slice(2, 5);
    for (const x of near) {
      for (let k = 0; k < 2; k++) {
        const z = this.rng.pick(nearZ) + this.rng.range(-14, 14);
        this.parkSpots.push({ x: x + CITY.roadWidth / 2 - 1.6, z, heading: Math.PI / 2 });
      }
    }
    for (const z of nearZ) {
      for (let k = 0; k < 2; k++) {
        const x = this.rng.pick(near) + this.rng.range(-14, 14);
        this.parkSpots.push({ x, z: z + CITY.roadWidth / 2 - 1.6, heading: 0 });
      }
    }
  }

  // --- queries used by gameplay -------------------------------------------

  // Nearest point on any road centreline (traffic routes snap to this).
  nearestRoadPoint(x, z) {
    let bestX = this.roadXs[0];
    let bestZ = this.roadZs[0];
    for (const rx of this.roadXs) if (Math.abs(rx - x) < Math.abs(bestX - x)) bestX = rx;
    for (const rz of this.roadZs) if (Math.abs(rz - z) < Math.abs(bestZ - z)) bestZ = rz;
    return Math.abs(bestX - x) < Math.abs(bestZ - z)
      ? { x: bestX, z }
      : { x, z: bestZ };
  }

  randomRoadPoint(rng) {
    if (rng.chance(0.5)) {
      return { x: rng.pick(this.roadXs), z: rng.range(-this.edge, this.edge) };
    }
    return { x: rng.range(-this.edge, this.edge), z: rng.pick(this.roadZs) };
  }

  // Push a circle (player feet, car centre) out of every building box.
  // Returns true when a push happened (a collision the caller can feel).
  resolveCircle(pos, radius) {
    let hit = false;
    for (const box of this.colliders) {
      const cx = clamp(pos.x, box.minX, box.maxX);
      const cz = clamp(pos.z, box.minZ, box.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      hit = true;
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        pos.x = cx + (dx / dist) * radius;
        pos.z = cz + (dz / dist) * radius;
      } else {
        // Centre inside the box: shove out along the smallest overlap.
        const left = pos.x - box.minX + radius;
        const right = box.maxX - pos.x + radius;
        const top = pos.z - box.minZ + radius;
        const bottom = box.maxZ - pos.z + radius;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = box.minX - radius;
        else if (min === right) pos.x = box.maxX + radius;
        else if (min === top) pos.z = box.minZ - radius;
        else pos.z = box.maxZ + radius;
      }
    }
    // Soft world bounds: the sea stops cars, the map edge stops feet.
    const limit = this.edge + CITY.coastOffset - 2;
    const beforeX = pos.x;
    const beforeZ = pos.z;
    pos.x = clamp(pos.x, -this.edge - 30, limit);
    pos.z = clamp(pos.z, -this.edge - 30, this.edge + 30);
    if (pos.x !== beforeX || pos.z !== beforeZ) hit = true;
    return hit;
  }
}

// world.js – baut die Gefängniszelle (Wände, Möbel, Gittertür, Fackel, Licht).
// Alle Maße kommen aus layout.js, damit Optik und Kollisionen übereinstimmen.

import { createTextures } from './textures.js';
import {
  ROOM, DOOR, CORRIDOR, BED, TABLE, STOOL, BUCKET, BOUNDS, SPAWN, END_Z, END_DOOR, buildColliders,
} from './layout.js';

// ---- Licht-Einstellungen (hier lässt sich die Stimmung anpassen) ----
const TORCH_INTENSITY = 38;     // Helligkeit der Fackel
const CORRIDOR_INTENSITY = 14;  // Helligkeit des Gangs hinter der Tür
const AMBIENT_INTENSITY = 1.4;  // schwaches Grundlicht (sonst wäre alles pechschwarz)
const MORNING_AMBIENT = 2.6;    // Grundlicht am Morgen (Tageslicht, das durchs Fenster streut)
const MORNING_SUN = 16;         // Helligkeit des Sonnenstrahls am Morgen
// Fenster in der hinteren Wand (Öffnung durch die ganze Wand, damit das Morgenlicht hindurchkommt)
const WIN = { halfW: 0.35, y0: 1.5, y1: 2.4 };
// Laufrichtung des Sonnenlichts (von draußen durchs Fenster schräg nach unten in die Zelle)
const SUN_DIR = (() => { const x = -0.35, y = -0.5, z = -0.79, l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; })();

export function createWorld(THREE, renderer) {
  const T = createTextures(THREE, renderer);

  const scene = new THREE.Scene();
  // WICHTIG: keine Hintergrundfarbe in der Szene! Three.js löscht bei einer Hintergrundfarbe in JEDEM Zeichendurchgang
  // das ganze Bild. Dann würde der zweite Durchgang (Arme) die Zelle wieder wegwischen -> alles schwarz.
  // Die Hintergrundfarbe kommt stattdessen vom Renderer.
  scene.background = null;
  renderer.setClearColor(0x030201, 1);
  scene.fog = new THREE.FogExp2(0x050302, 0.06);

  const group = new THREE.Group();
  scene.add(group);

  const W = ROOM.halfW, D = ROOM.halfD, H = ROOM.height, WT = ROOM.wall;
  const WALL_TS = 2.1;   // 7 Steinreihen à 0,3 m -> genau 10 Reihen bis zur Decke
  const FLOOR_TS = 2.0;

  // ---------- Materialien ----------
  const mk = (tex, o = {}) => new THREE.MeshStandardMaterial({
    color: o.color !== undefined ? o.color : 0xffffff,
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: o.bump !== undefined ? o.bump : 1.5,
    roughness: o.rough !== undefined ? o.rough : 0.9,
    metalness: o.metal !== undefined ? o.metal : 0,
  });
  const M = {
    wall: mk(T.wall, { rough: 0.97, bump: 2.4 }),
    ceil: mk(T.wall, { color: 0x8a847c, rough: 0.98, bump: 2.0 }),
    floor: mk(T.floor, { rough: 0.9, bump: 2.0 }),
    wood: mk(T.wood, { rough: 0.85, bump: 1.2 }),
    woodDark: mk(T.wood, { color: 0x77624e, rough: 0.9, bump: 1.2 }),
    iron: mk(T.metal, { rough: 0.5, metal: 0.45, bump: 0.6 }),
    mattress: mk(T.fabric, { color: 0xcdbf98, rough: 1 }),
    blanket: mk(T.fabric, { color: 0xa86a5c, rough: 1 }),
    pillow: mk(T.fabric, { color: 0xc8bda3, rough: 1 }),
    straw: mk(T.straw, { rough: 1, bump: 1.0 }),
    clay: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 }),
    candle: new THREE.MeshStandardMaterial({ color: 0xe9dfc4, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    sky: new THREE.MeshBasicMaterial({ color: 0x101a30, fog: false }),
  };

  // ---------- Hilfsfunktionen ----------
  let uvCounter = 0;
  // Texturen pro Fläche an die echte Größe anpassen (ts = Meter pro Texturkachel),
  // sonst würden lange Wände gestreckt. grain: Richtung der Holzmaserung.
  function scaleUV(g, w, h, d, ts, grain) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x,-x,+y,-y,+z,-z
    const swap = [false, false, false, false, false, false];
    if (grain === 'z') { swap[0] = true; swap[1] = true; }
    if (grain === 'x') { swap[2] = true; swap[3] = true; swap[4] = true; swap[5] = true; }
    uvCounter++;
    const o1 = (uvCounter * 0.6180339) % 1;
    const o2 = (uvCounter * 0.4142135) % 1;
    for (let f = 0; f < 6; f++) {
      const a = dims[f][0], b = dims[f][1];
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        const u0 = uv.getX(idx), v0 = uv.getY(idx);
        if (swap[f]) uv.setXY(idx, (v0 * b) / ts + o1, (u0 * a) / ts + o2);
        else uv.setXY(idx, (u0 * a) / ts + o1, (v0 * b) / ts + o2);
      }
    }
    uv.needsUpdate = true;
  }

  // Texturkoordinaten fest an die Welt binden (Ursprung = Raummitte): Steinreihen liegen an allen
  // Wänden auf gleicher Höhe, und weil die Steintextur spiegelsymmetrisch ist, sind gegenüberliegende
  // Wände exakte Spiegelbilder. (Gilt für Stein; Holz & Co. nutzen scaleUV.)
  function worldUV(g, cx, cy, cz, ts) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i) + cx, y = pos.getY(i) + cy, z = pos.getZ(i) + cz;
      if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / ts, y / ts);
      else if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / ts, z / ts);
      else uv.setXY(i, x / ts, y / ts);
    }
    uv.needsUpdate = true;
  }

  // Quader von minX..maxX usw. (Meter), mit passend skalierter Textur
  function boxMM(minX, maxX, minY, maxY, minZ, maxZ, mat, o = {}) {
    const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.world) worldUV(g, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, o.world);
    else scaleUV(g, w, h, d, o.ts || 2, o.grain);
    const m = new THREE.Mesh(g, mat);
    m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    m.castShadow = o.cast !== undefined ? o.cast : true;
    m.receiveShadow = o.receive !== undefined ? o.receive : true;
    (o.parent || group).add(m);
    return m;
  }

  // ---------- Zelle: Boden, Decke, Wände ----------
  boxMM(-W - WT, W + WT, -0.5, 0, -D - WT, D + WT, M.floor, { world: FLOOR_TS });
  boxMM(-W - WT, W + WT, H, H + 0.5, -D - WT, D + WT, M.ceil, { world: WALL_TS });
  boxMM(-W - WT, -W, 0, H, -D - WT, D + WT, M.wall, { world: WALL_TS });              // links
  boxMM(W, W + WT, 0, H, -D - WT, D + WT, M.wall, { world: WALL_TS });                // rechts
  // hinten: Wand mit Fensteröffnung (unten, oben, links und rechts vom Fenster)
  boxMM(-W, W, 0, WIN.y0, D, D + WT, M.wall, { world: WALL_TS });
  boxMM(-W, W, WIN.y1, H, D, D + WT, M.wall, { world: WALL_TS });
  boxMM(-W, -WIN.halfW, WIN.y0, WIN.y1, D, D + WT, M.wall, { world: WALL_TS });
  boxMM(WIN.halfW, W, WIN.y0, WIN.y1, D, D + WT, M.wall, { world: WALL_TS });
  boxMM(-W, -DOOR.halfW, 0, H, -D - WT, -D, M.wall, { world: WALL_TS });              // vorne links
  boxMM(DOOR.halfW, W, 0, H, -D - WT, -D, M.wall, { world: WALL_TS });                // vorne rechts
  boxMM(-DOOR.halfW, DOOR.halfW, DOOR.height, H, -D - WT, -D, M.wall, { world: WALL_TS }); // Sturz über der Tür

  // Deckenbalken
  for (const z of [-1.4, 0, 1.4]) {
    boxMM(-W, W, H - 0.32, H, z - 0.15, z + 0.15, M.woodDark, { ts: 1, grain: 'x' });
  }

  // ---------- Gang hinter der Tür (nur sichtbar, nicht begehbar) ----------
  const CH = CORRIDOR.halfW;
  const zFront = -D - WT;                       // Außenseite der Türwand
  const zEnd = END_Z;
  boxMM(-CH - WT, CH + WT, -0.5, 0, zEnd - WT, zFront, M.floor, { world: FLOOR_TS });
  boxMM(-CH - WT, CH + WT, H, H + 0.5, zEnd - WT, zFront, M.ceil, { world: WALL_TS });
  boxMM(-CH - WT, -CH, 0, H, zEnd - WT, zFront, M.wall, { world: WALL_TS });
  boxMM(CH, CH + WT, 0, H, zEnd - WT, zFront, M.wall, { world: WALL_TS });
  // Endwand mit Türöffnung; dahinter eine kurze dunkle Nische, aus der der Wärter später kommt
  const ED = END_DOOR;
  boxMM(-CH, -ED.halfW, 0, H, zEnd - WT, zEnd, M.wall, { world: WALL_TS });
  boxMM(ED.halfW, CH, 0, H, zEnd - WT, zEnd, M.wall, { world: WALL_TS });
  boxMM(-ED.halfW, ED.halfW, ED.height, H, zEnd - WT, zEnd, M.wall, { world: WALL_TS });
  const alcove = new THREE.Mesh(new THREE.PlaneGeometry(ED.halfW * 2, ED.height), M.black);
  alcove.position.set(0, ED.height / 2, zEnd - WT + 0.02);
  group.add(alcove);

  // schwere Holztür am Gangende, links angeschlagen (Drehpunkt = linke Kante), schwingt in den Gang
  const endDoorPivot = new THREE.Group();
  endDoorPivot.position.set(-ED.halfW, 0, zEnd + 0.05);
  group.add(endDoorPivot);
  const dw = ED.halfW * 2;
  const doorOpts = { ts: 1, grain: 'y', parent: endDoorPivot, cast: false };
  boxMM(0, dw, 0, ED.height, -0.05, 0.05, M.wood, doorOpts);
  boxMM(0.02, dw - 0.02, 0.45, 0.55, 0.05, 0.08, M.iron, { ts: 0.5, parent: endDoorPivot, cast: false });
  boxMM(0.02, dw - 0.02, 1.65, 1.75, 0.05, 0.08, M.iron, { ts: 0.5, parent: endDoorPivot, cast: false });
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14), M.iron);
  doorRing.position.set(dw - 0.18, 1.05, 0.1);
  endDoorPivot.add(doorRing);
  // amount 0 = zu, 1 = ganz offen (ca. 100 Grad, die Tür schwingt zum Spieler hin)
  function setEndDoor(amount) { endDoorPivot.rotation.y = -Math.max(0, Math.min(1, amount)) * 1.75; }

  // ---------- Gittertür aus dunklem Metall ----------
  let gatePivotRef = null;
  {
    const zc = -D - WT / 2;
    const hw = DOOR.halfW;
    // Drehpunkt = linke Kante (Scharniere). Die Teile werden mit ihren echten Koordinaten gebaut; der innere
    // Halter hebt die Verschiebung des Drehpunkts wieder auf, solange die Tür zu ist.
    const gatePivot = new THREE.Group();
    gatePivot.position.set(-hw, 0, zc);
    group.add(gatePivot);
    gatePivotRef = gatePivot;
    const gate = new THREE.Group();
    gate.position.set(hw, 0, -zc);
    gatePivot.add(gate);
    // Rahmen
    boxMM(-hw, -hw + 0.07, 0, DOOR.height, zc - 0.045, zc + 0.045, M.iron, { ts: 0.5, parent: gate });
    boxMM(hw - 0.07, hw, 0, DOOR.height, zc - 0.045, zc + 0.045, M.iron, { ts: 0.5, parent: gate });
    const railY = [0.12, 1.1, 2.08];
    for (const y of railY) {
      boxMM(-hw, hw, y - 0.035, y + 0.035, zc - 0.03, zc + 0.03, M.iron, { ts: 0.5, parent: gate });
    }
    // Gitterstäbe und Nieten als Instanzen (wenige Zeichenaufrufe)
    const barCount = 11;
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 2.04, 8), M.iron, barCount);
    const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 8, 6), M.iron, barCount * railY.length);
    const dummy = new THREE.Object3D();
    let ri = 0;
    for (let i = 0; i < barCount; i++) {
      const x = -0.5 + i * 0.1;
      dummy.position.set(x, 1.12, zc);
      dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix);
      for (const y of railY) {
        dummy.position.set(x, y, zc + 0.035);
        dummy.updateMatrix();
        rivets.setMatrixAt(ri++, dummy.matrix);
      }
    }
    bars.instanceMatrix.needsUpdate = true;
    rivets.instanceMatrix.needsUpdate = true;
    bars.castShadow = true; bars.receiveShadow = true;
    rivets.castShadow = true; rivets.receiveShadow = true;
    gate.add(bars); gate.add(rivets);
    // Schloss und Scharniere
    boxMM(0.38, 0.58, 0.95, 1.2, zc + 0.03, zc + 0.08, M.iron, { ts: 0.5, parent: gate });
    const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), M.black);
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(0.48, 1.08, zc + 0.085);
    gate.add(keyhole);
    for (const y of [0.5, 1.7]) {
      boxMM(-hw - 0.01, -hw + 0.1, y - 0.06, y + 0.06, zc - 0.06, zc + 0.06, M.iron, { ts: 0.5, parent: gate });
    }
  }

  // ---------- Holzbett (links, hinten) ----------
  {
    const { minX, maxX, minZ, maxZ } = BED;
    // Pfosten
    boxMM(minX, minX + 0.08, 0, 0.55, minZ, minZ + 0.08, M.wood, { ts: 1, grain: 'y' });
    boxMM(maxX - 0.08, maxX, 0, 0.55, minZ, minZ + 0.08, M.wood, { ts: 1, grain: 'y' });
    boxMM(minX, minX + 0.08, 0, 0.85, maxZ - 0.08, maxZ, M.wood, { ts: 1, grain: 'y' });
    boxMM(maxX - 0.08, maxX, 0, 0.85, maxZ - 0.08, maxZ, M.wood, { ts: 1, grain: 'y' });
    // Seitenbretter, Fußbrett, Kopfbrett
    boxMM(minX, minX + 0.05, 0.25, 0.39, minZ, maxZ, M.wood, { ts: 1, grain: 'z' });
    boxMM(maxX - 0.05, maxX, 0.25, 0.39, minZ, maxZ, M.wood, { ts: 1, grain: 'z' });
    boxMM(minX, maxX, 0.25, 0.39, minZ, minZ + 0.05, M.wood, { ts: 1, grain: 'x' });
    boxMM(minX, maxX, 0.25, 0.85, maxZ - 0.06, maxZ, M.wood, { ts: 1, grain: 'y' });
    // Lattenrost, Strohmatratze, Decke, Kissen
    boxMM(minX + 0.05, maxX - 0.05, 0.28, 0.32, minZ + 0.05, maxZ - 0.06, M.woodDark, { ts: 1, grain: 'z' });
    boxMM(minX + 0.06, maxX - 0.06, 0.32, 0.46, minZ + 0.07, maxZ - 0.08, M.mattress, { ts: 0.5 });
    boxMM(minX + 0.05, maxX - 0.05, 0.46, 0.50, minZ + 0.06, minZ + 1.15, M.blanket, { ts: 0.5 });
    boxMM(minX + 0.18, maxX - 0.18, 0.46, BED.top, maxZ - 0.5, maxZ - 0.12, M.pillow, { ts: 0.5 });
  }

  // ---------- Holztisch (rechts, hinten) mit Krug, Teller, Kerze ----------
  const candleFlame = {};
  {
    const { minX, maxX, minZ, maxZ, top } = TABLE;
    boxMM(minX, maxX, top - 0.06, top, minZ, maxZ, M.wood, { ts: 1, grain: 'z' });
    for (const lx of [minX + 0.04, maxX - 0.11]) {
      for (const lz of [minZ + 0.04, maxZ - 0.11]) {
        boxMM(lx, lx + 0.07, 0, top - 0.06, lz, lz + 0.07, M.wood, { ts: 1, grain: 'y' });
      }
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.02, 14), M.iron);
    plate.position.set(cx - 0.2, top + 0.01, cz - 0.05);
    plate.castShadow = true; plate.receiveShadow = true;
    group.add(plate);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 12), M.clay);
    jug.position.set(cx + 0.25, top + 0.1, cz + 0.12);
    jug.castShadow = true; jug.receiveShadow = true;
    group.add(jug);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.12, 8), M.candle);
    candle.position.set(cx + 0.08, top + 0.06, cz - 0.2);
    candle.castShadow = true;
    group.add(candle);
    candleFlame.pos = new THREE.Vector3(cx + 0.08, top + 0.15, cz - 0.2);
  }

  // ---------- Hocker ----------
  {
    const { x, z, half, top } = STOOL;
    boxMM(x - half, x + half, top - 0.06, top, z - half, z + half, M.wood, { ts: 1 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = x + sx * (half - 0.04), lz = z + sz * (half - 0.04);
        boxMM(lx - 0.025, lx + 0.025, 0, top - 0.06, lz - 0.025, lz + 0.025, M.wood, { ts: 1, grain: 'y' });
      }
    }
  }

  // ---------- Eimer ----------
  {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(BUCKET.half, BUCKET.half * 0.85, BUCKET.top, 14), M.iron);
    bucket.position.set(BUCKET.x, BUCKET.top / 2, BUCKET.z);
    bucket.castShadow = true; bucket.receiveShadow = true;
    group.add(bucket);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(BUCKET.half * 0.9, 0.008, 6, 16, Math.PI), M.iron);
    handle.position.set(BUCKET.x, BUCKET.top, BUCKET.z);
    group.add(handle);
  }

  // ---------- Strohhaufen (vorne links, nur Deko) ----------
  boxMM(-2.4, -1.3, 0, 0.05, -2.1, -1.2, M.straw, { ts: 0.5, cast: false });
  boxMM(-2.2, -1.5, 0.05, 0.09, -1.95, -1.4, M.straw, { ts: 0.5, cast: false });

  // ---------- Ketten und Fesseln an der linken Wand ----------
  {
    const linkGeo = new THREE.TorusGeometry(0.03, 0.007, 6, 10);
    for (const z of [0.9, 1.15]) {
      const x = -W + 0.04;
      boxMM(x - 0.04, x + 0.04, 2.28, 2.36, z - 0.03, z + 0.03, M.iron, { ts: 0.5 });
      for (let i = 0; i < 12; i++) {
        const link = new THREE.Mesh(linkGeo, M.iron);
        link.position.set(x, 2.25 - i * 0.062, z);
        link.rotation.y = (i % 2) * (Math.PI / 2);
        link.scale.set(1, 1.4, 1);
        link.castShadow = true;
        group.add(link);
      }
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), M.iron);
      cuff.position.set(x, 2.25 - 12 * 0.062 - 0.05, z);
      cuff.rotation.y = Math.PI / 2;
      cuff.castShadow = true;
      group.add(cuff);
    }
  }

  // ---------- vergittertes Fenster (hinten, genau in der Wandmitte) ----------
  {
    const wc = (WIN.y0 + WIN.y1) / 2;
    // Himmel hinter der Öffnung (nachts dunkel, morgens hell – siehe setMorning)
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.halfW * 2 + 0.3, WIN.y1 - WIN.y0 + 0.3), M.sky);
    sky.position.set(0, wc, D + WT + 0.02);
    sky.rotation.y = Math.PI;
    group.add(sky);
    // Rahmen an der Innenseite
    const fo = WIN.halfW + 0.04;
    boxMM(-fo, fo, WIN.y1, WIN.y1 + 0.05, D - 0.08, D, M.wall, { cast: false, world: WALL_TS });
    boxMM(-fo, fo, WIN.y0 - 0.05, WIN.y0, D - 0.1, D, M.wall, { cast: false, world: WALL_TS });
    boxMM(-fo, -WIN.halfW, WIN.y0 - 0.05, WIN.y1 + 0.05, D - 0.08, D, M.wall, { cast: false, world: WALL_TS });
    boxMM(WIN.halfW, fo, WIN.y0 - 0.05, WIN.y1 + 0.05, D - 0.08, D, M.wall, { cast: false, world: WALL_TS });
    // Gitterstäbe: werfen im Morgenlicht Streifen auf den Boden
    const barGeo = new THREE.CylinderGeometry(0.014, 0.014, WIN.y1 - WIN.y0 + 0.02, 6);
    for (const bx of [-0.21, -0.07, 0.07, 0.21]) {
      const bar = new THREE.Mesh(barGeo, M.iron);
      bar.position.set(bx, wc, D - 0.04);
      bar.castShadow = true;
      group.add(bar);
    }
  }

  // ---------- Fackel an der rechten Wand ----------
  const torchTilt = 0.48;
  const torchBase = new THREE.Vector3(W - 0.04, 1.5, -0.5);
  const flameLocalY = 0.72;
  const flameWorld = new THREE.Vector3(
    torchBase.x - Math.sin(torchTilt) * flameLocalY,
    torchBase.y + Math.cos(torchTilt) * flameLocalY,
    torchBase.z,
  );
  const flameMat = new THREE.SpriteMaterial({
    map: T.glow, color: 0xffb060, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false,
  });
  const haloMat = new THREE.SpriteMaterial({
    map: T.glow, color: 0xff7a20, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, opacity: 0.35, fog: false,
  });
  const flame = new THREE.Sprite(flameMat);
  const halo = new THREE.Sprite(haloMat);
  {
    boxMM(W - 0.04, W, 1.38, 1.62, -0.58, -0.42, M.iron, { ts: 0.5, cast: false });
    const holder = new THREE.Group();
    holder.position.copy(torchBase);
    holder.rotation.z = torchTilt;
    group.add(holder);
    const handleGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.56, 8);
    handleGeo.translate(0, 0.28, 0);
    holder.add(new THREE.Mesh(handleGeo, M.woodDark));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.04, 0.16, 10), M.cloth);
    head.position.y = 0.62;
    holder.add(head);
    flame.position.set(0, flameLocalY, 0);
    halo.position.set(0, flameLocalY, 0);
    flame.scale.set(0.28, 0.46, 1);
    halo.scale.set(1.4, 1.4, 1);
    holder.add(halo); holder.add(flame);
  }

  // Kerzenflamme (nur Leuchtpunkt, kein eigenes Licht – spart Leistung)
  const candleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glow, color: 0xffc070, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false,
  }));
  candleSprite.position.copy(candleFlame.pos);
  candleSprite.scale.set(0.09, 0.14, 1);
  group.add(candleSprite);

  // ---------- Lichter (bewusst wenige!) ----------
  const hemi = new THREE.HemisphereLight(0x4a5a80, 0x2a1d12, AMBIENT_INTENSITY);
  hemi.layers.enable(1);   // Ebene 1 = Arme (werden in eigenem Durchgang gezeichnet)
  scene.add(hemi);

  const torchLight = new THREE.PointLight(0xff9a3c, TORCH_INTENSITY, 0, 2);
  torchLight.position.copy(flameWorld);
  torchLight.castShadow = true;
  torchLight.shadow.mapSize.set(1024, 1024);
  torchLight.shadow.camera.near = 0.1;
  torchLight.shadow.camera.far = 16;
  torchLight.shadow.bias = -0.0006;
  torchLight.shadow.normalBias = 0.03;
  torchLight.shadow.camera.updateProjectionMatrix();   // nötig, damit near/far wirklich gelten
  torchLight.layers.enable(1);
  scene.add(torchLight);

  const corridorLight = new THREE.PointLight(0xff8a40, CORRIDOR_INTENSITY, 0, 2);
  corridorLight.position.set(0, 2.4, zFront - CORRIDOR.length * 0.55);
  corridorLight.castShadow = true;
  corridorLight.shadow.mapSize.set(512, 512);
  corridorLight.shadow.camera.near = 0.1;
  corridorLight.shadow.camera.far = 12;
  corridorLight.shadow.bias = -0.0008;
  corridorLight.shadow.normalBias = 0.04;
  corridorLight.shadow.camera.updateProjectionMatrix();
  corridorLight.layers.enable(1);
  scene.add(corridorLight);

  // ---------- schwebende Staubkörner ----------
  const DUST = 48;
  const dustBase = new Float32Array(DUST * 3);
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustBase[i * 3] = (Math.random() * 2 - 1) * (W - 0.2);
    dustBase[i * 3 + 1] = 0.4 + Math.random() * 2.3;
    dustBase[i * 3 + 2] = (Math.random() * 2 - 1) * (D - 0.2);
  }
  dustPos.set(dustBase);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.03, map: T.glow, color: 0xffc080, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // Zellentür: 0 = zu, 1 = ganz offen (schwingt nach außen in den Gang, ca. 95 Grad)
  function setCellGate(amount) {
    if (gatePivotRef) gatePivotRef.rotation.y = Math.max(0, Math.min(1, amount)) * 1.65;
  }
  // Die Schatten sind statisch (einmal berechnet). Nach einer Änderung an Schatten werfenden Teilen (Gittertür geöffnet)
  // muss man sie einmal neu berechnen lassen.
  function refreshShadows() { renderer.shadowMap.needsUpdate = true; }

  // ---------- Morgenlicht ----------
  // Die Sonne (mit Schatten der Gitterstäbe) wird erst gebraucht, wenn der Spieler geschlafen hat. Bis dahin spart das
  // Spiel das zusätzliche Licht. prepareMorning() wird aufgerufen, solange der Bildschirm schwarz ist (das Übersetzen der
  // Licht-Programme kann kurz ruckeln, das sieht dann niemand).
  let sun = null;
  let beam = null;
  let morningT = 0;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const skyNight = new THREE.Color(0x101a30), skyDay = new THREE.Color(0xffe6b8);
  const hemiSkyNight = new THREE.Color(0x4a5a80), hemiSkyDay = new THREE.Color(0xc4d4ee);
  const hemiGroundNight = new THREE.Color(0x2a1d12), hemiGroundDay = new THREE.Color(0x6a5038);
  const fogNight = new THREE.Color(0x050302), fogDay = new THREE.Color(0x2a2218);

  function prepareMorning() {
    if (sun) return;
    const target = new THREE.Vector3(0, (WIN.y0 + WIN.y1) / 2, D + WT / 2);
    sun = new THREE.DirectionalLight(0xffd9a0, 0);
    sun.position.set(target.x - SUN_DIR.x * 12, target.y - SUN_DIR.y * 12, target.z - SUN_DIR.z * 12);
    sun.target.position.copy(target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -4.5; sun.shadow.camera.right = 4.5;
    sun.shadow.camera.top = 4.5; sun.shadow.camera.bottom = -4.5;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
    sun.shadow.camera.updateProjectionMatrix();   // nötig, damit die Grenzen wirklich gelten
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.layers.enable(1);
    scene.add(sun);
    scene.add(sun.target);
    renderer.shadowMap.needsUpdate = true;   // Schatten der Fensterwand und Gitterstäbe einmal berechnen

    // schwach sichtbarer Lichtstrahl vom Fenster zum Boden (nur Optik)
    const L = 3.9;
    beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.45, L),
      new THREE.MeshBasicMaterial({
        color: 0xffe0a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    beam.position.set(target.x - 0 + SUN_DIR.x * (L / 2), target.y + SUN_DIR.y * (L / 2), D + SUN_DIR.z * (L / 2));
    beam.lookAt(beam.position.x + SUN_DIR.x, beam.position.y + SUN_DIR.y, beam.position.z + SUN_DIR.z);
    scene.add(beam);
  }

  // t: 0 = Nacht (wie bisher), 1 = voller Morgen. Kann jedes Bild aufgerufen werden.
  function setMorning(t) {
    t = clamp01(t);
    if (t === morningT) return;
    morningT = t;
    if (t > 0) prepareMorning();
    if (sun) sun.intensity = MORNING_SUN * t;
    if (beam) beam.material.opacity = 0.07 * t;
    hemi.intensity = lerp(AMBIENT_INTENSITY, MORNING_AMBIENT, t);
    hemi.color.copy(hemiSkyNight).lerp(hemiSkyDay, t);
    hemi.groundColor.copy(hemiGroundNight).lerp(hemiGroundDay, t);
    M.sky.color.copy(skyNight).lerp(skyDay, t);
    scene.fog.color.copy(fogNight).lerp(fogDay, t);
    scene.fog.density = lerp(0.06, 0.042, t);
    renderer.setClearColor(scene.fog.color, 1);
    dustMat.opacity = lerp(0.45, 0.85, t);
  }

  // ---------- Animation (Fackelflackern, Staub) ----------
  function update(t) {
    const n = 0.5 * Math.sin(t * 13.1) + 0.3 * Math.sin(t * 7.7 + 1.3) + 0.2 * Math.sin(t * 23.3 + 0.4);
    torchLight.intensity = TORCH_INTENSITY * (1 + 0.1 * n);
    flame.scale.set(0.28 * (1 + 0.08 * n), 0.46 * (1 + 0.14 * n), 1);
    halo.scale.setScalar(1.4 * (1 + 0.05 * n));
    corridorLight.intensity = CORRIDOR_INTENSITY * (1 + 0.06 * Math.sin(t * 5.3 + 2.0));
    candleSprite.scale.set(0.09, 0.14 * (1 + 0.15 * Math.sin(t * 9.7)), 1);
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = dustBase[i * 3] + Math.sin(t * 0.21 + i * 1.7) * 0.18;
      dustPos[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(t * 0.17 + i * 2.3) * 0.12;
      dustPos[i * 3 + 2] = dustBase[i * 3 + 2] + Math.sin(t * 0.19 + i * 1.1) * 0.18;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  return {
    scene,
    colliders: buildColliders(),
    bounds: BOUNDS,
    spawn: SPAWN,
    textures: T,
    setEndDoor,
    setCellGate,
    refreshShadows,
    prepareMorning,
    setMorning,
    update,
  };
}

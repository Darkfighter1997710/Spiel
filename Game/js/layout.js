// layout.js – gemeinsame Maße der Zelle und aller festen Hindernisse.
// Wird von world.js (Darstellung) UND physics.js/Tests (Kollisionen) benutzt,
// damit Sichtbares und Berührbares immer exakt zusammenpassen.
// Einheiten: Meter. x = rechts, y = oben, z = nach hinten (Blick beim Start: -z).

export const ROOM = Object.freeze({ halfW: 2.5, halfD: 2.2, height: 3.0, wall: 0.5 });
export const DOOR = Object.freeze({ halfW: 0.65, height: 2.2 });
export const CORRIDOR = Object.freeze({ halfW: 1.2, length: 3.3 });

export const BED = Object.freeze({ minX: -2.5, maxX: -1.5, minZ: 0.3, maxZ: 2.2, top: 0.55 });
export const TABLE = Object.freeze({ minX: 1.35, maxX: 2.35, minZ: 1.4, maxZ: 2.1, top: 0.8 });
export const STOOL = Object.freeze({ x: 1.05, z: 0.95, half: 0.19, top: 0.46 });
export const BUCKET = Object.freeze({ x: 2.05, z: -1.7, half: 0.2, top: 0.34 });

export const SPAWN = Object.freeze({ x: 0.4, y: 0, z: 1.2, yaw: 0 });

// Innenraum-Grenzen (Sicherheitsnetz der Physik)
export const BOUNDS = Object.freeze({
  minX: -ROOM.halfW, maxX: ROOM.halfW,
  minZ: -ROOM.halfD, maxZ: ROOM.halfD,
  ceiling: ROOM.height,
});

function aabb(minX, maxX, minZ, maxZ, minY, maxY, name) {
  return { minX, maxX, minZ, maxZ, minY, maxY, name };
}

export function buildColliders() {
  const W = ROOM.halfW, D = ROOM.halfD, H = ROOM.height, T = ROOM.wall;
  const c = [];
  // Wände (Außenseiten überlappen an den Ecken, damit keine Lücken entstehen)
  c.push(aabb(-W - T, -W, -D - T, D + T, 0, H, 'wand-links'));
  c.push(aabb(W, W + T, -D - T, D + T, 0, H, 'wand-rechts'));
  c.push(aabb(-W, W, D, D + T, 0, H, 'wand-hinten'));
  c.push(aabb(-W, -DOOR.halfW, -D - T, -D, 0, H, 'wand-vorne-links'));
  c.push(aabb(DOOR.halfW, W, -D - T, -D, 0, H, 'wand-vorne-rechts'));
  // Gefängnistür (Gitter) – blockiert die gesamte Öffnung
  c.push(aabb(-DOOR.halfW, DOOR.halfW, -D - T, -D, 0, H, 'tuer'));
  // Möbel
  c.push(aabb(BED.minX, BED.maxX, BED.minZ, BED.maxZ, 0, BED.top, 'bett'));
  c.push(aabb(TABLE.minX, TABLE.maxX, TABLE.minZ, TABLE.maxZ, 0, TABLE.top, 'tisch'));
  c.push(aabb(STOOL.x - STOOL.half, STOOL.x + STOOL.half, STOOL.z - STOOL.half, STOOL.z + STOOL.half, 0, STOOL.top, 'hocker'));
  c.push(aabb(BUCKET.x - BUCKET.half, BUCKET.x + BUCKET.half, BUCKET.z - BUCKET.half, BUCKET.z + BUCKET.half, 0, BUCKET.top, 'eimer'));
  return c;
}

// ---- Gang hinter der Tür und Wärter-Auftritt ----
// Endwand des Gangs (bei den aktuellen Maßen z = -6,0)
export const END_Z = -(ROOM.halfD + ROOM.wall + CORRIDOR.length);
// Holztür am Gangende: öffnet sich, der Wärter tritt aus der dunklen Nische dahinter
export const END_DOOR = Object.freeze({ halfW: 0.6, height: 2.2 });
// Laufweg des Wärters (nur z ändert sich; er geht Richtung Zelle = +z)
export const GUARD = Object.freeze({
  x: 0,
  startZ: END_Z - 0.2,     // steht zuerst in der Nische hinter der Tür
  hideZ: END_Z - 0.4,      // dort verschwindet er wieder im Dunkeln
  stopZ: -3.3,             // bleibt ca. 0,6 m vor dem Gitter stehen
  headHeight: 1.68,        // Augenhöhe des Wärters (Ziel für den Blick der Kamera)
});

// ---- Schlafen im Bett ----
// Kopfposition auf dem Kissen (links hinten) und Blickrichtung beim Aufwachen: hinüber zur Mitte der Zelle,
// wo das Sonnenlicht auf den Boden fällt. yaw/pitch werden aus dem Blickziel berechnet (gleiche Formel wie in main.js).
const SLEEP_EYE = { x: -2.0, y: 0.72, z: 1.8 };
const SLEEP_LOOK = { x: 0.2, y: 0.9, z: -1.0 };
export const SLEEP_POSE = Object.freeze({
  ...SLEEP_EYE,
  yaw: Math.atan2(-(SLEEP_LOOK.x - SLEEP_EYE.x), -(SLEEP_LOOK.z - SLEEP_EYE.z)),
  pitch: Math.atan2(SLEEP_LOOK.y - SLEEP_EYE.y, Math.hypot(SLEEP_LOOK.x - SLEEP_EYE.x, SLEEP_LOOK.z - SLEEP_EYE.z)),
  reach: 0.95,   // so nah (Meter, gemessen bis zur Bettkante) muss der Spieler sein, damit „Schlafen“ erscheint
});

// Wie weit (Meter) ist der Mittelpunkt (x, z) von der Bettkante entfernt? 0 = auf dem Bett.
export function distanceToBed(x, z) {
  const cx = Math.min(Math.max(x, BED.minX), BED.maxX);
  const cz = Math.min(Math.max(z, BED.minZ), BED.maxZ);
  return Math.hypot(x - cx, z - cz);
}

// Prüft die Arm-Animation mit einem einfachen Ersatz für Three.js:  node tests/arms.test.js
import { createArms } from '../js/arms.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };

class V { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Obj {
  constructor() { this.position = new V(); this.rotation = new V(); this.scale = new V(); this.scale.set(1, 1, 1); this.children = []; this.layers = { set() {} }; }
  add(c) { this.children.push(c); return this; }
  traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); }
}
class Geo { rotateX() { return this; } translate() { return this; } }
const THREE = {
  Group: Obj, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  CapsuleGeometry: Geo, CylinderGeometry: Geo, BoxGeometry: Geo, SphereGeometry: Geo,
  MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
};

const arms = createArms(THREE, null);
let meshes = 0; arms.group.traverse((o) => { if (o.geometry) meshes++; });
console.log(`Arme bestehen aus ${meshes} Teilen (2 Arme, je Ärmel, Saum, Unterarm, Handfläche, 4 Finger à 3 Glieder, Daumen).`);
ok(arms.group.children.length === 2, 'es sollten zwei Arme existieren');
ok(arms.group.children[0].scale.x === 1 && arms.group.children[1].scale.x === -1, 'linker Arm ist nicht gespiegelt');

const right = arms.group.children[0].children[0], left = arms.group.children[1].children[0];
const base = { phase: 0, amp: 0, sprinting: false, grounded: true, vy: 0, yawRate: 0, pitchRate: 0, dip: 0, time: 0 };
const finite = (o) => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite);

// Ruhe: kaum Bewegung
for (let i = 0; i < 60; i++) arms.update(1 / 60, { ...base, time: i / 60 });
const idleR = right.position.z, idleRot = right.rotation.x;
ok(Math.abs(idleR) < 0.005, 'Ruhehaltung wippt zu stark');

// Gehen: links und rechts schwingen gegengleich, Bewegung vorhanden
let minZ = 1, maxZ = -1, opposite = 0, samples = 0;
for (let i = 0; i < 240; i++) {
  const phase = i * 0.09;
  arms.update(1 / 60, { ...base, phase, amp: 1, time: i / 60 });
  minZ = Math.min(minZ, right.position.z); maxZ = Math.max(maxZ, right.position.z);
  if (Math.abs(right.position.z) > 0.01) { samples++; if (Math.sign(right.position.z) !== Math.sign(left.position.z)) opposite++; }
  ok(finite(right) && finite(left), 'NaN in der Armbewegung (gehen)');
}
const walkSwing = maxZ - minZ;
console.log(`Gehen: Armschwung vor/zurück ${(walkSwing * 100).toFixed(1)} cm, gegengleich in ${opposite}/${samples} Bildern`);
ok(walkSwing > 0.07 && walkSwing < 0.14, `Schwung unnatürlich (${walkSwing})`);
ok(opposite === samples, 'Arme schwingen nicht gegengleich');

// Sprinten: größerer Schwung, Hände ballen sich (Fingerwinkel größer)
function fingerAngle(arm) { return arm.children[0].children.length; }
let minS = 1, maxS = -1;
for (let i = 0; i < 300; i++) {
  arms.update(1 / 60, { ...base, phase: i * 0.16, amp: 1.5, sprinting: true, time: i / 60 });
  if (i > 120) { minS = Math.min(minS, right.position.z); maxS = Math.max(maxS, right.position.z); }
  ok(finite(right) && finite(left), 'NaN in der Armbewegung (sprinten)');
}
const sprintSwing = maxS - minS;
console.log(`Sprinten: Armschwung ${(sprintSwing * 100).toFixed(1)} cm (Gehen: ${(walkSwing * 100).toFixed(1)} cm)`);
ok(sprintSwing > walkSwing * 1.3, 'Sprint schwingt nicht stärker als Gehen');

// Hände schließen sich beim Sprinten (Finger-Gelenkwinkel messen)
function firstFingerJointX(poseGroup) {
  const hand = poseGroup.children[0].children.find((c) => c.children.length > 5);
  return hand.children[2].children[0].rotation.x;    // Mittelfinger, 1. Gelenk
}
const sprintCurl = firstFingerJointX(right);
for (let i = 0; i < 200; i++) arms.update(1 / 60, { ...base, time: i / 60 });
const relaxCurl = firstFingerJointX(right);
console.log(`Fingerkrümmung: locker ${relaxCurl.toFixed(2)} rad, Sprint ${sprintCurl.toFixed(2)} rad`);
ok(sprintCurl < relaxCurl - 0.3, 'Hand schließt sich beim Sprinten nicht');

// Luft: Arme heben sich
const yGround = right.position.y;
for (let i = 0; i < 90; i++) arms.update(1 / 60, { ...base, grounded: false, vy: 2, time: i / 60 });
console.log(`Sprung: Hände heben sich um ${((right.position.y - yGround) * 100).toFixed(1)} cm`);
ok(right.position.y > yGround + 0.02, 'Arme heben sich im Sprung nicht');

// Zufalls-Dauertest
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 5000; i++) {
  arms.update(0.001 + rnd() * 0.05, { phase: rnd() * 100, amp: rnd() * 1.6, sprinting: rnd() < 0.5, grounded: rnd() < 0.6, vy: (rnd() - 0.5) * 10, yawRate: (rnd() - 0.5) * 40, pitchRate: (rnd() - 0.5) * 40, dip: -rnd() * 0.14, time: i });
  if (!finite(right) || !finite(left)) { ok(false, 'NaN im Zufallstest'); break; }
}
ok(Math.abs(right.position.x) < 0.2 && Math.abs(right.position.y) < 0.3, 'Arme laufen aus dem Bild');

console.log(failures === 0 ? 'ALLE ARM-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

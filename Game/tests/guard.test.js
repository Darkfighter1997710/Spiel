// Prüft die Wärter-Figur und ihre Animation mit einem einfachen Ersatz für Three.js:  node tests/guard.test.js
import { createGuard } from '../js/guard.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };

class V { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Obj {
  constructor() { this.position = new V(); this.rotation = new V(); this.scale = new V(); this.scale.set(1, 1, 1); this.children = []; this.parent = null; this.visible = true; }
  add(c) { c.parent = this; this.children.push(c); return this; }
  traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); }
}
const geo = (name) => class { constructor(...a) { this.kind = name; this.args = a; } };
const THREE = {
  Group: Obj,
  Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  CylinderGeometry: geo('cyl'), BoxGeometry: geo('box'), SphereGeometry: geo('sph'), TorusGeometry: geo('tor'),
  MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
};

const { group, update } = createGuard(THREE);
let meshes = 0; group.traverse((o) => { if (o.geometry) meshes++; });
console.log(`Wärter besteht aus ${meshes} Teilen (Helm, Bart, Wams, Gürtel, Schlüsselbund, Knüppel, Arme, Beine, Stiefel).`);

const find = (kind, ...a) => { let r = null; group.traverse((o) => { if (o.geometry && o.geometry.kind === kind && a.every((v, i) => o.geometry.args[i] === v)) r = o; }); return r; };
const mouth = find('box', 0.042, 0.008, 0.012);
const head = mouth.parent;
const thighR = find('cyl', 0.075, 0.062, 0.44).parent;               // erstes Bein (rechts)
let thighL = null; group.traverse((o) => { if (o.geometry && o.geometry.kind === 'cyl' && o.geometry.args[2] === 0.44 && o.parent !== thighR) thighL = o.parent; });
const base = { x: 0, z: -3.3, yaw: 0, visible: true, phase: 0, amp: 0, talking: false, attention: false, time: 0, lookYaw: 0, lookPitch: 0 };

// Unsichtbar = nicht gezeichnet
update(1 / 60, { ...base, visible: false });
ok(group.visible === false, 'unsichtbarer Wärter wird gezeichnet');
update(1 / 60, base);
ok(group.visible === true && group.position.z === -3.3, 'Position/Sichtbarkeit falsch');

// Gehen: Beine schwingen gegengleich
let maxR = 0, opposite = 0, samples = 0;
for (let i = 0; i < 240; i++) {
  update(1 / 60, { ...base, phase: i * 0.1, amp: 1, time: i / 60 });
  maxR = Math.max(maxR, Math.abs(thighR.rotation.x));
  if (Math.abs(thighR.rotation.x) > 0.05) { samples++; if (Math.sign(thighR.rotation.x) !== Math.sign(thighL.rotation.x)) opposite++; }
}
console.log(`Gehen: Beinausschlag bis ${maxR.toFixed(2)} rad, gegengleich in ${opposite}/${samples} Bildern`);
ok(maxR > 0.45 && maxR < 0.7, `Beinausschlag unnatürlich (${maxR})`);
ok(opposite === samples, 'Beine schwingen nicht gegengleich');

// Im Stand keine Beinbewegung
for (let i = 0; i < 60; i++) update(1 / 60, { ...base, phase: 1.3, amp: 0, time: i / 60 });
ok(Math.abs(thighR.rotation.x) < 0.01, 'Beine bewegen sich im Stand');

// Kopf folgt dem Spieler (nur mit Aufmerksamkeit, begrenzt)
for (let i = 0; i < 120; i++) update(1 / 60, { ...base, attention: false, lookYaw: 1.2, time: i / 60 });
ok(Math.abs(head.rotation.y) < 0.02, 'Kopf dreht sich ohne Aufmerksamkeit');
for (let i = 0; i < 120; i++) update(1 / 60, { ...base, attention: true, lookYaw: 0.5, time: i / 60 });
ok(Math.abs(head.rotation.y - 0.5) < 0.03, `Kopf folgt nicht (${head.rotation.y})`);
for (let i = 0; i < 120; i++) update(1 / 60, { ...base, attention: true, lookYaw: 2.8, time: i / 60 });
ok(head.rotation.y <= 0.91, `Kopf dreht zu weit (${head.rotation.y})`);

// Sprechen: Mund öffnet sich, Mund bleibt sonst geschlossen
let maxMouth = 0;
for (let i = 0; i < 120; i++) { update(1 / 60, { ...base, talking: true, attention: true, time: i / 60 }); maxMouth = Math.max(maxMouth, mouth.scale.y); }
console.log(`Sprechen: Mund öffnet sich bis Faktor ${maxMouth.toFixed(2)}`);
ok(maxMouth > 1.8, 'Mund öffnet sich beim Sprechen nicht');
for (let i = 0; i < 120; i++) update(1 / 60, { ...base, talking: false, attention: true, time: 3 + i / 60 });
ok(mouth.scale.y < 1.05, 'Mund bleibt nach dem Sprechen offen');

// Zufalls-Dauertest: nie ungültige Werte
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 5000; i++) {
  update(0.001 + rnd() * 0.05, { x: rnd() * 2 - 1, z: -6.4 + rnd() * 3, yaw: rnd() * 7, visible: rnd() < 0.9, phase: rnd() * 200, amp: rnd(), talking: rnd() < 0.5, attention: rnd() < 0.5, time: i, lookYaw: (rnd() - 0.5) * 12, lookPitch: (rnd() - 0.5) * 3 });
  let bad = false;
  group.traverse((o) => { for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z]) if (!Number.isFinite(v)) bad = true; });
  if (bad) { ok(false, 'NaN in der Animation'); break; }
}

console.log(failures === 0 ? 'ALLE WÄRTER-FIGUR-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

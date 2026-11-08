// Automatische Prüfung der Physik (Node.js, ohne Browser):  node tests/physics.test.mjs
import { PlayerPhysics, PLAYER } from '../js/physics.mjs';
import { buildColliders, BOUNDS, SPAWN, BED, TABLE, ROOM } from '../js/layout.mjs';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FEHLER:', msg); } };
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const colliders = buildColliders();
const fresh = (x = SPAWN.x, z = SPAWN.z) => new PlayerPhysics(colliders, BOUNDS, { x, z, y: 0 });

function checkInvariants(pl, label) {
  const r = PLAYER.radius;
  ok(Number.isFinite(pl.x) && Number.isFinite(pl.y) && Number.isFinite(pl.z), `${label}: NaN`);
  ok(pl.x >= BOUNDS.minX + r - 1e-6 && pl.x <= BOUNDS.maxX - r + 1e-6, `${label}: x außerhalb (${pl.x})`);
  ok(pl.z >= BOUNDS.minZ + r - 1e-6 && pl.z <= BOUNDS.maxZ - r + 1e-6, `${label}: z außerhalb (${pl.z})`);
  ok(pl.y >= -1e-9, `${label}: unter dem Boden (${pl.y})`);
  ok(pl.y + PLAYER.height <= ROOM.height + 1e-6, `${label}: Decke durchstoßen`);
  for (const c of colliders) {
    if (!pl.isBlocking(c)) continue;
    const dx = pl.x - clamp(pl.x, c.minX, c.maxX), dz = pl.z - clamp(pl.z, c.minZ, c.maxZ);
    const d = Math.hypot(dx, dz);
    ok(d >= r - 2e-3, `${label}: steckt in "${c.name}" (Abstand ${d.toFixed(4)}, y=${pl.y.toFixed(2)})`);
  }
}

// 1) Zufallsläufe: wild laufen, sprinten, springen, drehen – mit festem und wackeligem Zeitschritt
for (let run = 0; run < 24; run++) {
  const rand = mulberry32(1000 + run);
  const pl = fresh(-1 + rand() * 2, -1 + rand() * 2);
  let yaw = rand() * 6.28, ix = 0, iz = 0, sprint = false;
  for (let i = 0; i < 30000; i++) {
    if (i % 25 === 0) { const a = rand() * 6.28, m = rand() < 0.2 ? 0 : 0.3 + rand() * 0.7; ix = Math.cos(a) * m; iz = Math.sin(a) * m; sprint = rand() < 0.5; }
    yaw += (rand() - 0.5) * 0.08;
    pl.setInput(ix, iz, sprint, yaw);
    if (rand() < 0.01) pl.queueJump();
    const dt = run % 2 === 0 ? 1 / 90 : (1 / 90) * (0.5 + rand());
    pl.step(dt);
    checkInvariants(pl, `zufall#${run}@${i}`);
  }
}

// 2) Mit voller Geschwindigkeit in jede Wand und jede Ecke laufen
const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
for (const [dx, dz] of dirs) {
  const pl = fresh(0.0, 0.0);
  const yaw = Math.atan2(-dx, -dz);   // so drehen, dass "vorwärts" = (dx,dz)
  for (let i = 0; i < 1500; i++) { pl.setInput(0, 1, true, yaw); pl.step(1 / 60); checkInvariants(pl, `wand(${dx},${dz})`); }
}

// 3) Tür: genau auf die Tür zulaufen darf nicht hindurchführen
{
  const pl = fresh(0, 0);
  for (let i = 0; i < 600; i++) { pl.setInput(0, 1, true, 0); pl.step(1 / 60); }
  ok(pl.z >= -ROOM.halfD + PLAYER.radius - 1e-6, `Tür durchschritten (z=${pl.z})`);
  console.log(`Tür-Test: Figur stoppt bei z=${pl.z.toFixed(3)} (Tür bei z=${-ROOM.halfD})`);
}

// 4) Springen: nur vom Boden, kein Mehrfachsprung, Rückkehr auf den Boden
{
  const pl = fresh(0.4, 0.0);
  for (let i = 0; i < 90; i++) pl.step(1 / 90);
  ok(pl.grounded && Math.abs(pl.y) < 1e-9, 'steht nicht auf dem Boden');
  let maxY = 0, landings = 0, wasAir = false;
  for (let i = 0; i < 90 * 20; i++) {
    pl.queueJump();                       // Dauerfeuer auf dem Sprung-Knopf
    pl.step(1 / 90);
    maxY = Math.max(maxY, pl.y);
    if (!pl.grounded) wasAir = true; else if (wasAir) { landings++; wasAir = false; }
  }
  const theory = PLAYER.jumpSpeed ** 2 / (2 * PLAYER.gravity);
  console.log(`Sprung-Test: max. Höhe ${maxY.toFixed(3)} m (Theorie ${theory.toFixed(3)} m), Landungen: ${landings}`);
  ok(maxY <= theory + 0.02, `Sprung zu hoch (${maxY})`);
  ok(maxY >= theory - 0.05, `Sprung zu niedrig (${maxY})`);
  ok(landings >= 10, 'zu wenige Landungen');
}
{ // Einmaliges Antippen mitten in der Luft ändert nichts
  const pl = fresh(0.4, 0.0);
  for (let i = 0; i < 90; i++) pl.step(1 / 90);
  pl.queueJump(); pl.step(1 / 90);
  for (let i = 0; i < 10; i++) pl.step(1 / 90);
  const vyBefore = pl.vy;
  pl.queueJump(); pl.step(1 / 90);
  ok(pl.vy < vyBefore, 'Luftsprung möglich!');
}

// 5) Bett: Gehen gegen das Bett blockiert, Springen darauf ist möglich und man bleibt oben stehen
{
  const pl = fresh(-0.8, 1.2);
  for (let i = 0; i < 300; i++) { pl.setInput(0, 1, false, Math.PI / 2); pl.step(1 / 90); checkInvariants(pl, 'bett-gehen'); }
  console.log(`Bett-Test (laufen): x=${pl.x.toFixed(3)}, y=${pl.y.toFixed(3)} (Bettkante x=${BED.maxX})`);
  ok(pl.x >= BED.maxX + PLAYER.radius - 1e-3 && pl.y === 0, 'Bett wurde durchlaufen/erklommen ohne Sprung');
  let onBed = false;
  for (let i = 0; i < 400; i++) { if (i % 60 === 0) pl.queueJump(); pl.setInput(0, 1, false, Math.PI / 2); pl.step(1 / 90); checkInvariants(pl, 'bett-springen'); if (pl.grounded && Math.abs(pl.y - BED.top) < 1e-6) onBed = true; }
  console.log(`Bett-Test (springen): auf dem Bett gelandet: ${onBed}`);
  ok(onBed, 'Aufs Bett springen klappt nicht');
}

// 6) Tisch ist zu hoch zum Draufspringen (verhält sich wie eine Wand)
{
  const pl = fresh(1.0, 1.75);
  let maxY = 0;
  for (let i = 0; i < 1200; i++) { if (i % 50 === 0) pl.queueJump(); pl.setInput(0, 1, false, -Math.PI / 2); pl.step(1 / 90); checkInvariants(pl, 'tisch'); maxY = Math.max(maxY, pl.y); }
  console.log(`Tisch-Test: x=${pl.x.toFixed(3)}, höchste Höhe ${maxY.toFixed(3)} (Tischkante x=${TABLE.minX}, Tischhöhe ${TABLE.top})`);
  ok(pl.x <= TABLE.minX - PLAYER.radius + 1e-3, 'Tisch durchlaufen');
  ok(maxY < TABLE.top - 0.02, 'Auf den Tisch gelangt, obwohl zu hoch');
}

console.log(failures === 0 ? '\nALLE PHYSIK-TESTS BESTANDEN' : `\n${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

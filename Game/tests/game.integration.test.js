// Integrationstest: startet das echte Spiel (main.js + alle Module) mit simuliertem Bildschirm und Fingern.
//   node tests/game.integration.test.js
// Three.js ist dabei eine Attrappe (die echte Bibliothek ist für den Test nicht nötig). Geprüft werden Ablauf
// und Zusammenspiel: Start, Joystick, Sprint gegen die Tür, Sprung, Arme, zwei Zeichendurchgänge, Wärter-Gespräch,
// Schlafen im Bett mit Sonnenaufgang, Einstellungen.
// NICHT geprüft werden kann, wie das Spiel aussieht oder wie es sich auf einem Handy anfühlt.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'verlies-'));
cpSync(root, tmp, { recursive: true, filter: (src) => !src.includes('node_modules') && !src.includes('/.git') });

// ---- Attrappe für libs/three.module.min.js erzeugen: exportiert genau die Namen, die der Code benutzt ----
const sources = [join(tmp, 'main.js'), ...readdirSync(join(tmp, 'js')).map((f) => join(tmp, 'js', f))];
const names = new Set();
for (const f of sources) for (const m of readFileSync(f, 'utf8').matchAll(/THREE\.([A-Za-z0-9_]+)/g)) names.add(m[1]);
const special = new Set(['PerspectiveCamera', 'WebGLRenderer', 'REVISION', 'SpotLight']);
const isConst = (n) => /(Mapping|ColorSpace|Blending|Wrapping|ShadowMap)$/.test(n);
let stub = `
const generic = (name) => {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'then') return undefined;
      if (p === 'length') return 0;
      if (p === Symbol.iterator) return function* () {};
      if (!(p in t)) t[p] = generic(String(p));
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return generic('ret'); },
    construct() { return generic('new'); },
  });
};
export const REVISION = 'test';
export class PerspectiveCamera {
  constructor() {
    this.fov = 72; this.aspect = 1;
    this.layers = { n: 0, set(n) { this.n = n; } };
    this.rotation = { order: '', set: (p, y, r) => globalThis.__rotLog.push([p, y, r]) };
    this.position = { set: (x, y, z) => globalThis.__camLog.push([x, y, z]) };
  }
  add() {} updateProjectionMatrix() {}
}
// Sonnenlicht: der Test merkt sich das Objekt, um die Helligkeit lesen zu können
export class SpotLight { constructor() { const g = generic('spot'); globalThis.__sun = g; return g; } }
export class WebGLRenderer {
  constructor() { this.capabilities = { getMaxAnisotropy: () => 8 }; this.shadowMap = {}; }
  setPixelRatio() {} setSize() {} compile() {} clear() { globalThis.__renders.push('C'); }
  clearDepth() { globalThis.__renders.push('D'); }
  render(scene, camera) { globalThis.__renders.push(camera.layers.n); }
  addEventListener() {}
}
`;
for (const n of names) {
  if (special.has(n)) continue;
  stub += isConst(n) ? `export const ${n} = 1;\n` : `export class ${n} { constructor() { return generic('${n}'); } }\n`;
}
writeFileSync(join(tmp, 'libs', 'three.module.min.js'), stub);

// ---- simulierter Bildschirm ----
globalThis.__camLog = [];
globalThis.__rotLog = [];
globalThis.__renders = [];
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    return p in t ? t[p] : () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const initiallyHidden = new Set([...indexHtml.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\shidden[\s>\/]/g)].map((m) => m[1]));
const elements = {};
function fakeEl(id) {
  const handlers = {};
  const classes = new Set();
  let text = '';
  const el = {
    id, style: {}, hidden: initiallyHidden.has(id), disabled: false, value: '1', checked: false, children: [], type: '', className: '',
    appendChild(c) { el.children.push(c); return c; },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    setPointerCapture() {}, closest: () => null, getContext: () => ctx,
    fire(t, ev = {}) { (handlers[t] || []).forEach((f) => f({ preventDefault() {}, target: el, ...ev })); },
  };
  Object.defineProperty(el, 'textContent', {
    get: () => text,
    set: (v) => { text = v; if (v === '') el.children.length = 0; },
  });
  return el;
}
globalThis.document = {
  hidden: false, fullscreenEnabled: false,
  getElementById: (id) => (elements[id] = elements[id] || fakeEl(id)),
  createElement: (tag) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx } : fakeEl(tag)),
  addEventListener() {},
  documentElement: fakeEl('root'),
};
globalThis.window = globalThis;
Object.assign(globalThis, { innerWidth: 800, innerHeight: 400, devicePixelRatio: 2, addEventListener() {}, visualViewport: undefined });
globalThis.CanvasRenderingContext2D = { prototype: { filter: '' } };
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };

let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.error('FEHLER:', msg); } };
const tick = () => new Promise((r) => setTimeout(r, 30));
let t = 1000;
async function frames(n) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; t += 16.7; if (cb) cb(t); } }
const E = (id) => elements[id];
const lastCam = () => globalThis.__camLog[globalThis.__camLog.length - 1];

try {
  await import(pathToFileURL(join(tmp, 'main.js')).href);   // das Spiel "starten"
  for (let i = 0; i < 6; i++) await tick();

  ok(!(E('error-box') && E('error-box').hidden === false), `Fehlerfenster wurde angezeigt: ${E('error-text') && E('error-text').textContent}`);
  ok(E('start-btn').disabled === false && E('start-btn').textContent === 'Spiel starten', `Startknopf nicht bereit (${E('start-btn').textContent})`);

  await frames(5);
  ok(globalThis.__camLog.length >= 5, 'Kamera wird nicht gesetzt');
  const [sx, sy, sz] = lastCam();
  console.log(`Start: Kamera bei x=${sx.toFixed(2)} y=${sy.toFixed(2)} z=${sz.toFixed(2)}`);
  ok(Math.abs(sy - 1.65) < 0.05 && Math.abs(sz - 1.2) < 0.05, 'Startposition falsch');

  // Pro Bild: zuerst löschen, dann Welt (Ebene 0), dann Tiefe löschen, dann Arme (Ebene 1)
  const r = globalThis.__renders.slice(-4);
  ok(JSON.stringify(r) === JSON.stringify(['C', 0, 'D', 1]), `Zeichenreihenfolge falsch: ${JSON.stringify(r)}`);

  E('start-btn').fire('click');
  ok(E('start-screen').hidden === true && E('hud').hidden === false, 'Start blendet Menü nicht aus');

  // Joystick links nach oben + Sprint halten -> gegen die Tür laufen
  E('touch-layer').fire('pointerdown', { pointerId: 1, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });
  E('btn-sprint').fire('pointerdown', { pointerId: 2 });
  await frames(150);
  const [x, y, z] = lastCam();
  console.log(`Nach Sprint gegen Tür: x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)}`);
  ok(z > -1.95 && z < -1.8, `Tür-Kollision im Gesamtspiel falsch (z=${z})`);
  ok(Math.abs(y - 1.65) < 0.12, `Augenhöhe falsch (y=${y})`);

  // Loslassen, rechts umsehen, springen
  E('touch-layer').fire('pointerup', { pointerId: 1 });
  E('btn-sprint').fire('pointerup', { pointerId: 2 });
  E('touch-layer').fire('pointerdown', { pointerId: 3, clientX: 600, clientY: 200 });
  E('touch-layer').fire('pointermove', { pointerId: 3, clientX: 700, clientY: 150 });
  E('btn-jump').fire('pointerdown', { pointerId: 4 });
  let maxY = 0;
  for (let i = 0; i < 60; i++) { await frames(1); maxY = Math.max(maxY, lastCam()[1]); }
  console.log(`Sprung: höchste Augenhöhe ${maxY.toFixed(2)} m (Stand: 1.65 m)`);
  ok(maxY > 1.65 + 0.4, 'Sprung hebt die Kamera nicht');
  ok(Math.abs(lastCam()[1] - 1.65) < 0.12, 'Kamera landet nicht wieder am Boden');

  // ---------- Wärter-Auftritt ----------
  // Wer 15 Sekunden gespielt hat, bekommt Besuch. Bisher wurden ca. 5,7 s gespielt.
  E('touch-layer').fire('pointerup', { pointerId: 3 });
  const hudActive = () => E('hud').classList.has('dialogue-active');
  let playedMs = 150 * 16.7 + 60 * 16.7 + 5 * 16.7;      // Bilder, die bisher gespielt wurden (ungefähr)
  let earlyShow = false, reachedAt = null;
  for (let i = 0; i < 3000 && !hudActive(); i++) {
    await frames(1); playedMs += 16.7;
    if (hudActive() && playedMs < 15000) earlyShow = true;
  }
  reachedAt = playedMs / 1000;
  ok(hudActive() && !earlyShow, `Gespräch erscheint nicht oder zu früh (${reachedAt.toFixed(1)} s)`);
  ok(E('dialogue').hidden === false, 'Gesprächsfenster nicht sichtbar');
  console.log(`Wärter: Gespräch beginnt nach ca. ${reachedAt.toFixed(1)} s Spielzeit (15 s Wartezeit + Tür + Gehweg).`);

  await frames(20);
  ok(E('dialogue-speaker').textContent === 'Wärter', `Sprecher falsch: "${E('dialogue-speaker').textContent}"`);
  ok(E('dialogue-text').textContent.length > 0, 'Text erscheint nicht');
  const typed = E('dialogue-text').textContent.length;
  await frames(20);
  ok(E('dialogue-text').textContent.length > typed, 'Schreibmaschinen-Effekt läuft nicht');

  // Eingaben sind im Gespräch gesperrt: Joystick bewirkt nichts, Joystick/Buttons sind ausgeblendet
  const before = lastCam();
  E('touch-layer').fire('pointerdown', { pointerId: 10, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 10, clientX: 150, clientY: 100 });
  E('btn-jump').fire('pointerdown', { pointerId: 11 });
  await frames(30);
  const after = lastCam();
  ok(Math.abs(after[0] - before[0]) < 0.01 && Math.abs(after[2] - before[2]) < 0.01 && Math.abs(after[1] - before[1]) < 0.05, 'Spieler bewegt sich im Gespräch');
  E('touch-layer').fire('pointerup', { pointerId: 10 });

  // Gespräch durchspielen: tippen bzw. jeweils die zweite Antwort wählen
  let steps = 0, choicesSeen = 0, spokenLines = new Set();
  while (hudActive() && steps++ < 400) {
    spokenLines.add(E('dialogue-text').textContent);
    const kids = E('dialogue-choices').children;
    if (kids.length > 0) { choicesSeen++; ok(kids.length === 3, 'es sollten 3 Antworten da sein'); kids[1].fire('click'); await frames(3); }
    else { E('dialogue-tap').fire('pointerdown', { pointerId: 20 }); await frames(8); }
  }
  ok(!hudActive() && E('dialogue').hidden === true, 'Gespräch endet nicht');
  ok(choicesSeen === 2, `Antworten wurden ${choicesSeen}-mal angeboten (erwartet 2)`);
  console.log(`Gespräch durchgespielt: ${spokenLines.size} Textstände, ${choicesSeen} Auswahlen.`);

  // Danach ist die Steuerung wieder frei (Wärter geht, Tür schließt sich)
  const pos0 = lastCam();
  E('touch-layer').fire('pointerdown', { pointerId: 30, clientX: 150, clientY: 200 });
  E('touch-layer').fire('pointermove', { pointerId: 30, clientX: 150, clientY: 360 });   // nach unten = rückwärts
  await frames(60);
  const pos1 = lastCam();
  console.log(`Danach: Spieler läuft wieder (z von ${pos0[2].toFixed(2)} auf ${pos1[2].toFixed(2)}).`);
  ok(pos1[2] > pos0[2] + 0.5, 'Steuerung nach dem Gespräch nicht frei');
  E('touch-layer').fire('pointerup', { pointerId: 30 });
  await frames(400);                                                // Wärter verschwindet, Tür schließt sich
  ok(!hudActive() && !(E('error-box') && E('error-box').hidden === false), 'Fehler nach dem Auftritt');

  // ---------- Schlafen im Bett ----------
  const rot = () => globalThis.__rotLog[globalThis.__rotLog.length - 1];
  const sun = () => globalThis.__sun.intensity;
  const fadeOpacity = () => Number(E('sleep-fade').style.opacity || 0);
  ok(E('btn-sleep').hidden === true, 'Schlafen-Knopf ist weit weg vom Bett sichtbar');
  ok(E('sleep-hint').hidden === false, 'Hinweis „Geh zum Bett“ erscheint nach dem Wärter nicht');
  ok(sun() === 0, `Sonne scheint schon vor dem Schlafen (Helligkeit ${sun()})`);

  // zum Bett laufen (Ziel: neben der Bettkante, 0,3 m davor)
  async function walkTo(tx, tz) {
    E('touch-layer').fire('pointerdown', { pointerId: 40, clientX: 150, clientY: 300 });
    for (let i = 0; i < 300; i++) {
      const [x, , z] = lastCam();
      let wx = tx - x, wz = tz - z;
      const d = Math.hypot(wx, wz);
      if (d < 0.12) break;
      wx /= d; wz /= d;
      const sy = Math.sin(rot()[1]), cy = Math.cos(rot()[1]);
      const inX = cy * wx - sy * wz, inZ = -(sy * wx + cy * wz);
      E('touch-layer').fire('pointermove', { pointerId: 40, clientX: 150 + inX * 100, clientY: 300 - inZ * 100 });
      await frames(2);
    }
    E('touch-layer').fire('pointerup', { pointerId: 40 });
    await frames(30);
  }
  await walkTo(-1.2, 1.0);
  const [bx, , bz] = lastCam();
  console.log(`Am Bett angekommen: x=${bx.toFixed(2)} z=${bz.toFixed(2)}`);
  ok(E('btn-sleep').hidden === false, 'Schlafen-Knopf erscheint am Bett nicht');
  ok(E('sleep-hint').hidden === true, 'Hinweis bleibt am Bett stehen');

  E('btn-sleep').fire('click');
  await frames(2);
  ok(E('btn-sleep').hidden === true && E('hud').classList.has('sleeping'), 'Schlafen startet nicht (Knopf/Sperre)');

  // Während des Schlafens sind Eingaben gesperrt, es wird schwarz, dann liegt die Kamera im Bett
  E('touch-layer').fire('pointerdown', { pointerId: 41, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 41, clientX: 150, clientY: 100 });
  let sawBlack = false, caption1 = '', caption2 = '', sunWhileBlack = null;
  for (let i = 0; i < 900 && !(sawBlack && fadeOpacity() < 0.99 && i > 0 && E('sleep-caption').textContent !== caption1 && caption2); i++) {
    await frames(1);
    if (fadeOpacity() > 0.99) {
      sawBlack = true;
      if (!caption1) caption1 = E('sleep-caption').textContent;
      if (E('sleep-caption').textContent !== caption1) caption2 = E('sleep-caption').textContent;
      sunWhileBlack = sun();
    }
    if (fadeOpacity() > 0.99 && caption2) break;
  }
  ok(sawBlack, 'Bildschirm wird beim Schlafen nicht schwarz');
  ok(caption1 === 'Du schläfst ein …' && caption2 === 'Am nächsten Morgen …', `Texte beim Schlafen: "${caption1}" / "${caption2}"`);
  ok(sunWhileBlack === 0, `Sonne schon vor dem Aufwachen an (${sunWhileBlack})`);
  const lie = lastCam();
  console.log(`Im Bett: Kamera x=${lie[0].toFixed(2)} y=${lie[1].toFixed(2)} z=${lie[2].toFixed(2)}`);
  ok(Math.abs(lie[0] + 2.0) < 0.05 && Math.abs(lie[1] - 0.72) < 0.05 && Math.abs(lie[2] - 1.8) < 0.05, 'Kamera liegt nicht auf dem Kissen');
  ok(E('hud').classList.has('sleeping'), 'Eingaben während des Schlafens nicht gesperrt');

  // Aufwachen: Bild wird hell, Sonne geht auf
  let sunMid = 0;
  for (let i = 0; i < 900 && fadeOpacity() > 0.02; i++) { await frames(1); sunMid = Math.max(sunMid, sun()); }
  ok(fadeOpacity() <= 0.02, 'Schwarz blendet nicht wieder aus');
  ok(sunMid > 0, 'Sonne geht beim Aufwachen nicht auf');
  for (let i = 0; i < 900 && E('hud').classList.has('sleeping'); i++) await frames(1);
  ok(!E('hud').classList.has('sleeping'), 'Sperre endet nicht');
  await frames(5);
  const up = lastCam();
  console.log(`Nach dem Schlafen: Sonne ${sun()} (von 140), Kamera y=${up[1].toFixed(2)}`);
  ok(Math.abs(sun() - 140) < 1e-6, `Sonne nicht auf voller Helligkeit (${sun()})`);
  ok(Math.abs(up[1] - 1.65) < 0.12 && Math.abs(up[0] - bx) < 0.1, 'Kamera steht nach dem Aufstehen nicht wieder am alten Platz');
  ok(E('sleep-fade').hidden === true && E('sleep-caption').textContent === '', 'Schwarzblende bleibt sichtbar');

  // Danach: Steuerung wieder frei, Licht bleibt, Schlafen gibt es nicht zweimal
  E('touch-layer').fire('pointerup', { pointerId: 41 });
  await frames(30);
  const bedPos = lastCam();
  E('touch-layer').fire('pointerdown', { pointerId: 42, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 42, clientX: 150, clientY: 100 });
  await frames(60);
  E('touch-layer').fire('pointerup', { pointerId: 42 });
  const moved = Math.hypot(lastCam()[0] - bedPos[0], lastCam()[2] - bedPos[2]);
  ok(moved > 0.3, 'Steuerung nach dem Schlafen nicht frei');
  await walkTo(-1.2, 1.0);
  ok(E('btn-sleep').hidden === true, 'Schlafen-Knopf erscheint ein zweites Mal');
  ok(Math.abs(sun() - 140) < 1e-6, 'Tageslicht geht wieder weg');

  // Einstellungen
  E('btn-settings').fire('click');
  ok(E('settings-panel').hidden === false, 'Einstellungen öffnen sich nicht');
  E('btn-resume').fire('click');
  ok(E('settings-panel').hidden === true, 'Weiter schließt Einstellungen nicht');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nGESAMTSPIEL-TEST BESTANDEN' : `\n${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

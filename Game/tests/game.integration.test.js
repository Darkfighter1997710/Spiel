// Integrationstest: startet das echte Spiel (main.js + alle Module) mit simuliertem Bildschirm und Fingern.
//   node tests/game.integration.test.js
// Three.js ist dabei eine Attrappe (die echte Bibliothek ist für den Test nicht nötig). Geprüft werden Ablauf
// und Zusammenspiel: Start, Joystick, Sprint gegen die Tür, Sprung, Arme, zwei Zeichendurchgänge, Einstellungen.
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
const special = new Set(['PerspectiveCamera', 'WebGLRenderer', 'DirectionalLight', 'REVISION']);
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
    this.rotation = { order: '', set() {} };
    this.position = { set: (x, y, z) => globalThis.__camLog.push([x, y, z]) };
  }
  add() {} updateProjectionMatrix() {}
}
export class DirectionalLight {
  constructor() {
    this.intensity = 0;
    this.position = { set() {}, copy() {} };
    this.target = { position: { copy() {}, set() {} } };
    this.shadow = { mapSize: { set() {} }, camera: { updateProjectionMatrix() {} } };
    this.layers = { enable() {} };
    globalThis.__sun = this;   // der Test prüft, wann das Sonnenlicht entsteht und wie hell es wird
  }
}
export class WebGLRenderer {
  constructor() { this.capabilities = { getMaxAnisotropy: () => 8 }; this.shadowMap = {}; }
  setPixelRatio() {} setSize() {} setClearColor() {} compile() {} clear() { globalThis.__renders.push('C'); }
  clearDepth() { globalThis.__renders.push('D'); }
  render(scene, camera) { globalThis.__renders.push(camera.layers.n); globalThis.__bgAtRender.push(scene.background === null); }
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
globalThis.__renders = [];
globalThis.__bgAtRender = [];
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

  // Regressionstest: Mit Hintergrundfarbe in der Szene löscht Three.js bei JEDEM Durchgang das Bild -> alles schwarz
  ok(globalThis.__bgAtRender.length > 0 && globalThis.__bgAtRender.every((v) => v === true), 'Szene hat eine Hintergrundfarbe: zweiter Durchgang würde die Welt wegwischen');

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
    if (kids.length > 0) { choicesSeen++; ok(kids.length === 2 || kids.length === 3, `unerwartete Anzahl Antworten: ${kids.length}`); kids[1].fire('click'); await frames(3); }
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

  // ---------- Schlafen ----------
  ok(E('sleep-hint').hidden === false, 'Hinweis "Geh zum Bett" fehlt nach dem Gespräch');
  ok(E('btn-sleep').hidden === true, 'Schlafen-Knopf erscheint, obwohl das Bett weit weg ist');
  ok(globalThis.__sun === undefined, 'Sonnenlicht existiert schon vor dem Schlafen (kostet unnötig Leistung)');

  // zum Bett gehen (Joystick nach links = seitwärts Richtung Bett)
  E('touch-layer').fire('pointerdown', { pointerId: 40, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 40, clientX: 90, clientY: 300 });
  await frames(70);
  E('touch-layer').fire('pointerup', { pointerId: 40 });
  await frames(5);
  ok(E('btn-sleep').hidden === false, 'Schlafen-Knopf erscheint nicht am Bett');
  ok(E('sleep-hint').hidden === true, 'Hinweis bleibt am Bett stehen');

  E('btn-sleep').fire('click');
  let sawLying = false, sawBlack = false, sawLockedHud = false;
  const captions = new Set();
  for (let i = 0; i < 800; i++) {
    await frames(1);
    const c = lastCam();
    if (Math.abs(c[0] + 2.0) < 0.05 && Math.abs(c[1] - 0.82) < 0.05 && Math.abs(c[2] - 1.7) < 0.05) sawLying = true;
    const m = /rgba\(0,0,0,([\d.]+)\)/.exec(E('sleep-fade').style.background || '');
    if (m && parseFloat(m[1]) >= 0.99) sawBlack = true;
    if (E('sleep-text').textContent) captions.add(E('sleep-text').textContent);
    if (E('hud').classList.has('cutscene')) sawLockedHud = true;
    if (i === 30) {                                                  // mitten im Hinlegen: Steuerung gesperrt
      const p0 = lastCam();
      E('touch-layer').fire('pointerdown', { pointerId: 41, clientX: 150, clientY: 300 });
      E('touch-layer').fire('pointermove', { pointerId: 41, clientX: 150, clientY: 100 });
      await frames(3);
      const p1 = lastCam();
      ok(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 0.2, 'Joystick bewegt die Kamera während des Hinlegens');
      E('touch-layer').fire('pointerup', { pointerId: 41 });
    }
  }
  ok(sawLying, 'Kamera liegt nie im Bett');
  ok(sawBlack, 'Bild wird beim Schlafen nie ganz schwarz');
  ok(sawLockedHud, 'Spielknöpfe werden beim Schlafen nicht ausgeblendet');
  ok(['Du schläfst ein …', 'Die Nacht vergeht …', 'Der Morgen ist gekommen.'].every((t) => captions.has(t)), `Texte beim Schlafen unvollständig: ${[...captions].join(' | ')}`);
  ok(globalThis.__sun && globalThis.__sun.intensity > 10, `Morgenlicht fehlt oder zu schwach (${globalThis.__sun && globalThis.__sun.intensity})`);
  const [ex, ey, ez] = lastCam();
  console.log(`Schlafen: Kamera lag im Bett, Bild wurde schwarz, Morgenlicht Helligkeit ${globalThis.__sun.intensity.toFixed(1)}, aufgestanden bei x=${ex.toFixed(2)} z=${ez.toFixed(2)}.`);
  ok(Math.abs(ex + 1.0) < 0.1 && Math.abs(ey - 1.65) < 0.1 && Math.abs(ez - 1.2) < 0.1, 'Nach dem Aufstehen nicht neben dem Bett');
  ok(E('btn-sleep').hidden === true && E('sleep-hint').hidden === true, 'Schlafen-Knopf/Hinweis nach dem Aufwachen noch da');
  ok(!E('hud').classList.has('cutscene'), 'Spielknöpfe bleiben nach dem Aufwachen ausgeblendet');
  ok(globalThis.__bgAtRender.every((v) => v === true), 'Hintergrundfarbe in der Szene (Zeichendurchgang löscht das Bild)');

  // Nach dem Aufwachen ist die Steuerung wieder frei
  const q0 = lastCam();
  E('touch-layer').fire('pointerdown', { pointerId: 50, clientX: 150, clientY: 300 });
  E('touch-layer').fire('pointermove', { pointerId: 50, clientX: 150, clientY: 240 });
  await frames(40);
  const q1 = lastCam();
  ok(Math.hypot(q1[0] - q0[0], q1[2] - q0[2]) > 0.3, 'Steuerung nach dem Aufwachen nicht frei');
  E('touch-layer').fire('pointerup', { pointerId: 50 });

  // ---------- Abholen am Morgen ----------
  ok(E('end-card').hidden === true, 'Endkarte schon vor dem Abholen sichtbar');
  globalThis.location = { reload() { globalThis.__reloaded = true; } };
  let waitFrames = 0;
  while (!hudActive() && waitFrames++ < 3000) await frames(1);
  ok(hudActive(), 'Der Wärter kommt am Morgen nicht zurück');
  console.log(`Abholen: Wärter kommt zurück, Gespräch beginnt ${(waitFrames * 16.7 / 1000).toFixed(1)} s nach dem Aufstehen.`);
  await frames(200);
  ok(E('dialogue-speaker').textContent === 'Wärter' && E('dialogue-text').textContent.includes('Sonne'), `Morgen-Gespräch falsch: "${E('dialogue-text').textContent}"`);
  const beforeEscort = lastCam();
  E('touch-layer').fire('pointerdown', { pointerId: 60, clientX: 150, clientY: 300 });   // Steuerung ist gesperrt
  E('touch-layer').fire('pointermove', { pointerId: 60, clientX: 150, clientY: 100 });
  await frames(20);
  ok(Math.hypot(lastCam()[0] - beforeEscort[0], lastCam()[2] - beforeEscort[2]) < 0.1, 'Spieler läuft selbst, obwohl der Wärter spricht');
  E('touch-layer').fire('pointerup', { pointerId: 60 });
  let guardTaps = 0;
  while (hudActive() && guardTaps++ < 40) { E('dialogue-tap').fire('pointerdown', { pointerId: 61 }); await frames(8); }
  ok(!hudActive(), 'Morgen-Gespräch endet nicht');

  // Der Wärter führt ab: Kamera läuft selbst durch die Zellentür und den Gang entlang
  let throughGate = false, maxFade = 0, cutsceneHud = false, handsVisibleErrors = 0, endFrames = 0;
  const path = [];
  while (E('end-card').hidden !== false && endFrames++ < 4000) {
    await frames(1);
    const c = lastCam(); path.push(c);
    if (c[2] < -2.3 && c[2] > -2.6 && Math.abs(c[0]) < 0.1) throughGate = true;
    const m = /rgba\(0,0,0,([\d.]+)\)/.exec(E('sleep-fade').style.background || '');
    if (m) maxFade = Math.max(maxFade, parseFloat(m[1]));
    if (E('hud').classList.has('cutscene')) cutsceneHud = true;
  }
  ok(E('end-card').hidden === false, 'Endkarte erscheint nicht');
  ok(throughGate, 'Der Spieler geht nicht durch die Zellentür');
  ok(maxFade >= 0.99, `Bild wird am Ende nicht schwarz (${maxFade})`);
  ok(cutsceneHud, 'Spielknöpfe werden beim Abführen nicht ausgeblendet');
  const [fx, fy, fz] = lastCam();
  let maxStep = 0; for (let i = 1; i < path.length; i++) maxStep = Math.max(maxStep, Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
  console.log(`Abführen: Spieler läuft durch die Tür bis z=${fz.toFixed(2)}, Bild wird schwarz, Endkarte erscheint (größter Schritt pro Bild ${maxStep.toFixed(3)} m).`);
  ok(Math.abs(fx) < 0.1 && Math.abs(fz + 5.7) < 0.2, 'Spieler endet nicht im Gang vor der Endtür');
  ok(maxStep < 0.05, 'Kamera springt beim Abführen');
  ok(globalThis.__bgAtRender.every((v) => v === true), 'Hintergrundfarbe in der Szene');

  // Endkarte: "Von vorn beginnen" lädt das Spiel neu
  E('btn-restart').fire('click');
  ok(globalThis.__reloaded === true, 'Knopf "Von vorn beginnen" lädt das Spiel nicht neu');

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

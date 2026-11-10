// Trockenlauf: führt den Aufbau-Code (Texturen + Welt) mit einer Attrappe von Three.js und Canvas aus.
// Er findet Programmfehler wie Tippfehler oder falsche Variablen. Er kann NICHT prüfen, wie die Welt aussieht.
//   node tests/build.smoke.js
function generic(name = 'x') {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'then') return undefined;
      if (p === 'length') return 0;
      if (p === 'name') return name;
      if (p === Symbol.iterator) return function* () {};
      if (!(p in t)) t[p] = generic(String(p));
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return generic('ret'); },
    construct() { return generic('new'); },
  });
}
const THREE = new Proxy({}, { get: (_, p) => (p === 'then' ? undefined : (typeof p === 'string' && /^[A-Z_]+$/.test(p) ? 1 : generic(String(p)))) });

const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p in t) return t[p];
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.CanvasRenderingContext2D = { prototype: { filter: '' } };

const { createWorld } = await import('../js/world.js');
const renderer = { capabilities: { getMaxAnisotropy: () => 8 }, setClearColor() {}, shadowMap: {} };
const world = createWorld(THREE, renderer);
if (!world || !world.colliders.length || typeof world.update !== 'function') throw new Error('Welt unvollständig');
if (world.scene.background !== null) throw new Error('Szene hat eine Hintergrundfarbe: Three.js würde bei jedem Zeichendurchgang das Bild löschen (Arme-Durchgang wischt die Welt weg)');
for (let i = 0; i < 5; i++) world.update(i * 0.016);
// Morgen: Übergang 0 -> 1 und zurück darf nie fehlschlagen; das Sonnenlicht entsteht erst beim ersten Aufruf
for (const t of [0, 0.25, 0.5, 1, 0.3, 0, 1.4, -1]) world.setMorning(t);
world.prepareMorning();
console.log(`Trockenlauf OK: ${world.colliders.length} Kollisionskörper, Animation läuft ohne Fehler.`);

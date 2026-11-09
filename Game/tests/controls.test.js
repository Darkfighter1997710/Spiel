// Prüft die Touch-Logik mit simulierten Fingern (ohne Browser):  node tests/controls.test.js
import { TouchControls } from '../js/controls.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

function fakeEl() {
  const h = {};
  const classes = new Set();
  return {
    style: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    addEventListener: (t, f) => { (h[t] = h[t] || []).push(f); },
    setPointerCapture() {},
    fire(t, ev) { (h[t] || []).forEach((f) => f({ preventDefault() {}, ...ev })); },
  };
}
globalThis.window = { innerWidth: 800, innerHeight: 400, addEventListener() {} };

const els = { layer: fakeEl(), joystick: fakeEl(), knob: fakeEl(), btnJump: fakeEl(), btnSprint: fakeEl() };
const c = new TouchControls(els);

// Joystick erscheint dort, wo die linke Seite berührt wird
els.layer.fire('pointerdown', { pointerId: 1, clientX: 150, clientY: 300 });
ok(els.joystick.classList.has('active'), 'Joystick nicht sichtbar');
ok(els.joystick.style.transform.includes('150px,300px'), 'Joystick nicht an Berührungspunkt');

// Nach oben ziehen = vorwärts (volle Auslenkung)
els.layer.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 300 - 200 });
let m = c.getMove();
ok(near(m.x, 0) && near(m.y, 1), `vorwärts erwartet, bekam ${JSON.stringify(m)}`);
ok(els.knob.style.transform.includes('0px,-56px'), 'Knopf nicht auf Radius begrenzt / Mitte nicht fix');
ok(els.joystick.style.transform.includes('150px,300px'), 'Joystick-Mittelpunkt hat sich bewegt');

// Totzone und weicher Anlauf
els.layer.fire('pointermove', { pointerId: 1, clientX: 152, clientY: 300 });
m = c.getMove(); ok(m.x === 0 && m.y === 0, 'Totzone greift nicht');
els.layer.fire('pointermove', { pointerId: 1, clientX: 150 + 28, clientY: 300 });
m = c.getMove(); ok(m.x > 0.3 && m.x < 0.7 && near(m.y, 0), `halbe Auslenkung nach rechts erwartet, bekam ${JSON.stringify(m)}`);

// Gleichzeitig mit rechtem Finger umsehen
els.layer.fire('pointerdown', { pointerId: 2, clientX: 600, clientY: 200 });
els.layer.fire('pointermove', { pointerId: 2, clientX: 640, clientY: 190 });
els.layer.fire('pointermove', { pointerId: 2, clientX: 650, clientY: 180 });
let look = c.consumeLook();
ok(look.dx === 50 && look.dy === -20, `Wischweg falsch: ${JSON.stringify(look)}`);
look = c.consumeLook(); ok(look.dx === 0 && look.dy === 0, 'Wischweg wird nicht zurückgesetzt');
m = c.getMove(); ok(m.x > 0.3, 'Joystick stoppt, während rechts gewischt wird');

// Zweiter Finger links wird ignoriert, solange der erste aktiv ist
els.layer.fire('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 });
els.layer.fire('pointermove', { pointerId: 3, clientX: 100, clientY: 20 });
m = c.getMove(); ok(m.x > 0.3 && near(m.y, 0), 'zweiter linker Finger stört den Joystick');

// Loslassen: Joystick verschwindet, Bewegung stoppt
els.layer.fire('pointerup', { pointerId: 1 });
ok(!els.joystick.classList.has('active'), 'Joystick bleibt sichtbar');
m = c.getMove(); ok(m.x === 0 && m.y === 0, 'Bewegung stoppt nicht');

// Sprung: einmal antippen = genau ein Sprung-Auftrag
els.btnJump.fire('pointerdown', { pointerId: 5 });
ok(c.consumeJump() === true, 'Sprung wird nicht ausgelöst');
ok(c.consumeJump() === false, 'Sprung wird mehrfach geliefert');

// Sprint: gedrückt halten, beim Loslassen zurück
els.btnSprint.fire('pointerdown', { pointerId: 6 });
ok(c.sprint === true, 'Sprint startet nicht');
els.btnSprint.fire('pointerup', { pointerId: 6 });
ok(c.sprint === false, 'Sprint endet nicht beim Loslassen');
els.btnSprint.fire('pointerdown', { pointerId: 7 });
els.btnSprint.fire('pointercancel', { pointerId: 7 });
ok(c.sprint === false, 'Sprint hängt nach Abbruch fest');

// reset() lässt alles los
els.layer.fire('pointerdown', { pointerId: 8, clientX: 100, clientY: 100 });
els.btnSprint.fire('pointerdown', { pointerId: 9 });
c.reset();
ok(!c.sprint && c.getMove().x === 0 && !els.joystick.classList.has('active'), 'reset() lässt nicht alles los');

console.log(failures === 0 ? 'ALLE TOUCH-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

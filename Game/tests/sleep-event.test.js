// Prüft den Schlaf-Ablauf:  node tests/sleep-event.test.js
import { SleepEvent, SLEEP_EVENT } from '../js/sleep-event.js';
import { SLEEP } from '../js/layout.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };
const DT = 1 / 60;
const FROM = { x: 0.4, y: 1.65, z: 0.3, yaw: 2.0, pitch: -0.3 };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1) Erst nach dem Gespräch möglich, und nur einmal startbar
{
  const e = new SleepEvent();
  ok(e.state === 'locked' && e.canStart === false, 'Schlafen schon vor dem Gespräch möglich');
  ok(e.start(FROM) === false && e.state === 'locked', 'start() wirkt, obwohl gesperrt');
  e.unlock(); ok(e.state === 'ready' && e.canStart, 'unlock() klappt nicht');
  ok(e.start(FROM) === true && e.state === 'lie_down', 'start() klappt nicht');
  ok(e.start(FROM) === false, 'zweites start() wurde angenommen');
}

// 2) Kompletter Ablauf: Reihenfolge, Werte immer gültig, Übergänge stimmen
{
  const e = new SleepEvent(); e.unlock(); e.start(FROM);
  const order = []; let t = 0, standUps = 0, prepares = 0, prepareBlack = true;
  let lastMorning = 0, morningMonotonic = true, minFade = 1, sawFull = false;
  let lockedAlways = true;
  while (!e.done && t < 60) {
    e.update(DT, true); t += DT;
    if (order[order.length - 1] !== e.state) order.push(e.state);
    if (e.consumeStandUp()) standUps++;
    if (e.consumePrepareMorning()) { prepares++; if (e.fade < 0.999) prepareBlack = false; }
    if (!(e.fade >= 0 && e.fade <= 1) || !(e.morning >= 0 && e.morning <= 1) || !(e.captionAlpha >= -1e-9 && e.captionAlpha <= 1 + 1e-9)) ok(false, `Wert außerhalb 0..1 (${e.state})`);
    if (e.morning < lastMorning - 1e-9) morningMonotonic = false;
    lastMorning = e.morning;
    if (e.fade >= 0.999) sawFull = true;
    if (!e.done && !e.inputLocked) lockedAlways = false;
    if (![e.cam.x, e.cam.y, e.cam.z, e.cam.yaw, e.cam.pitch].every(Number.isFinite)) ok(false, 'NaN in Kamera');
  }
  const expect = ['lie_down', 'fade_out', 'sleeping', 'fade_in', 'stand_up', 'morning'];
  ok(JSON.stringify(order) === JSON.stringify(expect), `Reihenfolge falsch: ${order.join(' > ')}`);
  ok(standUps === 1 && prepares === 1, `Aufstehen ${standUps}x, Morgenlicht vorbereiten ${prepares}x (je genau 1x erwartet)`);
  ok(prepareBlack, 'Morgenlicht wird vorbereitet, während das Bild noch sichtbar ist (Ruckler wäre sichtbar)');
  ok(sawFull, 'Bild wird nie ganz schwarz');
  ok(morningMonotonic && e.morning === 1 && e.fade === 0, 'Morgenlicht steigt nicht gleichmäßig auf 1');
  ok(lockedAlways, 'Steuerung während des Schlafens nicht durchgehend gesperrt');
  ok(!e.inputLocked && e.cameraOverride === false, 'Steuerung am Ende nicht frei');
  ok(near(e.cam.x, SLEEP.stand.x) && near(e.cam.y, SLEEP.stand.eyeY) && near(e.cam.z, SLEEP.stand.z) && near(e.cam.pitch, 0), 'Endposition ist nicht neben dem Bett');
  const total = SLEEP_EVENT.lieTime + SLEEP_EVENT.fadeOutTime + SLEEP_EVENT.sleepTime + SLEEP_EVENT.fadeInTime + SLEEP_EVENT.standTime;
  console.log(`Schlafen: ganzer Ablauf ca. ${t.toFixed(1)} s (Soll ${total.toFixed(1)} s), danach steht die Figur neben dem Bett.`);
  ok(Math.abs(t - total) < 0.1, 'Dauer weicht ab');
}

// 3) Kamera: startet an der aktuellen Haltung, liegt dann auf dem Bett, nie ruckartig
{
  const e = new SleepEvent(); e.unlock(); e.start(FROM);
  let prev = { ...e.cam }, maxJump = 0, lieSeen = false;
  while (!e.done) {
    e.update(DT, true);
    maxJump = Math.max(maxJump, Math.hypot(e.cam.x - prev.x, e.cam.y - prev.y, e.cam.z - prev.z));
    prev = { ...e.cam };
    if (e.state === 'fade_out') { lieSeen = near(e.cam.x, SLEEP.lie.x) && near(e.cam.y, SLEEP.lie.y) && near(e.cam.z, SLEEP.lie.z) && near(e.cam.pitch, SLEEP.lie.pitch); }
  }
  ok(lieSeen, 'Kamera liegt nicht in Liegeposition');
  ok(maxJump < 0.06, `Kamera springt (max. ${maxJump.toFixed(3)} m pro Bild)`);
  // Drehung nimmt den kurzen Weg (Start-Blickrichtung 2.0 rad, Ziel 0 rad)
  const e2 = new SleepEvent(); e2.unlock(); e2.start({ ...FROM, yaw: 3.0 });
  let wentLong = false;
  for (let i = 0; i < 60 * 2; i++) { e2.update(DT, true); if (e2.state === 'lie_down' && e2.cam.yaw < -0.1) wentLong = true; }
  ok(!wentLong, 'Kamera dreht den langen Weg');
}

// 4) Pause hält alles an
{
  const e = new SleepEvent(); e.unlock(); e.start(FROM);
  for (let i = 0; i < 100; i++) e.update(DT, true);
  const snap = JSON.stringify([e.state, e.stateTime, e.cam, e.fade]);
  for (let i = 0; i < 600; i++) e.update(DT, false);
  ok(snap === JSON.stringify([e.state, e.stateTime, e.cam, e.fade]), 'Ablauf läuft in der Pause weiter');
}

// 5) Zufällige Bildzeiten: nie ungültige Werte
{
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const e = new SleepEvent(); e.unlock(); e.start(FROM);
  for (let i = 0; i < 100000 && !e.done; i++) {
    e.update(0.001 + rnd() * 0.05, rnd() < 0.8);
    if (![e.cam.x, e.cam.y, e.cam.z, e.cam.yaw, e.cam.pitch, e.fade, e.morning].every(Number.isFinite)) { ok(false, 'NaN im Zufallstest'); break; }
  }
  ok(e.done, 'Zufallslauf endet nicht');
}

console.log(failures === 0 ? 'ALLE SCHLAF-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

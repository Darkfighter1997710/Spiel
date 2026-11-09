// Prüft den Schlaf-Ablauf und die Schlafpose:  node tests/sleep-event.test.js
import { SleepEvent, SLEEP, SLEEP_CAPTIONS } from '../js/sleep-event.js';
import { SLEEP_POSE, BED, distanceToBed } from '../js/layout.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };
const DT = 1 / 60;
const total = SLEEP.fadeOut + SLEEP.asleep + SLEEP.wake + SLEEP.getUp;

// 1) Ohne Start passiert nichts; Pause zählt nicht
{
  const e = new SleepEvent();
  for (let i = 0; i < 600; i++) e.update(DT, true);
  ok(e.state === 'idle' && !e.active && e.fade === 0 && e.daylight === 0, 'Ablauf läuft ohne Start');
  ok(e.start() === true && e.active, 'Start klappt nicht');
  const snap = JSON.stringify([e.state, e.fade, e.stateTime]);
  for (let i = 0; i < 600; i++) e.update(DT, false);
  ok(snap === JSON.stringify([e.state, e.fade, e.stateTime]), 'Schlafen läuft in der Pause weiter');
}

// 2) Kompletter Ablauf: Reihenfolge, Werte, Dauer, Tageslicht bleibt, nur einmal
{
  const e = new SleepEvent();
  e.start();
  ok(e.start() === false, 'zweiter Start während des Schlafens angenommen');
  const order = [];
  let t = 0, minDay = 0, prevDay = 0, monotonicDay = true, blackWhenLying = true, captions = new Set();
  for (let i = 0; i < 60 * 30 && !e.done; i++) {
    e.update(DT, true); t += DT;
    if (order[order.length - 1] !== e.state) order.push(e.state);
    ok(e.fade >= 0 && e.fade <= 1 && e.lying >= 0 && e.lying <= 1 && e.daylight >= 0 && e.daylight <= 1, 'Wert außerhalb 0..1');
    if (e.daylight < prevDay - 1e-9) monotonicDay = false;
    prevDay = e.daylight;
    // Das „Hinlegen“ (Kamera springt ins Bett) darf nur im Schwarzen passieren
    if (e.lying > 0 && e.lying < 1 && e.state !== 'get_up') blackWhenLying = false;
    if (e.state === 'fade_out' && e.lying !== 0) blackWhenLying = false;
    if (e.state === 'asleep' && e.fade < 1) blackWhenLying = false;
    if (e.caption) captions.add(e.caption);
    ok(e.active === (e.state !== 'done'), 'active passt nicht zum Zustand');
  }
  ok(JSON.stringify(order) === JSON.stringify(['fade_out', 'asleep', 'wake', 'get_up', 'done']), `Reihenfolge falsch: ${order.join(' > ')}`);
  ok(e.done && !e.active, 'Ablauf endet nicht');
  ok(e.daylight === 1 && e.fade === 0 && e.lying === 0, `Endwerte falsch (Licht ${e.daylight}, Schwarz ${e.fade}, liegt ${e.lying})`);
  ok(monotonicDay, 'Tageslicht wird zwischendurch wieder dunkler');
  ok(blackWhenLying, 'Kamera legt sich nicht im Schwarzen hin');
  ok(captions.has(SLEEP_CAPTIONS.falling) && captions.has(SLEEP_CAPTIONS.morning) && e.caption === '', 'Texte falsch');
  ok(Math.abs(t - total) < 0.1, `Dauer ${t.toFixed(2)} s statt ${total.toFixed(2)} s`);
  ok(e.start() === false && e.done, 'Schlafen nach dem Ende nochmals möglich');
  e.update(1, true); ok(e.daylight === 1 && e.done, 'Tageslicht geht nach dem Ende wieder weg');
  console.log(`Schlafen: ganzer Ablauf ${t.toFixed(1)} s (Schwarz ${SLEEP.fadeOut + SLEEP.asleep} s, danach Sonnenaufgang).`);
}

// 3) Zufällige Bildzeiten und Pausen: nie ungültige Werte
{
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const e = new SleepEvent();
  e.start();
  for (let i = 0; i < 200000 && !e.done; i++) {
    e.update(0.001 + rnd() * 0.05, rnd() < 0.8);
    if (![e.fade, e.lying, e.daylight].every(Number.isFinite)) { ok(false, 'NaN im Zufallstest'); break; }
  }
  ok(e.done, 'Zufallslauf endet nicht');
}

// 4) Schlafpose liegt auf dem Kissen, Blick ist gültig, Bettnähe wird richtig gemessen
{
  ok(SLEEP_POSE.x > BED.minX && SLEEP_POSE.x < BED.maxX && SLEEP_POSE.z > BED.minZ && SLEEP_POSE.z < BED.maxZ, 'Schlafpose nicht über dem Bett');
  ok(SLEEP_POSE.y > BED.top && SLEEP_POSE.y < 1.2, `Augenhöhe im Bett unplausibel (${SLEEP_POSE.y})`);
  ok(Number.isFinite(SLEEP_POSE.yaw) && Math.abs(SLEEP_POSE.pitch) < 1.45, 'Blickrichtung im Bett ungültig');
  ok(distanceToBed(-2.0, 1.0) === 0, 'auf dem Bett: Abstand soll 0 sein');
  ok(Math.abs(distanceToBed(-1.2, 1.0) - 0.3) < 1e-9, 'Abstand zur Bettkante falsch');
  ok(distanceToBed(0.4, 1.2) > SLEEP_POSE.reach, 'Spawn darf nicht schon „am Bett“ sein');
  ok(distanceToBed(1.0, -1.5) > SLEEP_POSE.reach, 'Zellenmitte vorne darf nicht „am Bett“ sein');
}

console.log(failures === 0 ? 'ALLE SCHLAF-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

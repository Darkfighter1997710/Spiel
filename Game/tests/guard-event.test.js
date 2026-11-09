// Prüft den Zeitplan des Wärter-Auftritts:  node tests/guard-event.test.js
import { GuardEvent, GUARD_EVENT } from '../js/guard-event.js';
import { GUARD } from '../js/layout.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };
const DT = 1 / 60;

// 1) Es zählt nur echte Spielzeit: in der Pause passiert nichts
{
  const e = new GuardEvent();
  for (let i = 0; i < 60 * 60; i++) e.update(DT, false);          // 60 Sekunden Pause
  ok(e.state === 'wait' && e.playTime === 0, 'Pause zählt als Spielzeit');
  for (let i = 0; i < 60 * 14.9; i++) e.update(DT, true);
  ok(e.state === 'wait', `kommt zu früh (Zustand ${e.state} bei ${e.playTime.toFixed(2)} s)`);
  for (let i = 0; i < 60 * 0.3; i++) e.update(DT, true);
  ok(e.state === 'door_open', `kommt nicht nach 15 s (Zustand ${e.state})`);
}

// 2) Kompletter Ablauf, Zustände in der richtigen Reihenfolge
{
  const e = new GuardEvent();
  const order = [];
  let started = 0, lockedWhenTalk = true, maxDoor = 0, minZ = 1e9, maxZ = -1e9, t = 0;
  let talkTime = 0;
  for (let i = 0; i < 60 * 120 && !e.done; i++) {
    e.update(DT, true); t += DT;
    if (order[order.length - 1] !== e.state) order.push(e.state);
    if (e.consumeDialogueStart()) started++;
    if (e.state === 'talk') {
      talkTime += DT;
      if (!e.inputLocked || !e.cameraLook) lockedWhenTalk = false;
      if (talkTime > 5) e.finishTalk();                            // Gespräch dauert 5 Sekunden
    }
    ok(e.doorOpen >= 0 && e.doorOpen <= 1, 'Tür außerhalb 0..1');
    ok(e.z >= GUARD.hideZ - 1e-9 && e.z <= GUARD.stopZ + 1e-9, `Wärter außerhalb seines Wegs (z=${e.z})`);
    ok(Number.isFinite(e.phase) && e.amp >= 0 && e.amp <= 1.0001, 'Laufwerte ungültig');
    maxDoor = Math.max(maxDoor, e.doorOpen); minZ = Math.min(minZ, e.z); maxZ = Math.max(maxZ, e.z);
  }
  const expect = ['wait', 'door_open', 'walk_in', 'arrive', 'talk', 'turn', 'walk_out', 'door_close', 'done'];
  ok(JSON.stringify(order) === JSON.stringify(expect), `Reihenfolge falsch: ${order.join(' > ')}`);
  ok(started === 1, `Gespräch wurde ${started}-mal gestartet`);
  ok(lockedWhenTalk, 'Eingaben im Gespräch nicht gesperrt');
  ok(maxDoor === 1 && e.doorOpen === 0, 'Tür öffnet/schließt nicht vollständig');
  ok(Math.abs(maxZ - GUARD.stopZ) < 1e-6 && Math.abs(minZ - GUARD.hideZ) < 1e-6, 'Wärter erreicht Ziel/Nische nicht');
  ok(e.visible === false && e.inputLocked === false, 'Zustand am Ende falsch');
  console.log(`Ablauf: Gespräch beginnt nach ${(15 + GUARD_EVENT.doorTime).toFixed(1)} s + Gehweg; gesamter Auftritt ca. ${t.toFixed(1)} s (inkl. 5 s Gespräch).`);
}

// 3) Eingaben sind nur während Ankunft und Gespräch gesperrt, nie davor oder danach
{
  const e = new GuardEvent();
  let lockedStates = new Set(), freeStates = new Set();
  for (let i = 0; i < 60 * 80 && !e.done; i++) {
    e.update(DT, true);
    if (e.state === 'talk' && e.stateTime > 1) e.finishTalk();
    (e.inputLocked ? lockedStates : freeStates).add(e.state);
  }
  ok(JSON.stringify([...lockedStates].sort()) === JSON.stringify(['arrive', 'talk']), `gesperrt in: ${[...lockedStates]}`);
  ok(!freeStates.has('arrive') && !freeStates.has('talk'), 'frei in gesperrtem Zustand');
}

// 4) Pause mitten im Auftritt hält alles an
{
  const e = new GuardEvent();
  for (let i = 0; i < 60 * 17; i++) e.update(DT, true);
  const snap = JSON.stringify([e.state, e.z, e.doorOpen, e.phase]);
  for (let i = 0; i < 600; i++) e.update(DT, false);
  ok(snap === JSON.stringify([e.state, e.z, e.doorOpen, e.phase]), 'Auftritt läuft in der Pause weiter');
}

// 5) Zufällig wechselnde Bildzeiten und Pausen: nie ungültige Werte, finishTalk wirkt nur im Gespräch
{
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const e = new GuardEvent();
  e.finishTalk(); ok(e.state === 'wait', 'finishTalk wirkt außerhalb des Gesprächs');
  for (let i = 0; i < 200000 && !e.done; i++) {
    e.update(0.001 + rnd() * 0.05, rnd() < 0.8);
    if (e.state === 'talk' && rnd() < 0.01) e.finishTalk();
    if (![e.x, e.z, e.yaw, e.doorOpen, e.phase, e.amp].every(Number.isFinite)) { ok(false, 'NaN im Zufallstest'); break; }
  }
  ok(e.done, 'Zufallslauf endet nicht');
}

console.log(failures === 0 ? 'ALLE WÄRTER-ABLAUF-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

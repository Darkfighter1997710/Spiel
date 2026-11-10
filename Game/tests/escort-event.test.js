// Prüft den Ablauf "Wächter holt den Spieler ab":  node tests/escort-event.test.js
import { EscortEvent, ESCORT_EVENT } from '../js/escort-event.js';
import { GUARD, ROOM, DOOR } from '../js/layout.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };
const DT = 1 / 60;
const POSE = { x: -1.0, z: 1.2, yaw: 0, pitch: 0 };

// 1) Startet erst nach begin(); Wartezeit zählt nur echte Spielzeit
{
  const e = new EscortEvent();
  for (let i = 0; i < 600; i++) e.update(DT, true, POSE);
  ok(e.state === 'idle' && !e.active, 'startet ohne begin()');
  e.begin();
  ok(e.state === 'delay' && e.active, 'begin() klappt nicht');
  for (let i = 0; i < 60 * 100; i++) e.update(DT, false, POSE);
  ok(e.state === 'delay', 'Pause zählt als Spielzeit');
  for (let i = 0; i < 60 * (ESCORT_EVENT.startDelay - 0.1); i++) e.update(DT, true, POSE);
  ok(e.state === 'delay', `kommt zu früh (${e.state})`);
  for (let i = 0; i < 60 * 0.3; i++) e.update(DT, true, POSE);
  ok(e.state === 'door_open', `kommt nicht nach der Wartezeit (${e.state})`);
}

// 2) Kompletter Ablauf mit Auswertung von Weg, Abstand, Tür und Bild
function run(pose) {
  const e = new EscortEvent();
  e.begin();
  const r = { order: [], dialogue: 0, gateOpened: 0, maxGuardBehind: 0, minGap: 1e9, gapAfterStart: [], nanSeen: false, crossedGate: null, maxFade: 0, fadeMonotonic: true, lockedOk: true, wallHit: false, t: 0 };
  let lastFade = 0, talkTime = 0, guardStartedMoving = false;
  for (let i = 0; i < 60 * 120 && !e.ended; i++) {
    e.update(DT, true, pose); r.t += DT;
    if (r.order[r.order.length - 1] !== e.state) r.order.push(e.state);
    if (e.consumeDialogueStart()) r.dialogue++;
    if (e.consumeGateOpened()) r.gateOpened++;
    if (e.state === 'talk') { talkTime += DT; if (talkTime > 4) e.finishTalk(); }
    if (![e.x, e.z, e.yaw, e.doorOpen, e.gateOpen, e.fade, e.cam.x, e.cam.y, e.cam.z, e.cam.yaw, e.cam.pitch, e.phase, e.camPhase].every(Number.isFinite)) r.nanSeen = true;
    if (e.doorOpen < 0 || e.doorOpen > 1 || e.gateOpen < 0 || e.gateOpen > 1 || e.fade < 0 || e.fade > 1) r.nanSeen = true;
    if (e.fade < lastFade - 1e-9) r.fadeMonotonic = false;
    lastFade = e.fade; r.maxFade = Math.max(r.maxFade, e.fade);
    if (['unlock', 'gate_open', 'talk', 'follow', 'fade', 'end'].includes(e.state) !== e.inputLocked) r.lockedOk = false;
    if (e.state === 'follow' || e.state === 'fade') {
      if (e.visible) {
        const gap = Math.hypot(e.x - e.cam.x, e.z - e.cam.z);
        // Der Wächter geht immer VOR dem Spieler (kleineres z = weiter im Gang) oder wartet an der Tür
        if (e.z > e.cam.z + 1e-6 && e.z < GUARD.stopZ - 1e-6) r.maxGuardBehind = Math.max(r.maxGuardBehind, e.z - e.cam.z);
        if (e.cam.z < GUARD.stopZ + 1e-6) { guardStartedMoving = true; r.gapAfterStart.push(gap); }
      }
      // Weg des Spielers: im Gang nie seitlich neben der Tür/Wand
      if (e.cam.z < -ROOM.halfD && Math.abs(e.cam.x) > DOOR.halfW - 0.1) r.wallHit = true;
      if (r.crossedGate === null && e.cam.z <= -ROOM.halfD - 0.25) r.crossedGate = e.cam.x;
    }
  }
  r.end = e;
  return r;
}
{
  const r = run(POSE), e = r.end;
  const expect = ['delay', 'door_open', 'walk_in', 'unlock', 'gate_open', 'talk', 'follow', 'fade', 'end'];
  ok(JSON.stringify(r.order) === JSON.stringify(expect), `Reihenfolge falsch: ${r.order.join(' > ')}`);
  ok(r.dialogue === 1 && r.gateOpened === 1, `Gespräch ${r.dialogue}x gestartet, Tür ${r.gateOpened}x als offen gemeldet (je 1x erwartet)`);
  ok(!r.nanSeen, 'ungültige Werte (NaN oder außerhalb 0..1)');
  ok(r.lockedOk, 'Steuerung nicht in genau den richtigen Zuständen gesperrt');
  ok(r.fadeMonotonic && r.maxFade === 1 && e.fade === 1, 'Bild wird nicht gleichmäßig ganz schwarz');
  ok(e.gateOpen === 1 && e.doorOpen === 1, 'Türen am Ende nicht offen');
  ok(e.visible === false, 'Wärter am Ende noch sichtbar');
  ok(r.crossedGate !== null && Math.abs(r.crossedGate) < 0.1, `Spieler läuft nicht mittig durch die Tür (x=${r.crossedGate})`);
  ok(!r.wallHit, 'Spielerweg schneidet Wand oder Türrahmen');
  ok(r.maxGuardBehind < 1e-6, `Wächter läuft hinter dem Spieler (${r.maxGuardBehind})`);
  const gaps = r.gapAfterStart;
  const minGap = Math.min(...gaps), maxGap = Math.max(...gaps);
  console.log(`Abholen: ganzer Ablauf ca. ${r.t.toFixed(1)} s; Abstand zum Wächter beim Gehen ${minGap.toFixed(2)}–${maxGap.toFixed(2)} m (Soll ${ESCORT_EVENT.gap} m).`);
  ok(minGap > ESCORT_EVENT.gap - 0.15, `Wächter kommt dem Spieler zu nah (${minGap})`);
  ok(Math.abs(e.cam.z - ESCORT_EVENT.playerEndZ) < 0.05 && Math.abs(e.cam.x) < 0.05, 'Spieler endet nicht vor der Endtür');
}

// 3) Gleich gutes Ergebnis von verschiedenen Startstellen und Blickrichtungen im Raum
for (const [x, z, yaw] of [[-1.0, 1.2, 0], [0.4, 0.4, 2.5], [1.5, -1.5, -2.0], [0, -1.9, 3.0], [-1.18, 0.4, 1.2], [1.0, 1.0, -0.4]]) {
  const r = run({ x, z, yaw, pitch: 0.3 });
  ok(r.order[r.order.length - 1] === 'end' && !r.nanSeen && !r.wallHit, `Startstelle (${x},${z}) funktioniert nicht`);
  ok(r.crossedGate !== null && Math.abs(r.crossedGate) < 0.1, `Startstelle (${x},${z}): nicht mittig durch die Tür (${r.crossedGate})`);
  ok(r.maxGuardBehind < 1e-6, `Startstelle (${x},${z}): Wächter läuft hinter dem Spieler`);
}

// 4) Kamera ruckelt nicht (kein Sprung zwischen zwei Bildern), Drehung nimmt den kurzen Weg
{
  const e = new EscortEvent(); e.begin();
  let prev = null, maxMove = 0, maxTurn = 0, talkT = 0;
  for (let i = 0; i < 60 * 120 && !e.ended; i++) {
    e.update(DT, true, { ...POSE, yaw: 3.0 });
    if (e.state === 'talk') { talkT += DT; if (talkT > 1) e.finishTalk(); }
    if (e.cameraOverride) {
      if (prev) {
        maxMove = Math.max(maxMove, Math.hypot(e.cam.x - prev.x, e.cam.z - prev.z));
        maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(e.cam.yaw - prev.yaw), Math.cos(e.cam.yaw - prev.yaw))));
      }
      prev = { ...e.cam };
    }
  }
  ok(maxMove < 0.03, `Kamera springt (${maxMove.toFixed(3)} m pro Bild)`);
  ok(maxTurn < 0.06, `Kamera dreht ruckartig (${maxTurn.toFixed(3)} rad pro Bild)`);
}

// 5) Pause hält alles an; Zufallsläufe mit wechselnden Bildzeiten
{
  const e = new EscortEvent(); e.begin();
  for (let i = 0; i < 60 * 9; i++) e.update(DT, true, POSE);
  const snap = JSON.stringify([e.state, e.z, e.doorOpen, e.gateOpen]);
  for (let i = 0; i < 600; i++) e.update(DT, false, POSE);
  ok(snap === JSON.stringify([e.state, e.z, e.doorOpen, e.gateOpen]), 'Ablauf läuft in der Pause weiter');
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const f = new EscortEvent(); f.begin();
  for (let i = 0; i < 300000 && !f.ended; i++) {
    f.update(0.001 + rnd() * 0.05, rnd() < 0.85, { x: rnd() * 4 - 2, z: rnd() * 3 - 1.5, yaw: rnd() * 7, pitch: (rnd() - 0.5) });
    if (f.state === 'talk' && rnd() < 0.01) f.finishTalk();
    if (![f.x, f.z, f.cam.x, f.cam.z, f.cam.yaw, f.fade].every(Number.isFinite)) { ok(false, 'NaN im Zufallstest'); break; }
  }
  ok(f.ended, 'Zufallslauf endet nicht');
  const g = new EscortEvent(); g.finishTalk(); ok(g.state === 'idle', 'finishTalk wirkt außerhalb des Gesprächs');
}

console.log(failures === 0 ? 'ALLE ABHOL-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

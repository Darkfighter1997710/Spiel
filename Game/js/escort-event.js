// escort-event.js – der Wächter holt den Spieler am Morgen ab (reine Logik, ohne Three.js, dadurch testbar).
//
// Zustände:  idle -> delay -> door_open -> walk_in -> unlock -> gate_open -> talk -> follow -> fade -> end
//   idle        noch nicht gestartet (main.js ruft begin(), sobald der Spieler aufgewacht ist und aufgestanden ist)
//   delay       einige Sekunden Ruhe im Morgenlicht (zählt nur echte Spielzeit)
//   door_open   die Tür am Gangende öffnet sich
//   walk_in     der Wärter geht zur Zellentür
//   unlock      er schließt auf (kurze Pause), Eingaben gesperrt, Kamera schaut ihn an
//   gate_open   die Gittertür der Zelle schwingt auf
//   talk        kurzes Gespräch (main.js startet es und ruft danach finishTalk())
//   follow      er dreht sich um und geht den Gang entlang; der Spieler folgt automatisch (Kamera folgt dem Weg).
//               Der Wärter wartet, bis der Spieler nah genug ist, und hält dann immer denselben Abstand.
//   fade        sobald der Wärter in der dunklen Nische verschwindet, wird das Bild schwarz
//   end         schwarz; main.js zeigt die Endkarte
// Die Anzeige liest nur die Ausgabewerte (x, z, yaw, visible, phase, amp, doorOpen, gateOpen, fade, cam, camPhase, camAmp).

import { GUARD } from './layout.js';

export const ESCORT_EVENT = Object.freeze({
  startDelay: 6,      // Sekunden Spielzeit nach dem Aufstehen bis zur Rückkehr
  doorTime: 1.4,
  walkSpeed: 1.25,    // Meter pro Sekunde (Wärter und Spieler)
  unlockTime: 0.9,
  gateTime: 1.5,
  turnTime: 0.7,
  gap: 1.6,           // Abstand, den der Wärter beim Gehen vor dem Spieler hält
  fadeTime: 2.2,
  strideRate: 5.6,
  eye: 1.65,
  playerEndZ: -5.7,   // dort bleibt der Spieler am Ende des Wegs stehen
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Weg als Linienzug mit Längen
function makePath(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, len, start: total, dx: len > 0 ? (b.x - a.x) / len : 0, dz: len > 0 ? (b.z - a.z) / len : -1 });
    total += len;
  }
  return { segs, total };
}
function pointAt(path, s) {
  const t = clamp(s, 0, path.total);
  for (const g of path.segs) {
    if (t <= g.start + g.len || g === path.segs[path.segs.length - 1]) {
      const u = clamp(t - g.start, 0, g.len);
      return { x: g.a.x + g.dx * u, z: g.a.z + g.dz * u, dx: g.dx, dz: g.dz };
    }
  }
  return { x: 0, z: 0, dx: 0, dz: -1 };
}
// Länge des Wegs bis zur Stelle mit dieser z-Koordinate (der Teil im Gang liegt auf einer Geraden entlang -z)
const sAtZ = (path, z) => {
  const last = path.segs[path.segs.length - 1];
  return last.start + (last.a.z - z);
};

export class EscortEvent {
  constructor(cfg = ESCORT_EVENT, guardPath = GUARD) {
    this.cfg = cfg;
    this.gp = guardPath;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.stateTime = 0;
    this.doorOpen = 0;
    this.gateOpen = 0;
    this.x = this.gp.x;
    this.z = this.gp.startZ;
    this.yaw = 0;
    this.visible = false;
    this.phase = 0;       // Laufphase des Wärters
    this.amp = 0;
    this.fade = 0;
    this.cam = { x: 0, y: this.cfg.eye, z: 0, yaw: 0, pitch: 0 };
    this.camPhase = 0;    // Laufphase des Spielers (für Kopfwippen und Armschwung)
    this.camAmp = 0;
    this._pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
    this._startDialogue = false;
    this._gateOpened = false;
    this._path = null;
    this._sp = 0;         // Strecke des Spielers auf dem Weg
    this._sg = 0;         // Strecke des Wärters auf dem Weg
    this._camYaw = 0;
    this._camPitch = 0;
    this._followTime = 0; // Zeit seit Beginn des Wegs (überdauert den Wechsel von follow zu fade)
  }

  begin() { if (this.state === 'idle') this._enter('delay'); }

  get active() { return this.state !== 'idle'; }
  get inputLocked() { return ['unlock', 'gate_open', 'talk', 'follow', 'fade', 'end'].includes(this.state); }
  get cameraLook() { return ['unlock', 'gate_open', 'talk'].includes(this.state); }     // Kamera dreht sich zum Wärter
  get cameraOverride() { return ['follow', 'fade', 'end'].includes(this.state); }       // Kamera folgt dem Weg
  get attention() { return this.cameraLook; }                                           // Wärter schaut den Spieler an
  get ended() { return this.state === 'end'; }

  consumeDialogueStart() { const r = this._startDialogue; this._startDialogue = false; return r; }
  // true genau einmal, sobald die Zellentür ganz offen ist (Schatten neu berechnen)
  consumeGateOpened() { const r = this._gateOpened; this._gateOpened = false; return r; }
  finishTalk() { if (this.state === 'talk') this._enter('follow'); }

  _enter(state) {
    this.state = state;
    this.stateTime = 0;
    if (state === 'follow') this._startFollow();
  }

  _startFollow() {
    const p = this._pose, c = this.cfg, g = this.gp;
    // Weg des Spielers: von seiner Stelle zur Gittertür und den Gang entlang bis in die Nähe der Endtür.
    // Der Wärter läuft auf derselben Linie weiter bis in die dunkle Nische.
    const b = { x: g.x, z: Math.min(p.z, -1.4) };
    this._path = makePath([{ x: p.x, z: p.z }, b, { x: g.x, z: g.hideZ }]);
    this._sp = 0;
    this._sg = sAtZ(this._path, g.stopZ);
    this._sStop = this._sg;
    this._sHide = sAtZ(this._path, g.hideZ);
    this._sPlayerEnd = sAtZ(this._path, c.playerEndZ);
    this._camYaw = p.yaw;
    this._camPitch = p.pitch;
    this.camPhase = 0;
    this._followTime = 0;
    this.cam = { x: p.x, y: c.eye, z: p.z, yaw: p.yaw, pitch: p.pitch };
  }

  // pose = aktuelle Kamera des Spielers { x, z, yaw, pitch } (wird beim Start des Wegs gemerkt)
  update(dt, playing, pose) {
    if (!playing || !(dt > 0) || this.state === 'idle') return;
    if (pose) this._pose = { x: pose.x, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    const c = this.cfg, g = this.gp;
    this.stateTime += dt;
    let guardWalking = false;

    switch (this.state) {
      case 'delay':
        if (this.stateTime >= c.startDelay) this._enter('door_open');
        break;

      case 'door_open':
        this.doorOpen = ease(this.stateTime / c.doorTime);
        if (this.stateTime >= c.doorTime) {
          this.doorOpen = 1; this.visible = true; this.z = g.startZ; this.yaw = 0;
          this._enter('walk_in');
        }
        break;

      case 'walk_in': {
        guardWalking = true;
        const remaining = g.stopZ - this.z;
        const v = c.walkSpeed * clamp(remaining / 0.7, 0.3, 1) * Math.min(1, 0.25 + this.amp);
        this.z = Math.min(g.stopZ, this.z + v * dt);
        if (this.z >= g.stopZ - 1e-6) { this.z = g.stopZ; this._enter('unlock'); }
        break;
      }

      case 'unlock':
        if (this.stateTime >= c.unlockTime) this._enter('gate_open');
        break;

      case 'gate_open':
        this.gateOpen = ease(this.stateTime / c.gateTime);
        if (this.stateTime >= c.gateTime) {
          this.gateOpen = 1; this._gateOpened = true; this._startDialogue = true;
          this._enter('talk');
        }
        break;

      case 'talk':
        break;

      case 'follow':
      case 'fade':
        guardWalking = this._followStep(dt);
        break;

      default:
        break;
    }

    // Gehbewegung des Wärters weich ein- und ausblenden
    this.amp += ((guardWalking ? 1 : 0) - this.amp) * (1 - Math.exp(-dt * 6));
    this.phase += dt * c.strideRate * this.amp;
  }

  // Spieler und Wärter entlang des Wegs bewegen; gibt zurück, ob der Wärter gerade geht
  _followStep(dt) {
    const c = this.cfg, g = this.gp, path = this._path;

    // Wärter dreht sich um (nur am Anfang)
    if (this.state === 'follow') this.yaw = Math.PI * ease(this.stateTime / c.turnTime);

    // Spieler läuft (sanfter Start), bis zum Wegende
    this._followTime += dt;
    const startUp = ease(this._followTime / 0.6);
    const playerWalking = this._sp < this._sPlayerEnd - 1e-6;
    if (playerWalking) this._sp = Math.min(this._sPlayerEnd, this._sp + c.walkSpeed * startUp * dt);
    const pp = pointAt(path, this._sp);
    this.camAmp += ((playerWalking ? 0.8 : 0) - this.camAmp) * (1 - Math.exp(-dt * 6));
    this.camPhase += dt * c.strideRate * this.camAmp;

    // Kamera: Blick in Laufrichtung, Kopf wippt leicht
    const yawT = Math.atan2(-pp.dx, -pp.dz);
    // sanft drehen, aber nie schneller als ca. 143 Grad pro Sekunde (kein Ruckeln, auch bei ungünstiger Startrichtung)
    const turn = wrap(yawT - this._camYaw) * (1 - Math.exp(-dt * 3.5));
    this._camYaw += clamp(turn, -2.5 * dt, 2.5 * dt);
    this._camPitch += (0.02 - this._camPitch) * (1 - Math.exp(-dt * 3));
    this.cam = {
      x: pp.x, z: pp.z,
      y: c.eye + Math.sin(this.camPhase * 2) * 0.02 * this.camAmp,
      yaw: this._camYaw, pitch: this._camPitch,
    };

    // Wärter: wartet an der Zellentür, bis der Spieler nah ist, dann immer genau "gap" Meter vor ihm
    const prevSg = this._sg;
    this._sg = Math.max(this._sStop, this._sp + c.gap);
    if (this._sg > this._sHide) this._sg = this._sHide;
    const gp = pointAt(path, this._sg);
    this.x = gp.x; this.z = gp.z;
    const guardWalking = this.visible && this._sg > prevSg + 1e-9;

    // Verschwindet der Wärter in der Nische, wird das Bild schwarz
    if (this.state === 'follow' && this._sg >= this._sHide - 1e-6) {
      this.visible = false;
      this._enter('fade');
      return false;
    }
    if (this.state === 'fade') {
      this.fade = ease(this.stateTime / c.fadeTime);
      if (this.stateTime >= c.fadeTime) { this.fade = 1; this._enter('end'); }
    }
    return guardWalking;
  }
}

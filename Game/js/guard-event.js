// guard-event.js – Zeitplan des Wärter-Auftritts (reine Logik, ohne Three.js, dadurch testbar).
//
// Ablauf:  wait  -> door_open -> walk_in -> arrive -> talk -> turn -> walk_out -> door_close -> done
//   wait        zählt reine Spielzeit (nur wenn gespielt wird, nicht in Pause/Einstellungen/Startmenü)
//   door_open   die Tür am Gangende öffnet sich
//   walk_in     der Wärter geht zur Gittertür
//   arrive      er bleibt stehen, schaut den Spieler an (Eingaben gesperrt, Kamera dreht sich zu ihm)
//   talk        Gespräch läuft (main.js startet es und ruft danach finishTalk())
//   turn        er dreht sich um, der Spieler darf wieder steuern
//   walk_out    er geht zurück in die dunkle Nische
//   door_close  die Tür schließt sich
// Die Anzeige (guard.js, world.js) liest nur die Ausgabewerte: x, z, yaw, visible, doorOpen, phase, amp.

import { GUARD } from './layout.js';

export const GUARD_EVENT = Object.freeze({
  triggerAfter: 15,   // Sekunden Spielzeit bis zum Auftritt
  doorTime: 1.4,      // Tür öffnet sich
  walkSpeed: 1.25,    // Meter pro Sekunde
  arriveTime: 0.7,    // kurze Pause nach dem Ankommen, bevor er spricht
  turnTime: 0.7,
  closeTime: 1.2,
  strideRate: 5.6,    // Schrittfrequenz (Bogenmaß pro Sekunde bei voller Gehbewegung)
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export class GuardEvent {
  constructor(cfg = GUARD_EVENT, path = GUARD) {
    this.cfg = cfg;
    this.path = path;
    this.reset();
  }

  reset() {
    this.state = 'wait';
    this.playTime = 0;        // gespielte Sekunden seit dem Start
    this.stateTime = 0;
    this.doorOpen = 0;        // 0 = zu, 1 = ganz offen
    this.x = this.path.x;
    this.z = this.path.startZ;
    this.yaw = 0;             // 0 = blickt Richtung Zelle (+z), PI = geht weg
    this.visible = false;
    this.phase = 0;           // Laufphase (für Beine und Arme)
    this.amp = 0;             // Stärke der Gehbewegung 0..1
    this._startDialogue = false;
  }

  // Eingaben des Spielers sperren und Kamera auf den Wärter richten
  get inputLocked() { return this.state === 'arrive' || this.state === 'talk'; }
  get cameraLook() { return this.inputLocked; }
  get done() { return this.state === 'done'; }

  // true genau einmal, sobald das Gespräch beginnen soll
  consumeDialogueStart() {
    const r = this._startDialogue;
    this._startDialogue = false;
    return r;
  }

  // main.js ruft das auf, wenn das Gespräch zu Ende ist
  finishTalk() {
    if (this.state === 'talk') this._enter('turn');
  }

  _enter(state) { this.state = state; this.stateTime = 0; }

  // playing = false: Pause (Einstellungen, Hochformat, Startmenü, App im Hintergrund) -> nichts läuft weiter
  update(dt, playing) {
    if (!playing || !(dt > 0)) return;
    const c = this.cfg, p = this.path;
    this.stateTime += dt;
    let walking = false;

    switch (this.state) {
      case 'wait':
        this.playTime += dt;
        if (this.playTime >= c.triggerAfter) this._enter('door_open');
        break;

      case 'door_open':
        this.doorOpen = ease(this.stateTime / c.doorTime);
        if (this.stateTime >= c.doorTime) {
          this.doorOpen = 1;
          this.visible = true;
          this.z = p.startZ;
          this._enter('walk_in');
        }
        break;

      case 'walk_in': {
        walking = true;
        const remaining = p.stopZ - this.z;
        const v = c.walkSpeed * clamp(remaining / 0.7, 0.3, 1) * Math.min(1, 0.25 + this.amp);
        this.z = Math.min(p.stopZ, this.z + v * dt);
        if (this.z >= p.stopZ - 1e-6) { this.z = p.stopZ; this._enter('arrive'); }
        break;
      }

      case 'arrive':
        if (this.stateTime >= c.arriveTime) { this._enter('talk'); this._startDialogue = true; }
        break;

      case 'talk':
        break;

      case 'turn':
        this.yaw = Math.PI * ease(this.stateTime / c.turnTime);
        if (this.stateTime >= c.turnTime) { this.yaw = Math.PI; this._enter('walk_out'); }
        break;

      case 'walk_out': {
        walking = true;
        const v = c.walkSpeed * Math.min(1, 0.25 + this.amp);
        this.z = Math.max(p.hideZ, this.z - v * dt);
        if (this.z <= p.hideZ + 1e-6) {
          this.z = p.hideZ;
          this.visible = false;
          this._enter('door_close');
        }
        break;
      }

      case 'door_close':
        this.doorOpen = 1 - ease(this.stateTime / c.closeTime);
        if (this.stateTime >= c.closeTime) { this.doorOpen = 0; this._enter('done'); }
        break;

      default:
        break;
    }

    // Gehbewegung weich ein- und ausblenden
    this.amp += ((walking ? 1 : 0) - this.amp) * (1 - Math.exp(-dt * 6));
    this.phase += dt * c.strideRate * this.amp;
  }
}

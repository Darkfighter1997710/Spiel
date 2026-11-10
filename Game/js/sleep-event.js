// sleep-event.js – Ablauf des Schlafens im Bett (reine Logik, ohne Three.js, dadurch testbar).
//
// Zustände:  locked -> ready -> lie_down -> fade_out -> sleeping -> fade_in -> stand_up -> morning
//   locked     Schlafen ist noch nicht möglich (erst nach dem Gespräch mit dem Wärter: unlock())
//   ready      Spieler darf zum Bett gehen und "Schlafen" wählen (main.js ruft start())
//   lie_down   die Kamera legt sich sanft ins Bett (Blick schräg nach oben zur Decke)
//   fade_out   Bild wird schwarz
//   sleeping   schwarz, "Die Nacht vergeht …"; währenddessen wird das Morgenlicht vorbereitet
//   fade_in    Augen öffnen sich: Bild wird hell, das Morgenlicht scheint in die Zelle
//   stand_up   Spieler steht neben dem Bett auf, die Steuerung ist gleich wieder frei
//   morning    fertig (Zelle bleibt hell)
// Die Anzeige liest nur die Ausgabewerte: cam, fade (0 = klar, 1 = schwarz), morning (0..1), caption, captionAlpha.

import { SLEEP } from './layout.js';

export const SLEEP_EVENT = Object.freeze({
  lieTime: 1.8,
  fadeOutTime: 1.2,
  sleepTime: 3.6,
  fadeInTime: 3.2,
  standTime: 1.8,
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

export class SleepEvent {
  constructor(cfg = SLEEP_EVENT, pose = SLEEP) {
    this.cfg = cfg;
    this.pose = pose;
    this.reset();
  }

  reset() {
    this.state = 'locked';
    this.stateTime = 0;
    this.from = { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 };
    this.cam = { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 };
    this.fade = 0;
    this.morning = 0;
    this.caption = '';
    this.captionAlpha = 0;
    this._standUp = false;
    this._prepareMorning = false;
  }

  unlock() { if (this.state === 'locked') this._enter('ready'); }

  // from = aktuelle Kamera { x, y, z, yaw, pitch }. true = es geht los
  start(from) {
    if (this.state !== 'ready') return false;
    this.from = { x: from.x, y: from.y, z: from.z, yaw: from.yaw, pitch: from.pitch };
    this.cam = { ...this.from };
    this._enter('lie_down');
    return true;
  }

  get canStart() { return this.state === 'ready'; }
  get inputLocked() { return ['lie_down', 'fade_out', 'sleeping', 'fade_in', 'stand_up'].includes(this.state); }
  get cameraOverride() { return this.inputLocked; }
  get done() { return this.state === 'morning'; }

  // true genau einmal, wenn die Figur neben dem Bett an ihren Platz gestellt werden soll
  consumeStandUp() { const r = this._standUp; this._standUp = false; return r; }
  // true genau einmal, wenn das Morgenlicht vorbereitet werden soll (der Bildschirm ist dann schwarz)
  consumePrepareMorning() { const r = this._prepareMorning; this._prepareMorning = false; return r; }

  _enter(state) { this.state = state; this.stateTime = 0; }

  _setCam(from, to, t) {
    this.cam = {
      x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), z: lerp(from.z, to.z, t),
      yaw: lerpAngle(from.yaw, to.yaw, t), pitch: lerp(from.pitch, to.pitch, t),
    };
  }

  // playing = false: Pause -> nichts läuft weiter
  update(dt, playing) {
    if (!playing || !(dt > 0)) return;
    const c = this.cfg, lie = this.pose.lie, st = this.pose.stand;
    const standCam = { x: st.x, y: st.eyeY, z: st.z, yaw: st.yaw, pitch: st.pitch };
    this.stateTime += dt;
    const t = this.stateTime;

    switch (this.state) {
      case 'lie_down':
        this._setCam(this.from, lie, ease(t / c.lieTime));
        this.fade = 0;
        if (t >= c.lieTime) { this.cam = { ...lie }; this._enter('fade_out'); }
        break;

      case 'fade_out':
        this.cam = { ...lie };
        this.fade = ease(t / c.fadeOutTime);
        if (t >= c.fadeOutTime) { this.fade = 1; this._prepareMorning = true; this._enter('sleeping'); }
        break;

      case 'sleeping': {
        this.cam = { ...lie };
        this.fade = 1;
        const half = c.sleepTime / 2;
        const first = t < half;
        this.caption = first ? 'Du schläfst ein …' : 'Die Nacht vergeht …';
        const local = first ? t / half : (t - half) / half;
        this.captionAlpha = Math.sin(Math.PI * clamp(local, 0, 1));
        if (t >= c.sleepTime) { this.caption = ''; this.captionAlpha = 0; this._enter('fade_in'); }
        break;
      }

      case 'fade_in': {
        this.cam = { ...lie };
        const p = ease(t / c.fadeInTime);
        this.fade = 1 - p;
        this.morning = p;
        this.caption = 'Der Morgen ist gekommen.';
        this.captionAlpha = ease((t / c.fadeInTime - 0.3) / 0.4);
        if (t >= c.fadeInTime) { this.fade = 0; this.morning = 1; this._standUp = true; this._enter('stand_up'); }
        break;
      }

      case 'stand_up':
        this.fade = 0;
        this.morning = 1;
        this._setCam(lie, standCam, ease(t / c.standTime));
        this.captionAlpha = 1 - ease(t / (c.standTime * 0.7));
        if (t >= c.standTime) { this.cam = { ...standCam }; this.caption = ''; this.captionAlpha = 0; this._enter('morning'); }
        break;

      default:
        break;
    }
  }
}

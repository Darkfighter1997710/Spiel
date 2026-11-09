// sleep-event.js – Ablauf „im Bett schlafen“ (reine Logik, ohne Three.js, dadurch testbar).
//
// Ablauf:  idle -> fade_out -> asleep -> wake -> get_up -> done
//   fade_out  Bildschirm wird schwarz („Du schläfst ein …“)
//   asleep    schwarz; die Kamera liegt jetzt im Bett („Am nächsten Morgen …“)
//   wake      Bild wird wieder hell, gleichzeitig geht die Sonne auf (Tageslicht 0 -> 1)
//   get_up    Spieler richtet sich auf, Kamera geht zurück in die normale Stehhöhe
//   done      fertig; das Tageslicht bleibt. Schlafen geht einmal pro Spielstart.
// Die Anzeige (main.js, world.js) liest nur die Ausgabewerte: fade, lying, daylight, caption, active.

export const SLEEP = Object.freeze({
  fadeOut: 1.4,    // Sekunden bis es ganz schwarz ist
  asleep: 2.6,     // Sekunden Schwarz
  captionSwitch: 1.3,   // nach so vielen Sekunden im Schwarz wechselt der Text
  wake: 4.0,       // Aufwachen: Bild wird hell, Sonne geht auf
  wakeFade: 2.2,   // davon: so lange blendet das Schwarz aus
  getUp: 1.6,      // Aufstehen
});

export const SLEEP_CAPTIONS = Object.freeze({ falling: 'Du schläfst ein …', morning: 'Am nächsten Morgen …' });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export class SleepEvent {
  constructor(cfg = SLEEP) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.stateTime = 0;
    this.fade = 0;        // 0 = Bild normal, 1 = ganz schwarz
    this.lying = 0;       // 0 = Spieler steht, 1 = Kamera liegt im Bett
    this.daylight = 0;    // 0 = Nacht/Fackelzelle, 1 = Sonnenlicht von außen
    this.caption = '';
  }

  // Eingaben sperren, solange geschlafen wird
  get active() { return this.state !== 'idle' && this.state !== 'done'; }
  get done() { return this.state === 'done'; }

  // Startet das Schlafen. Gibt false zurück, wenn schon geschlafen wurde oder gerade geschlafen wird.
  start() {
    if (this.state !== 'idle') return false;
    this._enter('fade_out');
    this.caption = SLEEP_CAPTIONS.falling;
    return true;
  }

  _enter(state) { this.state = state; this.stateTime = 0; }

  // playing = false: Pause (Einstellungen, Hochformat, App im Hintergrund) -> nichts läuft weiter
  update(dt, playing) {
    if (!playing || !(dt > 0) || !this.active) return;
    const c = this.cfg;
    this.stateTime += dt;

    switch (this.state) {
      case 'fade_out':
        this.fade = ease(this.stateTime / c.fadeOut);
        if (this.stateTime >= c.fadeOut) { this.fade = 1; this.lying = 1; this._enter('asleep'); }
        break;

      case 'asleep':
        this.fade = 1; this.lying = 1;
        if (this.stateTime >= c.captionSwitch) this.caption = SLEEP_CAPTIONS.morning;
        if (this.stateTime >= c.asleep) this._enter('wake');
        break;

      case 'wake':
        this.fade = 1 - ease(this.stateTime / c.wakeFade);
        this.daylight = ease(this.stateTime / c.wake);
        if (this.stateTime >= c.wake) { this.fade = 0; this.daylight = 1; this._enter('get_up'); }
        break;

      case 'get_up':
        this.fade = 0; this.daylight = 1;
        this.lying = 1 - ease(this.stateTime / c.getUp);
        if (this.stateTime >= c.getUp) { this.lying = 0; this.caption = ''; this._enter('done'); }
        break;

      default:
        break;
    }
  }
}

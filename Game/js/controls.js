// controls.js – Touch-Steuerung: dynamischer Joystick (links), Kamera-Wischen (rechts),
// Buttons Springen und Sprinten. Mehrere Finger gleichzeitig sind möglich.
// Zusätzlich (nur zum Testen am Computer): WASD/Pfeile, Leertaste, Shift.

export class TouchControls {
  constructor({ layer, joystick, knob, btnJump, btnSprint }) {
    this.layer = layer;
    this.joystick = joystick;
    this.knob = knob;
    this.btnJump = btnJump;
    this.btnSprint = btnSprint;

    this.RADIUS = 56;     // Weg des Knopfs in Pixeln
    this.DEADZONE = 0.1;  // kleine Zitterbewegungen ignorieren

    this.moveX = 0;       // rechts positiv
    this.moveY = 0;       // vorwärts positiv
    this._joy = null;     // { id, ox, oy }
    this._look = null;    // { id, x, y }
    this._lookDX = 0;
    this._lookDY = 0;
    this._jump = false;
    this._sprintBtn = false;
    this._sprintPointer = null;
    this._keys = new Set();

    this._bindLayer();
    this._bindButtons();
    this._bindKeys();
  }

  // ---------- Abfragen durch das Spiel ----------
  get sprint() { return this._sprintBtn || this._keys.has('ShiftLeft') || this._keys.has('ShiftRight'); }

  getMove() {
    if (this._joy) return { x: this.moveX, y: this.moveY };
    let x = 0, y = 0;
    const k = this._keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  consumeLook() {
    const r = { dx: this._lookDX, dy: this._lookDY };
    this._lookDX = 0; this._lookDY = 0;
    return r;
  }

  consumeJump() {
    const j = this._jump;
    this._jump = false;
    return j;
  }

  // Alles loslassen (z. B. beim Pausieren)
  reset() {
    this._releaseJoystick();
    this._look = null;
    this._lookDX = 0; this._lookDY = 0;
    this._jump = false;
    this._sprintBtn = false; this._sprintPointer = null;
    this.btnSprint.classList.remove('active');
    this.btnJump.classList.remove('active');
    this._keys.clear();
  }

  // ---------- Joystick + Kamera ----------
  _bindLayer() {
    const layer = this.layer;

    layer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const left = e.clientX < window.innerWidth / 2;
      if (left && !this._joy) {
        this._joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        this.joystick.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
        this.knob.style.transform = 'translate3d(0,0,0)';
        this.joystick.classList.add('active');
      } else if (!left && !this._look) {
        this._look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      } else {
        return;
      }
      try { layer.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    });

    layer.addEventListener('pointermove', (e) => {
      if (this._joy && e.pointerId === this._joy.id) {
        e.preventDefault();
        let dx = e.clientX - this._joy.ox;
        let dy = e.clientY - this._joy.oy;
        const len = Math.hypot(dx, dy);
        const R = this.RADIUS;
        if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }   // Mittelpunkt bleibt fest
        this.knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
        const m = Math.min(1, len / R);                               // 0..1 = Auslenkung
        if (m < this.DEADZONE) {
          this.moveX = 0; this.moveY = 0;
        } else {
          const s = (m - this.DEADZONE) / (1 - this.DEADZONE);        // weicher Anlauf nach der Totzone
          const l = Math.hypot(dx, dy) || 1;                          // Richtung (Länge 1)
          this.moveX = (dx / l) * s;
          this.moveY = (-dy / l) * s;                                 // Bildschirm unten = rückwärts
        }
      } else if (this._look && e.pointerId === this._look.id) {
        e.preventDefault();
        this._lookDX += e.clientX - this._look.x;
        this._lookDY += e.clientY - this._look.y;
        this._look.x = e.clientX; this._look.y = e.clientY;
      }
    });

    const end = (e) => {
      if (this._joy && e.pointerId === this._joy.id) this._releaseJoystick();
      if (this._look && e.pointerId === this._look.id) this._look = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    layer.addEventListener('lostpointercapture', end);
  }

  _releaseJoystick() {
    this._joy = null;
    this.moveX = 0; this.moveY = 0;
    this.joystick.classList.remove('active');
    this.knob.style.transform = 'translate3d(0,0,0)';
  }

  // ---------- Buttons ----------
  _bindButtons() {
    const jump = this.btnJump, sprint = this.btnSprint;

    jump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._jump = true;                       // einmaliges Antippen = ein Sprung
      jump.classList.add('active');
      try { jump.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    });
    const jumpEnd = () => jump.classList.remove('active');
    jump.addEventListener('pointerup', jumpEnd);
    jump.addEventListener('pointercancel', jumpEnd);
    jump.addEventListener('lostpointercapture', jumpEnd);

    sprint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._sprintBtn = true;                  // gedrückt halten = Sprint
      this._sprintPointer = e.pointerId;
      sprint.classList.add('active');
      try { sprint.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    });
    const sprintEnd = (e) => {
      if (this._sprintPointer !== null && e.pointerId !== undefined && e.pointerId !== this._sprintPointer) return;
      this._sprintBtn = false; this._sprintPointer = null;
      sprint.classList.remove('active');
    };
    sprint.addEventListener('pointerup', sprintEnd);
    sprint.addEventListener('pointercancel', sprintEnd);
    sprint.addEventListener('lostpointercapture', sprintEnd);
  }

  // ---------- Tastatur (nur Komfort am PC) ----------
  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { if (!e.repeat) this._jump = true; e.preventDefault(); return; }
      this._keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this._keys.delete(e.code); });
    window.addEventListener('blur', () => this._keys.clear());
  }
}

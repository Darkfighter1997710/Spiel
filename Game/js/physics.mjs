// physics.mjs – Spielfigur-Physik ohne Abhängigkeit von Three.js (dadurch testbar).
// Die Figur ist ein senkrechter Zylinder (Kreis von oben gesehen). Hindernisse sind
// Quader (AABB). Kollision = Kreis gegen Rechteck; das funktioniert auch an Ecken.

export const PLAYER = Object.freeze({
  radius: 0.32,
  height: 1.8,
  eye: 1.65,
  walkSpeed: 2.4,
  sprintSpeed: 4.8,
  jumpSpeed: 4.4,
  gravity: 13,
  stepHeight: 0.3,   // am Boden: Kanten bis zu dieser Höhe werden "überstiegen"
  airStep: 0.05,     // in der Luft: kaum Toleranz (Tisch bleibt unerreichbar, Bett nicht)
  groundAccel: 45,
  airAccel: 10,
  jumpBuffer: 0.12,  // Sprung kurz vor der Landung wird gemerkt (aber kein Luftsprung)
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class PlayerPhysics {
  constructor(colliders, bounds, spawn, params = PLAYER) {
    this.colliders = colliders;
    this.bounds = bounds;
    this.p = params;
    this.x = spawn.x; this.z = spawn.z; this.y = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0;
    this.inX = 0; this.inZ = 0; this.sprint = false;
    this.jumpTimer = 0;
    this.landImpact = 0;
    this.grounded = true;
    this.y = this._supportHeight(this.p.stepHeight, spawn.y || 0);
  }

  // moveX: rechts positiv, moveZ: vorwärts positiv (Joystick, Länge 0..1)
  setInput(moveX, moveZ, sprint, yaw) {
    this.inX = moveX; this.inZ = moveZ; this.sprint = !!sprint; this.yaw = yaw;
  }

  queueJump() { this.jumpTimer = this.p.jumpBuffer; }

  consumeLandImpact() { const v = this.landImpact; this.landImpact = 0; return v; }

  get speedXZ() { return Math.hypot(this.vx, this.vz); }

  step(dt) {
    const p = this.p;
    this.jumpTimer = Math.max(0, this.jumpTimer - dt);

    // --- gewünschte Geschwindigkeit aus Joystick + Blickrichtung ---
    const mag = Math.min(1, Math.hypot(this.inX, this.inZ));
    let tx = 0, tz = 0;
    if (mag > 1e-4) {
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // vorwärts = (-sin, -cos), rechts = (cos, -sin)
      let dx = cy * this.inX - sy * this.inZ;
      let dz = -sy * this.inX - cy * this.inZ;
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      const speed = this.sprint ? p.sprintSpeed : p.walkSpeed;
      tx = dx * speed * mag; tz = dz * speed * mag;
    }
    const accel = this.grounded ? p.groundAccel : p.airAccel;
    const ex = tx - this.vx, ez = tz - this.vz;
    const el = Math.hypot(ex, ez), maxDv = accel * dt;
    if (el <= maxDv) { this.vx = tx; this.vz = tz; }
    else { this.vx += (ex / el) * maxDv; this.vz += (ez / el) * maxDv; }

    // --- Sprung: nur vom Boden aus ---
    if (this.jumpTimer > 0 && this.grounded) {
      this.vy = p.jumpSpeed;
      this.grounded = false;
      this.jumpTimer = 0;
    }

    // --- vertikal zuerst: Schwerkraft, Landen, Decke ---
    this.vy -= p.gravity * dt;
    const reach = this.grounded ? p.stepHeight : p.airStep;
    const support = this._supportHeight(reach, this.y);
    const ny = this.y + this.vy * dt;
    if (this.vy <= 0 && ny <= support) {
      if (!this.grounded) this.landImpact = Math.max(this.landImpact, -this.vy);
      this.y = support; this.vy = 0; this.grounded = true;
    } else {
      this.y = ny; this.grounded = false;
    }
    const maxY = this.bounds.ceiling - p.height;
    if (this.y > maxY) { this.y = maxY; if (this.vy > 0) this.vy = 0; }

    // --- danach horizontal bewegen und Kollisionen mit der NEUEN Höhe lösen ---
    // (so stimmt der Endzustand immer: Höhe und Position passen zusammen)
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this._collide(); this._clampBounds();
    this._collide(); this._clampBounds();
  }

  // höchste Fläche unter den Füßen (0 = Boden)
  _supportHeight(reach, feetY) {
    const rr = this.p.radius;
    let best = 0;
    for (const c of this.colliders) {
      if (c.maxY > feetY + reach + 1e-6) continue;
      if (c.maxY <= best) continue;
      const dx = this.x - clamp(this.x, c.minX, c.maxX);
      const dz = this.z - clamp(this.z, c.minZ, c.maxZ);
      if (dx * dx + dz * dz < rr * rr) best = c.maxY;
    }
    return best;
  }

  isBlocking(c) {
    const reach = this.grounded ? this.p.stepHeight : this.p.airStep;
    if (c.maxY <= this.y + reach) return false;
    if (c.minY >= this.y + this.p.height) return false;
    return true;
  }

  _collide() {
    const r = this.p.radius;
    for (let iter = 0; iter < 4; iter++) {
      let hit = false;
      for (const c of this.colliders) {
        if (!this.isBlocking(c)) continue;
        const cx = clamp(this.x, c.minX, c.maxX);
        const cz = clamp(this.z, c.minZ, c.maxZ);
        const dx = this.x - cx, dz = this.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; push = r - d;
        } else {
          // Mittelpunkt liegt im Quader: über die nächstgelegene Seite hinaus schieben
          const l = this.x - c.minX, rt = c.maxX - this.x;
          const t = this.z - c.minZ, b = c.maxZ - this.z;
          const m = Math.min(l, rt, t, b);
          if (m === l) { nx = -1; nz = 0; push = l + r; }
          else if (m === rt) { nx = 1; nz = 0; push = rt + r; }
          else if (m === t) { nx = 0; nz = -1; push = t + r; }
          else { nx = 0; nz = 1; push = b + r; }
        }
        this.x += nx * push; this.z += nz * push;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= vn * nx; this.vz -= vn * nz; }  // an der Wand entlang gleiten
        hit = true;
      }
      if (!hit) break;
    }
  }

  _clampBounds() {
    const r = this.p.radius, b = this.bounds;
    this.x = clamp(this.x, b.minX + r, b.maxX - r);
    this.z = clamp(this.z, b.minZ + r, b.maxZ - r);
  }
}

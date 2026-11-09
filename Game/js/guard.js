// guard.js – der Gefängniswärter: Figur aus einfachen Formen samt Animation.
// Ursprung der Figur = Boden zwischen den Füßen, Blick = +z. Meter.
// Animation: Gehen (Beine/Arme/Schlüsselbund), Kopf folgt dem Spieler, Mund und rechte Hand beim Sprechen.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createGuard(THREE) {
  const group = new THREE.Group();
  group.visible = false;

  // ---------- Materialien (leichte Eigenhelligkeit, damit er im Gang nicht schwarz wird) ----------
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const skin = mat(0xb98767, { emissive: 0x1c100a });
  const leather = mat(0x4a3626, { emissive: 0x0e0905 });
  const cloth = mat(0x4d5a66, { emissive: 0x0b0e11 });
  const trousers = mat(0x34302b, { emissive: 0x070605 });
  const boots = mat(0x241d17, { emissive: 0x050403 });
  const iron = mat(0x777a80, { metalness: 0.5, roughness: 0.45, emissive: 0x0d0e0f });
  const wood = mat(0x6a4a2c, { emissive: 0x0d0904 });
  const hairMat = mat(0x2b2118, { emissive: 0x050403 });
  const dark = mat(0x120d0a, { roughness: 1 });

  const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // ---------- Becken und Oberkörper ----------
  const hips = pivot(group, 0, 0.92, 0);
  const torso = add(hips, new THREE.CylinderGeometry(0.215, 0.185, 0.58, 12), cloth, 0, 0.30, 0);
  torso.scale.z = 0.62;
  const jerkin = add(hips, new THREE.CylinderGeometry(0.225, 0.2, 0.40, 12), leather, 0, 0.22, 0);   // Lederwams
  jerkin.scale.z = 0.66;
  const belt = add(hips, new THREE.CylinderGeometry(0.205, 0.205, 0.07, 12), leather, 0, 0.03, 0);
  belt.scale.z = 0.68;
  add(hips, new THREE.BoxGeometry(0.06, 0.05, 0.02), iron, 0, 0.03, 0.14);                             // Gürtelschnalle
  for (const sx of [-1, 1]) add(hips, new THREE.SphereGeometry(0.078, 8, 6), iron, 0.265 * sx, 0.56, 0); // Schulterplatten
  add(hips, new THREE.CylinderGeometry(0.055, 0.06, 0.08, 8), skin, 0, 0.63, 0);                       // Hals

  // Schlüsselbund (rechts) und Knüppel (links) am Gürtel
  const keys = pivot(hips, 0.2, 0.0, 0.04);
  const ring = add(keys, new THREE.TorusGeometry(0.03, 0.006, 6, 12), iron, 0, -0.02, 0);
  for (let i = 0; i < 4; i++) {
    const k = add(keys, new THREE.BoxGeometry(0.012, 0.07, 0.008), iron, (i - 1.5) * 0.014, -0.075, 0);
    k.rotation.z = (i - 1.5) * 0.12;
  }
  const club = add(hips, new THREE.CylinderGeometry(0.022, 0.034, 0.40, 8), wood, -0.22, -0.14, 0.0);
  club.rotation.z = 0.1;

  // ---------- Kopf ----------
  const head = pivot(hips, 0, 0.74, 0);
  const skull = add(head, new THREE.SphereGeometry(0.105, 12, 10), skin);
  skull.scale.set(0.95, 1.1, 1.0);
  add(head, new THREE.SphereGeometry(0.121, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), iron, 0, 0.022, 0);   // Helm
  add(head, new THREE.CylinderGeometry(0.152, 0.152, 0.012, 16), iron, 0, 0.03, 0);                          // Helmkrempe
  add(head, new THREE.BoxGeometry(0.016, 0.075, 0.012), iron, 0, -0.01, 0.112);                              // Nasenschutz
  for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(0.011, 6, 5), dark, 0.036 * sx, 0.012, 0.094); // Augen
  add(head, new THREE.BoxGeometry(0.10, 0.014, 0.02), hairMat, 0, 0.036, 0.092);                             // Brauen
  add(head, new THREE.BoxGeometry(0.075, 0.022, 0.022), hairMat, 0, -0.04, 0.098);                           // Schnurrbart
  add(head, new THREE.BoxGeometry(0.085, 0.06, 0.04), hairMat, 0, -0.098, 0.074);                            // Bart
  const mouth = add(head, new THREE.BoxGeometry(0.042, 0.008, 0.012), dark, 0, -0.066, 0.097);

  // ---------- Arme (Schulter -> Ellbogen -> Hand) ----------
  function makeArm(side) {
    const shoulder = pivot(hips, 0.27 * side, 0.52, 0);
    add(shoulder, new THREE.CylinderGeometry(0.047, 0.043, 0.30, 8), cloth, 0, -0.15, 0);
    const elbow = pivot(shoulder, 0, -0.30, 0);
    add(elbow, new THREE.CylinderGeometry(0.04, 0.036, 0.27, 8), cloth, 0, -0.135, 0);
    add(elbow, new THREE.SphereGeometry(0.04, 8, 6), skin, 0, -0.30, 0);
    return { shoulder, elbow };
  }
  const armR = makeArm(1), armL = makeArm(-1);

  // ---------- Beine (Hüfte -> Knie -> Stiefel) ----------
  function makeLeg(side) {
    const hip = pivot(hips, 0.1 * side, 0.0, 0);
    add(hip, new THREE.CylinderGeometry(0.075, 0.062, 0.44, 8), trousers, 0, -0.22, 0);
    const knee = pivot(hip, 0, -0.44, 0);
    add(knee, new THREE.CylinderGeometry(0.06, 0.052, 0.40, 8), trousers, 0, -0.20, 0);
    add(knee, new THREE.BoxGeometry(0.1, 0.1, 0.2), boots, 0, -0.43, 0.04);
    return { hip, knee };
  }
  const legR = makeLeg(1), legL = makeLeg(-1);

  // ---------- Animation ----------
  const st = { talk: 0, attention: 0, headYaw: 0, headPitch: 0, mouth: 0 };

  // s: { x, z, yaw, visible, phase, amp, talking, attention, time, lookYaw, lookPitch }
  //   lookYaw/lookPitch: Richtung zum Spieler relativ zur Blickrichtung des Wärters (Bogenmaß)
  function update(dt, s) {
    group.visible = !!s.visible;
    group.position.set(s.x, 0, s.z);
    group.rotation.y = s.yaw;
    if (!s.visible) return;

    const k = (rate) => 1 - Math.exp(-dt * rate);
    st.talk += ((s.talking ? 1 : 0) - st.talk) * k(8);
    st.attention += ((s.attention ? 1 : 0) - st.attention) * k(5);

    const amp = clamp(s.amp, 0, 1);
    const sw = Math.sin(s.phase);                    // rechts
    const swL = Math.sin(s.phase + Math.PI);         // links (gegengleich)

    // Becken wippt und dreht sich leicht
    hips.position.y = 0.92 + Math.abs(sw) * 0.025 * amp;
    hips.rotation.y = sw * 0.08 * amp;
    hips.rotation.z = Math.cos(s.phase) * 0.03 * amp;
    // Atmen im Stand
    hips.position.y += Math.sin(s.time * 1.8) * 0.004 * (1 - amp);

    // Beine: negative x-Drehung = Bein nach vorn; Knie beugt sich beim Vorschwingen
    legR.hip.rotation.x = -sw * 0.55 * amp;
    legL.hip.rotation.x = -swL * 0.55 * amp;
    legR.knee.rotation.x = Math.max(0, Math.cos(s.phase)) * 0.8 * amp;
    legL.knee.rotation.x = Math.max(0, Math.cos(s.phase + Math.PI)) * 0.8 * amp;

    // Arme schwingen gegengleich zu den Beinen, Ellbogen leicht gebeugt
    armR.shoulder.rotation.x = sw * 0.45 * amp;
    armL.shoulder.rotation.x = swL * 0.45 * amp;
    armR.elbow.rotation.x = -0.2 - 0.2 * Math.max(0, -sw) * amp;
    armL.elbow.rotation.x = -0.2 - 0.2 * Math.max(0, -swL) * amp;

    // Sprechen: rechte Hand gestikuliert, linke Hand ruht am Gürtel
    const g = st.talk;
    const gesture = 0.5 + 0.5 * Math.sin(s.time * 2.3);
    armR.shoulder.rotation.x += g * ((-0.5 - 0.25 * gesture) - armR.shoulder.rotation.x);
    armR.elbow.rotation.x += g * ((-0.9 - 0.3 * Math.sin(s.time * 3.1)) - armR.elbow.rotation.x);
    armL.shoulder.rotation.x += g * ((-0.05) - armL.shoulder.rotation.x);
    armL.elbow.rotation.x += g * ((-0.8) - armL.elbow.rotation.x);

    // Schlüsselbund pendelt
    keys.rotation.z = Math.sin(s.phase * 2) * 0.2 * amp + Math.sin(s.time * 1.3) * 0.02;
    keys.rotation.x = Math.cos(s.phase) * 0.1 * amp;

    // Kopf folgt dem Spieler (nur bei Aufmerksamkeit), begrenzt auf natürliche Winkel
    const tYaw = clamp(wrap(s.lookYaw || 0), -0.9, 0.9) * st.attention;
    const tPitch = clamp(s.lookPitch || 0, -0.35, 0.35) * st.attention;
    st.headYaw += (tYaw - st.headYaw) * k(6);
    st.headPitch += (tPitch - st.headPitch) * k(6);
    head.rotation.y = st.headYaw - hips.rotation.y;      // Beckendrehung ausgleichen
    head.rotation.x = st.headPitch + Math.sin(s.time * 4.2) * 0.02 * g;   // leichtes Nicken beim Sprechen

    // Mund öffnet und schließt sich beim Sprechen
    const open = g * (0.35 + 0.65 * Math.abs(Math.sin(s.time * 13)));
    st.mouth += (open - st.mouth) * k(20);
    mouth.scale.y = 1 + st.mouth * 2.6;
  }

  return { group, update };
}

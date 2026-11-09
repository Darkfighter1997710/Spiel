// arms.js – Arme und Hände in der Ich-Perspektive.
// Die Arme hängen an der Kamera. Sie bewegen sich mit dem Laufschritt (Kamera-Phase), schwingen beim
// Sprinten stärker, ballen sich dabei zur lockeren Faust, heben sich in der Luft und hinken beim
// Umsehen leicht hinterher. Alle Maße in Metern, Blickrichtung der Kamera = -z.

const clampArm = (v, a, b) => (v < a ? a : v > b ? b : v);

// Finger: x-Position an der Handfläche, Gliedlängen, Radius, seitliche Spreizung, Krümmungsfaktor
const FINGERS = [
  { x: -0.031, len: [0.038, 0.025, 0.019], r: 0.0098, splay: 0.06, k: 0.85 },   // Zeigefinger
  { x: -0.0105, len: [0.042, 0.028, 0.021], r: 0.0100, splay: 0.0, k: 1.0 },    // Mittelfinger
  { x: 0.0105, len: [0.039, 0.027, 0.020], r: 0.0097, splay: -0.03, k: 1.08 },  // Ringfinger
  { x: 0.031, len: [0.032, 0.021, 0.017], r: 0.0088, splay: -0.10, k: 1.18 },   // kleiner Finger
];

export function createArms(THREE, textures) {
  const group = new THREE.Group();

  // ---------- Materialien ----------
  let sleeveMap = null;
  if (textures && textures.fabric && textures.fabric.map && textures.fabric.map.clone) {
    sleeveMap = textures.fabric.map.clone();
    sleeveMap.repeat.set(3, 2);
    sleeveMap.needsUpdate = true;
  }
  // kleine Eigenhelligkeit, damit die Hände auch fern der Fackel nicht im Dunkeln verschwinden
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7c, roughness: 0.78, emissive: 0x24150d });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x7d705f, map: sleeveMap, roughness: 1, emissive: 0x120e0a });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x3b332a, roughness: 1, emissive: 0x0a0806 });

  // Geometrien einmal bauen und wiederverwenden (spart Speicher)
  const cache = new Map();
  const segGeo = (r, S) => {
    const key = `${r.toFixed(4)}_${S.toFixed(4)}`;
    if (!cache.has(key)) {
      const g = new THREE.CapsuleGeometry(r, Math.max(0.001, S - 2 * r), 3, 8);
      g.rotateX(-Math.PI / 2);      // Länge entlang -z
      g.translate(0, 0, -S / 2);    // beginnt am Gelenk, endet bei -S
      cache.set(key, g);
    }
    return cache.get(key);
  };
  const tube = (rTop, rBottom, len, z, material, segs = 14) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, len, segs);
    g.rotateX(Math.PI / 2);         // oberes Ende zeigt nach +z (Ellenbogen), unteres nach -z (Handgelenk)
    g.translate(0, 0, z);
    return new THREE.Mesh(g, material);
  };

  function makeFinger(f) {
    const root = new THREE.Group();
    root.position.set(f.x, 0, -0.094);
    root.rotation.y = f.splay;
    const joints = [];
    let parent = root;
    for (let i = 0; i < f.len.length; i++) {
      const j = new THREE.Group();
      if (i > 0) j.position.z = -f.len[i - 1] * 0.94;
      j.add(new THREE.Mesh(segGeo(f.r * (1 - i * 0.1), f.len[i]), skin));
      parent.add(j);
      joints.push(j);
      parent = j;
    }
    return { root, joints, k: f.k };
  }

  // ---------- ein Arm (Ursprung am Ellenbogenende, ragt nach -z) ----------
  function makeArm() {
    const arm = new THREE.Group();
    arm.add(tube(0.062, 0.053, 0.40, -0.20, sleeve));        // Ärmel
    arm.add(tube(0.057, 0.057, 0.03, -0.40, cuff, 14));      // Saum
    arm.add(tube(0.041, 0.034, 0.13, -0.455, skin, 12));     // nackter Unterarm

    const hand = new THREE.Group();
    hand.position.z = -0.52;
    hand.rotation.z = -1.15;                                 // Handfläche zeigt nach innen
    arm.add(hand);

    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), skin);
    hand.add(wrist);
    const palmGeo = new THREE.BoxGeometry(0.086, 0.030, 0.096);
    palmGeo.translate(0, 0, -0.048);
    hand.add(new THREE.Mesh(palmGeo, skin));

    const fingers = FINGERS.map(makeFinger);
    fingers.forEach((f) => hand.add(f.root));

    const thumbRoot = new THREE.Group();
    thumbRoot.position.set(-0.046, -0.004, -0.030);
    hand.add(thumbRoot);
    const thumbLen = [0.034, 0.027];
    const thumb = [];
    let parent = thumbRoot;
    for (let i = 0; i < thumbLen.length; i++) {
      const j = new THREE.Group();
      if (i > 0) j.position.z = -thumbLen[i - 1] * 0.94;
      j.add(new THREE.Mesh(segGeo(0.0108 * (1 - i * 0.1), thumbLen[i]), skin));
      parent.add(j);
      thumb.push(j);
      parent = j;
    }

    // curl: 0 = offene Hand, 1 = Faust
    function setCurl(c) {
      for (const f of fingers) {
        const cc = c * f.k;
        f.joints[0].rotation.x = -cc * 0.9;
        f.joints[1].rotation.x = -cc * 1.25;
        f.joints[2].rotation.x = -cc * 0.75;
      }
      thumbRoot.rotation.y = 0.5 - c * 0.85;   // locker abgespreizt -> quer über die Finger
      thumbRoot.rotation.x = -0.25 - c * 0.35;
      thumb[0].rotation.x = -c * 0.45;
      thumb[1].rotation.x = -c * 0.8;
    }
    setCurl(0.42);
    return { arm, setCurl };
  }

  // ---------- zwei Arme: rechts normal, links gespiegelt ----------
  const sides = [];
  for (const side of [1, -1]) {
    const holder = new THREE.Group();           // Platz im Bild (links wird gespiegelt)
    holder.position.set(0.30 * side, -0.46, 0.05);
    holder.scale.x = side;
    const pose = new THREE.Group();             // wird pro Bild animiert
    const built = makeArm();
    pose.add(built.arm);
    holder.add(pose);
    group.add(holder);
    sides.push({ pose, setCurl: built.setCurl, off: side === 1 ? 0 : Math.PI });
  }

  // ---------- Animation ----------
  const st = { sprint: 0, air: 0, swayX: 0, swayY: 0 };

  // s: { phase, amp, sprinting, grounded, vy, yawRate, pitchRate, dip, time }
  function update(dt, s) {
    const k = (rate) => 1 - Math.exp(-dt * rate);
    st.sprint += ((s.sprinting ? 1 : 0) - st.sprint) * k(7);
    st.air += ((s.grounded ? 0 : 1) - st.air) * k(9);

    // beim Umsehen bleiben die Hände leicht zurück
    const tx = clampArm((s.yawRate || 0) * 0.012, -0.05, 0.05);
    const ty = clampArm(-(s.pitchRate || 0) * 0.012, -0.05, 0.05);
    st.swayX += (tx - st.swayX) * k(9);
    st.swayY += (ty - st.swayY) * k(9);

    const amp = clampArm(s.amp, 0, 1.6) * (1 + 0.25 * st.sprint);   // beim Sprinten ist s.amp schon größer
    const idle = 1 - Math.min(1, s.amp);

    for (const a of sides) {
      const sw = Math.sin(s.phase + a.off);                              // gegengleich links/rechts
      const breathe = Math.sin(s.time * 1.7 + a.off) * 0.0025 * idle;

      a.pose.position.set(
        st.swayX + st.air * 0.03,
        st.swayY + sw * 0.012 * amp + breathe + st.sprint * 0.025 + st.air * 0.035 + (s.dip || 0) * 0.5,
        -sw * 0.05 * amp - st.sprint * 0.02,
      );
      a.pose.rotation.x = 0.33 + sw * 0.14 * amp + st.sprint * 0.22 + st.air * 0.2;
      a.pose.rotation.y = 0.18 + sw * 0.05 * amp - st.air * 0.06;
      a.pose.rotation.z = -sw * 0.04 * amp;

      a.setCurl(0.42 + 0.58 * st.sprint + Math.sin(s.time * 0.9 + a.off) * 0.03 * idle + sw * 0.04 * amp);
    }
  }

  return { group, update };
}

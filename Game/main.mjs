// main.mjs – Start, Hauptschleife, Kamera, Einstellungen.
// Three.js und alle Spielmodule werden erst hier per import() geladen, damit bei einem
// Ladefehler eine verständliche Meldung erscheint statt eines leeren Bildschirms.

const $ = (id) => document.getElementById(id);

// ---------- Browser-Gesten unterdrücken (Zoomen, Kontextmenü, Doppeltipp, Scrollen) ----------
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest || !e.target.closest('#settings-panel')) e.preventDefault();
}, { passive: false });

// ---------- Einstellungen (werden im Browser gespeichert) ----------
const SETTINGS_KEY = 'verlies.settings.v1';
const DEFAULTS = { sens: 1, bright: 1, invert: false };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) { /* z. B. privater Modus */ }
}

// ---------- Fehleranzeige ----------
function showError(title, text) {
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  $('error-box').hidden = false;
  const btn = $('start-btn');
  btn.textContent = 'Nicht verfügbar';
  btn.disabled = true;
}
$('error-reload').addEventListener('click', () => location.reload());

boot().catch((err) => {
  console.error(err);
  if (err && err.code === 'NO_THREE') {
    showError('3D-Bibliothek fehlt',
      'Three.js konnte nicht geladen werden. Entweder fehlt die Datei libs/three.module.min.js im Projekt, ' +
      'oder es gibt keine Internetverbindung. Siehe README.md, Abschnitt „Three.js lokal ablegen“.');
  } else if (err && err.code === 'NO_WEBGL') {
    showError('3D nicht unterstützt',
      'Dieser Browser oder dieses Gerät kann keine 3D-Grafik (WebGL) darstellen. Bitte Chrome aktualisieren.');
  } else {
    showError('Unerwarteter Fehler', String((err && err.message) || err));
  }
});

async function boot() {
  const { loadThree } = await import('./js/loader.mjs');
  const { THREE, source } = await loadThree();
  const [{ createWorld }, { PlayerPhysics, PLAYER }, { TouchControls }] = await Promise.all([
    import('./js/world.mjs'),
    import('./js/physics.mjs'),
    import('./js/controls.mjs'),
  ]);

  const settings = loadSettings();

  // ---------- Renderer ----------
  const canvas = $('game');
  const dpr = window.devicePixelRatio || 1;
  let pixelRatio = Math.min(dpr, 1.75);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
  } catch (e) {
    const err = new Error('WebGL nicht verfügbar');
    err.code = 'NO_WEBGL';
    throw err;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // Schatten sind statisch: einmal berechnen genügt (spart viel Akku)
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const BASE_EXPOSURE = 1.1;
  renderer.toneMappingExposure = BASE_EXPOSURE * settings.bright;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('Grafik unterbrochen', 'Das Gerät hat die Grafik angehalten. Bitte die Seite neu laden.');
  });

  // ---------- Welt, Kamera, Physik ----------
  const world = createWorld(THREE, renderer);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';

  const physics = new PlayerPhysics(world.colliders, world.bounds, world.spawn);
  let yaw = world.spawn.yaw || 0;
  let pitch = 0;
  const PITCH_LIMIT = 1.45;    // ca. 83° – kein Überschlagen möglich

  function applySize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applySize);
  applySize();

  // ---------- Steuerung ----------
  const controls = new TouchControls({
    layer: $('touch-layer'),
    joystick: $('joystick'),
    knob: $('joy-knob'),
    btnJump: $('btn-jump'),
    btnSprint: $('btn-sprint'),
  });

  // ---------- Einstellungsfenster ----------
  let settingsOpen = false;
  const sensIn = $('sens'), brightIn = $('bright'), invertIn = $('invert');
  sensIn.value = settings.sens; brightIn.value = settings.bright; invertIn.checked = settings.invert;
  const syncOutputs = () => {
    $('sens-out').textContent = Number(settings.sens).toFixed(2);
    $('bright-out').textContent = Number(settings.bright).toFixed(2);
  };
  syncOutputs();
  sensIn.addEventListener('input', () => { settings.sens = parseFloat(sensIn.value); syncOutputs(); saveSettings(settings); });
  brightIn.addEventListener('input', () => {
    settings.bright = parseFloat(brightIn.value);
    renderer.toneMappingExposure = BASE_EXPOSURE * settings.bright;
    syncOutputs(); saveSettings(settings);
  });
  invertIn.addEventListener('change', () => { settings.invert = invertIn.checked; saveSettings(settings); });

  const openSettings = () => { settingsOpen = true; controls.reset(); $('settings-panel').hidden = false; };
  const closeSettings = () => { settingsOpen = false; $('settings-panel').hidden = true; };
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-resume').addEventListener('click', closeSettings);

  // Vollbild (nur anzeigen, wenn der Browser es kann)
  const fsBtn = $('btn-fullscreen');
  const root = document.documentElement;
  function enterFullscreen() {
    try {
      const p = root.requestFullscreen && root.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => {
          try {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
          } catch (_) { /* nicht kritisch */ }
        }).catch(() => {});
      }
    } catch (_) { /* nicht kritisch */ }
  }
  if (document.fullscreenEnabled) {
    fsBtn.hidden = false;
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else enterFullscreen();
    });
  }

  // ---------- Start ----------
  let started = false;
  const startBtn = $('start-btn');
  $('engine-info').textContent = `Three.js r${THREE.REVISION} · ${source} geladen`;
  renderer.compile(world.scene, camera);      // Shader vorab übersetzen (verhindert Ruckler beim ersten Bild)
  startBtn.textContent = 'Spiel starten';
  startBtn.disabled = false;
  startBtn.addEventListener('click', () => {
    started = true;
    $('start-screen').hidden = true;
    $('hud').hidden = false;
    enterFullscreen();
  });

  // ---------- Kamera: Position, Kopfwippen, Landeruck, Sprint-Weitwinkel ----------
  const cam = { phase: 0, amp: 0, dip: 0, eye: null, fov: 72 };
  function updateCamera(dt) {
    const targetEye = physics.y + PLAYER.eye;
    if (cam.eye === null) cam.eye = targetEye;
    // am Boden leicht glätten (weiches Hochsteigen), in der Luft exakt mitfliegen
    if (physics.grounded) cam.eye += (targetEye - cam.eye) * (1 - Math.exp(-dt * 20));
    else cam.eye = targetEye;

    const impact = physics.consumeLandImpact();
    if (impact > 1.2) cam.dip = -Math.min(0.14, impact * 0.022);
    cam.dip += (0 - cam.dip) * (1 - Math.exp(-dt * 9));

    const speed = physics.grounded ? physics.speedXZ : 0;
    const sprinting = speed > PLAYER.walkSpeed * 1.25;
    const wantAmp = Math.min(1, speed / PLAYER.walkSpeed) * (sprinting ? 1.5 : 1);
    cam.amp += (wantAmp - cam.amp) * (1 - Math.exp(-dt * 10));
    cam.phase += dt * speed * 2.0;

    const offY = Math.sin(cam.phase * 2) * 0.03 * cam.amp + cam.dip;
    const offX = Math.cos(cam.phase) * 0.02 * cam.amp;
    const roll = Math.cos(cam.phase) * 0.006 * cam.amp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // "rechts" in Blickrichtung
    camera.position.set(physics.x + rx * offX, cam.eye + offY, physics.z + rz * offX);
    camera.rotation.set(pitch, yaw, roll);

    const wantFov = 72 + (sprinting ? 5 : 0);
    cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(camera.fov - cam.fov) > 0.02) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  }

  // ---------- Hauptschleife ----------
  const STEP = 1 / 90;           // feste Physik-Schrittweite (verhindert Durchrutschen bei hoher Geschwindigkeit)
  let acc = 0;
  let last = performance.now();
  let fpsTime = 0, fpsFrames = 0;
  const isPortrait = () => window.innerHeight > window.innerWidth;
  const BASE_LOOK = 0.0045;      // Bogenmaß pro Pixel bei Empfindlichkeit 1.0

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, Math.max(0, rawDt));

    const active = started && !settingsOpen && !isPortrait() && !document.hidden;
    if (active) {
      const look = controls.consumeLook();
      const k = BASE_LOOK * settings.sens;
      yaw -= look.dx * k;
      pitch -= look.dy * k * (settings.invert ? -1 : 1);
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

      const mv = controls.getMove();
      physics.setInput(mv.x, mv.y, controls.sprint, yaw);
      if (controls.consumeJump()) physics.queueJump();

      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 8) { physics.step(STEP); acc -= STEP; n++; }
      if (n === 8) acc = 0;
    } else {
      controls.reset();
      physics.setInput(0, 0, false, yaw);
      acc = 0;
    }

    updateCamera(dt);
    world.update(now / 1000);
    renderer.render(world.scene, camera);

    // Falls das Gerät zu langsam ist, die Auflösung schrittweise verringern (nie wieder erhöhen)
    if (active) {
      fpsTime += Math.min(rawDt, 0.1); fpsFrames++;   // lange Pausen (App im Hintergrund) nicht mitzählen
      if (fpsFrames >= 120) {
        const avg = fpsTime / fpsFrames;
        if (avg > 1 / 40 && pixelRatio > 0.8) { pixelRatio = Math.max(0.8, pixelRatio - 0.2); applySize(); }
        fpsTime = 0; fpsFrames = 0;
      }
    }
  }
  requestAnimationFrame((t) => { last = t; frame(t); });
}

// main.js – Start, Hauptschleife, Kamera, Einstellungen.
// Three.js und alle Spielmodule werden erst hier per import() geladen, damit bei einem
// Ladefehler eine verständliche Meldung erscheint statt eines leeren Bildschirms.

const $ = (id) => document.getElementById(id);

// Versionsnummer: gleich wie in package.json und in index.html (?v=…). Sie hängt an allen Modul-Adressen, damit der Browser nach
// einem Update nie veraltete Dateien aus dem Zwischenspeicher nimmt (sonst laufen alte und neue Dateien gemischt).
const VERSION = '0.4.2';
const Q = `?v=${VERSION}`;

// ---------- Browser-Gesten unterdrücken (Zoomen, Kontextmenü, Doppeltipp, Scrollen) ----------
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest || !e.target.closest('#settings-panel')) e.preventDefault();
}, { passive: false });

// ---------- Einstellungen (werden im Browser gespeichert) ----------
const SETTINGS_KEY = 'verlies.settings.v1';
const DEFAULTS = { sens: 1, bright: 1, invert: false, diag: false };

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
  const { loadThree } = await import(`./js/loader.js${Q}`);
  const { THREE, source } = await loadThree();
  const [
    { createWorld }, { PlayerPhysics, PLAYER }, { TouchControls }, { createArms },
    { createGuard }, { GuardEvent }, { DialogueRunner, GUARD_DIALOGUE }, { createDialogueUI }, { GUARD, SLEEP_POSE, distanceToBed },
    { SleepEvent }, { captureErrors, formatDebug, gpuName },
  ] = await Promise.all([
    import(`./js/world.js${Q}`),
    import(`./js/physics.js${Q}`),
    import(`./js/controls.js${Q}`),
    import(`./js/arms.js${Q}`),
    import(`./js/guard.js${Q}`),
    import(`./js/guard-event.js${Q}`),
    import(`./js/dialogue.js${Q}`),
    import(`./js/dialogue-ui.js${Q}`),
    import(`./js/layout.js${Q}`),
    import(`./js/sleep-event.js${Q}`),
    import(`./js/debug.js${Q}`),
  ]);
  const errorLines = captureErrors();   // Fehler/Warnungen der Grafik sammeln (für die Diagnose-Anzeige)

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
  renderer.autoClear = false;               // wir löschen selbst: Welt und Arme werden in zwei Durchgängen gezeichnet
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const BASE_EXPOSURE = 1.1;
  renderer.toneMappingExposure = BASE_EXPOSURE * settings.bright;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('Grafik unterbrochen', 'Das Gerät hat die Grafik angehalten. Bitte die Seite neu laden.');
  });

  // ---------- Welt, Kamera, Physik ----------
  const world = createWorld(THREE, renderer);
  renderer.setClearColor(world.background, 1);   // Hintergrund über die Löschfarbe (nicht scene.background, siehe world.js)
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';

  // Arme und Hände: hängen an der Kamera und liegen auf Ebene 1. Sie werden in einem zweiten
  // Durchgang NACH dem Löschen der Tiefe gezeichnet – so ragen sie nie in Wände hinein.
  world.scene.add(camera);
  const arms = createArms(THREE, world.textures);
  camera.add(arms.group);
  arms.group.traverse((o) => o.layers.set(1));

  // Wärter-Auftritt: nach 15 s Spielzeit öffnet sich die Tür am Gangende, der Wärter geht zur Gittertür
  // und spricht mit dem Spieler (Ablauf: guard-event.js, Text: dialogue.js).
  const guard = createGuard(THREE);
  world.scene.add(guard.group);
  const guardEvent = new GuardEvent();
  const dialogue = new DialogueRunner(GUARD_DIALOGUE);
  let dialogueActive = false;
  const dialogueUI = createDialogueUI({
    root: $('dialogue'), hud: $('hud'), tap: $('dialogue-tap'), speaker: $('dialogue-speaker'),
    text: $('dialogue-text'), choices: $('dialogue-choices'), hint: $('dialogue-hint'),
  }, {
    onTap: () => dialogue.tap(),
    onChoose: (i) => dialogue.choose(i),
  });
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Schlafen: Nach dem Gespräch erscheint am Bett der Knopf „Schlafen“. Danach wird es durch die Sonne heller
  // (Ablauf: sleep-event.js, Licht: world.setDaylight).
  const sleep = new SleepEvent();
  const btnSleep = $('btn-sleep'), sleepHint = $('sleep-hint'), sleepFade = $('sleep-fade'), sleepCaption = $('sleep-caption');
  let sleepBtnShown = false, sleepHintShown = false, sleepHintLeft = 8;   // Hinweis erscheint maximal 8 Sekunden lang
  let shownFade = -1, shownCaption = null, shownDaylight = -1, shownSleeping = false;
  btnSleep.addEventListener('click', () => {
    if (!sleepBtnShown || !sleep.start()) return;
    controls.reset();
    btnSleep.hidden = true; sleepBtnShown = false;
  });

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

  // Diagnose-Anzeige: zeigt, was gezeichnet wird, plus drei Test-Schalter (Schatten, Nebel, helles Testlicht)
  const diagIn = $('diag');
  diagIn.checked = settings.diag;
  const applyDiag = () => { $('debug-box').hidden = !settings.diag; };
  diagIn.addEventListener('change', () => { settings.diag = diagIn.checked; saveSettings(settings); applyDiag(); });
  applyDiag();
  const dbg = { shadow: true, fog: true, bright: false, worldStat: { calls: 0, tris: 0 }, armStat: { calls: 0, tris: 0 }, fps: 0, timer: 99 };
  const fogObject = world.scene.fog;
  const refreshMaterials = () => world.scene.traverse((o) => {
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; });
  });
  const dbgLabel = (id, name, on, onText = 'an', offText = 'aus') => { $(id).textContent = `${name}: ${on ? onText : offText}`; };
  $('dbg-shadow').addEventListener('click', () => {
    dbg.shadow = !dbg.shadow;
    renderer.shadowMap.enabled = dbg.shadow;
    if (dbg.shadow) renderer.shadowMap.needsUpdate = true;
    refreshMaterials(); dbgLabel('dbg-shadow', 'Schatten', dbg.shadow);
  });
  $('dbg-fog').addEventListener('click', () => {
    dbg.fog = !dbg.fog;
    world.scene.fog = dbg.fog ? fogObject : null;
    refreshMaterials(); dbgLabel('dbg-fog', 'Nebel', dbg.fog);
  });
  $('dbg-bright').addEventListener('click', () => {
    dbg.bright = !dbg.bright;
    world.setDebugBright(dbg.bright); dbgLabel('dbg-bright', 'Testlicht', dbg.bright);
  });
  const readPass = () => {
    const r = renderer.info && renderer.info.render;
    return r ? { calls: r.calls, tris: r.triangles } : { calls: '?', tris: '?' };
  };
  function updateDebug(rawDt) {
    dbg.fps += ((1 / Math.max(rawDt, 0.001)) - dbg.fps) * 0.05;
    dbg.timer += rawDt;
    if (dbg.timer < 0.4) return;
    dbg.timer = 0;
    const info = renderer.info || {}, caps = renderer.capabilities || {};
    $('debug-text').textContent = formatDebug({
      version: VERSION, three: THREE.REVISION, source, gpu: dbg.gpu || (dbg.gpu = gpuName(renderer)),
      width: window.innerWidth, height: window.innerHeight, pixelRatio, fps: dbg.fps,
      world: dbg.worldStat, arms: dbg.armStat,
      programs: info.programs ? info.programs.length : '?',
      textures: info.memory ? info.memory.textures : '?', geometries: info.memory ? info.memory.geometries : '?',
      caps: {
        maxTextures: caps.maxTextures, maxTextureSize: caps.maxTextureSize, maxFragmentUniforms: caps.maxFragmentUniforms,
        maxVaryings: caps.maxVaryings, precision: caps.precision,
      },
      cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw, pitch },
      daylight: world.daylight, exposure: renderer.toneMappingExposure, messages: errorLines,
    });
  }

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
  $('engine-info').textContent = `Version ${VERSION} · Three.js r${THREE.REVISION} · ${source} geladen`;
  camera.layers.set(1); renderer.compile(world.scene, camera);   // Shader vorab übersetzen (verhindert Ruckler beim ersten Bild)
  camera.layers.set(0); renderer.compile(world.scene, camera);
  startBtn.textContent = 'Spiel starten';
  startBtn.disabled = false;
  startBtn.addEventListener('click', () => {
    started = true;
    $('start-screen').hidden = true;
    $('hud').hidden = false;
    enterFullscreen();
  });

  // ---------- Kamera: Position, Kopfwippen, Landeruck, Sprint-Weitwinkel ----------
  const cam = { phase: 0, amp: 0, dip: 0, eye: null, fov: 72, sprinting: false };
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
    cam.sprinting = sprinting;
    const wantAmp = Math.min(1, speed / PLAYER.walkSpeed) * (sprinting ? 1.5 : 1);
    cam.amp += (wantAmp - cam.amp) * (1 - Math.exp(-dt * 10));
    cam.phase += dt * speed * 2.0;

    const offY = Math.sin(cam.phase * 2) * 0.03 * cam.amp + cam.dip;
    const offX = Math.cos(cam.phase) * 0.02 * cam.amp;
    const roll = Math.cos(cam.phase) * 0.006 * cam.amp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // "rechts" in Blickrichtung
    let cx = physics.x + rx * offX, cy = cam.eye + offY, cz = physics.z + rz * offX;
    let camYaw = yaw, camPitch = pitch, camRoll = roll;
    const lie = sleep.lying;   // 0 = stehen, 1 = Kopf auf dem Kissen (Schlafen: Kamera blendet dazwischen)
    if (lie > 0) {
      cx += (SLEEP_POSE.x - cx) * lie; cy += (SLEEP_POSE.y - cy) * lie; cz += (SLEEP_POSE.z - cz) * lie;
      camYaw = yaw + wrapAngle(SLEEP_POSE.yaw - yaw) * lie;
      camPitch = pitch + (SLEEP_POSE.pitch - pitch) * lie;
      camRoll = roll * (1 - lie);
    }
    camera.position.set(cx, cy, cz);
    camera.rotation.set(camPitch, camYaw, camRoll);

    const wantFov = 72 + (sprinting ? 5 : 0);
    cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(camera.fov - cam.fov) > 0.02) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  }

  // ---------- Hauptschleife ----------
  const STEP = 1 / 90;           // feste Physik-Schrittweite (verhindert Durchrutschen bei hoher Geschwindigkeit)
  let acc = 0;
  let prevYaw = yaw, prevPitch = pitch;
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
      // --- Wärter-Auftritt weiterlaufen lassen (zählt nur echte Spielzeit) ---
      guardEvent.update(dt, true);
      if (guardEvent.consumeDialogueStart()) { dialogue.start(); dialogueActive = true; }
      if (dialogueActive) {
        dialogue.update(dt);
        if (dialogue.finished) { dialogueActive = false; guardEvent.finishTalk(); dialogueUI.hide(); }
        else dialogueUI.render(dialogue);
      }

      sleep.update(dt, true);

      if (sleep.active) {
        // Schlafen: keine Steuerung, die Figur bleibt stehen, die Kamera liegt im Bett
        controls.consumeLook(); controls.consumeJump(); controls.reset();
        physics.setInput(0, 0, false, yaw);
      } else if (guardEvent.inputLocked) {
        // Gespräch: keine Steuerung, die Kamera dreht sich sanft zum Wärter
        controls.consumeLook(); controls.consumeJump(); controls.reset();
        physics.setInput(0, 0, false, yaw);
        const eyeY = physics.y + PLAYER.eye;
        const dx = guardEvent.x - physics.x, dz = guardEvent.z - physics.z;
        const dist = Math.max(0.5, Math.hypot(dx, dz));
        const yawT = Math.atan2(-dx, -dz);
        const pitchT = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(GUARD.headHeight - eyeY, dist)));
        const kk = 1 - Math.exp(-dt * 4);
        yaw += wrapAngle(yawT - yaw) * kk;
        pitch += (pitchT - pitch) * kk;
      } else {
        const look = controls.consumeLook();
        const k = BASE_LOOK * settings.sens;
        yaw -= look.dx * k;
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - look.dy * k * (settings.invert ? -1 : 1)));
        const mv = controls.getMove();
        physics.setInput(mv.x, mv.y, controls.sprint, yaw);
        if (controls.consumeJump()) physics.queueJump();
      }

      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 8) { physics.step(STEP); acc -= STEP; n++; }
      if (n === 8) acc = 0;
    } else {
      controls.reset();
      physics.setInput(0, 0, false, yaw);
      acc = 0;
    }

    // Drehtempo (für das leichte Nachhinken der Hände) – egal ob Wischen oder automatische Kamerafahrt
    const yawRate = wrapAngle(yaw - prevYaw) / Math.max(dt, 0.004);
    const pitchRate = (pitch - prevPitch) / Math.max(dt, 0.004);
    prevYaw = yaw; prevPitch = pitch;

    // Wärter und Tür am Gangende darstellen
    {
      const dx = physics.x - guardEvent.x, dz = physics.z - guardEvent.z;
      const lookYaw = wrapAngle(Math.atan2(dx, dz) - guardEvent.yaw);
      const lookPitch = Math.atan2(GUARD.headHeight - (physics.y + PLAYER.eye), Math.max(0.5, Math.hypot(dx, dz)));
      world.setEndDoor(guardEvent.doorOpen);
      guard.update(dt, {
        x: guardEvent.x, z: guardEvent.z, yaw: guardEvent.yaw, visible: guardEvent.visible,
        phase: guardEvent.phase, amp: guardEvent.amp,
        talking: dialogueActive && dialogue.talking,
        attention: guardEvent.state === 'arrive' || guardEvent.state === 'talk',
        time: now / 1000, lookYaw, lookPitch,
      });
    }

    // Schlafen: Knopf/Hinweis am Bett, Schwarzblende, Tageslicht
    {
      const canSleep = active && guardEvent.done && !sleep.active && !sleep.done && !dialogueActive;
      const near = canSleep && distanceToBed(physics.x, physics.z) <= SLEEP_POSE.reach;
      if (near !== sleepBtnShown) { sleepBtnShown = near; btnSleep.hidden = !near; }
      const wantHint = canSleep && !near && sleepHintLeft > 0;
      if (wantHint) sleepHintLeft -= dt;
      if (wantHint !== sleepHintShown) { sleepHintShown = wantHint; sleepHint.hidden = !wantHint; }

      const f = sleep.fade;
      if (f !== shownFade) {
        shownFade = f;
        sleepFade.hidden = f <= 0.001;
        sleepFade.style.opacity = String(f);
      }
      if (sleep.caption !== shownCaption) { shownCaption = sleep.caption; sleepCaption.textContent = sleep.caption; }
      if (sleep.active !== shownSleeping) {
        shownSleeping = sleep.active;
        if (sleep.active) $('hud').classList.add('sleeping'); else $('hud').classList.remove('sleeping');
      }
      if (sleep.daylight !== shownDaylight) { shownDaylight = sleep.daylight; world.setDaylight(sleep.daylight); }
      arms.group.visible = !(sleep.lying > 0.3);   // im Bett liegend sieht man die Arme nicht
    }

    updateCamera(dt);
    arms.update(dt, {
      phase: cam.phase, amp: cam.amp, sprinting: cam.sprinting, grounded: physics.grounded, vy: physics.vy,
      yawRate, pitchRate, dip: cam.dip, time: now / 1000,
    });
    world.update(now / 1000);
    renderer.clear();
    camera.layers.set(0); renderer.render(world.scene, camera);   // 1. Welt
    if (settings.diag) dbg.worldStat = readPass();
    renderer.clearDepth();
    camera.layers.set(1); renderer.render(world.scene, camera);   // 2. Arme (immer vor der Welt)
    if (settings.diag) { dbg.armStat = readPass(); updateDebug(rawDt); }

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

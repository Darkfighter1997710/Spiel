// main.js – Start, Hauptschleife, Kamera, Einstellungen.
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
  const { loadThree } = await import('./js/loader.js');
  const { THREE, source } = await loadThree();
  const [
    { createWorld }, { PlayerPhysics, PLAYER }, { TouchControls }, { createArms },
    { createGuard }, { GuardEvent }, { DialogueRunner, GUARD_DIALOGUE, ESCORT_DIALOGUE }, { createDialogueUI }, { GUARD, SLEEP, distanceToBed },
    { SleepEvent }, { EscortEvent },
  ] = await Promise.all([
    import('./js/world.js'),
    import('./js/physics.js'),
    import('./js/controls.js'),
    import('./js/arms.js'),
    import('./js/guard.js'),
    import('./js/guard-event.js'),
    import('./js/dialogue.js'),
    import('./js/dialogue-ui.js'),
    import('./js/layout.js'),
    import('./js/sleep-event.js'),
    import('./js/escort-event.js'),
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
  const guardTalk = new DialogueRunner(GUARD_DIALOGUE);       // Abend: Hinrichtung morgen, jetzt schlafen
  const escortTalk = new DialogueRunner(ESCORT_DIALOGUE);     // Morgen: Abholen
  let talk = null;                                            // gerade laufendes Gespräch (oder null)
  const dialogueUI = createDialogueUI({
    root: $('dialogue'), hud: $('hud'), tap: $('dialogue-tap'), speaker: $('dialogue-speaker'),
    text: $('dialogue-text'), choices: $('dialogue-choices'), hint: $('dialogue-hint'),
  }, {
    onTap: () => { if (talk) talk.tap(); },
    onChoose: (i) => { if (talk) talk.choose(i); },
  });
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Abholen am Morgen: nach dem Aufwachen kommt der Wärter zurück, öffnet die Zellentür und führt den Spieler ab
  // (Ablauf: escort-event.js). Am Ende wird das Bild schwarz und die Endkarte erscheint.
  const escort = new EscortEvent();
  const endCard = $('end-card');
  let endCardShown = false;
  $('btn-restart').addEventListener('click', () => window.location.reload());

  // Schlafen: nach dem Gespräch darf der Spieler zum Bett gehen und schlafen. Danach scheint das Morgenlicht in die Zelle.
  const sleepEvent = new SleepEvent();
  const sleepEls = { hint: $('sleep-hint'), btn: $('btn-sleep'), fade: $('sleep-fade'), text: $('sleep-text') };
  const sleepShown = { hint: false, btn: false, sleeping: false, fade: -1, caption: '', alpha: -1 };
  sleepEls.btn.addEventListener('click', () => {
    if (!sleepEvent.canStart || guardEvent.inputLocked || distanceToBed(physics.x, physics.z) > SLEEP.nearDistance) return;
    sleepEvent.start({ x: physics.x, y: physics.y + PLAYER.eye, z: physics.z, yaw, pitch });
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
    const override = sleepEvent.cameraOverride ? sleepEvent : (escort.cameraOverride ? escort : null);
    if (override) {
      // Schlafen oder Abgeführtwerden: die Kamera folgt dem Ablauf
      const c = override.cam;
      yaw = c.yaw; pitch = c.pitch;
      camera.position.set(c.x, c.y, c.z);
      camera.rotation.set(c.pitch, c.yaw, 0);
      cam.eye = null; cam.dip = 0;
      if (override === escort) { cam.phase = escort.camPhase; cam.amp = escort.camAmp; }   // Hände schwingen beim Gehen mit
      else cam.amp = 0;
      return;
    }
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
    camera.position.set(physics.x + rx * offX, cam.eye + offY, physics.z + rz * offX);
    camera.rotation.set(pitch, yaw, roll);

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
      if (guardEvent.consumeDialogueStart()) { talk = guardTalk; talk.start(); }
      if (talk) {
        talk.update(dt);
        if (talk.finished) {
          if (talk === guardTalk) { guardEvent.finishTalk(); sleepEvent.unlock(); } else escort.finishTalk();
          talk = null;
          dialogueUI.hide();
        } else dialogueUI.render(talk);
      }

      // Schlafen (läuft nur, wenn gespielt wird)
      sleepEvent.update(dt, true);
      if (sleepEvent.done) escort.begin();                                  // Aufgewacht und aufgestanden: Rückkehr des Wärters
      escort.update(dt, true, { x: physics.x, z: physics.z, yaw, pitch });
      if (escort.consumeDialogueStart()) { talk = escortTalk; talk.start(); }
      if (escort.consumeGateOpened()) world.refreshShadows();               // offene Tür wirft andere Schatten
      if (sleepEvent.consumePrepareMorning()) world.prepareMorning();      // Bildschirm ist jetzt schwarz
      if (sleepEvent.consumeStandUp()) physics.teleport(SLEEP.stand.x, SLEEP.stand.z);

      if (guardEvent.inputLocked || sleepEvent.inputLocked || escort.inputLocked) {
        // Gespräch, Schlafen oder Abführen: keine Steuerung
        controls.consumeLook(); controls.consumeJump(); controls.reset();
        physics.setInput(0, 0, false, yaw);
      }
      const lookSrc = guardEvent.cameraLook ? guardEvent : (escort.cameraLook ? escort : null);
      if (lookSrc) {
        // Gespräch: die Kamera dreht sich sanft zum Wärter
        const eyeY = physics.y + PLAYER.eye;
        const dx = lookSrc.x - physics.x, dz = lookSrc.z - physics.z;
        const dist = Math.max(0.5, Math.hypot(dx, dz));
        const yawT = Math.atan2(-dx, -dz);
        const pitchT = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(GUARD.headHeight - eyeY, dist)));
        const kk = 1 - Math.exp(-dt * 4);
        yaw += wrapAngle(yawT - yaw) * kk;
        pitch += (pitchT - pitch) * kk;
      } else if (!sleepEvent.inputLocked && !escort.inputLocked) {
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

    // Schlafen: Hinweis, Knopf, Abdunkelung und Text (nur ändern, wenn sich etwas ändert)
    {
      const near = distanceToBed(physics.x, physics.z) <= SLEEP.nearDistance;
      const free = sleepEvent.canStart && !guardEvent.inputLocked;
      const showBtn = free && near, showHint = free && !near;
      if (showBtn !== sleepShown.btn) { sleepShown.btn = showBtn; sleepEls.btn.hidden = !showBtn; }
      if (showHint !== sleepShown.hint) { sleepShown.hint = showHint; sleepEls.hint.hidden = !showHint; }
      const sl = sleepEvent.inputLocked || escort.inputLocked;
      if (sl !== sleepShown.sleeping) {
        sleepShown.sleeping = sl;
        if (sl) $('hud').classList.add('cutscene'); else $('hud').classList.remove('cutscene');
      }
      const f = Math.round(Math.max(sleepEvent.fade, escort.fade) * 100) / 100;
      if (f !== sleepShown.fade) { sleepShown.fade = f; sleepEls.fade.style.background = `rgba(0,0,0,${f})`; }
      if (sleepEvent.caption !== sleepShown.caption) { sleepShown.caption = sleepEvent.caption; sleepEls.text.textContent = sleepEvent.caption; }
      const a = Math.round(sleepEvent.captionAlpha * 100) / 100;
      if (a !== sleepShown.alpha) { sleepShown.alpha = a; sleepEls.text.style.opacity = String(a); }
      world.setMorning(sleepEvent.morning);
      arms.group.visible = !sleepEvent.cameraOverride || sleepEvent.state === 'stand_up';
      if (escort.ended && !endCardShown) { endCardShown = true; endCard.hidden = false; }
    }

    // Wärter und Tür am Gangende darstellen
    {
      const gs = escort.active ? escort : guardEvent;     // wer steuert gerade den Wärter und die Tür am Gangende?
      const dx = physics.x - gs.x, dz = physics.z - gs.z;
      const lookYaw = wrapAngle(Math.atan2(dx, dz) - gs.yaw);
      const lookPitch = Math.atan2(GUARD.headHeight - (physics.y + PLAYER.eye), Math.max(0.5, Math.hypot(dx, dz)));
      world.setEndDoor(gs.doorOpen);
      world.setCellGate(escort.gateOpen);
      guard.update(dt, {
        x: gs.x, z: gs.z, yaw: gs.yaw, visible: gs.visible,
        phase: gs.phase, amp: gs.amp,
        talking: !!(talk && talk.talking),
        attention: gs.attention,
        time: now / 1000, lookYaw, lookPitch,
      });
    }

    updateCamera(dt);
    arms.update(dt, {
      phase: cam.phase, amp: cam.amp, sprinting: cam.sprinting, grounded: physics.grounded, vy: physics.vy,
      yawRate, pitchRate, dip: cam.dip, time: now / 1000,
    });
    world.update(now / 1000);
    renderer.clear();
    camera.layers.set(0); renderer.render(world.scene, camera);   // 1. Welt
    renderer.clearDepth();
    camera.layers.set(1); renderer.render(world.scene, camera);   // 2. Arme (immer vor der Welt)

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

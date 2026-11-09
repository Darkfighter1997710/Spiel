// Prüft die Diagnose-Anzeige (Textaufbereitung, Fehlersammler):  node tests/debug.test.js
import { captureErrors, formatDebug, gpuName } from '../js/debug.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };

// 1) Fehlersammler: merkt sich Fehler/Warnungen, begrenzt die Anzahl, reicht sie weiter
{
  const seen = [];
  const origErr = console.error, origWarn = console.warn;
  console.error = (...a) => seen.push(['e', ...a]);
  console.warn = (...a) => seen.push(['w', ...a]);
  globalThis.window = globalThis; globalThis.addEventListener = () => {};
  const lines = captureErrors(3);
  console.error('THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false');
  console.warn('nur eine Warnung');
  console.error(new Error('Programmfehler'));
  console.error('vierter');
  console.error = origErr; console.warn = origWarn;
  ok(lines.length === 3, `Begrenzung auf 3 klappt nicht (${lines.length})`);
  ok(lines[0].startsWith('Warnung: nur eine Warnung') && lines[1].includes('Programmfehler') && lines[2].includes('vierter'), `Inhalt falsch: ${JSON.stringify(lines)}`);
  ok(seen.length === 4, 'Meldungen werden nicht an die Konsole weitergereicht');
}

// 2) Textaufbereitung: alle Angaben kommen vor, fehlende Werte stürzen nicht ab
{
  const full = formatDebug({
    version: '9.9.9', three: '170', source: 'lokal', gpu: 'Mali-G78', width: 800, height: 360, pixelRatio: 1.75, fps: 58.4,
    world: { calls: 83, tris: 24150 }, arms: { calls: 38, tris: 5200 }, programs: 9, textures: 12, geometries: 210,
    caps: { maxTextures: 16, maxTextureSize: 4096, maxFragmentUniforms: 221, maxVaryings: 15, precision: 'highp' },
    cam: { x: 0.4, y: 1.65, z: 1.2, yaw: -0.5, pitch: 0.1 }, daylight: 0, exposure: 1.1, messages: ['Fehler: Beispiel'],
  });
  for (const part of ['Version 9.9.9', 'r170', 'Mali-G78', 'Welt: 83 Aufrufe, 24150 Dreiecke', 'Arme: 38 Aufrufe', 'Programme 9', '4096', 'Kamera 0.40 1.65 1.20', '! Fehler: Beispiel']) {
    ok(full.includes(part), `Anzeige enthält "${part}" nicht:\n${full}`);
  }
  const empty = formatDebug({ version: 'x', world: {}, arms: {}, cam: {} });
  ok(typeof empty === 'string' && empty.includes('?') && !empty.includes('undefined') && !empty.includes('NaN'), `fehlende Werte falsch dargestellt:\n${empty}`);
}

// 3) Grafikkartenname: auch ohne die Erweiterung oder bei Fehlern kein Absturz
{
  ok(gpuName({ getContext: () => ({ getExtension: () => null, getParameter: () => 'Grundname', RENDERER: 1 }) }) === 'Grundname', 'Name ohne Erweiterung');
  ok(gpuName({ getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 7 }), getParameter: (p) => (p === 7 ? 'Adreno 650' : 'x') }) }) === 'Adreno 650', 'Name mit Erweiterung');
  ok(gpuName({}) === '?', 'Fehlerfall soll "?" liefern');
}

console.log(failures === 0 ? 'ALLE DIAGNOSE-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);

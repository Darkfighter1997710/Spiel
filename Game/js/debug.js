// debug.js – Diagnose-Anzeige für Darstellungsprobleme (in den Einstellungen einschaltbar: „Diagnose-Anzeige“).
// Zeigt, was wirklich gezeichnet wird (Zeichenaufrufe je Durchgang), Grafikkarte, Grenzen und Fehlermeldungen der Grafik.
// Reine Textfunktionen, dadurch testbar.

// Fängt Fehler und Warnungen ab (auch die von Three.js, z. B. „Shader Error“), damit sie auf dem Bildschirm stehen.
export function captureErrors(limit = 5) {
  const lines = [];
  const text = (a) => (typeof a === 'string' ? a : (a && a.message) || String(a));
  const push = (kind, args) => {
    lines.push(`${kind}: ${args.map(text).join(' ').replace(/\s+/g, ' ').slice(0, 200)}`);
    while (lines.length > limit) lines.shift();
  };
  for (const kind of ['error', 'warn']) {
    const orig = console[kind];
    console[kind] = (...args) => {
      try { push(kind === 'error' ? 'Fehler' : 'Warnung', args); } catch (_) { /* nie selbst Fehler auslösen */ }
      orig.apply(console, args);
    };
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (e) => push('Fehler', [e.message || e.error]));
    window.addEventListener('unhandledrejection', (e) => push('Fehler', [e.reason]));
  }
  return lines;
}

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (_) {
    return '?';
  }
}

const num = (v, k = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(k) : '?');
const any = (v) => (v === undefined || v === null ? '?' : String(v));

export function formatDebug(d) {
  const c = d.caps || {};
  const L = [];
  L.push(`Version ${d.version} · Three.js r${any(d.three)} (${any(d.source)})`);
  L.push(`GPU: ${any(d.gpu)}`);
  L.push(`Bild ${any(d.width)}×${any(d.height)} · Pixel ${num(d.pixelRatio)} · ${num(d.fps, 0)} FPS`);
  L.push(`Welt: ${any(d.world.calls)} Aufrufe, ${any(d.world.tris)} Dreiecke`);
  L.push(`Arme: ${any(d.arms.calls)} Aufrufe, ${any(d.arms.tris)} Dreiecke`);
  L.push(`Programme ${any(d.programs)} · Texturen ${any(d.textures)} · Geometrien ${any(d.geometries)}`);
  L.push(`Limits: Tex-Einheiten ${any(c.maxTextures)} · Texturgröße ${any(c.maxTextureSize)} · Frag-Uniforms ${any(c.maxFragmentUniforms)} · Varyings ${any(c.maxVaryings)} · ${any(c.precision)}`);
  L.push(`Kamera ${num(d.cam.x)} ${num(d.cam.y)} ${num(d.cam.z)} · Blick ${num(d.cam.yaw)} ${num(d.cam.pitch)}`);
  L.push(`Tageslicht ${num(d.daylight)} · Belichtung ${num(d.exposure)}`);
  for (const m of d.messages || []) L.push(`! ${m}`);
  return L.join('\n');
}

// textures.js – erzeugt alle Texturen beim Start per Code (Canvas).
// Vorteil: keine Bilddateien, die fehlen oder kaputtgehen können; nahtlos kachelbar.
// Jede Material-Textur besteht aus einer Farbkarte und einer Höhenkarte (für Relief/Bump).

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp255 = (v) => Math.max(0, Math.min(255, v));
const rgb = (c, f = 1, j = 0) =>
  `rgb(${clamp255(c[0] * f + j) | 0},${clamp255(c[1] * f + j) | 0},${clamp255(c[2] * f + j) | 0})`;

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

// ruft fn an allen Positionen auf, an denen ein Kreis (x,y,r) über den Rand hinaus "umläuft"
function wrapped(size, x, y, r, fn) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx, py = y + dy;
      if (px + r > 0 && px - r < size && py + r > 0 && py - r < size) fn(px, py);
    }
  }
}

function addNoise(ctx, size, amp, rand) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// weichzeichnen, ohne dass an den Kachelrändern Nähte entstehen
function blurTiled(canvas, px) {
  if (typeof CanvasRenderingContext2D === 'undefined' || !('filter' in CanvasRenderingContext2D.prototype)) return;
  const s = canvas.width;
  const tmp = makeCanvas(s);
  const g = tmp.getContext('2d');
  g.filter = `blur(${px}px)`;
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.drawImage(canvas, dx, dy);
  const g2 = canvas.getContext('2d');
  g2.clearRect(0, 0, s, s);
  g2.drawImage(tmp, 0, 0);
}

function blotches(ctx, size, rand, count, rMin, rMax, alpha, lightChance) {
  for (let i = 0; i < count; i++) {
    const x = rand() * size, y = rand() * size, r = rMin + rand() * (rMax - rMin);
    const light = rand() < lightChance;
    wrapped(size, x, y, r, (px, py) => {
      const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
      const a = alpha * (0.4 + rand() * 0.6);
      gr.addColorStop(0, light ? `rgba(150,138,112,${a})` : `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}

function cracks(g, h, size, rand, count) {
  for (let i = 0; i < count; i++) {
    let x = rand() * size, y = rand() * size, a = rand() * Math.PI * 2;
    g.beginPath(); h.beginPath();
    g.moveTo(x, y); h.moveTo(x, y);
    for (let s = 0; s < 18; s++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 9; y += Math.sin(a) * 9;
      g.lineTo(x, y); h.lineTo(x, y);
    }
    g.lineWidth = 1.3; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
    h.lineWidth = 2.2; h.strokeStyle = 'rgba(0,0,0,0.9)'; h.stroke();
  }
}

// Spiegelt die linke Hälfte auf die rechte (mx) und/oder die obere auf die untere (my).
// Dadurch ist die Textur exakt symmetrisch – und, weil Kacheln sich wiederholen, auch nahtlos.
function mirrorCanvas(c, mx, my) {
  const s = c.width, hf = s / 2, g = c.getContext('2d');
  if (mx) {
    const snap = makeCanvas(s); snap.getContext('2d').drawImage(c, 0, 0);
    g.save(); g.translate(s, 0); g.scale(-1, 1);
    g.drawImage(snap, 0, 0, hf, s, 0, 0, hf, s);
    g.restore();
  }
  if (my) {
    const snap = makeCanvas(s); snap.getContext('2d').drawImage(c, 0, 0);
    g.save(); g.translate(0, s); g.scale(1, -1);
    g.drawImage(snap, 0, 0, s, hf, 0, 0, s, hf);
    g.restore();
  }
}

// ---------- Stein (Wand, Boden) ----------
function stoneTexture({
  size = 512, rows = 6, minW = 1.3, maxW = 2.4, base = [104, 98, 90],
  vary = 40, gap = 3, seed = 1, crackCount = 0, dirt = 0.2, mirrorX = false, mirrorY = false,
}) {
  const rand = mulberry32(seed);
  const col = makeCanvas(size), g = col.getContext('2d');
  const hei = makeCanvas(size), h = hei.getContext('2d');
  g.fillStyle = '#14120f'; g.fillRect(0, 0, size, size);
  h.fillStyle = '#000'; h.fillRect(0, 0, size, size);
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const widths = [];
    let sum = 0;
    while (sum < size - rowH * minW * 0.5) {
      const w = rowH * (minW + rand() * (maxW - minW));
      widths.push(w); sum += w;
    }
    const k = size / sum;           // so skalieren, dass die Reihe exakt in die Kachel passt
    let x = rand() * size;
    const y = r * rowH;
    for (const w0 of widths) {
      const w = w0 * k;
      const f = 1 + (rand() - 0.5) * (vary / 100);
      const jit = (rand() - 0.5) * 10;
      const gray = 140 + rand() * 80;
      for (const dx of [-size, 0, size]) {
        const bx = x + dx + gap / 2;
        if (bx > size || bx + w < 0) continue;
        g.fillStyle = rgb(base, f, jit);
        g.fillRect(bx, y + gap / 2, w - gap, rowH - gap);
        g.fillStyle = 'rgba(255,240,220,0.07)';
        g.fillRect(bx, y + gap / 2, w - gap, 3);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(bx, y + rowH - gap / 2 - 4, w - gap, 4);
        h.fillStyle = `rgb(${gray | 0},${gray | 0},${gray | 0})`;
        h.fillRect(bx, y + gap / 2, w - gap, rowH - gap);
      }
      // kleine Abplatzer
      for (let c = 0; c < 2; c++) {
        const cx = (x + rand() * w) % size, cy = y + rand() * rowH, cr = 2 + rand() * 5;
        wrapped(size, cx, cy, cr, (px, py) => {
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.beginPath(); g.arc(px, py, cr, 0, Math.PI * 2); g.fill();
        });
      }
      x = (x + w) % size;
    }
  }
  blotches(g, size, rand, 90, 20, 90, dirt, 0.3);
  cracks(g, h, size, rand, crackCount);
  blurTiled(hei, 1.6);
  addNoise(g, size, 24, rand);
  addNoise(h, size, 14, rand);
  if (mirrorX || mirrorY) { mirrorCanvas(col, mirrorX, mirrorY); mirrorCanvas(hei, mirrorX, mirrorY); }
  return { color: col, height: hei };
}

// ---------- Holz (Planken mit Maserung) ----------
function woodTexture({ size = 512, planks = 4, seed = 5, tone = [96, 64, 38] }) {
  const rand = mulberry32(seed);
  const col = makeCanvas(size), g = col.getContext('2d');
  const hei = makeCanvas(size), h = hei.getContext('2d');
  const pw = size / planks;
  for (let i = 0; i < planks; i++) {
    const f = 1 + (rand() - 0.5) * 0.35;
    const x0 = i * pw;
    g.fillStyle = rgb(tone, f); g.fillRect(x0, 0, pw, size);
    h.fillStyle = '#b4b4b4'; h.fillRect(x0, 0, pw, size);
    for (let j = 0; j < 46; j++) {
      const gx = x0 + rand() * pw;
      const k = 1 + Math.floor(rand() * 3);
      const ph = rand() * Math.PI * 2;
      const amp = 1 + rand() * 3.5;
      const light = rand() < 0.4;
      const wdt = 0.6 + rand() * 1.6;
      g.strokeStyle = light ? `rgba(255,220,170,${0.04 + rand() * 0.06})` : `rgba(20,10,0,${0.08 + rand() * 0.14})`;
      g.lineWidth = wdt;
      h.strokeStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)';
      h.lineWidth = wdt;
      g.beginPath(); h.beginPath();
      for (let y = 0; y <= size; y += 8) {
        const xx = gx + Math.sin((y / size) * Math.PI * 2 * k + ph) * amp;
        if (y === 0) { g.moveTo(xx, y); h.moveTo(xx, y); } else { g.lineTo(xx, y); h.lineTo(xx, y); }
      }
      g.stroke(); h.stroke();
    }
    if (rand() < 0.6) {
      const kx = x0 + pw * (0.25 + rand() * 0.5), ky = rand() * size;
      for (let ring = 5; ring >= 1; ring--) {
        const rx = ring * 3.2, ry = ring * 7;
        wrapped(size, kx, ky, ry, (px, py) => {
          g.strokeStyle = `rgba(25,12,2,${0.12 + (5 - ring) * 0.07})`;
          g.lineWidth = 1.4;
          g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); g.stroke();
          h.strokeStyle = 'rgba(0,0,0,0.3)'; h.lineWidth = 1.4;
          h.beginPath(); h.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); h.stroke();
        });
      }
    }
    g.fillStyle = 'rgba(8,5,2,0.9)'; g.fillRect(x0 - 1.5, 0, 3, size);
    h.fillStyle = '#000'; h.fillRect(x0 - 1.5, 0, 3, size);
    if (i === 0) { g.fillRect(size - 1.5, 0, 3, size); h.fillRect(size - 1.5, 0, 3, size); }
  }
  blurTiled(hei, 0.8);
  addNoise(g, size, 16, rand);
  addNoise(h, size, 10, rand);
  return { color: col, height: hei };
}

// ---------- dunkles Eisen ----------
function metalTexture({ size = 256, seed = 9 }) {
  const rand = mulberry32(seed);
  const col = makeCanvas(size), g = col.getContext('2d');
  const hei = makeCanvas(size), h = hei.getContext('2d');
  g.fillStyle = '#34353a'; g.fillRect(0, 0, size, size);
  h.fillStyle = '#808080'; h.fillRect(0, 0, size, size);
  blotches(g, size, rand, 40, 10, 50, 0.16, 0);
  for (let i = 0; i < 40; i++) {
    const x = rand() * size, y = rand() * size, a = rand() * Math.PI, l = 8 + rand() * 40;
    g.strokeStyle = `rgba(200,200,215,${0.05 + rand() * 0.08})`; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    h.strokeStyle = 'rgba(0,0,0,0.25)'; h.lineWidth = 1;
    h.beginPath(); h.moveTo(x, y); h.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); h.stroke();
  }
  for (let i = 0; i < 18; i++) {   // Rostflecken
    const x = rand() * size, y = rand() * size, r = 6 + rand() * 24;
    wrapped(size, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(120,55,22,${0.25 + rand() * 0.25})`);
      gr.addColorStop(1, 'rgba(120,55,22,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  addNoise(g, size, 26, rand);
  addNoise(h, size, 40, rand);
  return { color: col, height: hei };
}

// ---------- grober Stoff ----------
function fabricTexture({ size = 256, seed = 11, color = [150, 140, 120] }) {
  const rand = mulberry32(seed);
  const col = makeCanvas(size), g = col.getContext('2d');
  const hei = makeCanvas(size), h = hei.getContext('2d');
  g.fillStyle = rgb(color); g.fillRect(0, 0, size, size);
  h.fillStyle = '#808080'; h.fillRect(0, 0, size, size);
  const step = 4;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const alt = ((x / step + y / step) & 1) === 0;
      g.fillStyle = alt ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
      g.fillRect(x, y, step - 1, step - 1);
      h.fillStyle = alt ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      h.fillRect(x, y, step - 1, step - 1);
    }
  }
  blotches(g, size, rand, 30, 12, 50, 0.12, 0.2);
  addNoise(g, size, 22, rand);
  return { color: col, height: hei };
}

// ---------- Stroh ----------
function strawTexture({ size = 256, seed = 13 }) {
  const rand = mulberry32(seed);
  const col = makeCanvas(size), g = col.getContext('2d');
  const hei = makeCanvas(size), h = hei.getContext('2d');
  g.fillStyle = '#5e4e26'; g.fillRect(0, 0, size, size);
  h.fillStyle = '#505050'; h.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rand() * size, y = rand() * size, a = rand() * Math.PI, l = 14 + rand() * 30;
    const tone = 0.7 + rand() * 0.6;
    const wdt = 1 + rand() * 1.4;
    wrapped(size, x, y, l, (px, py) => {
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      g.strokeStyle = rgb([176, 148, 72], tone); g.lineWidth = wdt;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py + dy); g.stroke();
      h.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.3})`; h.lineWidth = wdt;
      h.beginPath(); h.moveTo(px, py); h.lineTo(px + dx, py + dy); h.stroke();
    });
  }
  addNoise(g, size, 18, rand);
  return { color: col, height: hei };
}

// ---------- weicher Leuchtpunkt (Flamme, Staub) ----------
function glowCanvas(size = 128) {
  const c = makeCanvas(size), g = c.getContext('2d');
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,236,190,1)');
  gr.addColorStop(0.25, 'rgba(255,170,70,0.75)');
  gr.addColorStop(0.6, 'rgba(255,110,20,0.22)');
  gr.addColorStop(1, 'rgba(255,90,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

export function createTextures(THREE, renderer) {
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1);
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const pair = (p) => ({ map: tex(p.color, true), bump: tex(p.height, false) });

  const glow = new THREE.CanvasTexture(glowCanvas());
  glow.colorSpace = THREE.SRGBColorSpace;

  return {
    wall: pair(stoneTexture({ size: 512, rows: 7, minW: 1.3, maxW: 2.5, base: [112, 105, 96], vary: 45, gap: 3, seed: 21, crackCount: 5, dirt: 0.22, mirrorX: true })),
    floor: pair(stoneTexture({ size: 512, rows: 4, minW: 0.9, maxW: 1.6, base: [78, 74, 68], vary: 50, gap: 4, seed: 33, crackCount: 14, dirt: 0.32, mirrorX: true, mirrorY: true })),
    wood: pair(woodTexture({ size: 512, planks: 4, seed: 5 })),
    metal: pair(metalTexture({ size: 256, seed: 9 })),
    fabric: pair(fabricTexture({ size: 256, seed: 11 })),
    straw: pair(strawTexture({ size: 256, seed: 13 })),
    glow,
  };
}

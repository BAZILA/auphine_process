'use strict';
// Génère les icônes PNG de la PWA (192, 512, maskable) sans aucune dépendance.
// Même dessin que public/icons/icon.svg : dégradé violet → corail et deux anneaux entrelacés.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const FROM = [0x6d, 0x5d, 0xfc];
const TO = [0xff, 0x7a, 0x59];
const SAMPLES = 4; // suréchantillonnage 4×4 pour l'anticrénelage

// --- Encodage PNG minimal ------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Dessin (coordonnées normalisées 0..1) ----------------------------------------
function insideRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Petite icône monochrome (barre d'état Android) : anneaux blancs sur fond transparent. */
function renderBadge(size) {
  const ringR = 0.24;
  const ringW = 0.09;
  const centers = [0.5 - 0.13, 0.5 + 0.13];
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (centers.some((cx) => Math.abs(Math.hypot(x - cx, y - 0.5) - ringR) <= ringW / 2)) hit++;
        }
      }
      const i = (py * size + px) * 4;
      out[i] = out[i + 1] = out[i + 2] = 255;
      out[i + 3] = Math.round((hit / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return encodePng(size, out);
}

function render(size, { maskable }) {
  const radius = maskable ? 0 : 13 / 48;
  const scale = maskable ? 0.78 : 1; // zone de sécurité des icônes « maskable »
  const ringR = (9 / 48) * scale;
  const ringW = (3.6 / 48) * scale;
  const rings = [
    { cx: 0.5 - (5 / 48) * scale, alpha: 1 },
    { cx: 0.5 + (5 / 48) * scale, alpha: 0.85 },
  ];
  const out = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedRect(x, y, radius)) continue;
          const t = (x + y) / 2;
          let cr = FROM[0] + (TO[0] - FROM[0]) * t;
          let cg = FROM[1] + (TO[1] - FROM[1]) * t;
          let cb = FROM[2] + (TO[2] - FROM[2]) * t;
          for (const ring of rings) {
            const d = Math.hypot(x - ring.cx, y - 0.5);
            if (Math.abs(d - ringR) <= ringW / 2) {
              cr += (255 - cr) * ring.alpha;
              cg += (255 - cg) * ring.alpha;
              cb += (255 - cb) * ring.alpha;
            }
          }
          r += cr; g += cg; b += cb; a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return encodePng(size, out);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  fs.writeFileSync(path.join(OUT_DIR, name), render(size, { maskable }));
  console.log(`ok ${name}`);
}
fs.writeFileSync(path.join(OUT_DIR, 'badge-96.png'), renderBadge(96));
console.log('ok badge-96.png');

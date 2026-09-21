// Génère les icônes PWA (192/512/maskable + apple-touch-icon) à partir de
// src/assets/logo.png (512×512), sans dépendance externe (zlib natif).
// Usage : node scripts/generate-pwa-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ─── CRC32 (pour l'encodage des chunks PNG) ─────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
};

// ─── Décodage PNG (filtres 0-4, 8 bits) ─────────────────────────────────────
const decodePng = (buf) => {
  let pos = 8;
  let width, height, bitDepth, colorType;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`bitDepth non supporté: ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!channels) throw new Error(`colorType non supporté: ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    const line = raw.slice(base + 1, base + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff;
          break;
        }
        default: throw new Error(`filtre inconnu: ${filter}`);
      }
      cur[x] = v;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }

  return { width, height, channels, data: out };
};

// ─── Redimensionnement (plus proche voisin) ─────────────────────────────────
const resizeNearest = (src, size) => {
  const { width, height, channels, data } = src;
  const dst = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / size));
      const si = (sy * width + sx) * channels;
      const di = (y * size + x) * channels;
      for (let c = 0; c < channels; c++) dst[di + c] = data[si + c];
    }
  }
  return { width: size, height: size, channels, data: dst };
};

// ─── Encodage PNG ───────────────────────────────────────────────────────────
const encodePng = (img) => {
  const { width, height, channels, data } = img;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtre 0 (None)
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0; // color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ─── Génération ─────────────────────────────────────────────────────────────
const source = decodePng(fs.readFileSync(path.join(ASSETS_DIR, 'logo.png')));

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  const png = encodePng(resizeNearest(source, size));
  fs.writeFileSync(path.join(PUBLIC_DIR, name), png);
  console.log(`✔ ${name} (${size}×${size}, ${png.length} octets)`);
}

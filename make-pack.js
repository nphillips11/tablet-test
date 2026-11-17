// Generates the stand-in content pack for the tablet compatibility test.
// Plain noise images and sine tones only: no game art, no game audio.
// Run: node make-pack.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'pack');
const IMAGES = 40;   // about the number of images in one island
const SOUNDS = 300;  // about the number of sound clips in one island

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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
// pixel(x, y) returns [r, g, b]
function png(w, h, pixel, level) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const c = pixel(x, y);
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function hue(i, n) {
  const a = (i / n) * Math.PI * 2;
  return [0, 2.094, 4.189].map(o => Math.round(128 + 110 * Math.cos(a + o)));
}
function wav(freq, seconds, rate) {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 50) * Math.min(1, (seconds - t) * 8);
    b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * t) * env * 12000), 44 + i * 2);
  }
  return b;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const files = [];
function add(name, type, data) {
  fs.writeFileSync(path.join(OUT, name), data);
  files.push({
    path: name, type: type, size: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  });
}
const pad = (n, w) => String(n).padStart(w, '0');

for (let i = 0; i < IMAGES; i++) {
  const c = hue(i, IMAGES);
  const noise = crypto.randomBytes(768 * 512 * 3);
  // Noise does not compress, so each file is about 1.2 MB, like a painted background.
  add('img-' + pad(i, 2) + '.png', 'image/png', png(768, 512, (x, y) => {
    if (x < 256 && y < 170) return c; // a solid block so each image is visibly different
    const o = (y * 768 + x) * 3;
    return [(noise[o] + c[0]) >> 1, (noise[o + 1] + c[1]) >> 1, (noise[o + 2] + c[2]) >> 1];
  }, 1));
}
for (let i = 0; i < SOUNDS; i++) {
  add('snd-' + pad(i, 3) + '.wav', 'audio/wav', wav(220 * Math.pow(2, (i % 36) / 12), 1.0, 22050));
}
const total = files.reduce((s, f) => s + f.size, 0);
fs.writeFileSync(path.join(OUT, 'manifest.json'),
  JSON.stringify({ version: 1, totalBytes: total, files: files }));

// Shell images: a full-size backdrop for the drag test, and a home-screen icon.
fs.writeFileSync(path.join(__dirname, 'bg.png'), png(1536, 1024, (x, y) => {
  const n = ((x * 7919 + y * 104729) % 13);
  return [40 + (y >> 3) + n, 90 + (x >> 4) + n, 150 - (y >> 4) + n];
}, 6));
fs.writeFileSync(path.join(__dirname, 'icon-180.png'), png(180, 180, (x, y) => {
  const d = Math.hypot(x - 90, y - 90);
  return d < 50 ? [246, 178, 74] : [30, 35, 56];
}, 6));

console.log(files.length + ' files, ' + (total / 1048576).toFixed(1) + ' MB');

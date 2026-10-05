'use strict';
/* M0：生成星露谷像素风占位图标（纯 Node 标准库 PNG 写出） */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'assets', 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

/* ---- CRC32（PNG 块校验） ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function writePng(file, size, rows) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; /* filter: None */
    for (let x = 0; x < size; x++) {
      const px = rows[y][x];
      raw[off++] = px[0]; raw[off++] = px[1]; raw[off++] = px[2]; raw[off++] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  /* bit depth */
  ihdr[9] = 6;  /* color type RGBA */
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* ---- 16x16 像素图案：浅绿描边 / 主绿棋盘 / 米白中心 ---- */
const PAL = {
  l: [0x9e, 0xd9, 0x6a, 255],
  g: [0x5a, 0xa0, 0x2c, 255],
  d: [0x3f, 0x7a, 0x1e, 255],
  c: [0xf2, 0xed, 0xd9, 255],
  t: [0, 0, 0, 0],
};
function pattern() {
  const pat = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 16; x++) {
      if (x === 0 || x === 15 || y === 0 || y === 15) row.push('l');
      else if (x >= 6 && x <= 9 && y >= 6 && y <= 9) row.push('c');
      else row.push((x + y) % 2 === 0 ? 'g' : 'd');
    }
    pat.push(row);
  }
  return pat;
}
function upscale(pat, size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push(PAL[pat[(y * 16 / size) | 0][(x * 16 / size) | 0]]);
    rows.push(row);
  }
  return rows;
}
function transparent(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push([0, 0, 0, 0]);
    rows.push(row);
  }
  return rows;
}

const pat = pattern();
writePng(path.join(ICON_DIR, 'icon-192.png'), 192, upscale(pat, 192));
writePng(path.join(ICON_DIR, 'icon-512.png'), 512, upscale(pat, 512));
writePng(path.join(ICON_DIR, 'icon-blank.png'), 32, transparent(32));
console.log('icons OK:', fs.readdirSync(ICON_DIR).join(', '));

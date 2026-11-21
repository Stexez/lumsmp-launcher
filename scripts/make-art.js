// Generates the launcher's pixel art (SVG icons + PNG app icon) from tiny pixel maps.
// Run: node scripts/make-art.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'src', 'renderer', 'assets');
const BUILD = path.join(__dirname, '..', 'build');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });

/** map: array of strings, palette: char → color ('.' = transparent) */
function svg(map, palette) {
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  let rects = '';
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.' || !palette[c]) { x++; continue; }
      let run = 1;
      while (row[x + run] === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[c]}"/>`;
      x += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

const icons = {
  gear: [[
    '....##....',
    '.#.#oo#.#.',
    '#o#oooo#o#',
    '.#oo##oo#.',
    '#oo#..#oo#',
    '#oo#..#oo#',
    '.#oo##oo#.',
    '#o#oooo#o#',
    '.#.#oo#.#.',
    '....##....',
  ], { '#': '#3a3a48', o: '#f4f1e8' }],
  logout: [[
    'wwwwww....',
    'w....w....',
    'w....w..g.',
    'w....w..gg',
    'w..ggggggg',
    'w..ggggggg',
    'w....w..gg',
    'w....w..g.',
    'w....w....',
    'wwwwww....',
  ], { w: '#f4f1e8', g: '#ff5d50' }],
  folder: [[
    'yyyy......',
    'yYYYyyyyyy',
    'yYYYYYYYYy',
    'yyyyyyyyyy',
    'yYYYYYYYYy',
    'yYYYYYYYYy',
    'yYYYYYYYYy',
    'yYYYYYYYYy',
    'yyyyyyyyyy',
  ], { y: '#b88a12', Y: '#f7d14a' }],
  server: [[
    'ssssssssss',
    's========s',
    's=g====bbs',
    'ssssssssss',
    's========s',
    's=g====bbs',
    'ssssssssss',
    's========s',
    's=r====bbs',
    'ssssssssss',
  ], { s: '#2a2a36', '=': '#8a8a8a', g: '#2fd16a', r: '#ff5d50', b: '#5ce1e6' }],
  microsoft: [[
    'rrrr.gggg',
    'rrrr.gggg',
    'rrrr.gggg',
    'rrrr.gggg',
    '.........',
    'bbbb.yyyy',
    'bbbb.yyyy',
    'bbbb.yyyy',
    'bbbb.yyyy',
  ], { r: '#f25022', g: '#7fba00', b: '#00a4ef', y: '#ffb900' }],
  user: [[
    '...hhhh...',
    '..hhhhhh..',
    '..hsssss..',
    '..sesses..',
    '..ssssss..',
    '...smms...',
    '.cccccccc.',
    'cccccccccc',
    'cccccccccc',
    'cc.cccc.cc',
  ], { h: '#4d3323', s: '#d9a066', e: '#1f1f27', m: '#9b5c3a', c: '#5ce1e6' }],
  phone: [[
    '.kkkkkk.',
    'kSSSSSSk',
    'kSggggSk',
    'kSgddgSk',
    'kSggggSk',
    'kSddddSk',
    'kSSSSSSk',
    'kSSkkSSk',
    '.kkkkkk.',
  ], { k: '#1f1f27', S: '#3a3a48', g: '#6cbf45', d: '#5ce1e6' }],
  moon: [[
    '..mmmmmm..',
    '.mmmmmmmm.',
    'mmmmmmmMMm',
    'mmMMmmmMMm',
    'mmMMmmmmmm',
    'mmmmmmmmmm',
    'mmmmmMMmmm',
    'mMmmmMMmmm',
    '.mmmmmmmm.',
    '..mmmmmm..',
  ], { m: '#f3edcf', M: '#d8cfa4' }],
  cloud: [[
    '.....wwww........',
    '...wwwwwwww..ww..',
    '.wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwww',
    '.LLLLLLLLLLLLLLL.',
  ], { w: '#ffffff', L: '#d9dcef' }],
  play: [[
    'w.....',
    'ww....',
    'www...',
    'wwww..',
    'wwwww.',
    'wwww..',
    'www...',
    'ww....',
    'w.....',
  ], { w: '#ffffff' }],
  check: [[
    '........g',
    '.......gg',
    'g.....gg.',
    'gg...gg..',
    '.gg.gg...',
    '..ggg....',
    '...g.....',
  ], { g: '#2fd16a' }],
  home: [[
    '....rr....',
    '...rrrr...',
    '..rrrrrr..',
    '.rrrrrrrr.',
    'rrrrrrrrrr',
    '.wwwwwwww.',
    '.wwbbwddw.',
    '.wwbbwddw.',
    '.wwwwwddw.',
    '.wwwwwddw.',
  ], { r: '#c4372d', w: '#e8dcc0', b: '#5ce1e6', d: '#79502e' }],
  search: [[
    '..wwww....',
    '.w....w...',
    'w......w..',
    'w......w..',
    'w......w..',
    'w......w..',
    '.w....w...',
    '..wwwwgg..',
    '.......gg.',
    '........gg',
  ], { w: '#bcb8ab', g: '#8c897f' }],
  lock: [[
    '..yyyy..',
    '.y....y.',
    '.y....y.',
    'YYYYYYYY',
    'YyyyyyyY',
    'Yyy..yyY',
    'Yyyy.yyY',
    'YyyyyyyY',
    'YYYYYYYY',
  ], { y: '#f7d14a', Y: '#b88a12' }],
};

for (const [name, [map, palette]] of Object.entries(icons)) {
  fs.writeFileSync(path.join(OUT, `px-${name}.svg`), svg(map, palette));
}

// ---------------------------------------------------------------- PNG app icon (grass block, 16x16 → 256x256)
const ICON = [
  'GGGGGGGGGGGGGGGG',
  'GgGGGgGGGGgGGgGG',
  'GGGgGGGGgGGGGGGG',
  'GGGGGGgGGGGgGGGG',
  'gGgGGGGGgGGGGgGg',
  'DgDDgDDgDDDgDDgD',
  'DDDdDDDDDdDDDDDD',
  'DdDDDDsDDDDDdDDD',
  'DDDDdDDDDdDDDDsD',
  'DDsDDDDdDDDDDDDD',
  'DDDDDDDDDDsDdDDD',
  'DdDDDsDDDDDDDDDD',
  'DDDDDDDDdDDDDsDD',
  'DDdDDDDDDDDdDDDD',
  'DDDDsDDdDDDDDDDD',
  'DDDDDDDDDDDDDDdD',
];
const COLORS = { G: [108, 191, 69], g: [143, 216, 102], D: [134, 89, 58], d: [99, 63, 40], s: [160, 160, 160] };

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const SIZE = 256;
const MARGIN = 16;              // transparent border
const CELL = (SIZE - MARGIN * 2) / 16;
const iconPng = png(SIZE, (x, y) => {
  if (x < MARGIN || y < MARGIN || x >= SIZE - MARGIN || y >= SIZE - MARGIN) return [0, 0, 0, 0];
  const cx = Math.floor((x - MARGIN) / CELL);
  const cy = Math.floor((y - MARGIN) / CELL);
  const edge = x - MARGIN < 6 || y - MARGIN < 6 || SIZE - MARGIN - x <= 6 || SIZE - MARGIN - y <= 6;
  const [r, g, b] = COLORS[ICON[cy][cx]];
  return edge ? [Math.floor(r * 0.55), Math.floor(g * 0.55), Math.floor(b * 0.55), 255] : [r, g, b, 255];
});
fs.writeFileSync(path.join(BUILD, 'icon.png'), iconPng);
fs.writeFileSync(path.join(OUT, 'icon.png'), iconPng);

// ---------------------------------------------------------------- oyun içi mod: "LUMSMP" logosu (256x64) + mod ikonu
const GLYPHS = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
};
const LOGO_W = 256; const LOGO_H = 64; const SCALE = 6; const SHADOW = 4;
const word = 'LUMSMP';
const glyphW = 5 * SCALE; const gap = SCALE;
const totalW = word.length * glyphW + (word.length - 1) * gap;
const ox = Math.floor((LOGO_W - totalW - SHADOW) / 2); const oy = Math.floor((LOGO_H - 7 * SCALE - SHADOW) / 2);
function logoPixel(x, y) {
  const hit = (px, py) => {
    const i = Math.floor((px - ox) / (glyphW + gap));
    if (px < ox || i < 0 || i >= word.length) return -1;
    const gx = Math.floor((px - ox - i * (glyphW + gap)) / SCALE);
    const gy = Math.floor((py - oy) / SCALE);
    if (gx < 0 || gx > 4 || gy < 0 || gy > 6) return -1;
    return GLYPHS[word[i]][gy][gx] === '1' ? i : -1;
  };
  const main = hit(x, y);
  if (main >= 0) {
    const green = main >= 3;
    const row = Math.floor((y - oy) / SCALE);
    if (green) return row >= 5 ? [63, 138, 42, 255] : [143, 216, 102, 255];
    return row >= 5 ? [200, 196, 184, 255] : [242, 239, 230, 255];
  }
  if (hit(x - SHADOW, y - SHADOW) >= 0) return [0, 0, 0, 230];
  return [0, 0, 0, 0];
}
const MOD_RES = path.join(__dirname, '..', 'client-mod', 'src', 'main', 'resources', 'assets', 'lumsmp');
if (fs.existsSync(path.dirname(MOD_RES))) {
  fs.mkdirSync(path.join(MOD_RES, 'textures', 'gui'), { recursive: true });
  const logo = (() => {
    const raw = Buffer.alloc(LOGO_H * (LOGO_W * 4 + 1));
    for (let y = 0; y < LOGO_H; y++) {
      raw[y * (LOGO_W * 4 + 1)] = 0;
      for (let x = 0; x < LOGO_W; x++) raw.set(logoPixel(x, y), y * (LOGO_W * 4 + 1) + 1 + x * 4);
    }
    // png() kare resim üretiyor; logo için IHDR'yi elle kuruyoruz.
    const sq = png(1, () => [0, 0, 0, 0]);
    const head = sq.subarray(0, 8);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(LOGO_W, 0); ihdr.writeUInt32BE(LOGO_H, 4); ihdr[8] = 8; ihdr[9] = 6;
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
      return Buffer.concat([len, td, c]);
    };
    return Buffer.concat([head, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  })();
  fs.writeFileSync(path.join(MOD_RES, 'textures', 'gui', 'logo.png'), logo);
  fs.writeFileSync(path.join(MOD_RES, 'icon.png'), iconPng);
  console.log('client mod art written');
}
console.log('pixel art written:', Object.keys(icons).length, 'icons + icon.png');

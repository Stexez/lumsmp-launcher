// Copies the Pixelify Sans font files into the renderer so the app never loads fonts from the internet.
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', '@fontsource', 'pixelify-sans', 'files');
const target = path.join(__dirname, '..', 'src', 'renderer', 'fonts');
fs.mkdirSync(target, { recursive: true });
if (!fs.existsSync(source)) {
  console.warn('[copy-fonts] @fontsource/pixelify-sans bulunamadı, font kopyalanmadı.');
  process.exit(0);
}
let copied = 0;
for (const file of fs.readdirSync(source)) {
  if (/^pixelify-sans-(latin|latin-ext)-(400|500|700)-normal\.woff2$/.test(file)) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
    copied++;
  }
}
console.log(`[copy-fonts] ${copied} font dosyası kopyalandı.`);

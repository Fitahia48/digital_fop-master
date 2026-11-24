// Test local du pipeline de lecture (hors Strapi) — supprimé après usage.
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { pdf } = require('pdf-to-img');

const pdfjsPkg = require.resolve('pdfjs-dist/package.json');
const base = path.dirname(pdfjsPkg).split(path.sep).join('/');
const fontsDir = `${base}/standard_fonts/`;
const cmapsDir = `${base}/cmaps/`;

const f = 'public/uploads/D2024_055_VF_9bf0005845.pdf';
const doc = await pdf(f, {
  scale: 1.6,
  docInitParams: { standardFontDataUrl: fontsDir, cMapUrl: cmapsDir, cMapPacked: true },
});
console.log('pages', doc.length);

let t = Date.now();
const png1 = await doc.getPage(1);
console.log('render p1 ms', Date.now() - t);

const m = await sharp(png1).metadata();
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}">` +
    `<text x="${m.width / 2}" y="${m.height / 2}" font-size="48" fill="rgba(0,0,0,0.08)" text-anchor="middle" transform="rotate(-30 ${m.width / 2} ${m.height / 2})">Biblio</text></svg>`
);

t = Date.now();
const out1 = await sharp(png1).composite([{ input: svg }]).resize({ width: 1400 }).webp({ quality: 80 }).toBuffer();
console.log('cold webp ms', Date.now() - t, 'size', out1.length);

const png2 = await doc.getPage(2);
t = Date.now();
const out2 = await sharp(png2).composite([{ input: svg }]).resize({ width: 1400 }).webp({ quality: 80 }).toBuffer();
console.log('warm webp ms', Date.now() - t, 'size', out2.length);

await doc.destroy();

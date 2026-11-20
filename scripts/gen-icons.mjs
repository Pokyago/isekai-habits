// Renders public/icon.svg to the PNG sizes the installable app needs.
// Run with: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = await readFile(join(publicDir, 'icon.svg'));

const targets = [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(publicDir, name));
  console.log(`wrote ${name} (${size}×${size})`);
}

// desktop/icon.ico for "Isekai Habits.exe": the usual Windows sizes packed into one file.
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = await Promise.all(
  icoSizes.map((size) => sharp(svg, { density: 300 }).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, at);
  header.writeUInt8(size >= 256 ? 0 : size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
const icoPath = join(publicDir, '..', 'desktop', 'icon.ico');
await writeFile(icoPath, Buffer.concat([header, ...images]));
console.log(`wrote desktop/icon.ico (${icoSizes.join(', ')})`);

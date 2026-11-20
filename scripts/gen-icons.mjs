// Renders public/icon.svg to the PNG sizes the installable app needs.
// Run with: npm run icons
import { readFile } from 'node:fs/promises';
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

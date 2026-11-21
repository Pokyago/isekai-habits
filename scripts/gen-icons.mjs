// Renders public/icon.svg to every icon the app needs.
// Run with: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const full = await readFile(join(publicDir, 'icon.svg'), 'utf8');

const swap = (svg, from, to) => {
  if (!(from instanceof RegExp ? from.test(svg) : svg.includes(from))) throw new Error(`icon.svg no longer has ${from}`);
  return svg.replace(from, to);
};

// Windows and the browser tab show the icon as it is, so there it gets rounded corners.
// Phones and the installed app cut their own shape, and need the square to be full.
const rounded = swap(full, /rx="0"/g, 'rx="112"');

// At taskbar sizes the circle and stars turn to noise: leave them out and let her face fill the square.
let small = swap(rounded, /<g id="detail">[\s\S]*?<\/g>/, '');
small = swap(small, /<g id="spark"[\s\S]*?<\/g>/, '');
small = swap(small, /<g id="heroine" transform="[^"]*">/, '<g id="heroine" transform="translate(256 268) scale(6.6) translate(-60 -60)">');

const render = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png();

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await render(full, size).toFile(join(publicDir, name));
  console.log(`wrote ${name} (${size}×${size})`);
}

await writeFile(join(publicDir, 'favicon.svg'), small);
console.log('wrote favicon.svg');

// desktop/icon.ico for "Isekai Habits.exe": the usual Windows sizes packed into one file.
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = await Promise.all(icoSizes.map((size) => render(size <= 40 ? small : rounded, size).toBuffer()));
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

// A sheet for checking by eye: the full icon, then the small ones enlarged pixel for pixel.
if (process.argv[2] === '--sheet' && process.argv[3]) {
  const tiles = [{ input: await render(rounded, 384).toBuffer(), left: 8, top: 8 }];
  let x = 408;
  for (const size of [64, 48, 32, 24, 16]) {
    const buf = images[icoSizes.indexOf(size)];
    tiles.push({ input: await sharp(buf).resize(size * 3, size * 3, { kernel: 'nearest' }).png().toBuffer(), left: x, top: 20 });
    tiles.push({ input: buf, left: x, top: 240 });
    x += size * 3 + 16;
  }
  await sharp({ create: { width: x + 8, height: 400, channels: 4, background: '#30343c' } })
    .composite(tiles)
    .png()
    .toFile(process.argv[3]);
  console.log(`wrote ${process.argv[3]}`);
}

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const svg = readFileSync(resolve(publicDir, 'icon.svg'));

// Maskable variant: same icon padded inside safe zone (80% inner area).
// We accomplish this by composing the SVG scaled to 80% over a solid background.
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#09090b"/>
  <g transform="translate(51 51) scale(0.8)">${svg.toString().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g>
</svg>`);

const targets = [
  { size: 192, file: 'icon-192.png', src: svg },
  { size: 512, file: 'icon-512.png', src: svg },
  { size: 512, file: 'icon-maskable-512.png', src: maskableSvg },
  { size: 180, file: 'apple-touch-icon.png', src: svg },
  { size: 32, file: 'favicon-32.png', src: svg },
];

for (const { size, file, src } of targets) {
  await sharp(src).resize(size, size).png().toFile(resolve(publicDir, file));
  console.log(`wrote ${file} (${size}x${size})`);
}

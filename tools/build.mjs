#!/usr/bin/env node
/**
 * Assemble loadable extension folders for both browsers.
 *
 *   node tools/build.mjs   ->   dist/chrome/   and   dist/firefox/
 *
 * The two differ only in the manifest: Chrome runs the background as a service
 * worker (which pulls the engine in via importScripts), Firefox runs it as an
 * event page with a script list.
 *
 * Only one icon per technology is kept in the repo, at the largest size. The
 * toolbar sizes are produced from it here, so adding a technology adds one file
 * rather than four.
 */
import { cpSync, mkdirSync, rmSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

// Chrome cannot use SVG for an action icon, so every size has to exist as a PNG.
const SIZES = [16, 32, 48, 128];
const LARGEST = Math.max(...SIZES); // the size icons/<id>.png is committed at

function resize(srcPng, size) {
  const { width, height, data: pixels } = srcPng;
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor((y * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / size));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / size));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4;
          const alpha = pixels[i + 3];
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      if (a === 0) continue;
      out.data[o] = Math.round(r / a);
      out.data[o + 1] = Math.round(g / a);
      out.data[o + 2] = Math.round(b / a);
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/**
 * Write every toolbar size for every committed icon, downscaling from the
 * 128 px original in icons/<id>.png. The SVG sources in icons/src/ stay in the
 * repo but are not rendered here -- that needs a renderer, and `npm run icons`
 * owns it.
 */
function emitIcons(outDir) {
  let count = 0;
  for (const file of readdirSync(join(root, 'icons'))) {
    if (!file.endsWith('.png')) continue; // icons/src/ is a directory, so it skips itself
    const id = file.slice(0, -'.png'.length);
    const source = join(root, 'icons', file);
    // The committed file is already the largest size; only the smaller ones
    // have to be computed.
    copyFileSync(source, join(outDir, `${id}-${LARGEST}.png`));
    const image = PNG.sync.read(readFileSync(source));
    if (image.width !== image.height) {
      throw new Error(`icons/${file} is ${image.width}x${image.height}; icons must be square or they come out stretched`);
    }
    for (const size of SIZES) {
      if (size === LARGEST) continue;
      writeFileSync(join(outDir, `${id}-${size}.png`), PNG.sync.write(resize(image, size)));
    }
    count++;
  }
  return count;
}

rmSync(dist, { recursive: true, force: true });

for (const target of TARGETS) {
  let icons = 0;
  const out = join(dist, target.name);
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });

  mkdirSync(join(out, 'icons'), { recursive: true });
  icons += emitIcons(join(out, 'icons'));

  copyFileSync(join(root, target.manifest), join(out, 'manifest.json'));
  console.log(`built dist/${target.name} (${icons} icons)`);
}

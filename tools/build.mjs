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
 * Only the 128 px icon is kept in the repo. The toolbar sizes are produced from
 * it here, so adding a technology adds one file rather than four.
 */
import { cpSync, mkdirSync, rmSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, resize, encodePng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

// Chrome cannot use SVG for an action icon, so every size has to exist as a PNG.
const SIZES = [16, 32, 48, 128];

/**
 * Write every toolbar size for every committed icon, downscaling from the
 * 128 px original. The SVG sources in icons/src/ stay in the repo but are not
 * rendered here -- that needs a renderer, and `npm run icons` owns it.
 */
function emitIcons(outDir) {
  let count = 0;
  for (const file of readdirSync(join(root, 'icons'))) {
    if (!file.endsWith('-128.png')) continue;
    const id = file.slice(0, -'-128.png'.length);
    const source = readFileSync(join(root, 'icons', file));
    copyFileSync(join(root, 'icons', file), join(outDir, file));
    const image = decodePng(source);
    for (const size of SIZES) {
      if (size === 128) continue;
      writeFileSync(join(outDir, `${id}-${size}.png`), encodePng(resize(image, size)));
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

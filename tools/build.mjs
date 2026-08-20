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
import { cpSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

// Chrome cannot use SVG for an action icon, so every size has to exist as a PNG.
const SIZES = [16, 32, 48, 128];
const LARGEST = Math.max(...SIZES); // the size icons/<id>.png is committed at

/**
 * Write every toolbar size for every committed icon, downscaling from the
 * 128 px original in icons/<id>.png. The SVG sources in icons/src/ stay in the
 * repo but are not rendered here -- icons/<id>.png is the committed artefact,
 * and `npm run icons` owns producing it.
 */
async function emitIcons(outDir) {
  let count = 0;
  for (const file of readdirSync(join(root, 'icons'))) {
    if (!file.endsWith('.png')) continue; // icons/src/ is a directory, so it skips itself
    const id = file.slice(0, -'.png'.length);
    const source = join(root, 'icons', file);
    // The committed file is already the largest size; only the smaller ones
    // have to be computed.
    copyFileSync(source, join(outDir, `${id}-${LARGEST}.png`));

    const meta = await sharp(source).metadata();
    if (meta.width !== meta.height) {
      throw new Error(`icons/${file} is ${meta.width}x${meta.height}; icons must be square or they come out stretched`);
    }

    for (const size of SIZES) {
      if (size === LARGEST) continue;
      await sharp(source).resize(size, size).toFile(join(outDir, `${id}-${size}.png`));
    }
    count++;
  }
  return count;
}

// Zips the built extension folder so manifest.json sits at the archive root,
// which is what the Chrome Web Store / AMO upload forms expect.
function zipDir(out, zipPath) {
  rmSync(zipPath, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: out });
}

rmSync(dist, { recursive: true, force: true });

for (const target of TARGETS) {
  const out = join(dist, target.name);
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });

  mkdirSync(join(out, 'icons'), { recursive: true });
  const icons = await emitIcons(join(out, 'icons'));

  copyFileSync(join(root, target.manifest), join(out, 'manifest.json'));
  console.log(`built dist/${target.name} (${icons} icons)`);

  const zipPath = join(dist, `${target.name}.zip`);
  zipDir(out, zipPath);
  console.log(`zipped dist/${target.name}.zip`);
}

#!/usr/bin/env node
/**
 * Assemble loadable extension folders for both browsers.
 *
 *   node tools/build.mjs   ->   dist/chrome/   and   dist/firefox/
 *
 * The two differ only in the manifest: Chrome runs the background as a service
 * worker (which pulls in signatures.js via importScripts), Firefox runs it as
 * an event page with a script list.
 */
import { cpSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

rmSync(dist, { recursive: true, force: true });

for (const target of TARGETS) {
  const out = join(dist, target.name);
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });

  // Only the rendered PNGs ship; the SVG sources stay in the repo.
  mkdirSync(join(out, 'icons'), { recursive: true });
  for (const file of readdirSync(join(root, 'icons'))) {
    if (file.endsWith('.png')) copyFileSync(join(root, 'icons', file), join(out, 'icons', file));
  }

  copyFileSync(join(root, target.manifest), join(out, 'manifest.json'));
  console.log(`built dist/${target.name}`);
}

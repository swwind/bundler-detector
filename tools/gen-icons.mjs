#!/usr/bin/env node
/**
 * Rasterise the toolbar icons.
 *
 * Sources are either SVG, or PNG for the logos only published as raster
 * (Rspack's favicon, Turbopack's README mark) -- those get wrapped in an SVG
 * so both kinds go through the same fit-and-pad render below.
 *
 * Any technology in src/signatures/ without a source file gets a lettermark
 * generated from its own `color`, so registering a technology never leaves the
 * toolbar showing the wrong logo. Drop a real `icons/src/<id>.svg` in later and
 * it takes over.
 *
 * Chrome cannot use SVG for action icons, so a PNG is committed -- but only one
 * per technology, as icons/<id>.png; `npm run build` derives the toolbar sizes
 * from it. This only needs re-running when a source or the list changes:
 *
 *   npm run icons
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SIZE = 128; // icons/<id>.png is rendered at this size; the build derives the rest

for (const file of ['bundlers', 'frameworks', 'meta']) require(join(root, 'src', 'signatures', file + '.js'));
const technologies = globalThis.StackSignatures;

const srcDir = join(root, 'icons', 'src');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

/** Wrap a raster logo in an SVG so it takes the same path as the vector ones. */
function svgFromPng(buffer) {
  const href = 'data:image/png;base64,' + buffer.toString('base64');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128">' +
    `<image href="${href}" xlink:href="${href}" x="0" y="0" width="128" height="128"/></svg>`
  );
}

/**
 * A one-letter stand-in on the project's own colour. One letter rather than
 * two because the 16 px toolbar icon is the one that has to stay readable.
 */
function lettermark(name, color) {
  const initial = (name.replace(/[^A-Za-z]/g, '')[0] || '?').toUpperCase();
  const ink = contrastInk(color);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<rect width="30" height="30" x="1" y="1" rx="7" fill="${color}"/>` +
    `<text x="16" y="17" fill="${ink}" font-family="DejaVu Sans, Verdana, sans-serif" font-size="19" ` +
    `font-weight="700" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`
  );
}

/** Black or white, whichever stays readable on the given background. */
function contrastInk(color) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#1b1d21' : '#ffffff';
}

/**
 * Render to a square, fitting the longest side and padding the other with
 * transparency -- which is what `fit: 'contain'` does.
 *
 * Plenty of logos are not square -- Lit's flame is 160 tall by 128 wide, Solid's
 * ribbons are wider than they are tall. Writing those out at their own aspect
 * ratio would leave the build to squash them into a square icon.
 */
async function render(id, svgInput) {
  const input = typeof svgInput === 'string' ? Buffer.from(svgInput) : svgInput;
  await sharp(input)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toFile(join(outDir, `${id}.png`));
}

const sources = new Map();
for (const file of readdirSync(srcDir)) {
  const match = /^(.+)\.(svg|png)$/.exec(file);
  if (match) sources.set(match[1], file);
}

for (const [id, file] of sources) {
  const svg = file.endsWith('.png')
    ? svgFromPng(readFileSync(join(srcDir, file)))
    : readFileSync(join(srcDir, file), 'utf8');
  await render(id, svg);
  console.log(`${id}.png`);
}

for (const tech of technologies) {
  if (sources.has(tech.id)) continue;
  await render(tech.id, lettermark(tech.name, tech.color));
  console.log(`${tech.id}.png (generated lettermark — no icons/src/${tech.id}.svg)`);
}

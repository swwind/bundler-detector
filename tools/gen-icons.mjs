#!/usr/bin/env node
/**
 * Rasterise icons/src/* into the PNG sizes the toolbar needs.
 *
 * Sources are either SVG, or PNG for the logos only published as raster
 * (Rspack's favicon, Turbopack's README mark) -- those get wrapped in an SVG
 * so the renderer resamples them to each size. Chrome cannot use SVG for
 * action icons, so the PNGs are committed and this only needs re-running when
 * a source changes:
 *
 *   npm install --no-save @resvg/resvg-js && node tools/gen-icons.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error('Missing renderer. Run: npm install --no-save @resvg/resvg-js');
  process.exit(1);
}

const srcDir = join(root, 'icons', 'src');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

/** Wrap a raster logo in an SVG so it can be resampled to each icon size. */
function svgFromPng(buffer) {
  const href = 'data:image/png;base64,' + buffer.toString('base64');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128">' +
    `<image href="${href}" xlink:href="${href}" x="0" y="0" width="128" height="128"/></svg>`
  );
}

const sources = readdirSync(srcDir).filter((f) => /\.(svg|png)$/.test(f));

for (const file of sources) {
  const id = file.replace(/\.(svg|png)$/, '');
  const svg = file.endsWith('.png')
    ? svgFromPng(readFileSync(join(srcDir, file)))
    : readFileSync(join(srcDir, file), 'utf8');
  for (const size of SIZES) {
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      background: 'rgba(0,0,0,0)',
      shapeRendering: 2,
      textRendering: 2,
    })
      .render()
      .asPng();
    writeFileSync(join(outDir, `${id}-${size}.png`), png);
  }
  console.log(`${id}: ${SIZES.join(', ')}`);
}

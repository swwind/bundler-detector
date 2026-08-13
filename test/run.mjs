#!/usr/bin/env node
/**
 * Regression tests for the signature engine.
 *
 * Every fixture under test/fixtures/ is real production output from the tool it
 * is named after, produced by building the same tiny app (an entry module, a
 * dynamic import and a CSS import) with each bundler. If a rule in
 * src/signatures.js stops matching real output, this fails.
 *
 *   node test/run.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { analyze } = require(join(here, '..', 'src', 'signatures.js'));

/**
 * expect.primary   the bundler that must be reported first
 * expect.version   exact string the dialog should show (null = no claim made)
 * expect.only      no other bundler may be reported
 */
const CASES = [
  // Vite 2 and 3 emit the same markers and the same assets/name.HASH.js
  // filenames, so the honest answer for both is the range.
  { dir: 'vite2', primary: 'vite', version: '2 – 3', only: true },
  { dir: 'vite3', primary: 'vite', version: '2 – 3', only: true },
  { dir: 'vite4', primary: 'vite', version: '4', only: true },
  { dir: 'vite5', primary: 'vite', version: '5 – 7', only: true },
  { dir: 'vite6', primary: 'vite', version: '5 – 7', only: true },
  { dir: 'vite7', primary: 'vite', version: '5 – 7', only: true },
  { dir: 'vite8', primary: 'vite', version: '≥ 8', only: true },
  { dir: 'webpack4', primary: 'webpack', version: '≤ 4', only: true },
  { dir: 'webpack5', primary: 'webpack', version: '5', only: true },
  { dir: 'next-webpack', primary: 'webpack', version: '5', only: true },
  // Rspack 1.x stamps its exact version into the runtime, which is the only
  // thing separating it from webpack 5 -- its runtime is webpack's otherwise.
  { dir: 'rspack1', primary: 'rspack', version: '1.5.8', only: true },
  { dir: 'rspack2', primary: 'rspack', version: '≥ 2', only: true },
  { dir: 'turbopack', primary: 'turbopack', version: null, only: true },
  { dir: 'parcel', primary: 'parcel', version: '≥ 2', only: true },
  // No runtime survives in plain Rollup ESM output, so we must stay silent
  // rather than guess.
  { dir: 'rollup', primary: null },
  // esbuild renames its interop helpers when minifying, which erases the only
  // marker it has. Staying silent is the correct result here.
  { dir: 'esbuild', primary: null },
  { dir: 'esbuild-unminified', primary: 'esbuild', version: null },
];

function loadFixture(dir) {
  const root = join(here, 'fixtures', dir);
  const sources = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (!statSync(path).isFile()) continue;
    if (name.endsWith('.map')) continue;
    const kind = name.endsWith('.html') ? 'html' : name.endsWith('.js') ? 'js' : null;
    if (!kind) continue;
    sources.push({ kind, label: name, text: readFileSync(path, 'utf8') });
  }
  return sources;
}

let failed = 0;
let passed = 0;

for (const c of CASES) {
  let sources;
  try {
    sources = loadFixture(c.dir);
  } catch {
    console.log(`SKIP ${c.dir} (fixture missing)`);
    continue;
  }
  if (!sources.length) {
    console.log(`SKIP ${c.dir} (fixture empty)`);
    continue;
  }

  const { detections } = analyze({ sources, globals: [] });
  const top = detections[0];
  const problems = [];

  if (c.primary === null) {
    if (top) problems.push(`expected no detection, got ${detections.map((d) => d.id).join(', ')}`);
  } else {
    if (!top) problems.push(`expected ${c.primary}, got nothing`);
    else if (top.id !== c.primary) problems.push(`expected ${c.primary}, got ${top.id}`);
    else if (c.version !== undefined) {
      const got = top.version ? top.version.text : null;
      if (got !== c.version) problems.push(`version: expected ${JSON.stringify(c.version)}, got ${JSON.stringify(got)}`);
    }
    if (c.only && detections.length > 1) {
      problems.push(`expected only ${c.primary}, also got ${detections.slice(1).map((d) => d.id).join(', ')}`);
    }
  }

  const label = top ? `${top.id}${top.version ? ' ' + top.version.text : ''} (${top.confidence})` : '(none)';
  if (problems.length) {
    failed++;
    console.log(`FAIL ${c.dir.padEnd(13)} -> ${label}`);
    for (const p of problems) console.log(`      ${p}`);
  } else {
    passed++;
    console.log(`ok   ${c.dir.padEnd(13)} -> ${label}`);
  }
}

// A page really running two bundlers must surface both (the devil case).
{
  const sources = [...loadFixture('vite8'), ...loadFixture('webpack5')];
  const { detections } = analyze({ sources, globals: [] });
  const ids = detections.map((d) => d.id).sort();
  if (ids.join(',') === 'vite,webpack') {
    passed++;
    console.log('ok   mixed vite+webpack -> both reported');
  } else {
    failed++;
    console.log(`FAIL mixed vite+webpack -> got ${ids.join(',') || '(none)'}`);
  }
}

// window globals alone should be enough, with no script bodies at all.
{
  const { detections } = analyze({ sources: [], globals: ['webpackChunkmyapp', 'React'] });
  if (detections.length === 1 && detections[0].id === 'webpack' && detections[0].version.text === '5') {
    passed++;
    console.log('ok   globals-only        -> webpack 5');
  } else {
    failed++;
    console.log(`FAIL globals-only -> ${JSON.stringify(detections.map((d) => d.id))}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

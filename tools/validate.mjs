#!/usr/bin/env node
/**
 * Check that the built extension folders are actually loadable.
 *
 * Catches the failure modes that only show up when a browser rejects the
 * folder: a manifest pointing at a file that was not copied, a Chrome-only key
 * left in the Firefox manifest, or the two manifests drifting apart in version.
 *
 *   node tools/validate.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const note = (msg) => console.log('  ' + msg);

function check(condition, message) {
  if (!condition) problems.push(message);
  return condition;
}

/** Every path a browser will try to load out of the manifest. */
function referencedFiles(manifest, dir) {
  const refs = [];
  const bg = manifest.background || {};
  if (bg.service_worker) refs.push(bg.service_worker);
  for (const script of bg.scripts || []) refs.push(script);
  for (const cs of manifest.content_scripts || []) refs.push(...(cs.js || []), ...(cs.css || []));
  if (manifest.action && manifest.action.default_popup) refs.push(manifest.action.default_popup);
  refs.push(...Object.values((manifest.action && manifest.action.default_icon) || {}));
  refs.push(...Object.values(manifest.icons || {}));

  // Follow the popup's own <script>/<link> references.
  const popup = manifest.action && manifest.action.default_popup;
  if (popup && existsSync(join(dir, popup))) {
    const html = readFileSync(join(dir, popup), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!/^(https?:|data:|#)/.test(m[1])) refs.push(join(dirname(popup), m[1]));
    }
  }
  return [...new Set(refs)];
}

const TARGETS = [
  {
    name: 'chrome',
    // Firefox-only keys that make Chrome reject or warn on the manifest.
    forbidden: ['browser_specific_settings'],
    require: (m) => {
      check(m.background && m.background.service_worker, 'chrome: background.service_worker missing');
      check(!m.background.scripts, 'chrome: background.scripts must not be present');
    },
  },
  {
    name: 'firefox',
    forbidden: ['minimum_chrome_version'],
    require: (m) => {
      check(m.background && Array.isArray(m.background.scripts), 'firefox: background.scripts missing');
      check(!m.background.service_worker, 'firefox: background.service_worker must not be present');
      const gecko = (m.browser_specific_settings || {}).gecko || {};
      check(gecko.id, 'firefox: browser_specific_settings.gecko.id missing (AMO needs a stable id)');
      // background.js expects the engine to already be on globalThis.
      const scripts = m.background.scripts || [];
      check(
        scripts[scripts.length - 1] === 'src/background.js',
        'firefox: src/background.js must be the last background script'
      );
    },
  },
];

/**
 * The technology ids the built signature files register. Read out of the build
 * itself rather than the repo, so a file the build forgot to copy is caught.
 */
function technologyIds(dir) {
  const registry = [];
  const sandbox = { StackSignatures: registry, StackRelations: [] };
  for (const file of readdirSync(join(dir, 'src/signatures'))) {
    const code = readFileSync(join(dir, 'src/signatures', file), 'utf8');
    new Function('globalThis', 'self', code)(sandbox, sandbox);
  }
  return registry.map((t) => t.id);
}

const versions = new Set();

for (const target of TARGETS) {
  const dir = join(root, 'dist', target.name);
  console.log(`dist/${target.name}`);
  if (!check(existsSync(dir), `dist/${target.name} missing — run npm run build`)) continue;

  const manifestPath = join(dir, 'manifest.json');
  if (!check(existsSync(manifestPath), `dist/${target.name}/manifest.json missing`)) continue;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`${target.name}: manifest.json is not valid JSON — ${error.message}`);
    continue;
  }

  check(manifest.manifest_version === 3, `${target.name}: expected manifest_version 3`);
  check(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), `${target.name}: version must be x.y.z`);
  versions.add(manifest.version);
  target.require(manifest);

  for (const key of target.forbidden) {
    check(!(key in manifest), `${target.name}: manifest must not contain "${key}"`);
  }

  const refs = referencedFiles(manifest, dir);
  const missing = refs.filter((f) => !existsSync(join(dir, f)));
  check(missing.length === 0, `${target.name}: manifest references missing files: ${missing.join(', ')}`);
  note(`manifest v${manifest.version}, ${refs.length} referenced files, ${missing.length} missing`);

  // Every technology the engine can report needs an icon in every size, or
  // the toolbar silently falls back to the unknown cube.
  const ids = technologyIds(dir).concat(['devil', 'unknown']);
  const sizes = [16, 32, 48, 128];
  const missingIcons = [];
  for (const id of ids) {
    for (const size of sizes) {
      if (!existsSync(join(dir, `icons/${id}-${size}.png`))) missingIcons.push(`${id}-${size}.png`);
    }
  }
  check(missingIcons.length === 0, `${target.name}: missing icons: ${missingIcons.join(', ')}`);
  note(`${ids.length} icon ids x ${sizes.length} sizes present`);

  // The background worker loads the signature files itself on Chrome and has
  // them loaded for it on Firefox; the two lists have to agree.
  const background = readFileSync(join(dir, 'src/background.js'), 'utf8');
  const imported = [...background.matchAll(/'(\/src\/[\w/.-]+\.js)'/g)].map((m) => m[1].slice(1));
  const missingImports = imported.filter((f) => !existsSync(join(dir, f)));
  check(missingImports.length === 0, `${target.name}: background imports missing files: ${missingImports.join(', ')}`);
  if (target.name === 'firefox') {
    const declared = (manifest.background.scripts || []).filter((f) => f !== 'src/background.js');
    check(
      declared.join() === imported.join(),
      `firefox: background.scripts [${declared.join(', ')}] does not match background.js importScripts [${imported.join(', ')}]`
    );
  }
  note(`${imported.length} engine files loaded before background.js`);

  const stray = readdirSync(dir).filter((f) => !['manifest.json', 'src', 'icons'].includes(f));
  check(stray.length === 0, `${target.name}: unexpected files in build output: ${stray.join(', ')}`);
}

check(versions.size <= 1, `manifests disagree on version: ${[...versions].join(' vs ')}`);

// When run from a tag build, the tag must match the manifest version.
const tag = process.env.RELEASE_TAG;
if (tag) {
  const want = tag.replace(/^v/, '');
  const got = [...versions][0];
  check(want === got, `tag ${tag} does not match manifest version ${got}`);
  note(`tag ${tag} matches manifest version`);
}

if (problems.length) {
  console.log('\nFAILED');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nall builds valid');

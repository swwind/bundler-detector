#!/usr/bin/env node
/**
 * Regression tests for the signature engine.
 *
 * Every fixture under test/fixtures/ is real. Two kinds:
 *
 *   bundle fixtures  production output of the tool named on the tin, produced
 *                    by building the same tiny app with each bundler, or the
 *                    framework's own starter template
 *   page fixtures    page.json -- the exact facts the content scripts harvest
 *                    (window globals, DOM expando properties, attributes and
 *                    classes, script URLs, head markup) captured from a real
 *                    page in a real browser
 *
 * A page fixture keeps the whole harvest, analytics noise included, so a rule
 * that fires on somebody's tag manager fails here rather than in the wild.
 *
 *   node --test test/run.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const src = join(here, '..', 'src');
for (const file of ['bundlers', 'frameworks', 'meta']) require(join(src, 'signatures', file + '.js'));
const { analyze } = require(join(src, 'engine.js'));

/**
 * primary   the technology that must be reported first
 * version   exact string the dialog should show (null = no claim made)
 * also      technologies that must also be reported, in any order
 * builtOn   technologies that must be folded into the primary
 * only      nothing beyond primary + also may be reported
 */
const CASES = [
  // ---- bundlers -------------------------------------------------------
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
  // A Next.js webpack build: the Next markers in the chunk registry win over
  // the plain webpack reading, and webpack arrives folded in.
  { dir: 'next-webpack', primary: 'next', version: null, builtOn: ['webpack'], only: true },
  // Rspack 1.x stamps its exact version into a webpack-compatible runtime,
  // which is what separates these markers from plain webpack 5.
  { dir: 'rspack1', primary: 'rspack', version: '1.5.8', builtOn: ['webpack'], only: true },
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

  // ---- UI frameworks --------------------------------------------------
  // Each of these is that framework's own Vite starter, so Vite is a real
  // second finding rather than a false positive.
  { dir: 'react', primary: 'react', version: '≥ 19', also: ['vite'], only: true },
  { dir: 'vue', primary: 'vue', version: '≥ 3', also: ['vite'], only: true },
  { dir: 'svelte', primary: 'svelte', version: '5', also: ['vite'], only: true },
  { dir: 'solid', primary: 'solid', version: null, also: ['vite'], only: true },
  { dir: 'preact', primary: 'preact', version: null, also: ['vite'], only: true },
  { dir: 'lit', primary: 'lit', version: '4.2.2', also: ['vite'], only: true },
  // Qwik stamps its exact version into the container element.
  { dir: 'qwik', primary: 'qwik', version: '1.20.0', also: ['vite'], only: true },

  // A prerendered Angular page has no runtime globals at all: the version
  // comes off the root element's ng-version attribute.
  { dir: 'angular', primary: 'angular', version: '22.1.3+sha-004cf3a', only: true },
  { dir: 'angularjs', primary: 'angularjs', version: '1.8.2', also: ['jquery'] },
  { dir: 'jquery', primary: 'jquery', version: '4.0.0', only: true },
  { dir: 'alpine', primary: 'alpine', version: '3.16.2', also: ['preact'] },
  { dir: 'htmx', primary: 'htmx', version: '2.0.10', only: true },
  { dir: 'backbone', primary: 'backbone', version: '1.6.0', also: ['jquery'], only: true },
  { dir: 'knockout', primary: 'knockout', version: '3.5.3', also: ['jquery'], only: true },
  { dir: 'ember', primary: 'ember', version: null, also: ['webpack'], only: true },
  { dir: 'stimulus', primary: 'stimulus', version: null, only: true },

  // ---- meta-frameworks ------------------------------------------------
  // The UI framework and the bundler are intrinsic to each of these, so they
  // have to arrive folded in rather than as extra findings.
  { dir: 'next', primary: 'next', version: '16.3.1-canary.24', builtOn: ['react', 'turbopack'], only: true },
  { dir: 'nuxt', primary: 'nuxt', version: null, builtOn: ['vue', 'vite'], only: true },
  { dir: 'sveltekit', primary: 'sveltekit', version: null, builtOn: ['svelte', 'vite'], only: true },
  { dir: 'gatsby', primary: 'gatsby', version: '4.24.6', builtOn: ['react', 'webpack'], only: true },
  { dir: 'docusaurus', primary: 'docusaurus', version: '3.10.1', builtOn: ['react', 'rspack'], only: true },
  // A page fixture carries no bundle text, so Vite -- which is only visible
  // inside the chunk that holds its preload helper -- is not found here.
  { dir: 'vitepress', primary: 'vitepress', version: '2.0.0-alpha.17', builtOn: ['vue'], only: true },
  { dir: 'remix', primary: 'remix', version: '3.0.0-beta.10', only: true },
  // Rspress 2 and 1.x, each the tool's own starter built for production. The
  // Rsbuild/Rspack markers must arrive folded in; React and React Router live
  // in vendor chunks this fixture does not carry (see the react-router test
  // below for that half).
  { dir: 'rspress', primary: 'rspress', version: '2.0.19', builtOn: ['rspack'], only: true },
  // 1.x builds with Rspack 1.x, whose webpack-compatible runtime carries the
  // ruid stamp -- so the exact bundler version arrives as a chip.
  { dir: 'rspress1', primary: 'rspress', version: '1.47.2', builtOn: ['rspack', 'webpack'], only: true },
  // Astro builds with Vite, so the Vite markers in its runtime must end up
  // folded into the Astro detection rather than reported alongside it.
  { dir: 'astro', primary: 'astro', version: '7.2.1', builtOn: ['vite'], only: true },
  // A zero-JS Astro page: no runtime, no scripts, nothing but the stylesheet
  // link into /_astro/. That one path is the whole detection.
  { dir: 'astro-static', primary: 'astro', version: null, only: true },
];

function loadFixture(dir) {
  const root = join(here, 'fixtures', dir);
  const sources = [];
  let globals = [];

  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (!statSync(path).isFile()) continue;
    if (name === 'page.json' || name.endsWith('.map')) continue;
    const kind = name.endsWith('.html') ? 'html' : name.endsWith('.js') ? 'js' : null;
    if (!kind) continue;
    sources.push({ kind, label: name, text: readFileSync(path, 'utf8') });
  }

  const pagePath = join(root, 'page.json');
  if (existsSync(pagePath)) {
    const page = JSON.parse(readFileSync(pagePath, 'utf8'));
    globals = page.globals || [];
    sources.push(
      { kind: 'html', label: 'page markup', text: page.markup || '' },
      { kind: 'dom', label: 'page DOM', text: page.dom || '' },
      { kind: 'prop', label: 'DOM properties', text: (page.props || []).join('\n') },
      { kind: 'url', label: 'resource URLs', text: (page.urls || []).join('\n') }
    );
  }
  return { sources, globals };
}

describe('signature engine', () => {
  for (const c of CASES) {
    it(c.dir, (t) => {
      let fixture;
      try {
        fixture = loadFixture(c.dir);
      } catch {
        t.skip('fixture missing');
        return;
      }
      if (!fixture.sources.length) {
        t.skip('fixture empty');
        return;
      }

      const { detections } = analyze(fixture);
      const top = detections[0];

      if (c.primary === null) {
        assert.strictEqual(
          detections.length,
          0,
          `expected no detection, got ${detections.map((d) => d.id).join(', ')}`
        );
      } else {
        assert.ok(top, `expected ${c.primary}, got nothing`);
        assert.strictEqual(top.id, c.primary, `expected ${c.primary}, got ${top ? top.id : 'nothing'}`);

        if (c.version !== undefined) {
          const got = top.version ? top.version.text : null;
          assert.strictEqual(got, c.version, `version: expected ${JSON.stringify(c.version)}, got ${JSON.stringify(got)}`);
        }

        const ids = detections.map((d) => d.id);
        for (const id of c.also || []) {
          assert.ok(
            ids.includes(id),
            `expected ${id} to be reported too, got ${ids.join(', ') || '(none)'}`
          );
        }
        const foldedIn = ((top && top.builtOn) || []).map((b) => b.id);
        for (const id of c.builtOn || []) {
          assert.ok(
            foldedIn.includes(id),
            `expected ${id} folded into ${c.primary}, got ${foldedIn.join(', ') || '(none)'}`
          );
        }
        if (c.only) {
          const allowed = new Set([c.primary, ...(c.also || [])]);
          const extra = ids.filter((id) => !allowed.has(id));
          assert.deepStrictEqual(
            extra,
            [],
            `expected only ${[...allowed].join(' + ')}, also got ${extra.join(', ')}`
          );
        }
      }
    });
  }

  // A page really running two bundlers must surface both (the devil case).
  it('mixed vite+webpack', () => {
    const sources = [...loadFixture('vite8').sources, ...loadFixture('webpack5').sources];
    const { detections, conflicts } = analyze({ sources, globals: [] });
    const ids = detections.map((d) => d.id).sort();
    assert.deepStrictEqual(ids, ['vite', 'webpack']);
    assert.ok(conflicts.includes('bundler'), `expected bundler conflict, got ${conflicts.join(',')}`);
  });

  // jQuery beside a framework is normal, not a conflict -- that distinction is
  // what keeps the devil icon meaningful.
  it('jquery beside vue', () => {
    const { detections, conflicts } = analyze({
      sources: [],
      globals: [{ name: 'jQuery', version: '3.7.1' }, { name: 'webpackChunkapp' }, { name: '__VUE__' }],
    });
    const ids = detections.map((d) => d.id);
    assert.deepStrictEqual(ids, ['vue', 'jquery', 'webpack']);
    assert.deepStrictEqual(conflicts, []);
  });

  it('react router alone is not remix', () => {
    const { detections } = analyze({
      sources: [],
      globals: ['__reactRouterVersion', 'webpackChunkapp'],
    });
    assert.deepStrictEqual(detections.map((d) => d.id), ['webpack']);
  });

  it('webpack interop helpers are not preact', () => {
    const text =
      'n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};' +
      'r.d(t,{a:t});return t},r.__chunkIds=[],s.__bootstrap=1,o.__keyed=2';
    const { detections } = analyze({ sources: [{ kind: 'js', label: 'banner.js', text }], globals: [] });
    assert.deepStrictEqual(detections.map((d) => d.id), []);
  });

  it('a bare data-action is not stimulus', () => {
    const dom = ['data-action="delete"', 'data-action="click:menu#toggle"', 'data-remote="true"'].join('\n');
    const { detections } = analyze({ sources: [{ kind: 'dom', label: 'page DOM', text: dom }], globals: [] });
    assert.deepStrictEqual(detections.map((d) => d.id), []);
  });

  // window globals alone should be enough, with no script bodies at all.
  it('globals-only', () => {
    const { detections } = analyze({ sources: [], globals: ['webpackChunkmyapp'] });
    assert.strictEqual(detections.length, 1);
    assert.strictEqual(detections[0].id, 'webpack');
    assert.strictEqual(detections[0].version.text, '5');
  });

  // Rspack's ESM chunks carry no rspackChunk global and no data-rspack -- the
  // exported module-id names are the whole signal, and either one alone is
  // enough for the >= 2 bound.
  for (const marker of ['export const __rspack_esm_id=77844;', 'export const __rspack_esm_ids=[77844];']) {
    it(`rspack esm chunk (${marker.includes('_ids') ? '__rspack_esm_ids' : '__rspack_esm_id'})`, () => {
      const text = `performance.mark("js-parse-end:app-runtime.js");${marker}export const __webpack_modules__={};`;
      const { detections } = analyze({ sources: [{ kind: 'js', label: 'app-runtime.js', text }], globals: [] });
      assert.deepStrictEqual(detections.map((d) => d.id), ['rspack']);
      assert.strictEqual(detections[0].version.text, '≥ 2');
      assert.ok(detections[0].evidence.some((e) => e.rule === 'rspack-esm-id'));
    });
  }
});

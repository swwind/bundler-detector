'use strict';
/**
 * Bundler signature database + matching engine.
 *
 * This file is pure logic: no DOM, no extension APIs. It runs unchanged in the
 * background worker and under Node (see test/run.mjs), so every rule below can
 * be regression-tested against real bundle output.
 *
 * Every rule was derived by building a fixture app with the real tool and
 * reading the production output. The `seen` comment on a rule records the
 * version(s) the pattern was actually observed in.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BundlerSignatures = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  // Scores are summed per bundler; see CONFIDENCE for how they map to labels.
  const STRONG = 100; // only this bundler emits it
  const MEDIUM = 55; // this bundler or a close relative emits it
  const WEAK = 25; // suggestive, not conclusive

  /**
   * Rule fields:
   *   where   which source kinds to test: 'js' | 'html' | 'global' | 'url'
   *   str     plain substring (fast path)  -- or --
   *   re      regular expression
   *   min/max inclusive major-version bounds implied by a match
   *   exact   fn(match) -> version string read straight out of the bundle
   *   dev     match indicates a dev server rather than a production build
   */
  const BUNDLERS = [
    {
      id: 'vite',
      name: 'Vite',
      color: '#a855f7',
      home: 'https://vite.dev',
      rules: [
        // The preload helper's error event. seen: 4.5, 5.4, 6.4, 7.3, 8.2 (absent in 3.2)
        {
          id: 'vite-preload-error',
          where: ['js'],
          str: 'vite:preloadError',
          weight: STRONG,
          min: 4,
          desc: 'vite:preloadError event in the preload helper',
        },
        // seen: 2.9 through 8.2 -- the oldest stable marker of __vitePreload
        {
          id: 'vite-preload-css',
          where: ['js'],
          str: 'Unable to preload CSS for ',
          weight: STRONG,
          min: 2,
          desc: 'CSS preload error message from __vitePreload',
        },
        // Survives only in unminified builds.
        {
          id: 'vite-preload-fn',
          where: ['js'],
          str: '__vitePreload',
          weight: STRONG,
          desc: '__vitePreload helper (unminified build)',
        },
        {
          id: 'vite-map-deps',
          where: ['js'],
          str: '__vite__mapDeps',
          weight: STRONG,
          desc: '__vite__mapDeps chunk dependency table',
        },
        // @vitejs/plugin-legacy
        {
          id: 'vite-legacy',
          where: ['js', 'html'],
          re: /__vite_is_modern_browser|vite-legacy-entry|__vite_legacy_guard/,
          weight: STRONG,
          desc: '@vitejs/plugin-legacy runtime',
        },
        // Build output HTML: module entry + crossorigin + /assets/name-HASH.js
        {
          id: 'vite-html-entry',
          where: ['html'],
          re: /<script[^>]+type=["']module["'][^>]+crossorigin[^>]*src=["'][^"']*\/assets\/[^"']+-[A-Za-z0-9_-]{8}\.js["']/,
          weight: STRONG,
          min: 4,
          desc: 'Vite build entry <script type="module" crossorigin src="/assets/...">',
        },
        // Vite <= 3 used name.HASH.js instead of name-HASH.js. seen: 3.2.11
        {
          id: 'vite-html-entry-legacy-hash',
          where: ['html'],
          re: /<script[^>]+type=["']module["'][^>]+crossorigin[^>]*src=["'][^"']*\/assets\/[^"']+\.[a-f0-9]{8}\.js["']/,
          weight: STRONG,
          max: 3,
          desc: 'Vite <=3 entry filename (assets/name.HASH.js)',
        },
        {
          id: 'vite-modulepreload',
          where: ['html'],
          re: /<link[^>]+rel=["']modulepreload["'][^>]+crossorigin/,
          weight: MEDIUM,
          desc: '<link rel="modulepreload" crossorigin> emitted by the Vite build',
        },
        {
          id: 'vite-client',
          where: ['js', 'html', 'url'],
          str: '/@vite/client',
          weight: STRONG,
          dev: true,
          desc: 'Vite dev server client',
        },
        {
          id: 'vite-fs-url',
          where: ['url', 'html'],
          str: '/@fs/',
          weight: MEDIUM,
          dev: true,
          desc: 'Vite dev server /@fs/ URL',
        },
        {
          id: 'vite-deps-url',
          where: ['url'],
          str: '/node_modules/.vite/deps/',
          weight: STRONG,
          dev: true,
          desc: 'Vite dev dependency pre-bundle',
        },
        {
          id: 'vite-global',
          where: ['global'],
          re: /^(__vite_is_modern_browser|__vite_plugin_react_preamble_installed__)$/,
          weight: STRONG,
          desc: 'Vite global on window',
        },
      ],
      /**
       * Narrow the major version using markers that live *inside the preload
       * helper*. Absence only means something when we actually found the
       * helper, so all of this is scoped to the file that contained it.
       *
       *   csp-nonce lookup      added in 5  (absent 4.5, present 5.4/6.4/7.3/8.2)
       *   import.meta.resolve   added in 8  (absent 7.3, present 8.2)
       */
      refine(ctx) {
        const file = ctx.fileWithRule('vite-preload-error');
        if (!file) return null;
        if (!file.text.includes('csp-nonce')) return { max: 4 };
        if (!file.text.includes('import.meta.resolve')) return { min: 5, max: 7 };
        return { min: 8 };
      },
    },

    {
      id: 'rspack',
      name: 'Rspack',
      color: '#f93920',
      home: 'https://rspack.rs',
      rules: [
        // Rspack >= 2 renamed the chunk global away from webpack's.
        // seen: 2.1.9 (rspackChunk) vs 0.7.5/1.0.14/1.5.8 (webpackChunk)
        {
          id: 'rspack-chunk-global',
          where: ['global'],
          re: /^rspackChunk/,
          weight: STRONG,
          min: 2,
          desc: 'self.rspackChunk* chunk registry on window',
        },
        {
          id: 'rspack-chunk-push',
          where: ['js'],
          re: /(self|window|globalThis)\.rspackChunk[\w$]*\s*=/,
          weight: STRONG,
          min: 2,
          desc: 'self.rspackChunk* chunk registration',
        },
        {
          id: 'rspack-data-attr',
          where: ['js', 'html'],
          str: 'data-rspack',
          weight: STRONG,
          min: 2,
          desc: 'data-rspack attribute on injected <script>/<link>',
        },
        // The jackpot: Rspack 1.x stamps its exact version into the runtime.
        // seen: 1.0.14, 1.5.8 (absent in 0.7.5 and in 2.1.9)
        {
          id: 'rspack-ruid',
          where: ['js'],
          re: /ruid\s*[=:]\s*["'`]bundler=rspack@([0-9][\w.+-]*)["'`]/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '__webpack_require__.ruid version stamp',
        },
        {
          id: 'rspack-hot',
          where: ['js', 'global'],
          re: /rspackHotUpdate/,
          weight: STRONG,
          dev: true,
          desc: 'Rspack HMR runtime',
        },
      ],
    },

    {
      id: 'webpack',
      name: 'webpack',
      color: '#8dd6f9',
      home: 'https://webpack.js.org',
      // Rspack ships a deliberately webpack-compatible runtime, so everything
      // here also matches an Rspack <= 1.x build. Resolved in applyOverlaps().
      family: 'webpack',
      rules: [
        {
          id: 'webpack-chunk-global',
          where: ['global'],
          re: /^webpackChunk/,
          weight: STRONG,
          min: 5,
          max: 5,
          desc: 'self.webpackChunk* chunk registry on window',
        },
        {
          id: 'webpack-chunk-push',
          where: ['js'],
          re: /(self|window|globalThis)\.webpackChunk[\w$]*\s*=/,
          weight: STRONG,
          min: 5,
          max: 5,
          desc: 'self.webpackChunk* chunk registration (webpack 5)',
        },
        {
          id: 'webpack-data-attr',
          where: ['js', 'html'],
          str: 'data-webpack',
          weight: STRONG,
          min: 5,
          max: 5,
          desc: 'data-webpack attribute on injected <script>',
        },
        // webpack <= 4. seen: 4.47.0 -> (window.webpackJsonp=window.webpackJsonp||[]).push
        {
          id: 'webpack-jsonp',
          where: ['global'],
          re: /^webpackJsonp/,
          weight: STRONG,
          max: 4,
          desc: 'window.webpackJsonp chunk registry (webpack <=4)',
        },
        {
          id: 'webpack-jsonp-push',
          where: ['js'],
          re: /(self|window|globalThis)\.webpackJsonp[\w$]*\s*=/,
          weight: STRONG,
          max: 4,
          desc: 'window.webpackJsonp chunk registration (webpack <=4)',
        },
        {
          id: 'webpack-require',
          where: ['js'],
          str: '__webpack_require__',
          weight: MEDIUM,
          desc: '__webpack_require__ runtime (unminified)',
        },
        {
          id: 'webpack-public-path',
          where: ['js'],
          str: 'Automatic publicPath is not supported in this browser',
          weight: MEDIUM,
          desc: 'webpack runtime publicPath error string',
        },
        {
          id: 'webpack-chunk-load-error',
          where: ['js'],
          re: /Loading chunk \\?"?\s*\+|ChunkLoadError/,
          weight: WEAK,
          desc: 'webpack chunk-loading error scaffolding',
        },
        {
          id: 'webpack-hot',
          where: ['js', 'global'],
          re: /webpackHotUpdate/,
          weight: MEDIUM,
          dev: true,
          desc: 'webpack HMR runtime',
        },
      ],
    },

    {
      id: 'turbopack',
      name: 'Turbopack',
      color: '#e5426b',
      home: 'https://turbo.build/pack',
      rules: [
        // seen: Next.js 16.3.0 `next build --turbopack`
        {
          id: 'turbopack-global-push',
          where: ['js'],
          re: /globalThis\.TURBOPACK\s*(\|\||=)/,
          weight: STRONG,
          desc: 'globalThis.TURBOPACK chunk registry',
        },
        {
          id: 'turbopack-global',
          where: ['global'],
          re: /^TURBOPACK/,
          weight: STRONG,
          desc: 'TURBOPACK global on window',
        },
        {
          id: 'turbopack-consts',
          where: ['js'],
          re: /TURBOPACK_(ASSET_SUFFIX|NEXT_CHUNK_URLS|CHUNK_UPDATE)/,
          weight: STRONG,
          desc: 'Turbopack runtime constant',
        },
        {
          id: 'turbopack-context',
          where: ['js'],
          re: /__turbopack_(context|require|load|esm)__/,
          weight: STRONG,
          desc: '__turbopack_*__ module helper',
        },
      ],
    },

    {
      id: 'parcel',
      name: 'Parcel',
      color: '#e7a83e',
      home: 'https://parceljs.org',
      rules: [
        // seen: 2.16.4 -> globalThis.parcelRequirea61f
        {
          id: 'parcel-require-global',
          where: ['global'],
          re: /^parcelRequire/,
          weight: STRONG,
          desc: 'parcelRequire* module registry on window',
        },
        {
          id: 'parcel-require',
          where: ['js'],
          re: /(globalThis|window|self)\.parcelRequire[\w$]*/,
          weight: STRONG,
          min: 2,
          desc: 'globalThis.parcelRequire* registry (Parcel 2)',
        },
        {
          id: 'parcel-helpers',
          where: ['js'],
          re: /\$parcel\$(interopDefault|export|exportWildcard|global)/,
          weight: STRONG,
          min: 2,
          desc: '$parcel$ helper function',
        },
      ],
    },

    {
      id: 'esbuild',
      name: 'esbuild',
      color: '#ffcf00',
      home: 'https://esbuild.github.io',
      // Minified esbuild output renames these helpers, so this only fires on
      // unminified bundles. Never claimed with high confidence.
      rules: [
        {
          id: 'esbuild-helpers',
          where: ['js'],
          re: /var __(toESM|toCommonJS|commonJS|esm)\s*=/,
          weight: MEDIUM,
          desc: 'esbuild CommonJS interop helper (unminified)',
        },
        {
          id: 'esbuild-banner',
          where: ['js'],
          re: /bundled with esbuild|esbuild v\d/i,
          weight: MEDIUM,
          desc: 'esbuild banner comment',
        },
      ],
    },

    {
      id: 'rollup',
      name: 'Rollup',
      color: '#ef3335',
      home: 'https://rollupjs.org',
      // Plain Rollup ESM output carries no runtime at all, so Rollup is only
      // visible through its CommonJS interop helpers.
      rules: [
        {
          id: 'rollup-interop',
          where: ['js'],
          re: /_interop(NamespaceDefault|DefaultLegacy|Namespace|RequireDefault)\b/,
          weight: WEAK,
          desc: 'Rollup CommonJS interop helper',
        },
        {
          id: 'rollup-banner',
          where: ['js'],
          re: /\brollup(\.js)? v\d+\.\d+/i,
          weight: MEDIUM,
          desc: 'Rollup banner comment',
        },
      ],
    },
  ];

  /**
   * Relationships that would otherwise produce bogus "multiple bundlers"
   * verdicts. `absorbs` = when `id` is detected, fold the other tool's
   * evidence into it instead of reporting it separately.
   */
  const OVERLAPS = [
    {
      id: 'rspack',
      absorbs: ['webpack'],
      note: "Rspack ships a webpack-compatible runtime, so this page's webpack markers are attributed to Rspack.",
    },
    {
      id: 'vite',
      absorbs: ['rollup', 'esbuild'],
      note: 'Vite builds with Rollup and pre-bundles with esbuild, so their traces are attributed to Vite.',
    },
    {
      id: 'turbopack',
      absorbs: ['webpack'],
      note: 'Next.js serves some webpack-format chunks alongside Turbopack output.',
      // Only absorb when webpack's evidence is weak; a real dual setup keeps both.
      onlyIfWeaker: true,
    },
  ];

  const MIN_SCORE = 25; // below this we do not report at all

  function confidenceOf(score) {
    if (score >= 100) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  function matchRule(rule, text) {
    if (rule.str) {
      const i = text.indexOf(rule.str);
      return i === -1 ? null : { index: i, match: [rule.str] };
    }
    const m = rule.re.exec(text);
    return m ? { index: m.index, match: m } : null;
  }

  function snippet(text, index, len) {
    const start = Math.max(0, index - 24);
    const raw = text.slice(start, index + (len || 40) + 24);
    return (start > 0 ? '…' : '') + raw.replace(/\s+/g, ' ').trim() + '…';
  }

  /**
   * @param {object} input
   * @param {Array<{kind:string,label:string,text:string}>} input.sources
   *        kind is 'js' | 'html' | 'url'; label is shown to the user.
   * @param {string[]} [input.globals] names observed on the page's window
   * @returns {{detections: Array, notes: string[]}}
   */
  function analyze(input) {
    const sources = input.sources || [];
    const globals = input.globals || [];
    const hitsByBundler = new Map();

    const record = (bundler, rule, where, label, sample) => {
      let list = hitsByBundler.get(bundler.id);
      if (!list) hitsByBundler.set(bundler.id, (list = []));
      // Keep the first hit per rule, but remember how many files showed it.
      const existing = list.find((h) => h.rule === rule.id);
      if (existing) {
        existing.count++;
        return;
      }
      list.push({
        rule: rule.id,
        desc: rule.desc,
        where,
        label,
        sample,
        weight: rule.weight,
        min: rule.min,
        max: rule.max,
        exact: rule.exact ? rule.exact(sample.match) : undefined,
        dev: !!rule.dev,
        count: 1,
      });
    };

    for (const bundler of BUNDLERS) {
      for (const rule of bundler.rules) {
        // Text sources
        if (rule.where.some((w) => w !== 'global')) {
          for (const src of sources) {
            if (!rule.where.includes(src.kind)) continue;
            const hit = matchRule(rule, src.text);
            if (!hit) continue;
            record(bundler, rule, src.kind, src.label, {
              match: hit.match,
              text: snippet(src.text, hit.index, hit.match[0].length),
            });
          }
        }
        // window globals
        if (rule.where.includes('global')) {
          for (const name of globals) {
            const hit = matchRule(rule, name);
            if (!hit) continue;
            record(bundler, rule, 'global', 'window', {
              match: hit.match,
              text: 'window.' + name,
            });
          }
        }
      }
    }

    // Build detections
    let detections = [];
    for (const bundler of BUNDLERS) {
      const hits = hitsByBundler.get(bundler.id);
      if (!hits || !hits.length) continue;
      const score = hits.reduce((sum, h) => sum + h.weight, 0);
      if (score < MIN_SCORE) continue;

      const ctx = {
        hits,
        fileWithRule(ruleId) {
          const hit = hits.find((h) => h.rule === ruleId);
          if (!hit) return null;
          return sources.find((s) => s.label === hit.label) || null;
        },
      };
      const refined = bundler.refine ? bundler.refine(ctx) : null;

      detections.push({
        id: bundler.id,
        name: bundler.name,
        color: bundler.color,
        home: bundler.home,
        family: bundler.family,
        score,
        confidence: confidenceOf(score),
        version: summarizeVersion(hits, refined),
        mode: hits.some((h) => h.dev) && !hits.some((h) => !h.dev) ? 'dev' : 'build',
        evidence: hits
          .slice()
          .sort((a, b) => b.weight - a.weight)
          .map((h) => ({
            rule: h.rule,
            desc: h.desc,
            where: h.where,
            label: h.label,
            sample: h.sample.text,
            count: h.count,
          })),
      });
    }

    const notes = [];
    detections = applyOverlaps(detections, notes);
    detections.sort((a, b) => b.score - a.score);
    return { detections, notes };
  }

  function applyOverlaps(detections, notes) {
    const byId = new Map(detections.map((d) => [d.id, d]));
    const absorbed = new Set();
    for (const rel of OVERLAPS) {
      const primary = byId.get(rel.id);
      if (!primary || primary.confidence === 'low') continue;
      for (const otherId of rel.absorbs) {
        const other = byId.get(otherId);
        if (!other || absorbed.has(otherId)) continue;
        if (rel.onlyIfWeaker && other.score >= primary.score) continue;
        absorbed.add(otherId);
        primary.absorbed = (primary.absorbed || []).concat({
          id: other.id,
          name: other.name,
          version: other.version,
          evidence: other.evidence,
        });
        if (notes.indexOf(rel.note) === -1) notes.push(rel.note);
      }
    }
    return detections.filter((d) => !absorbed.has(d.id));
  }

  function summarizeVersion(hits, refined) {
    const exact = hits.find((h) => h.exact);
    if (exact) return { text: exact.exact, exact: true };

    let min = null;
    let max = null;
    for (const h of hits) {
      if (h.min != null) min = min == null ? h.min : Math.max(min, h.min);
      if (h.max != null) max = max == null ? h.max : Math.min(max, h.max);
    }
    if (refined) {
      if (refined.min != null) min = min == null ? refined.min : Math.max(min, refined.min);
      if (refined.max != null) max = max == null ? refined.max : Math.min(max, refined.max);
    }
    // Contradictory bounds mean the page mixes builds; fall back to the lower one.
    if (min != null && max != null && min > max) max = null;

    if (min != null && max != null) {
      return { text: min === max ? String(min) : `${min} – ${max}`, exact: false };
    }
    if (min != null) return { text: `≥ ${min}`, exact: false };
    if (max != null) return { text: `≤ ${max}`, exact: false };
    return null;
  }

  return { BUNDLERS, OVERLAPS, analyze, MIN_SCORE };
});

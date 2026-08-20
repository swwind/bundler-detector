'use strict';
/**
 * Bundler signatures.
 *
 * Every rule was derived by building a fixture app with the real tool and
 * reading the production output. The `seen` comment on a rule records the
 * version(s) the pattern was actually observed in. See test/fixtures/.
 *
 * Rule fields:
 *   where   source kinds to test: 'js' | 'html' | 'url' | 'dom' | 'prop' | 'global'
 *   str     plain substring (fast path)
 *   re      regular expression
 *   all     every substring must appear in the same source
 *   min/max inclusive major-version bounds implied by a match
 *   exact   fn(match) -> version string read straight out of the page
 *   dev     match indicates a dev server rather than a production build
 */
(function (root) {
  const STRONG = 100;
  const MEDIUM = 55;
  const WEAK = 25;
  const list = (root.StackSignatures = root.StackSignatures || []);
  const relations = (root.StackRelations = root.StackRelations || []);

  list.push(
    {
      id: 'vite',
      name: 'Vite',
      category: 'bundler',
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
      category: 'bundler',
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
          where: ['js', 'html', 'dom'],
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
      category: 'bundler',
      color: '#8dd6f9',
      home: 'https://webpack.js.org',
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
          where: ['js', 'html', 'dom'],
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
      category: 'bundler',
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
      category: 'bundler',
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
      category: 'bundler',
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
      category: 'bundler',
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
    }
  );

  relations.push(
    {
      id: 'rspack',
      builtOn: ['webpack'],
      note: "Rspack ships a webpack-compatible runtime, so this page's webpack markers are attributed to Rspack.",
    },
    {
      id: 'vite',
      builtOn: ['rollup', 'esbuild'],
      note: 'Vite builds with Rollup and pre-bundles with esbuild, so their traces are attributed to Vite.',
    },
    {
      id: 'turbopack',
      builtOn: ['webpack'],
      note: 'Next.js serves some webpack-format chunks alongside Turbopack output.',
      // Only absorb when webpack's evidence is weak; a real dual setup keeps both.
      onlyIfWeaker: true,
    }
  );

  if (typeof module === 'object' && module.exports) module.exports = list;
})(typeof globalThis !== 'undefined' ? globalThis : self);

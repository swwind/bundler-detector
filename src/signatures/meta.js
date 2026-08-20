'use strict';
/**
 * Meta-framework signatures.
 *
 * These sit on top of a UI framework *and* a bundler: Next.js is React plus
 * webpack or Turbopack, Nuxt is Vue plus Vite. Both of those are intrinsic, so
 * the relations at the bottom of this file fold them into the meta-framework
 * rather than reporting three findings for one decision.
 *
 * Loaded after bundlers.js and frameworks.js so the technologies read in
 * priority order, but the engine sorts relations itself -- see applyRelations.
 */
(function (root) {
  const STRONG = 100;
  const MEDIUM = 55;
  const list = (root.StackSignatures = root.StackSignatures || []);
  const relations = (root.StackRelations = root.StackRelations || []);

  list.push(
    {
      id: 'next',
      name: 'Next.js',
      category: 'meta-framework',
      color: '#0070f3',
      home: 'https://nextjs.org',
      rules: [
        // window.next.version is the exact release, which almost nothing else
        // in this file can offer. seen: react.dev (15.1.12), nextjs.org (16.3.1-canary.24)
        {
          id: 'next-global',
          where: ['global'],
          re: /^next$/,
          weight: STRONG,
          desc: 'window.next runtime object',
        },
        {
          id: 'next-data-globals',
          where: ['global'],
          re: /^(__NEXT_DATA__|__NEXT_P|__next_f|__BUILD_MANIFEST|__SSG_MANIFEST|NEXT_DEPLOYMENT_ID|__next_set_public_path__)$/,
          weight: STRONG,
          desc: '__NEXT_DATA__ / __next_f page payload on window',
        },
        // The App Router streams its payload through self.__next_f.push.
        {
          id: 'next-flight-push',
          where: ['js', 'html'],
          re: /(self|window)\.__next_f\s*(\.push|=)/,
          weight: STRONG,
          min: 13,
          desc: 'self.__next_f flight payload push (App Router)',
        },
        {
          id: 'next-asset-url',
          where: ['url', 'html'],
          str: '/_next/static/',
          weight: STRONG,
          desc: '/_next/static/ build asset directory',
        },
        // Next names its webpack chunk registry after the app, always _N_E.
        // seen: react.dev
        {
          id: 'next-chunk-global',
          where: ['global', 'js'],
          re: /webpackChunk_N_E|(^|\W)_N_E($|\W)/,
          weight: STRONG,
          desc: 'webpackChunk_N_E chunk registry',
        },
        {
          id: 'next-router-script',
          where: ['dom', 'html'],
          re: /\bdata-nscript|\bdata-next-hide-fouc/,
          weight: MEDIUM,
          desc: 'data-nscript attribute on a next/script tag',
        },
      ],
    },

    {
      id: 'nuxt',
      name: 'Nuxt',
      category: 'meta-framework',
      color: '#00dc82',
      home: 'https://nuxt.com',
      rules: [
        // seen: nuxt.com
        {
          id: 'nuxt-globals',
          where: ['global'],
          re: /^(__NUXT__|useNuxtApp|__buildAssetsURL|__publicAssetsURL|__NUXT_PATHS__)$/,
          weight: STRONG,
          desc: '__NUXT__ / useNuxtApp runtime global',
        },
        {
          id: 'nuxt-asset-url',
          where: ['url', 'html'],
          str: '/_nuxt/',
          weight: STRONG,
          desc: '/_nuxt/ build asset directory',
        },
        {
          id: 'nuxt-payload',
          where: ['js', 'html'],
          re: /window\.__NUXT__|__NUXT_DATA__/,
          weight: STRONG,
          desc: 'window.__NUXT__ hydration payload',
        },
        // Nuxt 2's vue-meta wrote this on every tag it managed.
        {
          id: 'nuxt2-head-attr',
          where: ['dom', 'html'],
          str: 'data-n-head',
          weight: STRONG,
          max: 2,
          desc: 'data-n-head attribute (Nuxt 2)',
        },
        {
          id: 'nuxt-root-id',
          where: ['dom', 'html'],
          re: /\bid="__nuxt"/,
          weight: MEDIUM,
          desc: 'id="__nuxt" application root',
        },
      ],
    },

    {
      id: 'sveltekit',
      name: 'SvelteKit',
      category: 'meta-framework',
      color: '#ff3e00',
      home: 'https://svelte.dev/docs/kit',
      rules: [
        // seen: svelte.dev -> __sveltekit_1gw33p1
        {
          id: 'sveltekit-global',
          where: ['global'],
          re: /^__sveltekit_/,
          weight: STRONG,
          // Its `version` is the build id, not a SvelteKit release.
          noVersion: true,
          desc: '__sveltekit_… hydration state on window',
        },
        {
          id: 'sveltekit-asset-url',
          where: ['url', 'html'],
          str: '/_app/immutable/',
          weight: STRONG,
          desc: '/_app/immutable/ build asset directory',
        },
        {
          id: 'sveltekit-data-attrs',
          where: ['dom', 'html'],
          re: /\bdata-sveltekit-(preload-data|preload-code|reload|noscroll|replacestate)\b/,
          weight: STRONG,
          desc: 'data-sveltekit-preload-data link attribute',
        },
        {
          id: 'sveltekit-kit-start',
          where: ['js', 'html'],
          re: /__sveltekit_[\w$]+\s*=|kit\.start\(/,
          weight: MEDIUM,
          desc: 'SvelteKit start() bootstrap script',
        },
      ],
    },

    {
      id: 'remix',
      name: 'Remix / React Router',
      category: 'meta-framework',
      color: '#3992ff',
      home: 'https://remix.run',
      rules: [
        {
          id: 'remix-globals',
          where: ['global'],
          re: /^__remix(Context|Manifest|RouteModules|Router)$/,
          weight: STRONG,
          desc: '__remixContext hydration payload on window',
        },
        // React Router 7 is Remix's framework mode under a new name.
        {
          id: 'react-router-globals',
          where: ['global'],
          re: /^__reactRouter(Context|Manifest|RouteModules|Version)$/,
          weight: STRONG,
          min: 7,
          desc: '__reactRouterContext hydration payload (React Router 7)',
        },
        {
          id: 'remix-payload',
          where: ['js', 'html'],
          re: /window\.__remixContext|window\.__reactRouterContext/,
          weight: STRONG,
          desc: 'window.__remixContext bootstrap assignment',
        },
        // seen: remix.run (Remix 3 beta)
        {
          id: 'remix-dom-attr',
          where: ['dom', 'html'],
          re: /\brmx-[a-z-]+[="]/,
          weight: MEDIUM,
          desc: 'rmx-… attribute in the markup',
        },
      ],
    },

    {
      id: 'gatsby',
      name: 'Gatsby',
      category: 'meta-framework',
      color: '#663399',
      home: 'https://gatsbyjs.com',
      rules: [
        // seen: gatsbyjs.com -> <meta name="generator" content="Gatsby 4.24.6">
        {
          id: 'gatsby-generator',
          where: ['html'],
          re: /content=["']Gatsby v?([0-9][\w.+-]*)["']/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '<meta name="generator" content="Gatsby …">',
        },
        {
          id: 'gatsby-globals',
          where: ['global'],
          re: /^(___loader|___emitter|___chunkMapping|___webpackCompilationHash|___navigate|asyncRequires)$/,
          weight: STRONG,
          desc: '___loader / ___chunkMapping runtime global',
        },
        {
          id: 'gatsby-page-data',
          where: ['url', 'js'],
          str: '/page-data/',
          weight: MEDIUM,
          desc: '/page-data/ route payload request',
        },
        {
          id: 'gatsby-root-id',
          where: ['dom', 'html'],
          re: /\bid="___gatsby"/,
          weight: STRONG,
          desc: 'id="___gatsby" application root',
        },
      ],
    },

    {
      id: 'docusaurus',
      name: 'Docusaurus',
      category: 'meta-framework',
      color: '#25c2a0',
      home: 'https://docusaurus.io',
      rules: [
        // seen: docusaurus.io -> <meta name="generator" content="Docusaurus v3.10.1">
        {
          id: 'docusaurus-generator',
          where: ['html'],
          re: /content=["']Docusaurus v?([0-9][\w.+-]*)["']/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '<meta name="generator" content="Docusaurus …">',
        },
        {
          id: 'docusaurus-global',
          where: ['global'],
          re: /^(docusaurus|docusaurusRoot)$/,
          weight: STRONG,
          desc: 'window.docusaurus prefetch API',
        },
        {
          id: 'docusaurus-root-id',
          where: ['dom', 'html'],
          re: /\bid="__docusaurus/,
          weight: STRONG,
          desc: 'id="__docusaurus" application root',
        },
      ],
    },

    {
      id: 'vitepress',
      name: 'VitePress',
      category: 'meta-framework',
      color: '#5c73e7',
      home: 'https://vitepress.dev',
      rules: [
        // seen: vuejs.org, vitepress.dev -> "VitePress v2.0.0-alpha.17"
        {
          id: 'vitepress-generator',
          where: ['html'],
          re: /content=["']VitePress v?([0-9][\w.+-]*)["']/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '<meta name="generator" content="VitePress …">',
        },
        {
          id: 'vitepress-globals',
          where: ['global'],
          re: /^(__VITEPRESS__|__VP_HASH_MAP__|__VP_SITE_DATA__)$/,
          weight: STRONG,
          desc: '__VP_HASH_MAP__ / __VITEPRESS__ runtime global',
        },
        {
          id: 'vitepress-app-id',
          where: ['dom', 'html'],
          re: /\bid="VPContent\b|\bclass="VPDoc\b/,
          weight: MEDIUM,
          desc: 'VPContent / VPDoc default-theme element',
        },
      ],
    },

    {
      id: 'rspress',
      name: 'Rspress',
      category: 'meta-framework',
      color: '#0095ff',
      home: 'https://rspress.rs',
      rules: [
        // seen: rspress.rs and rspack.rs (2.0.19), modernjs.dev (2.0.13),
        // v1.rspress.rs (1.47.2) -- every Rspress build stamps this.
        {
          id: 'rspress-generator',
          where: ['html'],
          re: /content=["']Rspress v?([0-9][\w.+-]*)["']/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '<meta name="generator" content="Rspress …">',
        },
        // Rspress 2 renamed the app root and added a modal container beside it.
        // 1.x rendered into a plain #root, which is nobody's evidence.
        // seen: 2.0.19, modernjs.dev
        {
          id: 'rspress-root-id',
          where: ['dom', 'html'],
          re: /\bid="__rspress_(root|modal_container)"/,
          weight: STRONG,
          min: 2,
          desc: 'id="__rspress_root" application root (Rspress 2)',
        },
        // The one default-theme class both majors write: 1.x named everything
        // rspress-*, 2.0 moved to rp-* but kept rspress-doc on the article.
        // seen: 1.47.2 (rspress-nav, rspress-doc), 2.0.19 ("rp-doc rspress-doc")
        {
          id: 'rspress-theme-class',
          where: ['dom', 'html'],
          re: /\brspress-(doc|nav|sidebar|logo|mobile-hamburger)\b/,
          weight: MEDIUM,
          desc: 'rspress-doc / rspress-nav default-theme class',
        },
        // The appearance script Rspress inlines into <head> so the theme is
        // settled before first paint. seen: 1.47.2, 2.0.19
        {
          id: 'rspress-theme-storage',
          where: ['js', 'html'],
          str: 'rspress-theme-appearance',
          weight: STRONG,
          desc: "localStorage 'rspress-theme-appearance' theme script",
        },
      ],
    },

    {
      id: 'astro',
      name: 'Astro',
      category: 'meta-framework',
      color: '#f041ff',
      home: 'https://astro.build',
      rules: [
        // <meta name="generator" content={Astro.generator}>, which most
        // templates keep. seen: 7.2.1, astro.build
        {
          id: 'astro-generator',
          where: ['html'],
          re: /content=["']Astro v([0-9][\w.+-]*)["']/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: '<meta name="generator" content="Astro v…">',
        },
        // Default build.assets directory. The one marker a zero-JS Astro page
        // still has: it shows up on the stylesheet <link> alone. seen: 7.2.1
        {
          id: 'astro-assets-dir',
          where: ['html', 'url'],
          str: '/_astro/',
          weight: STRONG,
          desc: '/_astro/ build asset directory',
        },
        {
          id: 'astro-island-element',
          where: ['html'],
          re: /<astro-island[\s>]/,
          weight: STRONG,
          desc: '<astro-island> hydration wrapper in the markup',
        },
        // The island runtime is inlined into the page, so it arrives as an
        // inline script rather than a fetched file. seen: 7.2.1
        {
          id: 'astro-island-runtime',
          where: ['js', 'html'],
          re: /customElements\.(define|get)\(\s*["'`]astro-island["'`]/,
          weight: STRONG,
          desc: 'customElements.define("astro-island") runtime',
        },
        {
          id: 'astro-island-attrs',
          where: ['js', 'html'],
          re: /component-url|renderer-url|before-hydration-url/,
          weight: MEDIUM,
          desc: 'astro-island component-url/renderer-url attribute',
        },
        // ClientRouter (view transitions). seen: 7.2.1
        {
          id: 'astro-lifecycle-events',
          where: ['js', 'html'],
          re: /astro:(page-load|before-swap|after-swap|before-preparation|after-preparation|hydrate)/,
          weight: STRONG,
          desc: 'astro:* lifecycle event',
        },
        {
          id: 'astro-transitions-meta',
          where: ['js', 'html'],
          str: 'astro-view-transitions-enabled',
          weight: STRONG,
          desc: 'astro-view-transitions-enabled marker',
        },
        {
          id: 'astro-slot',
          where: ['js', 'html'],
          re: /["'`]astro-(static-)?slot["'`]/,
          weight: MEDIUM,
          desc: '<astro-slot> lookup in the renderer',
        },
        {
          id: 'astro-cid-attr',
          where: ['dom', 'html'],
          re: /\bdata-astro-(cid|transition|source)[-="]/,
          weight: STRONG,
          desc: 'data-astro-cid-… scoped-style attribute',
        },
        {
          id: 'astro-global',
          where: ['global'],
          re: /^Astro$/,
          weight: MEDIUM,
          desc: 'window.Astro client-directive registry',
        },
        {
          id: 'astro-dev-toolbar',
          where: ['js', 'html'],
          re: /astro-dev-toolbar|astro-dev-overlay/,
          weight: STRONG,
          dev: true,
          desc: 'Astro dev toolbar',
        },
        {
          id: 'astro-dev-scripts',
          where: ['js', 'html', 'url'],
          str: 'astro:scripts/',
          weight: STRONG,
          dev: true,
          desc: 'astro:scripts/ dev server virtual module',
        },
      ],
    }
  );

  /**
   * A meta-framework *is* its UI framework and ships its bundler, so both are
   * folded into it. Astro is the exception on the UI side: its islands can be
   * React, Vue, Svelte or nothing at all, so whatever is found there is a real
   * finding and stays its own card.
   */
  relations.push(
    {
      id: 'next',
      builtOn: ['react', 'turbopack', 'webpack'],
      note: 'Next.js is a React framework and ships its own bundler, so those markers are attributed to Next.js.',
    },
    {
      id: 'nuxt',
      builtOn: ['vue', 'vite', 'webpack', 'rollup', 'esbuild'],
      note: 'Nuxt is a Vue framework and bundles with Vite, so those markers are attributed to Nuxt.',
    },
    {
      id: 'sveltekit',
      builtOn: ['svelte', 'vite', 'rollup', 'esbuild'],
      note: 'SvelteKit is a Svelte framework and bundles with Vite, so those markers are attributed to SvelteKit.',
    },
    {
      id: 'remix',
      builtOn: ['react', 'vite', 'rollup', 'esbuild'],
      note: 'Remix is a React framework and bundles with Vite, so those markers are attributed to Remix.',
    },
    {
      id: 'gatsby',
      builtOn: ['react', 'webpack'],
      note: 'Gatsby is a React framework and bundles with webpack, so those markers are attributed to Gatsby.',
    },
    {
      id: 'docusaurus',
      builtOn: ['react', 'webpack', 'rspack'],
      note: 'Docusaurus is a React site generator and bundles with webpack or Rspack, so those markers are attributed to Docusaurus.',
    },
    {
      id: 'vitepress',
      builtOn: ['vue', 'vite', 'rollup', 'esbuild'],
      note: 'VitePress is a Vue site generator built on Vite, so those markers are attributed to VitePress.',
    },
    {
      id: 'rspress',
      builtOn: ['react', 'rspack', 'webpack', 'remix'],
      note: 'Rspress is a React site generator built on Rsbuild/Rspack and routed by React Router, so those markers are attributed to Rspress.',
    },
    {
      id: 'astro',
      builtOn: ['vite', 'rollup', 'esbuild'],
      note: 'Astro builds with Vite, so the Vite/Rollup/esbuild markers on this page are attributed to Astro. Its islands are reported separately.',
    }
  );

  if (typeof module === 'object' && module.exports) module.exports = list;
})(typeof globalThis !== 'undefined' ? globalThis : self);

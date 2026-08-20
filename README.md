# Stack Detector

A Firefox and Chrome extension that works out what the page you are looking at
was built with — the framework, the UI library and the bundler — and turns the
toolbar icon into that project's logo.

- A Next.js site → the Next.js mark.
- A Vue SPA on Vite → the Vue mark, with Vite in the popup.
- Built with Rspack and nothing else recognisable → the Rspack crab.
- Two rival frameworks on one page → 😈, and the popup lists everything.

Click the icon for the details: what was found, which version (as precisely as
the page allows), what it was built on, and the exact byte patterns that led to
that conclusion.

![The extension on anthropic.com: the toolbar icon has become the jQuery mark,
and the popup reads "jQuery v3.5.1 - with Rspack", listing jQuery under UI
LIBRARY and Rspack v1.3.9 under BUNDLER with a webpack 5 chip folded into it,
both with high confidence and evidence to unfold](example.png)

Not on any store — clone it and load it yourself.

## Build

Needs Node 20+. There is nothing to install: the build only copies files and
picks the right manifest.

```sh
git clone https://github.com/swwind/stack-detector.git
cd stack-detector
npm run build
```

That writes two loadable folders:

```
dist/chrome     manifest with a service-worker background
dist/firefox    manifest with an event-page background + a gecko id
```

They share every line of code and differ only in the manifest.

## Install in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the `dist/chrome` folder

The icon appears straight away and survives restarts. Chrome shows a
*"Disable developer mode extensions"* warning on startup — that is the normal
nag for any unpacked extension.

Click the puzzle-piece icon and pin *Stack Detector* so the logo stays visible
in the toolbar, which is rather the point of it.

After changing the source, run `npm run build` again and press **reload** ↻ on
the extension's card.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Pick `dist/firefox/manifest.json` (the file, not the folder)

Then **grant site access**, or it will detect much less: Firefox MV3 makes host
permissions opt-in, so until you allow it the extension can read the page but
never the script files themselves.

- Click the puzzle-piece icon → the gear next to *Stack Detector* → **Always
  Allow on All Sites**
- Or `about:addons` → Stack Detector → **Permissions** → *Access your data for
  all websites*

**Temporary add-ons disappear when Firefox restarts.** Loading it again is the
same three steps. A permanent install would need the add-on signed by Mozilla.

## Check it works

Visit a few sites and watch the icon:

| Site | Expected |
| --- | --- |
| <https://nextjs.org> | Next.js, built on React + Turbopack |
| <https://vuejs.org> | VitePress, built on Vue + Vite |
| <https://angular.dev> | Angular 22.1.3 |
| <https://svelte.dev> | SvelteKit, built on Svelte 5 + Vite |
| <https://jquery.com> | jQuery 4.0.0 |
| <https://stackoverflow.com> | Svelte 5, with jQuery, Stimulus and webpack |

Those are the verdicts it actually produced when run against the live sites.

## What it detects

Three categories, in the order they claim the icon: a **framework** says more
about a page than the **UI library** underneath it, which says more than the
**bundler** underneath that.

### Frameworks

| | Recognised by | Version |
| --- | --- | --- |
| **Next.js** | `window.next`, `__NEXT_DATA__`, `self.__next_f`, `/_next/static/`, the `webpackChunk_N_E` registry | **exact**, off `window.next.version` |
| **Nuxt** | `useNuxtApp`, `__NUXT__`, `__buildAssetsURL`, `/_nuxt/` | none |
| **SvelteKit** | `__sveltekit_…`, `/_app/immutable/`, `data-sveltekit-preload-data` | none |
| **Astro** | `<astro-island>` and its runtime, `astro:page-load`, `/_astro/`, `data-astro-cid-…` | **exact** from the generator meta tag |
| **Gatsby** | `___loader`, `___chunkMapping`, `id="___gatsby"`, `/page-data/` | **exact** from the generator meta tag |
| **Docusaurus** | `window.docusaurus`, `id="__docusaurus"` | **exact** from the generator meta tag |
| **VitePress** | `__VITEPRESS__`, `__VP_HASH_MAP__` | **exact** from the generator meta tag |
| **Rspress** | `id="__rspress_root"` (2.x), the `rspress-doc`/`rspress-nav` theme classes, the `rspress-theme-appearance` script | **exact** from the generator meta tag |
| **Remix** | `__remixContext`; Remix 3's `rmx-…`/`data-remix-…` attributes, `rmxc-…` classes and `@remix-run/ui` requests | **exact** for Remix 3, off the asset path |

### UI libraries

| | Recognised by | Version |
| --- | --- | --- |
| **React** | `__reactFiber$…` / `__reactProps$…` on DOM nodes, `_reactListening…`, the minified error-decoder URL | major only, from the decoder URL moving to `react.dev` in 19 |
| **Preact** | the mangled `__k`/`__c`/`__e`/`__b` vnode internals, `__k` on DOM nodes, `window.preact` | none |
| **Vue** | `__vue_app__` and `_vnode` on DOM nodes, `__VUE__`, `__v_isVNode`, `__vccOpts`, `data-v-…` | 2 vs 3; exact from a dev-build banner |
| **Angular** | `ng-version` on the root element, `__ngContext__`, `_nghost-`/`_ngcontent-`, `ɵcmp` | **exact**, off `ng-version` |
| **AngularJS** | `window.angular`, `ng-app`/`ng-controller`, the `ng-scope` class | **exact**, off `angular.version.full` |
| **Svelte** | `window.__svelte`, `svelte.dev/e/…` error URLs, `svelte-…` scoped classes | **major**, off `__svelte.v` |
| **Solid** | `_$DX_DELEGATE`, `$$click`-style handlers on DOM nodes | none |
| **Qwik** | `q:container` / `q:version` attributes, `_qc_`, `window.qwikevents` | **exact**, off `q:version` |
| **Lit** | `litElementVersions` on window, `$lit$` template markers | **exact**, off `litElementVersions` |
| **Alpine.js** | `window.Alpine`, `_x_…` on DOM nodes, `x-data`/`x-show` | **exact**, off `Alpine.version` |
| **htmx** | `window.htmx`, `hx-get`/`hx-boost` attributes | **exact**, off `htmx.version` |
| **jQuery** | `window.jQuery`, the `jQuery<digits>` data expando, the banner comment | **exact** |
| **Stimulus** | `window.Stimulus`, `data-controller` | none |
| **Ember.js** | `EmberENV`, `__ember_auto_import__`, the `ember-view` class | none |
| **Backbone.js** | `window.Backbone` | **exact**, off `Backbone.VERSION` |
| **Knockout** | `window.ko`, `__ko__` on DOM nodes | **exact**, off `ko.version` |

### Bundlers

| | Recognised by | Version |
| --- | --- | --- |
| **Vite** | `vite:preloadError`, `Unable to preload CSS for`, `__vite__mapDeps`, the `<script type="module" crossorigin src="/assets/…">` entry tag | major, narrowed to a range |
| **webpack** | `self.webpackChunk*` (v5), `window.webpackJsonp` (≤4), `data-webpack`, `__webpack_require__` | major only |
| **Rspack** | `self.rspackChunk*` and `data-rspack` (≥2), `__rspack_esm_id`/`__rspack_esm_ids` in ESM chunks (≥2), or the `ruid="bundler=rspack@x.y.z"` stamp (1.x) | **exact on 1.x**, `≥ 2` otherwise |
| **Turbopack** | `globalThis.TURBOPACK`, `TURBOPACK_ASSET_SUFFIX`, `__turbopack_context__` | not exposed |
| **Parcel** | `globalThis.parcelRequire*`, `$parcel$` helpers | major |
| **esbuild** | `__toESM` / `__commonJS` / `__esm` interop helpers | not exposed |
| **Rollup** | `_interopNamespaceDefault` and friends | not exposed |

Dev servers are recognised too (`/@vite/client`, `webpackHotUpdate`,
`rspackHotUpdate`, `__VUE_HMR_RUNTIME__`, `__svelte_meta`) and marked with a
**dev server** pill.

## How it works

A page yields *facts*; the signature files decide what those facts mean. Nothing
in the matching engine knows what React or webpack is.

Five kinds of fact get collected:

| Fact | Where from | What it catches |
| --- | --- | --- |
| `js` | every `<script src>` and `<link rel=modulepreload>` the HTML names, fetched by the background worker | bundler runtimes, error strings, framework internals |
| `html` | the page's `<script>`, `<link>` and `<meta>` tags | generator stamps, entry-tag shapes |
| `dom` | every distinct attribute and class in the document | `ng-version`, `q:version`, `x-data`, `data-v-…`, `svelte-…` |
| `prop` | own properties of DOM nodes | `__reactFiber$…`, `__vue_app__`, `__ngContext__`, `_x_dataStack` |
| `global` | properties the page added to `window` | `webpackChunk*`, `__VUE__`, `jQuery`, `next` |

The last two need the page's own JavaScript context, which an isolated content
script cannot reach — that is what `src/content-main.js` is for.

**Page-defined globals are found by subtraction.** Rather than a list of names
worth looking for, the MAIN-world script creates a hidden same-origin
`about:blank` iframe and subtracts *its* `window` properties from the real one.
What is left is exactly what the page added, in that browser, at that version.
Any framework that puts a name on `window` is visible whether or not anyone
thought to add it to a list.

**DOM expando properties are free for the same reason.** A DOM element normally
has no own properties at all — everything real lives on the prototype — so
anything found there was put there by script. React's `__reactFiber$…`, Vue's
`__vue_app__` and Angular's `__ngContext__` all fall out of one generic sweep.

**Versions come from six shapes.** Reading a version means touching page objects,
so the MAIN-world script tries `.version` (React, Vue, Alpine, htmx, Next),
`.VERSION` (Backbone), `.version.full` (AngularJS), `.fn.jquery` (jQuery), the
first entry of an array (Lit's `litElementVersions`) and `.v` as a `Set`
(Svelte's `window.__svelte`). A result only counts if it looks like a version —
which is what stops SvelteKit's build id, a 13-digit timestamp sitting in a
property called `version`, being reported as a release.

### Built on

Next.js *is* React and ships webpack or Turbopack. Reporting all three as
separate findings would be technically true and useless, so a meta-framework
absorbs what is intrinsic to it and the popup shows those as chips under the
card, evidence and all.

Only intrinsic relationships are folded in. React on webpack is a *choice*, not
a fact about React, so those stay two findings — and Astro keeps its islands
separate, because an Astro island can be React, Vue, Svelte or nothing at all.

### Conflicts

Two findings in the same category — two bundlers, or two rival frameworks — get
the devil icon. Libraries that legitimately live alongside anything (jQuery,
Lit, Alpine, htmx, Stimulus, Backbone, Knockout) are exempt: jQuery next to
React is a normal Tuesday, not a contradiction.

## Caveats worth knowing

- **jQuery never takes the icon.** It is on a large share of the web and is
  hardly ever the most interesting thing about a page, so anything else found
  beside it wins. Everything else sorts on the weight of its evidence, which is
  what puts Alpine ahead of the Preact-based search widget on alpinejs.dev.
- **Rspack ≤ 1.x is webpack, byte for byte.** Rspack ships a deliberately
  webpack-compatible runtime: 0.7 and 1.x emit `webpackChunk*` and
  `data-webpack` exactly like webpack 5. The `ruid` stamp rescues 1.0+, but an
  Rspack 0.x site is reported as webpack 5 and there is no signal to do better.
  Rspack 2's ESM chunks are the opposite case: no chunk global and no
  `data-rspack`, just the exported `__rspack_esm_id`/`__rspack_esm_ids` names —
  which is what makes them worth matching on their own.
- **Alpine vendors Vue's reactivity package**, so `__v_isRef` and `__v_isReactive`
  appear in Alpine bundles. Vue is matched on `__v_isVNode` instead, which lives
  in `runtime-core` and only ships with a real Vue app.
- **A widget counts.** Algolia DocSearch is built with Preact and Builder.io
  embeds React, so sites carrying either really do have that library on the
  page. The popup says so; it does not claim the site was written in it.
- **A zero-JS Astro page rests on one marker.** With no islands and no client
  router there is no runtime to find; the `/_astro/` stylesheet link is the only
  evidence left. Change `build.assets` and the page becomes undetectable.
- **Minified Rollup and esbuild output is undetectable.** Neither adds a runtime
  to a plain ESM bundle, and minification renames esbuild's interop helpers. A
  silent result is the honest one.
- Only the first 256 KB and the last 256 KB of each script are searched. Bundler
  markers live at both ends — chunks register themselves on the first line, and
  webpack and Rspack put the runtime at the end of the entry chunk — so the
  middle is application code that costs time and yields nothing.
- Only scripts the HTML names are read: every `<script src>` and every
  `<link rel="modulepreload">`, with no cap on how many. Chunks the page pulls
  in later via `import()` are not chased. The modulepreload half is load-
  bearing, not thoroughness for its own sake — VitePress ships an almost empty
  entry `<script>` and puts the Vite runtime behind a modulepreload, so
  dropping it makes vuejs.org and vite.dev undetectable.
- The iframe used to enumerate built-in globals is created, read and removed
  synchronously at `document_idle`. On a page with a `frame-src` CSP that
  forbids it, the script falls back to prefix-matching a fixed list of names —
  less complete, never wrong.
- The page can, in principle, forge the `postMessage` that carries globals and
  DOM properties to the extension. The worst it achieves is a wrong icon; the
  script contents the background reads are unaffected.

## Development

```sh
npm test             # match the engine against real bundle output and real pages
npm run build        # assemble dist/chrome and dist/firefox
npm run validate     # check both builds are loadable
npm run icons        # re-render icons/src/* to icons/*.png
```

`test/fixtures/` holds two kinds of fixture, both real:

- **bundle fixtures** — production output of one small app (an entry module, a
  dynamic import and a CSS import) built with Vite 2 through 8, webpack 4 and 5,
  Rspack 1.x and 2.x, Turbopack, Parcel, Rollup and esbuild; plus each UI
  framework's own Vite starter template, and each site generator's own starter
  docs site, built and rendered.
- **page fixtures** — `page.json`, the exact facts the content scripts harvest,
  captured from a real page in a real browser. Each one keeps the *whole*
  harvest, analytics noise included, so a rule that fires on somebody's tag
  manager fails the test rather than shipping.

`npm test` asserts the technology, the version string, what was folded into what
and that nothing else was reported, so a rule that stops matching real output —
or starts matching something it should not — fails loudly.

### Layout

```
src/engine.js           matching engine: scoring, relations, versions (pure, runs under Node)
src/signatures/         the rule tables — bundlers, frameworks, meta-frameworks
src/content-main.js     MAIN-world script: page globals and DOM expando properties
src/content.js          isolated script: markup, attributes, inline scripts, script URLs
src/background.js       fetches scripts, matches, swaps the icon
src/popup.*             the dialog
tools/                  build, validate, icon rendering, PNG resizing
test/run.mjs            engine tests against committed bundle output and page captures
```

The Firefox add-on id in `manifest.firefox.json` is still
`stack-detector@swwind`. It is an identity, not a name: changing it would make
Firefox treat this as a different add-on and lose every existing install.

### CI

`.github/workflows/ci.yml` runs the signature tests, builds both targets and
checks they are loadable. That is the whole of it.

### Adding a technology

1. Look at something real and read what it leaves behind. Guessed patterns are
   worse than no patterns.
2. Add an entry to the right file in `src/signatures/`, with `seen:` noting what
   you checked it against. Set `category`, and add a relation at the bottom of
   the file if it is built on something else.
3. Put the project's own logo in as `icons/src/<id>.svg` (or `.png` if that is
   all they publish) and run `npm run icons`, which writes `icons/<id>.png` at
   128 px. That one file is what the repo keeps; `npm run build` derives the
   toolbar's 48, 32 and 16 from it. A technology with no source file falls back to a lettermark on its
   own `color` so the toolbar never shows the *wrong* logo, but that is a
   placeholder, not a finished icon.
4. Add a fixture under `test/fixtures/<id>/` — a build, a `page.json` capture, or
   both — and a case in `test/run.mjs`.

Nothing else needs touching: the icon list, the popup's category groups and the
build validator all read the signature registry.

## Icon credits

Most icons are the projects' own artwork:

Every icon is the project's own artwork.

| Icon | Source |
| --- | --- |
| vite, webpack, parcel, rollup, esbuild, react, vue, angular, svelte, next, nuxt, gatsby, ember, qwik, remix | [material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT) |
| solid, lit, preact, docusaurus, vitepress, stimulus | the project's own published SVG — solidjs.com, lit.dev (the `flame` symbol out of its full lockup), the preactjs.com branding assets, docusaurus.io, vitepress.dev, stimulus.hotwired.dev |
| jquery, alpine, htmx, angularjs, backbone | [devicon](https://github.com/devicons/devicon) (MIT) — those five publish a wide wordmark as their own asset, and devicon carries the square symbol from the same logo |
| rspack | the site favicon, `https://assets.rspack.rs/rspack/favicon-128x128.png` |
| turbopack | the Turbo mark from the [vercel/turborepo](https://github.com/vercel/turborepo) README |
| astro | the mark from `https://astro.build/favicon.svg` |
| knockout | the [Knockout organisation](https://github.com/knockout) avatar on GitHub — the same script K as their favicon, at 460 px instead of 16 |
| sveltekit | the Svelte mark, which is SvelteKit's own branding too — the toolbar cannot tell the two apart, the popup can |

Four are recoloured, shape untouched, because their published colour disappears
against a toolbar: `astro` (dark on dark), `next` and `remix` (material-icon-theme
ships them near-white, which vanishes on a light toolbar), and `stimulus` (whose
SVG sets no fill at all, so it renders black). Nothing else is altered, and
nothing is drawn by hand.

Only the devil (conflict state) and the unknown-state cube are invented, since
neither corresponds to a real project.

Rspack and Turbopack publish their marks as raster only, so `icons/src/` holds
PNGs for those two and `npm run icons` resamples them; the rest are SVG.

These files are the projects' trademarks, whatever the licence on the repository
they were fetched from. Fine for personal use; worth checking before publishing
to the Chrome Web Store or AMO.

# Bundler Detector

A Firefox and Chrome extension that works out which JavaScript bundler built the
page you are looking at, and turns the toolbar icon into that bundler's logo.

- Built with Vite → the icon becomes the Vite lightning bolt.
- Built with Rspack → the Rspack crab.
- Two bundlers on one page → 😈, and the popup lists everything it found.

Click the icon for the details: which bundler, which version (as precisely as the
bundle allows), and the exact byte patterns that led to that conclusion.

<!-- popup: verdict header, one card per bundler, expandable evidence list -->

Not on any store — clone it and load it yourself.

## Build

Needs Node 20+. There is nothing to install: the build only copies files and
picks the right manifest.

```sh
git clone https://github.com/swwind/bundler-detector.git
cd bundler-detector
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

Click the puzzle-piece icon and pin *Bundler Detector* so the logo stays visible
in the toolbar, which is rather the point of it.

After changing the source, run `npm run build` again and press **reload** ↻ on
the extension's card.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Pick `dist/firefox/manifest.json` (the file, not the folder)

Then **grant site access**, or it will barely detect anything: Firefox MV3 makes
host permissions opt-in, so until you allow it the extension can only read page
globals and markup, never the script files themselves.

- Click the puzzle-piece icon → the gear next to *Bundler Detector* → **Always
  Allow on All Sites**
- Or `about:addons` → Bundler Detector → **Permissions** → *Access your data for
  all websites*

**Temporary add-ons disappear when Firefox restarts.** Loading it again is the
same three steps. A permanent install would need the add-on signed by Mozilla.

## Check it works

Visit a few sites and watch the icon:

| Site | Expected |
| --- | --- |
| <https://vuejs.org> | Vite |
| <https://stackoverflow.com> | webpack |
| <https://rspack.rs> | Rspack |
| <https://nextjs.org> | Turbopack |

Those are the verdicts it actually produced when tested against the live sites.

## What it detects

| Bundler | How it is recognised | Version resolution |
| --- | --- | --- |
| **Vite** | `vite:preloadError`, `Unable to preload CSS for`, `__vite__mapDeps`, the `<script type="module" crossorigin src="/assets/…">` entry tag | major version, narrowed to a range |
| **webpack** | `self.webpackChunk*` (v5), `window.webpackJsonp` (≤4), `data-webpack` attribute, `__webpack_require__` | major version only |
| **Rspack** | `self.rspackChunk*` and `data-rspack` (≥2), or the `ruid="bundler=rspack@x.y.z"` runtime stamp (1.x) | **exact version on 1.x**, `≥ 2` otherwise |
| **Turbopack** | `globalThis.TURBOPACK` registry, `TURBOPACK_ASSET_SUFFIX`, `__turbopack_context__` | not exposed |
| **Parcel** | `globalThis.parcelRequire*`, `$parcel$` helpers | major version |
| **esbuild** | `__toESM` / `__commonJS` / `__esm` interop helpers | not exposed |
| **Rollup** | `_interopNamespaceDefault` and friends | not exposed |

Dev servers are recognised too (`/@vite/client`, `webpackHotUpdate`,
`rspackHotUpdate`) and marked with a **dev server** pill.

Every pattern in `src/signatures.js` was derived by building the same small app
with the real tool and reading its production output — not from documentation.
The `seen:` comment on each rule records the versions the pattern was actually
observed in.

### How the version is worked out

Almost no bundler writes its version into production output. The exceptions and
the workarounds:

- **Rspack 1.x** stamps `__webpack_require__.ruid = "bundler=rspack@1.5.8"` into
  the runtime, so the popup shows the exact version. This is also the only thing
  that distinguishes Rspack 1.x from webpack 5 at all — see the caveats below.
- **Vite** is placed in a range by markers that entered the preload helper in a
  known release: `Unable to preload CSS` (≥2), `vite:preloadError` (≥4), the
  `meta[property=csp-nonce]` lookup (≥5), `import.meta.resolve` (≥8), and the
  `assets/name.HASH.js` → `assets/name-HASH.js` filename change in 4. Absence
  only narrows the range when the preload helper was actually found, so a
  missing marker never produces a wrong bound.
- **webpack** splits at 5 on `webpackChunk` vs `webpackJsonp`. Nothing in the
  output identifies the minor version.

When the output does not support a claim, the popup says *version unknown*
rather than guessing.

## Caveats worth knowing

- **Rspack ≤ 1.x is webpack, byte for byte.** Rspack ships a deliberately
  webpack-compatible runtime: 0.7 and 1.x emit `webpackChunk*` and
  `data-webpack` exactly like webpack 5. The `ruid` stamp rescues 1.0+, but an
  Rspack 0.x site is reported as webpack 5 and there is no signal to do better.
- When Rspack *is* identified, its webpack markers are attributed to Rspack
  instead of being reported as a second bundler. Same for Vite, which absorbs
  the Rollup and esbuild traces it necessarily leaves behind. The popup says so
  when this happens.
- **Minified Rollup and esbuild output is undetectable.** Neither adds a runtime
  to a plain ESM bundle, and minification renames esbuild's interop helpers. A
  silent result is the honest one.
- Only the first 256 KB and the last 256 KB of each script are searched. Bundler
  markers live at both ends — chunks register themselves on the first line, and
  webpack and Rspack put the runtime at the end of the entry chunk — so the
  middle is application code that costs time and yields nothing.
- Every script on the page is read, however many there are. They are fetched
  cache-first and six at a time, so on a big site this is mostly CPU spent on
  the regex pass rather than network.
- The page can, in principle, forge the `postMessage` that carries page globals
  to the extension. The worst it achieves is a wrong icon; the script contents
  the background reads are unaffected.

## Development

```sh
npm test             # match the engine against real bundle output
npm run build        # assemble dist/chrome and dist/firefox
npm run validate     # check both builds are loadable
npm run icons        # re-render icons/src/* to PNG (needs @resvg/resvg-js)
```

`test/fixtures/` holds genuine production builds of one small app — an entry
module, a dynamic import and a CSS import — produced by Vite 2 through 8,
webpack 4 and 5, Rspack 1.x and 2.x, Turbopack (via Next.js), Parcel, Rollup and
esbuild, plus a Next.js webpack build. `npm test` asserts the bundler *and* the
version string for each, so a rule that stops matching real output fails loudly.

### Layout

```
src/signatures.js     rule table + matching engine (pure, runs under Node)
src/content-main.js   MAIN-world script: reads page globals
src/content.js        isolated script: DOM, inline scripts, script URLs
src/background.js     fetches scripts, matches, swaps the icon
src/popup.*           the dialog
tools/                build, validate, icon rendering
test/run.mjs          signature tests against committed bundle output
```

### CI

`.github/workflows/ci.yml` runs the signature tests, builds both targets and
checks they are loadable. That is the whole of it.

### Adding a bundler

1. Build something real with it and read the output. Guessed patterns are worse
   than no patterns.
2. Add an entry to `BUNDLERS` in `src/signatures.js`, with `seen:` noting the
   versions you checked.
3. Drop the project's own logo in as `icons/src/<id>.svg` (or `.png` if that is
   all they publish) and run `npm run icons`; add the id to the `ICONS` set in
   `src/background.js` and `KNOWN_ICONS` in `src/popup.js`.
4. Add the build output under `test/fixtures/<id>/` and a case in `test/run.mjs`.

## Icon credits

All bundler icons are the projects' own artwork:

| Icon | Source |
| --- | --- |
| vite, webpack, parcel, rollup, esbuild | [material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT), unmodified |
| rspack | the site favicon, `https://assets.rspack.rs/rspack/favicon-128x128.png` |
| turbopack | the Turbo mark from the [vercel/turborepo](https://github.com/vercel/turborepo) README |

Only the devil (multi-bundler state) and the unknown-state cube are drawn for
this project, since neither corresponds to a real project logo.

Rspack and Turbopack publish their marks as raster only, so `icons/src/` holds
PNGs for those two and `npm run icons` resamples them; the rest are SVG and
render crisply at every size. Rspack's mascot is detailed enough that the 16 px
version reads more as an orange blob than a crab — it is still distinct from
every other icon in the set, which is what the toolbar needs.

These files are the bundlers' trademarks, whatever the licence on the
repository they were fetched from. Fine for personal use; worth checking before
publishing to the Chrome Web Store or AMO.

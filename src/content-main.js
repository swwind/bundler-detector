'use strict';
/**
 * MAIN-world content script.
 *
 * Runs in the page's own JavaScript context, which is the only place where
 * globals like `webpackChunkfoo`, `rspackChunkfoo`, `TURBOPACK` or
 * `parcelRequire9f3a` are visible. The isolated content script cannot see
 * these, so we hand them over by postMessage.
 *
 * Requires Chrome 111+ / Firefox 128+ for `"world": "MAIN"`. On older Firefox
 * this script simply never runs and content.js falls back to wrappedJSObject.
 */
(function () {
  const REQUEST = '__bundler_detector_request__';
  const REPLY = '__bundler_detector_globals__';

  // Prefixes worth reporting. Chunk registries are suffixed with a
  // project-specific name or hash, so these are prefix matches.
  const INTERESTING =
    /^(webpackChunk|webpackJsonp|webpackHotUpdate|rspackChunk|rspackHotUpdate|parcelRequire|TURBOPACK|__turbopack|__vite|__VITE|__NEXT_DATA__|__next_f|__NUXT__|__remixContext|__SVELTEKIT)/;

  function collect() {
    const found = [];
    try {
      for (const name of Object.getOwnPropertyNames(window)) {
        if (INTERESTING.test(name)) found.push(name);
      }
    } catch {
      /* some pages break property enumeration; the other signals still work */
    }
    return found;
  }

  function publish() {
    try {
      window.postMessage({ type: REPLY, globals: collect() }, '*');
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.type === REQUEST) publish();
  });

  publish();
})();

'use strict';
/**
 * MAIN-world content script: harvests the facts only the page's own JavaScript
 * context can see.
 *
 * Two of them, and neither is visible from an isolated content script:
 *
 *   globals  the properties the page has added to `window` -- `webpackChunkfoo`,
 *            `__VUE__`, `jQuery`, `next`, `Alpine`
 *   props    the expando properties frameworks hang on DOM nodes --
 *            `__reactFiber$…`, `__vue_app__`, `_x_dataStack`, `__ngContext__`
 *
 * It deliberately knows nothing about any framework. It reports *what the page
 * defined*, and src/signatures/ decides what that means. The one piece of
 * knowledge kept here is the handful of shapes a library uses to publish its
 * version, because reading those means touching page objects, which only this
 * context can do.
 *
 * Requires Chrome 111+ / Firefox 128+ for `"world": "MAIN"`. On older Firefox
 * this script never runs and content.js falls back to wrappedJSObject.
 */
(function () {
  const REQUEST = '__stack_detector_request__';
  const REPLY = '__stack_detector_facts__';

  const MAX_GLOBALS = 300;
  const MAX_PROPS = 200;
  const MAX_ELEMENTS = 600;

  /**
   * The properties a pristine window has, so the page's own can be told apart
   * from the ~1000 the browser provides. A same-origin about:blank iframe is
   * the cheapest honest source for that list: it is the same browser, the same
   * version, the same feature flags.
   */
  function builtinGlobals() {
    try {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      document.documentElement.appendChild(frame);
      const names = new Set(Object.getOwnPropertyNames(frame.contentWindow));
      frame.remove();
      return names.size > 100 ? names : null;
    } catch {
      return null;
    }
  }

  /**
   * Fallback when the iframe trick is unavailable (a CSP with `frame-src
   * 'none'`, a detached document). Prefix matching against the things that
   * have historically mattered -- less complete, never wrong.
   */
  const FALLBACK_INTERESTING =
    /^(webpackChunk|webpackJsonp|webpackHotUpdate|rspackChunk|rspackHotUpdate|parcelRequire|TURBOPACK|__turbopack|__vite|__VUE|Vue$|React$|ReactDOM$|preact$|jQuery$|angular$|Alpine$|htmx$|ko$|Backbone$|Ember|Stimulus$|__svelte|__sveltekit|__NEXT|__next|__NUXT|useNuxtApp|__remix|__reactRouter|___loader|docusaurus|__VITEPRESS|__VP_|qwikevents|litElementVersions|litHtmlVersions|reactiveElementVersions|Astro$)/;

  /**
   * A version string has to look like one. jQuery publishes "3.7.1" and Svelte
   * publishes "5", but SvelteKit's `version` is a build timestamp -- so the
   * first component is capped at four digits, which no real major version
   * reaches and no timestamp fits inside.
   */
  function looksLikeVersion(value) {
    return typeof value === 'string' && value.length < 24 && /^\d{1,4}([._+-]|$)/.test(value);
  }

  /**
   * Where libraries actually put their version. Each shape below was read off
   * a real library: `.version` (React, Vue, Alpine, htmx, Next), `.VERSION`
   * (Backbone, Ember), `.version.full` (AngularJS), `.fn.jquery` (jQuery), the
   * first entry of an array (Lit's litElementVersions), and `.v` as a Set
   * (Svelte's window.__svelte).
   */
  function versionOf(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    const first = (x) => {
      if (Array.isArray(x)) return x[0];
      if (typeof Set === 'function' && x instanceof Set) return [...x][0];
      return undefined;
    };
    let candidates;
    try {
      candidates = [value.version, value.VERSION, value.version && value.version.full, value.fn && value.fn.jquery, first(value), first(value.v)];
    } catch {
      return undefined; // a getter threw; the name alone is still evidence
    }
    for (const candidate of candidates) if (looksLikeVersion(candidate)) return candidate;
    return undefined;
  }

  function collectGlobals() {
    const builtin = builtinGlobals();
    const found = [];
    let names;
    try {
      names = Object.getOwnPropertyNames(window);
    } catch {
      return found; // some pages break property enumeration
    }
    for (const name of names) {
      if (name.length > 64) continue;
      if (builtin ? builtin.has(name) : !FALLBACK_INTERESTING.test(name)) continue;
      let version;
      try {
        version = versionOf(window[name]);
      } catch {
        // Accessing the property threw; the name is still worth reporting.
      }
      found.push(version ? { name, version } : { name });
      if (found.length >= MAX_GLOBALS) break;
    }
    return found;
  }

  /**
   * Own properties of a DOM element. Elements normally have none -- everything
   * real lives on the prototype -- so anything found here was put there by
   * script, which is exactly what a framework does to track its nodes.
   */
  function collectProps() {
    const props = new Set();
    let all;
    try {
      all = document.getElementsByTagName('*');
    } catch {
      return [];
    }
    const step = Math.max(1, Math.floor(all.length / MAX_ELEMENTS));
    for (let i = 0; i < all.length && props.size < MAX_PROPS; i += step) {
      try {
        for (const name of Object.getOwnPropertyNames(all[i])) props.add(name);
      } catch {
        /* skip this element */
      }
    }
    // The document itself carries React's event-delegation flag and jQuery's
    // data key, so it is worth a separate namespaced look.
    try {
      for (const name of Object.getOwnPropertyNames(document)) props.add('document:' + name);
    } catch {
      /* ignore */
    }
    return [...props];
  }

  function publish() {
    try {
      window.postMessage({ type: REPLY, globals: collectGlobals(), props: collectProps() }, '*');
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.type === REQUEST) publish();
  });

  publish();
})();

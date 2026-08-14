'use strict';
/**
 * Isolated-world content script.
 *
 * Gathers everything about the page that can be seen from the DOM -- script
 * URLs, inline script bodies, the tags themselves -- plus the page globals
 * reported by content-main.js, and hands the lot to the background worker,
 * which does the fetching and the matching.
 */
(function () {
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const REQUEST = '__bundler_detector_request__';
  const REPLY = '__bundler_detector_globals__';

  const MAX_INLINE_SCRIPTS = 12;
  const MAX_INLINE_BYTES = 256 * 1024;
  const MAX_SCRIPT_URLS = 60; // the background applies its own, smaller budget

  /** URLs seen so far, accumulated across rescans (chunks load lazily). */
  const seenUrls = new Set();
  let pageGlobals = new Set();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== REPLY) return;
    for (const name of event.data.globals || []) pageGlobals.add(name);
  });

  /**
   * Ask the MAIN-world script for page globals. Falls back to Firefox's
   * wrappedJSObject when MAIN-world content scripts are unavailable.
   */
  function requestGlobals() {
    try {
      window.postMessage({ type: REQUEST }, '*');
    } catch {
      /* ignore */
    }
    // Firefox-only escape hatch (also covers Firefox < 128).
    const unwrapped = window.wrappedJSObject;
    if (unwrapped) {
      try {
        for (const name of Object.getOwnPropertyNames(unwrapped)) {
          if (
            /^(webpackChunk|webpackJsonp|webpackHotUpdate|rspackChunk|rspackHotUpdate|parcelRequire|TURBOPACK|__turbopack|__vite|Astro$)/.test(
              name
            )
          ) {
            pageGlobals.add(name);
          }
        }
      } catch {
        /* ignore */
      }
    }
    return new Promise((resolve) => setTimeout(resolve, 60));
  }

  function absolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch {
      return null;
    }
  }

  function collectScriptUrls() {
    const push = (raw) => {
      const url = absolute(raw);
      if (!url) return;
      if (!/^https?:/.test(url)) return;
      seenUrls.add(url);
    };

    for (const el of document.querySelectorAll('script[src]')) push(el.getAttribute('src'));
    for (const el of document.querySelectorAll('link[rel="modulepreload"][href], link[rel="preload"][as="script"][href]')) {
      push(el.getAttribute('href'));
    }
    // Chunks fetched after load never appear in the DOM as <script src>, but
    // they do show up here.
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        if (entry.initiatorType === 'script' || /\.(m?js)(\?|$)/.test(entry.name)) push(entry.name);
      }
    } catch {
      /* ignore */
    }
    return Array.from(seenUrls).slice(0, MAX_SCRIPT_URLS);
  }

  /**
   * A compact stand-in for the page HTML: just the tags the HTML rules care
   * about. Serialising the whole document would be far more expensive and no
   * more useful.
   *
   * `meta` carries the generator stamp some tools emit, and custom elements
   * are how a framework announces its runtime in the markup (<astro-island>
   * and friends) -- in both cases the tag and its attributes are the signal,
   * never the contents, so every element is cloned shallow.
   */
  function collectMarkup() {
    const parts = [];
    for (const el of document.querySelectorAll('script, link, meta[name]')) {
      parts.push(el.cloneNode(false).outerHTML);
      if (parts.length >= 400) break;
    }
    let custom = 0;
    for (const el of document.getElementsByTagName('*')) {
      if (el.tagName.indexOf('-') === -1) continue;
      // Serialised props can run to kilobytes; the opening tag is enough.
      parts.push(el.cloneNode(false).outerHTML.slice(0, 512));
      if (++custom >= 20) break;
    }
    return parts.join('\n');
  }

  function collectInlineScripts() {
    const out = [];
    for (const el of document.querySelectorAll('script:not([src])')) {
      const text = el.textContent;
      if (!text || text.length < 24) continue;
      out.push({
        kind: 'js',
        label: 'inline <script> #' + (out.length + 1),
        text: text.length > MAX_INLINE_BYTES ? text.slice(0, MAX_INLINE_BYTES) : text,
      });
      if (out.length >= MAX_INLINE_SCRIPTS) break;
    }
    return out;
  }

  async function scan(reason) {
    await requestGlobals();
    const payload = {
      type: 'bundler-detector:scan',
      reason,
      pageUrl: location.href,
      title: document.title,
      markup: collectMarkup(),
      inlineScripts: collectInlineScripts(),
      scriptUrls: collectScriptUrls(),
      globals: Array.from(pageGlobals),
    };
    try {
      await api.runtime.sendMessage(payload);
    } catch {
      // Background worker asleep or extension reloading; the next scan retries.
    }
  }

  // The popup can ask for a fresh look at the page.
  api.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'bundler-detector:rescan') scan('manual');
  });

  scan('load');
  // Lazy chunks and late-injected runtimes show up after first paint.
  setTimeout(() => scan('settled'), 2500);
})();

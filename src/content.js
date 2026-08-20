'use strict';
/**
 * Isolated-world content script.
 *
 * Gathers everything about the page that is visible from the DOM -- script
 * URLs, inline script bodies, the tags, the attributes and classes -- merges in
 * the globals and DOM properties reported by content-main.js, and hands the lot
 * to the background worker, which does the fetching and the matching.
 */
(function () {
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const REQUEST = '__web_stack_detector_request__';
  const REPLY = '__web_stack_detector_facts__';

  const MAX_INLINE_SCRIPTS = 12;
  const MAX_INLINE_BYTES = 256 * 1024;
  const MAX_TAGS = 400;
  const MAX_CUSTOM_ELEMENTS = 20;
  const MAX_ATTRS = 400;
  const MAX_CLASSES = 300;
  const MAX_ATTR_VALUE = 96;

  /** Accumulated across rescans, since chunks and widgets load late. */
  const seenUrls = new Set();
  let pageGlobals = new Map();
  let pageProps = new Set();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== REPLY) return;
    for (const g of event.data.globals || []) {
      if (!g || typeof g.name !== 'string') continue;
      // A later scan may have read a version the first one missed.
      const existing = pageGlobals.get(g.name);
      if (!existing || (!existing.version && g.version)) pageGlobals.set(g.name, g);
    }
    for (const name of event.data.props || []) pageProps.add(name);
  });

  /**
   * Ask the MAIN-world script for the page's globals and DOM properties.
   * Falls back to Firefox's wrappedJSObject where MAIN-world content scripts
   * are unavailable (Firefox < 128), which reaches the globals but not the
   * element expandos.
   */
  function requestFacts() {
    try {
      window.postMessage({ type: REQUEST }, '*');
    } catch {
      /* ignore */
    }
    const unwrapped = window.wrappedJSObject;
    if (unwrapped && !pageGlobals.size) {
      try {
        for (const name of Object.getOwnPropertyNames(unwrapped)) {
          if (name.length <= 64 && !pageGlobals.has(name)) pageGlobals.set(name, { name });
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

  /**
   * Only scripts the HTML asks for by name: <script src> plus the preload
   * hints next to them.
   *
   * The preload hints are not optional. VitePress ships a near-empty entry
   * <script> and puts the Vite runtime -- the chunk holding vite:preloadError
   * -- behind <link rel="modulepreload">, so vuejs.org and vite.dev are not
   * detectable as Vite without them.
   *
   * What this deliberately leaves out is everything the page fetched at
   * runtime via import() or fetch(). Those are the same bundles reached a
   * different way, and on a big site there are a lot of them.
   */
  function collectScriptUrls() {
    const push = (raw) => {
      const url = absolute(raw);
      if (url && /^https?:/.test(url)) seenUrls.add(url);
    };
    for (const el of document.querySelectorAll('script[src]')) push(el.getAttribute('src'));
    for (const el of document.querySelectorAll('link[rel="modulepreload"][href]')) push(el.getAttribute('href'));
    return Array.from(seenUrls);
  }

  /**
   * A compact stand-in for the page HTML: just the tags the HTML rules care
   * about. Serialising the whole document would be far more expensive and no
   * more useful.
   *
   * `meta` carries the generator stamp Astro, Gatsby, Docusaurus and VitePress
   * all emit -- the single richest source of exact versions in the whole
   * extension -- and custom elements are how a framework announces its runtime
   * in the markup (<astro-island> and friends). In both cases the tag and its
   * attributes are the signal, never the contents, so every element is cloned
   * shallow.
   */
  function collectMarkup() {
    const parts = [];
    for (const el of document.querySelectorAll('script, link, meta[name], meta[property]')) {
      parts.push(el.cloneNode(false).outerHTML);
      if (parts.length >= MAX_TAGS) break;
    }
    let custom = 0;
    for (const el of document.getElementsByTagName('*')) {
      if (el.tagName.indexOf('-') === -1) continue;
      // Serialised props can run to kilobytes; the opening tag is enough.
      parts.push(el.cloneNode(false).outerHTML.slice(0, 512));
      if (++custom >= MAX_CUSTOM_ELEMENTS) break;
    }
    return parts.join('\n');
  }

  /**
   * The distinct attributes and classes used anywhere in the document, one per
   * line, as `name="value"` and `.class`.
   *
   * This is where server-rendered frameworks leave their only trace. A
   * prerendered Angular page carries `ng-version="22.1.3"` and nothing else;
   * Qwik writes `q:version`; Alpine writes `x-data`; the Vue and Svelte
   * compilers write `data-v-…` attributes and `svelte-…` classes. None of it
   * needs the framework to still be running.
   *
   * Values are kept because several of them *are* the version. Long ones are
   * truncated: no rule needs the tail of a 4 KB inline style, and the point is
   * to stay cheap on a page with 50,000 elements.
   */
  function collectDom() {
    const attrs = new Map();
    const classes = new Set();
    const all = document.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (attrs.size < MAX_ATTRS) {
        const list = el.attributes;
        for (let j = 0; j < list.length; j++) {
          const attr = list[j];
          if (attrs.has(attr.name)) continue;
          const value = attr.value;
          attrs.set(attr.name, value ? attr.name + '="' + value.slice(0, MAX_ATTR_VALUE) + '"' : attr.name);
        }
      }
      if (classes.size < MAX_CLASSES && el.classList) {
        for (const token of el.classList) classes.add('.' + token);
      }
      if (attrs.size >= MAX_ATTRS && classes.size >= MAX_CLASSES) break;
    }
    return [...attrs.values()].concat([...classes]).join('\n');
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
    await requestFacts();
    const payload = {
      type: 'web-stack-detector:scan',
      reason,
      pageUrl: location.href,
      title: document.title,
      markup: collectMarkup(),
      dom: collectDom(),
      inlineScripts: collectInlineScripts(),
      scriptUrls: collectScriptUrls(),
      globals: Array.from(pageGlobals.values()),
      props: Array.from(pageProps),
    };
    try {
      await api.runtime.sendMessage(payload);
    } catch {
      // Background worker asleep or extension reloading; the next scan retries.
    }
  }

  // The popup can ask for a fresh look at the page.
  api.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'web-stack-detector:rescan') scan('manual');
  });

  scan('load');
  // Lazy chunks, late-injected runtimes and client-side hydration all show up
  // after first paint.
  setTimeout(() => scan('settled'), 2500);
})();

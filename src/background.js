'use strict';
/**
 * Background worker: fetches the page's JavaScript, runs the signature engine,
 * swaps the toolbar icon and keeps the result for the popup.
 *
 * Fetching happens here rather than in the content script because only the
 * background context has cross-origin host permissions; most real sites serve
 * their bundles from a CDN on another origin.
 */

// Chrome loads this file as a service worker (importScripts available);
// Firefox lists signatures.js ahead of it in background.scripts.
if (typeof importScripts === 'function') importScripts('/src/signatures.js');

const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
const { analyze } = globalThis.BundlerSignatures;

/** Icons that exist in icons/. Anything else falls back to `unknown`. */
const ICONS = new Set(['vite', 'webpack', 'rspack', 'turbopack', 'parcel', 'rollup', 'esbuild', 'devil', 'unknown']);
const ICON_SIZES = [16, 32, 48, 128];

// Every script on the page is read. Bundles are already in the browser cache,
// so this costs much less than it sounds.
const MAX_CONCURRENCY = 6;
// Within each file only the two ends are searched -- see fetchScript.
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_PER_BUNDLER = 12;

/** tabId -> result, mirrored into storage.session so it survives worker restarts. */
const results = new Map();

/**
 * Each tab scans twice (at load, then once lazy chunks have settled) and the
 * two runs overlap. These counters keep the newer scan's result from being
 * overwritten by an older one that happened to finish later.
 */
const scanSeq = new Map();
const scanDone = new Map();

function iconPaths(id) {
  const name = ICONS.has(id) ? id : 'unknown';
  const path = {};
  for (const size of ICON_SIZES) path[size] = `/icons/${name}-${size}.png`;
  return path;
}

async function setIcon(tabId, id, title) {
  try {
    await api.action.setIcon({ tabId, path: iconPaths(id) });
    await api.action.setTitle({ tabId, title });
  } catch {
    // Tab closed or navigated away mid-scan.
  }
}

/**
 * Read a script, keeping only the head and the tail.
 *
 * Bundler markers cluster at both ends: chunk files register themselves on the
 * first line, and webpack/Rspack put the runtime at the end of the entry chunk.
 * The middle is application code, so skipping it costs nothing and keeps huge
 * bundles cheap.
 */
async function fetchScript(url) {
  const res = await fetch(url, { credentials: 'omit', cache: 'force-cache', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body) return (await res.text()).slice(0, HEAD_BYTES + TAIL_BYTES);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let head = '';
  let tail = [];
  let tailLength = 0;
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    const text = decoder.decode(value, { stream: true });
    if (head.length < HEAD_BYTES) {
      head += text;
    } else {
      tail.push(text);
      tailLength += text.length;
      while (tail.length > 1 && tailLength - tail[0].length >= TAIL_BYTES) {
        tailLength -= tail.shift().length;
      }
    }
    if (total > MAX_FILE_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return tail.length ? head + '\n/*…*/\n' + tail.join('') : head;
}

/**
 * Files most likely to carry the runtime go first. Everything gets read either
 * way; this only decides the order, and so which file a rule matched in several
 * places cites as its evidence.
 */
function prioritize(urls) {
  const score = (url) => {
    let s = 0;
    const path = url.split('?')[0];
    const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    if (/(runtime|webpack|rspack|turbopack|polyfill)/.test(base)) s += 30;
    if (/(main|index|entry|app|client|bundle)/.test(base)) s += 20;
    if (/(vendor|chunk|framework)/.test(base)) s += 10;
    if (/\/(assets|static|_next|_nuxt|build|dist)\//.test(path)) s += 5;
    if (/\.(m?js)$/.test(base)) s += 2;
    return s;
  };
  return urls
    .map((url, i) => ({ url, i, s: score(url) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((e) => e.url);
}

async function fetchAll(urls) {
  const queue = prioritize(urls);
  const sources = [];
  const failures = [];
  let bytes = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const url = queue[cursor++];
      try {
        const text = await fetchScript(url);
        bytes += text.length;
        sources.push({ kind: 'js', label: shortLabel(url), text, url });
      } catch (error) {
        failures.push({ url: shortLabel(url), error: String(error && error.message ? error.message : error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, worker));
  return { sources, failures, bytes };
}

function shortLabel(url) {
  try {
    const u = new URL(url);
    const file = u.pathname.slice(u.pathname.lastIndexOf('/') + 1) || u.pathname;
    return file.length > 48 ? file.slice(0, 45) + '…' : file;
  } catch {
    return url;
  }
}

function trim(detections) {
  for (const d of detections) {
    if (d.evidence.length > MAX_EVIDENCE_PER_BUNDLER) d.evidence = d.evidence.slice(0, MAX_EVIDENCE_PER_BUNDLER);
    for (const a of d.absorbed || []) {
      if (a.evidence.length > MAX_EVIDENCE_PER_BUNDLER) a.evidence = a.evidence.slice(0, MAX_EVIDENCE_PER_BUNDLER);
    }
  }
  return detections;
}

async function handleScan(message, tabId) {
  const seq = (scanSeq.get(tabId) || 0) + 1;
  scanSeq.set(tabId, seq);

  const { sources: fetched, failures, bytes } = await fetchAll(message.scriptUrls || []);

  const sources = [
    { kind: 'html', label: 'page markup', text: message.markup || '' },
    { kind: 'url', label: 'resource URLs', text: (message.scriptUrls || []).join('\n') },
    ...(message.inlineScripts || []),
    ...fetched,
  ];

  const { detections, notes } = analyze({ sources, globals: message.globals || [] });
  trim(detections);

  const confident = detections.filter((d) => d.confidence !== 'low');
  const icon = confident.length > 1 ? 'devil' : confident.length === 1 ? confident[0].id : 'unknown';

  const result = {
    pageUrl: message.pageUrl,
    title: message.title,
    scannedAt: Date.now(),
    reason: message.reason,
    detections,
    notes,
    icon,
    stats: {
      scriptsSeen: (message.scriptUrls || []).length,
      scriptsRead: fetched.length,
      scriptsFailed: failures.length,
      inlineScripts: (message.inlineScripts || []).length,
      globals: (message.globals || []).length,
      bytes,
    },
    failures: failures.slice(0, 5),
  };

  // A newer scan already published for this tab; drop this stale one.
  if ((scanDone.get(tabId) || 0) > seq) return null;
  scanDone.set(tabId, seq);

  results.set(tabId, result);
  try {
    await api.storage.session.set({ ['tab:' + tabId]: result });
  } catch {
    /* session storage unavailable; the in-memory copy still serves the popup */
  }

  await setIcon(tabId, icon, titleFor(result));
  return result;
}

function titleFor(result) {
  const list = result.detections.filter((d) => d.confidence !== 'low');
  if (!list.length) return 'No bundler detected — click for details';
  const names = list.map((d) => d.name + (d.version ? ' ' + d.version.text : ''));
  return names.join(' + ') + ' — click for details';
}

async function getResult(tabId) {
  if (results.has(tabId)) return results.get(tabId);
  try {
    const stored = await api.storage.session.get('tab:' + tabId);
    const value = stored['tab:' + tabId];
    if (value) results.set(tabId, value);
    return value || null;
  } catch {
    return null;
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'bundler-detector:scan') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) return;
    handleScan(message, tabId).catch((error) => console.error('[bundler-detector] scan failed', error));
    return; // no response needed
  }

  if (message.type === 'bundler-detector:get') {
    getResult(message.tabId).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'bundler-detector:rescan') {
    api.tabs
      .sendMessage(message.tabId, { type: 'bundler-detector:rescan' })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  results.delete(tabId);
  scanSeq.delete(tabId);
  scanDone.delete(tabId);
  api.storage.session.remove('tab:' + tabId).catch(() => {});
});

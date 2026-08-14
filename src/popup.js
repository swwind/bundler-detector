'use strict';
/**
 * The dialog: what was found, which version, and the evidence behind it.
 */
(function () {
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const app = document.getElementById('app');
  const KNOWN_ICONS = new Set([
    'vite',
    'webpack',
    'rspack',
    'turbopack',
    'parcel',
    'rollup',
    'esbuild',
    'astro',
    'devil',
    'unknown',
  ]);

  const el = (tag, props, children) => {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children || []) node.append(child);
    return node;
  };

  const iconFor = (id, size) =>
    el('img', {
      src: `/icons/${KNOWN_ICONS.has(id) ? id : 'unknown'}-${size}.png`,
      alt: '',
      width: size === 128 ? 52 : 26,
      height: size === 128 ? 52 : 26,
    });

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return url || '';
    }
  }

  function renderEvidence(list) {
    return el('ul', { className: 'evidence' }, list.map((e) =>
      el('li', {}, [
        el('div', { className: 'what', textContent: e.desc }),
        el('div', {
          className: 'where',
          textContent: e.count > 1 ? `${e.label} (+${e.count - 1} more file${e.count > 2 ? 's' : ''})` : e.label,
        }),
        el('code', { textContent: e.sample }),
      ])
    ));
  }

  function renderCard(d) {
    const head = el('div', { className: 'card-head' }, [
      iconFor(d.id, 48),
      el('span', { className: 'card-name', textContent: d.name }),
      d.version
        ? el('span', {
            className: 'card-version' + (d.version.exact ? ' exact' : ''),
            textContent: (d.version.exact ? 'v' : '') + d.version.text,
          })
        : el('span', { className: 'card-version', textContent: 'version unknown' }),
      el('span', { className: 'spacer' }),
      d.mode === 'dev' ? el('span', { className: 'pill dev', textContent: 'dev server' }) : '',
      el('span', { className: 'pill ' + d.confidence, textContent: d.confidence }),
    ]);

    const card = el('div', { className: 'card' }, [head]);

    if (d.absorbed && d.absorbed.length) {
      card.append(
        el('div', {
          className: 'absorbed',
          textContent:
            'Also matched ' +
            d.absorbed.map((a) => a.name).join(', ') +
            ' — counted as part of ' +
            d.name +
            '.',
        })
      );
    }

    card.append(
      el('details', {}, [
        el('summary', { textContent: `Evidence (${d.evidence.length})` }),
        renderEvidence(d.evidence),
      ])
    );
    return card;
  }

  function render(result) {
    app.className = '';
    app.replaceChildren();

    if (!result) {
      app.append(
        el('p', { className: 'status', textContent: 'Nothing scanned here.' }),
        el('p', {
          className: 'empty',
          textContent:
            'Content scripts cannot run on browser pages, the extension gallery, or local files unless you allow it. Open a normal http(s) page and try again.',
        })
      );
      return;
    }

    const confident = result.detections.filter((d) => d.confidence !== 'low');
    const headline =
      confident.length > 1
        ? `${confident.length} bundlers detected`
        : confident.length === 1
          ? confident[0].name + (confident[0].version ? ' ' + confident[0].version.text : '')
          : 'No bundler detected';

    app.append(
      el('header', { className: 'verdict' }, [
        iconFor(result.icon, 128),
        el('div', {}, [
          el('h1', { textContent: headline }),
          el('p', { className: 'host', textContent: hostOf(result.pageUrl) }),
        ]),
      ])
    );

    if (result.detections.length) {
      app.append(el('div', { className: 'cards' }, result.detections.map(renderCard)));
    } else {
      app.append(
        el('p', { className: 'empty' }, [
          el('strong', { textContent: 'No known bundler signature found. ' }),
          document.createTextNode(
            'The page may be hand-written, server-rendered, or built by a tool that leaves no runtime behind — plain Rollup and minified esbuild output are indistinguishable from ordinary JavaScript.'
          ),
        ])
      );
    }

    if (result.notes && result.notes.length) {
      app.append(el('ul', { className: 'notes' }, result.notes.map((n) => el('li', { textContent: n }))));
    }

    const s = result.stats;
    const stats = `${s.scriptsRead}/${s.scriptsSeen} scripts read · ${Math.round(s.bytes / 1024)} KB · ${s.globals} globals`;

    const rescan = el('button', { textContent: 'Rescan' });
    rescan.addEventListener('click', async () => {
      rescan.disabled = true;
      rescan.textContent = 'Scanning…';
      await api.runtime.sendMessage({ type: 'bundler-detector:rescan', tabId: currentTabId }).catch(() => {});
      setTimeout(load, 1200);
    });

    app.append(el('footer', {}, [el('span', { textContent: stats }), el('span', { className: 'spacer' }), rescan]));
  }

  let currentTabId = null;

  async function load() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return render(null);
    currentTabId = tab.id;
    const result = await api.runtime.sendMessage({ type: 'bundler-detector:get', tabId: tab.id }).catch(() => null);
    render(result || null);
  }

  load();
})();

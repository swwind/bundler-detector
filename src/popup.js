'use strict';
/**
 * The dialog: what was found, which version, and the evidence behind it.
 *
 * It loads the signature registry too (see popup.html) so the icon list and
 * the category labels come from the same place the detections do.
 */
(function () {
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const app = document.getElementById('app');
  const { technologies, CATEGORIES } = globalThis.StackEngine;

  const KNOWN_ICONS = new Set(technologies().map((t) => t.id).concat(['devil', 'unknown']));
  const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

  const el = (tag, props, children) => {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children || []) if (child) node.append(child);
    return node;
  };

  const iconFor = (id, size) =>
    el('img', {
      src: `/icons/${KNOWN_ICONS.has(id) ? id : 'unknown'}-${size}.png`,
      alt: '',
      width: size,
      height: size,
    });

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return url || '';
    }
  }

  const versionText = (d) => (d.version ? (d.version.exact ? 'v' : '') + d.version.text : '');

  function renderEvidence(list) {
    return el(
      'ul',
      { className: 'evidence' },
      list.map((e) =>
        el('li', {}, [
          el('div', { className: 'what', textContent: e.desc }),
          el('div', {
            className: 'where',
            textContent:
              e.count > 1 ? `${e.label} (+${e.count - 1} more source${e.count > 2 ? 's' : ''})` : e.label,
          }),
          el('code', { textContent: e.sample }),
        ])
      )
    );
  }

  /** The technologies whose evidence was folded into this detection. */
  function renderBuiltOn(d) {
    const strip = el('div', { className: 'built-on' }, [
      el('span', { className: 'built-on-label', textContent: 'absorbed' }),
    ]);
    for (const b of d.builtOn) {
      strip.append(
        el('span', { className: 'chip', title: CATEGORY_LABEL.get(b.category) || b.category }, [
          iconFor(b.id, 16),
          el('span', { textContent: b.name }),
          versionText(b) ? el('span', { className: 'chip-version', textContent: versionText(b) }) : null,
        ])
      );
    }
    return strip;
  }

  function renderCard(d) {
    const card = el('div', { className: 'card' }, [
      el('div', { className: 'card-head' }, [
        iconFor(d.id, 32),
        el('span', { className: 'card-name', textContent: d.name }),
        el('span', {
          className: 'card-version' + (d.version && d.version.exact ? ' exact' : ''),
          textContent: versionText(d) || 'version unknown',
        }),
        el('span', { className: 'spacer' }),
        d.mode === 'dev' ? el('span', { className: 'pill dev', textContent: 'dev server' }) : null,
        el('span', { className: 'pill ' + d.confidence, textContent: d.confidence }),
      ]),
    ]);

    if (d.builtOn && d.builtOn.length) card.append(renderBuiltOn(d));

    // The evidence for what a detection absorbed belongs to that detection, so
    // it is listed under the same disclosure.
    const evidence = d.evidence.concat(
      ...(d.builtOn || []).map((b) => b.evidence.map((e) => ({ ...e, desc: b.name + ': ' + e.desc })))
    );
    card.append(
      el('details', {}, [el('summary', { textContent: `Evidence (${evidence.length})` }), renderEvidence(evidence)])
    );
    return card;
  }

  function renderGroups(detections) {
    const wrap = el('div', { className: 'groups' });
    for (const category of CATEGORIES) {
      const inGroup = detections.filter((d) => d.category === category.id);
      if (!inGroup.length) continue;
      wrap.append(
        el('h2', { className: 'group-label', textContent: category.label }),
        el('div', { className: 'cards' }, inGroup.map(renderCard))
      );
    }
    // Anything whose category is not in the list still gets shown.
    const known = new Set(CATEGORIES.map((c) => c.id));
    const rest = detections.filter((d) => !known.has(d.category));
    if (rest.length) wrap.append(el('div', { className: 'cards' }, rest.map(renderCard)));
    return wrap;
  }

  function headlineFor(result, confident) {
    if (!confident.length) return 'Nothing recognised';
    const primary = confident[0];
    const main = primary.name + (versionText(primary) ? ' ' + versionText(primary) : '');
    if (result.conflicts && result.conflicts.length) {
      const label = CATEGORIES.find((c) => c.id === result.conflicts[0]);
      return `Two ${label ? label.plural : 'technologies'} on one page`;
    }
    return main;
  }

  function subtitleFor(result, confident) {
    const host = hostOf(result.pageUrl);
    const rest = confident.slice(1).map((d) => d.name);
    return rest.length ? host + ' · with ' + rest.join(', ') : host;
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

    app.append(
      el('header', { className: 'verdict' }, [
        iconFor(result.icon, 48),
        el('div', { className: 'verdict-text' }, [
          el('h1', { textContent: headlineFor(result, confident) }),
          el('p', { className: 'host', textContent: subtitleFor(result, confident) }),
        ]),
      ])
    );

    if (result.detections.length) {
      app.append(renderGroups(result.detections));
    } else {
      app.append(
        el('p', { className: 'empty' }, [
          el('strong', { textContent: 'No known framework or bundler found. ' }),
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
    const stats = `${s.scriptsRead}/${s.scriptsSeen} scripts · ${Math.round(s.bytes / 1024)} KB · ${s.globals} globals · ${s.props || 0} props`;

    const rescan = el('button', { textContent: 'Rescan' });
    rescan.addEventListener('click', async () => {
      rescan.disabled = true;
      rescan.textContent = 'Scanning…';
      await api.runtime.sendMessage({ type: 'web-stack-detector:rescan', tabId: currentTabId }).catch(() => {});
      setTimeout(load, 1200);
    });

    app.append(el('footer', {}, [el('span', { textContent: stats }), el('span', { className: 'spacer' }), rescan]));
  }

  let currentTabId = null;

  async function load() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return render(null);
    currentTabId = tab.id;
    const result = await api.runtime.sendMessage({ type: 'web-stack-detector:get', tabId: tab.id }).catch(() => null);
    render(result || null);
  }

  load();
})();

'use strict';
/**
 * Matching engine.
 *
 * Pure logic: no DOM, no extension APIs, no signature data. It runs unchanged
 * in the background worker and under Node (see test/run.mjs), reading whatever
 * the files in src/signatures/ have pushed into the registry.
 *
 * The split is deliberate. A page yields *facts* -- script bodies, markup,
 * window globals, DOM expando properties, attributes -- and the signature
 * files interpret them. Nothing in this file knows what React or webpack is.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StackEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  /**
   * Categories, most specific first. The order is the priority order: it picks
   * which detection becomes the toolbar icon and the popup headline, and it
   * decides which pairs count as a genuine conflict.
   */
  const CATEGORIES = [
    { id: 'meta-framework', label: 'Framework', plural: 'frameworks' },
    { id: 'framework', label: 'UI library', plural: 'UI libraries' },
    { id: 'bundler', label: 'Bundler', plural: 'bundlers' },
  ];
  const CATEGORY_RANK = new Map(CATEGORIES.map((c, i) => [c.id, CATEGORIES.length - i]));

  const MIN_SCORE = 25; // below this we do not report at all

  /** Everything src/signatures/*.js has registered, in load order. */
  function technologies() {
    return root.StackSignatures || [];
  }

  /** Relations pushed by the signature files: `id` is built on `builtOn`. */
  function relations() {
    return root.StackRelations || [];
  }

  /**
   * Rule weights are summed per technology. The signature files score a marker
   * only this technology emits at 100, one a close relative also emits at 55,
   * and a merely suggestive one at 25 -- so one conclusive marker, or two
   * corroborating ones, reaches 'high', and a lone weak marker never does.
   */
  function confidenceOf(score) {
    if (score >= 100) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  /**
   * A rule matches by plain substring (`str`, the fast path), by regular
   * expression (`re`), or by requiring several substrings to appear in the
   * same source (`all`) -- which is how a technology with no single unique
   * token is still identified from the combination it always emits.
   */
  function matchRule(rule, text) {
    if (rule.str) {
      const i = text.indexOf(rule.str);
      return i === -1 ? null : { index: i, match: [rule.str] };
    }
    if (rule.all) {
      let first = null;
      for (const part of rule.all) {
        let hit = null;
        if (typeof part === 'string') {
          const i = text.indexOf(part);
          if (i !== -1) hit = { index: i, text: part };
        } else {
          const m = part.exec(text);
          if (m) hit = { index: m.index, text: m[0] };
        }
        if (!hit) return null;
        if (!first) first = hit;
      }
      return { index: first.index, match: [first.text] };
    }
    const m = rule.re.exec(text);
    return m ? { index: m.index, match: m } : null;
  }

  function snippet(text, index, len) {
    const start = Math.max(0, index - 24);
    const raw = text.slice(start, index + (len || 40) + 24);
    return (start > 0 ? '…' : '') + raw.replace(/\s+/g, ' ').trim() + '…';
  }

  /** Accepts both ['name'] and [{name, version}]. */
  function normalizeGlobals(globals) {
    return (globals || []).map((g) => (typeof g === 'string' ? { name: g } : g)).filter((g) => g && g.name);
  }

  /**
   * @param {object} input
   * @param {Array<{kind:string,label:string,text:string}>} input.sources
   *        kind is 'js' | 'html' | 'url' | 'dom' | 'prop'; label is shown to the user.
   * @param {Array<string|{name:string,version?:string}>} [input.globals]
   *        page-defined window properties, with a version where one was readable
   * @returns {{detections: Array, notes: string[], conflicts: string[]}}
   */
  function analyze(input) {
    const sources = input.sources || [];
    const globals = normalizeGlobals(input.globals);
    const hitsByTech = new Map();

    const record = (tech, rule, where, label, sample, version) => {
      let list = hitsByTech.get(tech.id);
      if (!list) hitsByTech.set(tech.id, (list = []));
      // Keep the first hit per rule, but remember how many sources showed it.
      const existing = list.find((h) => h.rule === rule.id);
      if (existing) {
        existing.count++;
        if (!existing.exact && version) existing.exact = version;
        return;
      }
      list.push({
        rule: rule.id,
        desc: rule.desc,
        where,
        label,
        sample,
        weight: rule.weight,
        min: rule.min,
        max: rule.max,
        exact: rule.exact ? rule.exact(sample.match) : version,
        dev: !!rule.dev,
        count: 1,
      });
    };

    for (const tech of technologies()) {
      for (const rule of tech.rules) {
        for (const src of sources) {
          if (!rule.where.includes(src.kind)) continue;
          const hit = matchRule(rule, src.text);
          if (!hit) continue;
          record(tech, rule, src.kind, src.label, {
            match: hit.match,
            text: snippet(src.text, hit.index, hit.match[0].length),
          });
        }
        // Globals are matched name by name so a version read off the object
        // can be attributed to the rule that claimed the name.
        if (rule.where.includes('global')) {
          for (const g of globals) {
            const hit = matchRule(rule, g.name);
            if (!hit) continue;
            // `noVersion` is for globals that carry a number which is not the
            // technology's release -- SvelteKit's build id, lit-html's own
            // package version.
            const version = rule.noVersion ? undefined : g.version;
            record(
              tech,
              rule,
              'global',
              'window',
              { match: hit.match, text: 'window.' + g.name + (version ? ' → ' + version : '') },
              version
            );
          }
        }
      }
    }

    let detections = [];
    for (const tech of technologies()) {
      const hits = hitsByTech.get(tech.id);
      if (!hits || !hits.length) continue;
      const score = hits.reduce((sum, h) => sum + h.weight, 0);
      if (score < MIN_SCORE) continue;

      const ctx = {
        hits,
        fileWithRule(ruleId) {
          const hit = hits.find((h) => h.rule === ruleId);
          if (!hit) return null;
          return sources.find((s) => s.label === hit.label) || null;
        },
      };
      const refined = tech.refine ? tech.refine(ctx) : null;

      detections.push({
        id: tech.id,
        name: tech.name,
        category: tech.category,
        color: tech.color,
        home: tech.home,
        coexists: !!tech.coexists,
        rank: tech.rank || 0,
        score,
        confidence: confidenceOf(score),
        version: summarizeVersion(hits, refined),
        mode: hits.some((h) => h.dev) && !hits.some((h) => !h.dev) ? 'dev' : 'build',
        evidence: hits
          .slice()
          .sort((a, b) => b.weight - a.weight)
          .map((h) => ({
            rule: h.rule,
            desc: h.desc,
            where: h.where,
            label: h.label,
            sample: h.sample.text,
            count: h.count,
          })),
      });
    }

    const notes = [];
    detections = applyRelations(detections, notes);
    detections.sort(byPriority);
    return { detections, notes, conflicts: conflictingCategories(detections) };
  }

  /**
   * Priority order, used for the icon, the headline and the card order:
   * category first (a framework says more about a page than its bundler), then
   * the technology's own rank, then the weight of the evidence.
   *
   * `rank` exists for jQuery, which is on a large share of the web and is
   * almost never the most interesting thing about a page. Everything else
   * sorts on evidence, which is what puts Alpine ahead of the Preact-based
   * search widget on alpinejs.dev.
   */
  function byPriority(a, b) {
    const category = (CATEGORY_RANK.get(b.category) || 0) - (CATEGORY_RANK.get(a.category) || 0);
    if (category) return category;
    if ((a.rank || 0) !== (b.rank || 0)) return (b.rank || 0) - (a.rank || 0);
    return b.score - a.score;
  }

  /**
   * Fold a technology's evidence into the thing that is built on top of it.
   *
   * Next.js *is* React and ships webpack or Turbopack; reporting all three as
   * separate findings would be technically true and useless. Only intrinsic
   * relationships belong here -- React on webpack is a choice, not a fact
   * about React, so those stay two findings.
   */
  function applyRelations(detections, notes) {
    const byId = new Map(detections.map((d) => [d.id, d]));
    const absorbed = new Set();
    // Most specific first, whatever order the signature files loaded in: Astro
    // has to claim Vite before Vite claims Rollup, or Rollup's evidence would
    // be lost inside a Vite detection that is itself about to be absorbed.
    const ordered = relations()
      .slice()
      .sort((a, b) => {
        const rank = (d) => (d && CATEGORY_RANK.get(d.category)) || 0;
        return rank(byId.get(b.id)) - rank(byId.get(a.id));
      });
    for (const rel of ordered) {
      const primary = byId.get(rel.id);
      if (!primary || primary.confidence === 'low' || absorbed.has(rel.id)) continue;
      for (const otherId of rel.builtOn) {
        const other = byId.get(otherId);
        if (!other || absorbed.has(otherId)) continue;
        if (rel.onlyIfWeaker && other.score >= primary.score) continue;
        absorbed.add(otherId);
        primary.builtOn = (primary.builtOn || []).concat({
          id: other.id,
          name: other.name,
          category: other.category,
          version: other.version,
          confidence: other.confidence,
          evidence: other.evidence,
        });
        if (rel.note && notes.indexOf(rel.note) === -1) notes.push(rel.note);
      }
    }
    return detections.filter((d) => !absorbed.has(d.id));
  }

  /**
   * Categories holding two findings that should not both be there -- two
   * bundlers, or two rival frameworks. Libraries flagged `coexists` are
   * excluded: jQuery next to React is a normal Tuesday, not a contradiction.
   * The flag says nothing about priority, only about whether the pairing is
   * surprising.
   */
  function conflictingCategories(detections) {
    const counts = new Map();
    for (const d of detections) {
      if (d.confidence === 'low' || d.coexists) continue;
      counts.set(d.category, (counts.get(d.category) || 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  }

  function summarizeVersion(hits, refined) {
    const exact = hits.find((h) => h.exact);
    if (exact) return { text: exact.exact, exact: true };

    let min = null;
    let max = null;
    for (const h of hits) {
      if (h.min != null) min = min == null ? h.min : Math.max(min, h.min);
      if (h.max != null) max = max == null ? h.max : Math.min(max, h.max);
    }
    if (refined) {
      if (refined.min != null) min = min == null ? refined.min : Math.max(min, refined.min);
      if (refined.max != null) max = max == null ? refined.max : Math.min(max, refined.max);
    }
    // Contradictory bounds mean the page mixes builds; fall back to the lower one.
    if (min != null && max != null && min > max) max = null;

    if (min != null && max != null) {
      return { text: min === max ? String(min) : `${min} – ${max}`, exact: false };
    }
    if (min != null) return { text: `≥ ${min}`, exact: false };
    if (max != null) return { text: `≤ ${max}`, exact: false };
    return null;
  }

  return { analyze, technologies, relations, CATEGORIES, MIN_SCORE };
});

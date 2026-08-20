'use strict';
/**
 * UI framework and library signatures.
 *
 * Where a bundler leaves its mark in the *bundle*, a framework leaves it in the
 * *running page*: the expando properties it hangs on DOM nodes, the globals it
 * defines, the attributes and classes it writes into the markup. Those survive
 * minification, which bundle text often does not, so they carry most of the
 * weight here.
 *
 * Every rule below was checked against something real -- a production build of
 * the framework's own starter app (test/fixtures/), the framework's published
 * dist file, or the framework's own website. The `seen:` comment records which.
 *
 * `coexists: true` marks a library that is normally used *alongside* another
 * framework rather than instead of it. It stops jQuery-next-to-React being
 * reported as a conflict, and keeps such a library from claiming the icon.
 */
(function (root) {
  const STRONG = 100;
  const MEDIUM = 55;
  const WEAK = 25;
  const list = (root.StackSignatures = root.StackSignatures || []);
  const relations = (root.StackRelations = root.StackRelations || []);

  list.push(
    {
      id: 'react',
      name: 'React',
      category: 'framework',
      color: '#58c4dc',
      home: 'https://react.dev',
      rules: [
        // React hangs its fiber, props and event bookkeeping on every host
        // node it owns, with a per-page random suffix.
        // seen: 19.2 (Vite starter), react.dev, nextjs.org, gatsbyjs.com, docusaurus.io
        {
          id: 'react-dom-expando',
          where: ['prop'],
          re: /__react(Fiber|Props|Container|Events|Marker|Resources)\$/,
          weight: STRONG,
          desc: '__reactFiber$… property on a DOM node',
        },
        {
          id: 'react-listening',
          where: ['prop'],
          re: /_reactListening/,
          weight: STRONG,
          desc: '_reactListening… delegation flag on the document',
        },
        // seen: 16.14 -- renamed to __reactFiber$ in 17
        {
          id: 'react-internal-instance',
          where: ['prop'],
          re: /__reactInternalInstance\$/,
          weight: STRONG,
          max: 16,
          desc: '__reactInternalInstance$ property (React <=16)',
        },
        // Set by the legacy ReactDOM.render() root, not by createRoot().
        // seen: gatsbyjs.com
        {
          id: 'react-root-container',
          where: ['prop'],
          str: '_reactRootContainer',
          weight: MEDIUM,
          desc: '_reactRootContainer from the legacy ReactDOM.render() root',
        },
        {
          id: 'react-global',
          where: ['global'],
          re: /^(React|ReactDOM)$/,
          weight: STRONG,
          desc: 'window.React / window.ReactDOM',
        },
        // The production error decoder URL, which is the one React string that
        // reliably survives minification -- and it moved in 19.
        // seen: react-dom 19.2 -> react.dev/errors/ ; 16.14/17.0/18.3 -> reactjs.org
        {
          id: 'react-errors-url',
          where: ['js'],
          str: 'https://react.dev/errors/',
          weight: STRONG,
          min: 19,
          desc: 'react.dev/errors/ decoder URL (React >=19)',
        },
        {
          id: 'react-errors-url-legacy',
          where: ['js'],
          str: 'reactjs.org/docs/error-decoder.html',
          weight: STRONG,
          max: 18,
          desc: 'reactjs.org error-decoder URL (React <=18)',
        },
        {
          id: 'react-minified-error',
          where: ['js'],
          str: 'Minified React error',
          weight: STRONG,
          desc: 'Minified React error #… message',
        },
        // seen: react-dom 16.14/17.0 SSR; absent from 18
        {
          id: 'react-dom-reactroot',
          where: ['dom', 'html'],
          str: 'data-reactroot',
          weight: MEDIUM,
          max: 17,
          desc: 'data-reactroot server-rendering marker (React <=17)',
        },
        // react-dom's streaming runtime defines these one-letter globals to
        // complete suspense boundaries. seen: nextjs.org (React 19)
        {
          id: 'react-streaming-globals',
          where: ['global'],
          re: /^\$R[BCTVX]$/,
          weight: MEDIUM,
          min: 18,
          desc: 'react-dom streaming suspense global ($RC/$RB/…)',
        },
      ],
    },

    {
      id: 'preact',
      name: 'Preact',
      category: 'framework',
      color: '#673ab8',
      home: 'https://preactjs.com',
      rules: [
        // seen: preactjs.com
        {
          id: 'preact-global',
          where: ['global'],
          re: /^(preact|__PREACT_DEVTOOLS__)$/,
          weight: STRONG,
          desc: 'window.preact',
        },
        // Preact mangles its internals to a fixed set of short names via its
        // own mangle.json, so the same properties appear in every build.
        // seen: 10.x (Vite starter), preactjs.com
        {
          id: 'preact-vnode-props',
          where: ['js'],
          all: ['.__k', '.__c', '.__e', '.__b'],
          weight: STRONG,
          desc: 'Preact mangled vnode internals (__k/__c/__e/__b together)',
        },
        {
          id: 'preact-dom-expando',
          where: ['prop'],
          re: /^__k$/m,
          weight: MEDIUM,
          desc: '__k child-vnode pointer on a DOM node',
        },
        {
          id: 'preact-attr',
          where: ['prop'],
          str: '__preactattr_',
          weight: STRONG,
          max: 8,
          desc: '__preactattr_ property (Preact <=8)',
        },
      ],
    },

    {
      id: 'vue',
      name: 'Vue',
      category: 'framework',
      color: '#41b883',
      home: 'https://vuejs.org',
      rules: [
        // seen: 3.5 (Vite starter), vuejs.org, nuxt.com
        {
          id: 'vue-app-expando',
          where: ['prop'],
          str: '__vue_app__',
          weight: STRONG,
          min: 3,
          desc: '__vue_app__ on the mount element (Vue 3)',
        },
        {
          id: 'vue-vnode-expando',
          where: ['prop'],
          re: /^(_vnode|__vnode)$/m,
          weight: MEDIUM,
          min: 3,
          desc: 'Vue 3 vnode bookkeeping on a DOM node',
        },
        // seen: vue 2.7 dist -- the instance is hung on its own element
        {
          id: 'vue2-expando',
          where: ['prop'],
          re: /^__vue__$/m,
          weight: STRONG,
          max: 2,
          desc: '__vue__ component instance on a DOM node (Vue 2)',
        },
        // Set by the production runtime, not only by the devtools bridge.
        // seen: 3.5 (Vite starter), vuejs.org, nuxt.com
        {
          id: 'vue-globals',
          where: ['global'],
          re: /^(__VUE__|__VUE_INSTANCE_SETTERS__|__VUE_SSR_SETTERS__)$/,
          weight: STRONG,
          min: 3,
          desc: 'Vue 3 runtime global on window',
        },
        {
          id: 'vue-global',
          where: ['global'],
          re: /^Vue$/,
          weight: STRONG,
          desc: 'window.Vue',
        },
        {
          id: 'vue-hmr',
          where: ['global'],
          re: /^__VUE_HMR_RUNTIME__$/,
          weight: STRONG,
          min: 3,
          dev: true,
          desc: 'Vue 3 HMR runtime',
        },
        // Internals are read off objects by name, so a minifier leaves them
        // alone. Deliberately *not* the @vue/reactivity flags (__v_isRef,
        // __v_isReactive): Alpine vendors that package, and matching those
        // reports alpinejs.dev as a Vue site. __v_isVNode lives in
        // runtime-core, which only a real Vue app ships.
        // seen: 3.5 (Vite starter); absent from alpinejs@3 cdn.min.js
        {
          id: 'vue-vnode-flag',
          where: ['js'],
          str: '__v_isVNode',
          weight: STRONG,
          min: 3,
          desc: '__v_isVNode flag from the Vue 3 runtime',
        },
        {
          id: 'vue-sfc-opts',
          where: ['js'],
          str: '__vccOpts',
          weight: STRONG,
          min: 3,
          desc: '__vccOpts compiled single-file-component options',
        },
        // seen: vue 2.7 dist -> /*! Vue.js v2.7.16 */
        {
          id: 'vue-banner',
          where: ['js'],
          re: /Vue\.js v(\d[\w.-]*)/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'Vue.js banner comment',
        },
        // Scoped-style attribute the SFC compiler stamps on every element.
        {
          id: 'vue-scope-id',
          where: ['dom', 'html'],
          re: /\bdata-v-[0-9a-f]{6,8}\b/,
          weight: MEDIUM,
          desc: 'data-v-… scoped-style attribute from a .vue component',
        },
        {
          id: 'vue2-ssr',
          where: ['dom', 'html'],
          str: 'data-server-rendered',
          weight: MEDIUM,
          max: 2,
          desc: 'data-server-rendered marker (Vue 2 SSR)',
        },
      ],
    },

    {
      id: 'angular',
      name: 'Angular',
      category: 'framework',
      color: '#e23237',
      home: 'https://angular.dev',
      rules: [
        // The root component element carries the exact framework version.
        // seen: angular.dev -> ng-version="22.1.3+sha-004cf3a"
        {
          id: 'angular-ng-version',
          where: ['dom', 'html'],
          re: /\bng-version="(\d[\w.+-]*)"/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'ng-version attribute on the root component',
        },
        // seen: angular.dev
        {
          id: 'angular-context',
          where: ['prop'],
          str: '__ngContext__',
          weight: STRONG,
          desc: '__ngContext__ on a component host element',
        },
        // Emulated view encapsulation writes these on every styled element.
        {
          id: 'angular-emulated-encapsulation',
          where: ['dom', 'html'],
          re: /\b_ng(host|content)-[\w-]+/,
          weight: STRONG,
          desc: '_nghost-/_ngcontent- view-encapsulation attribute',
        },
        {
          id: 'angular-server-context',
          where: ['dom', 'html'],
          str: 'ng-server-context',
          weight: STRONG,
          desc: 'ng-server-context attribute (Angular SSR/prerender)',
        },
        {
          id: 'angular-testability',
          where: ['global'],
          re: /^(getAllAngularRootElements|getAllAngularTestabilities|frameworkStabilizers)$/,
          weight: STRONG,
          desc: 'Angular testability hook on window',
        },
        // Angular prefixes its compiler-generated statics with U+03B5, which
        // survives minification because it is a property name.
        {
          id: 'angular-theta',
          where: ['js'],
          re: /ɵ(cmp|fac|mod|prov|inj|dir|pipe)\b/,
          weight: STRONG,
          desc: 'ɵcmp / ɵfac compiled Angular definition',
        },
        {
          id: 'angular-error-codes',
          where: ['js'],
          re: /NG0[0-9]{3}/,
          weight: MEDIUM,
          desc: 'NG0… runtime error code',
        },
        {
          id: 'angular-zone',
          where: ['global'],
          re: /^(Zone|__zone_symbol__)/,
          weight: WEAK,
          desc: 'zone.js, which Angular ships by default',
        },
      ],
    },

    {
      id: 'angularjs',
      name: 'AngularJS',
      category: 'framework',
      color: '#b52e31',
      home: 'https://angularjs.org',
      rules: [
        // seen: angularjs.org -> angular.version.full === '1.8.2'
        {
          id: 'angularjs-global',
          where: ['global'],
          re: /^angular$/,
          weight: STRONG,
          max: 1,
          desc: 'window.angular (AngularJS 1.x)',
        },
        // seen: angular 1.8.2 dist -> /*! AngularJS v1.8.2 */
        {
          id: 'angularjs-banner',
          where: ['js'],
          re: /AngularJS v(\d[\w.-]*)/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'AngularJS banner comment',
        },
        // seen: angularjs.org
        {
          id: 'angularjs-directives',
          where: ['dom', 'html'],
          re: /\bng-(app|controller|repeat|model|click|show|hide|if|include|view|bind)[="]/,
          weight: STRONG,
          max: 1,
          desc: 'ng-app / ng-controller / ng-repeat directive in the markup',
        },
        // Classes the 1.x compiler adds to every scope it links.
        {
          id: 'angularjs-scope-class',
          where: ['dom'],
          re: /^\.(ng-scope|ng-binding|ng-isolate-scope)$/m,
          weight: STRONG,
          max: 1,
          desc: 'ng-scope / ng-binding class added by the 1.x compiler',
        },
      ],
    },

    {
      id: 'svelte',
      name: 'Svelte',
      category: 'framework',
      color: '#ff3e00',
      home: 'https://svelte.dev',
      rules: [
        // window.__svelte = { v: Set(['5']) } -- the set holds the major
        // version, which is as precise as Svelte gets at runtime.
        // seen: 5.x (Vite starter), svelte.dev, stackoverflow.com
        {
          id: 'svelte-global',
          where: ['global'],
          re: /^__svelte$/,
          weight: STRONG,
          desc: 'window.__svelte version registry',
        },
        // seen: 5.x (Vite starter) -- prod builds keep the error-code URLs
        {
          id: 'svelte-error-url',
          where: ['js'],
          str: 'svelte.dev/e/',
          weight: STRONG,
          min: 5,
          desc: 'svelte.dev/e/… runtime error URL (Svelte >=5)',
        },
        // The compiler scopes component styles with a hash class.
        {
          id: 'svelte-scoped-class',
          where: ['dom'],
          re: /^\.svelte-[a-z0-9]{5,8}$/m,
          weight: STRONG,
          desc: 'svelte-… scoped-style class from the compiler',
        },
        {
          id: 'svelte-ssr-marker',
          where: ['dom', 'html'],
          str: 'data-svelte-h',
          weight: STRONG,
          max: 4,
          desc: 'data-svelte-h hydration marker (Svelte 4 SSR)',
        },
        {
          id: 'svelte-meta',
          where: ['prop'],
          str: '__svelte_meta',
          weight: STRONG,
          dev: true,
          desc: '__svelte_meta source location (dev build)',
        },
      ],
    },

    {
      id: 'solid',
      name: 'Solid',
      category: 'framework',
      color: '#4f88c6',
      home: 'https://solidjs.com',
      rules: [
        // Solid delegates events through a document-level registry and marks
        // each handler on the element it belongs to.
        // seen: 1.9 (Vite starter), solidjs.com
        {
          id: 'solid-delegate',
          where: ['prop', 'js'],
          str: '_$DX_DELEGATE',
          weight: STRONG,
          desc: '_$DX_DELEGATE delegated-event registry',
        },
        {
          id: 'solid-handler-expando',
          where: ['prop'],
          re: /^\$\$(click|input|change|keydown|keyup|submit|mousedown|pointerdown|focusin)$/m,
          weight: STRONG,
          desc: '$$click-style delegated handler on a DOM node',
        },
        {
          id: 'solid-hydration-key',
          where: ['dom', 'html'],
          re: /\bdata-hk="/,
          weight: MEDIUM,
          desc: 'data-hk hydration key',
        },
      ],
    },

    {
      id: 'qwik',
      name: 'Qwik',
      category: 'framework',
      color: '#ac7ef4',
      home: 'https://qwik.dev',
      rules: [
        // seen: 1.20 (Vite starter), qwik.dev -> q:version="1.19.0-dev+841d645"
        {
          id: 'qwik-version-attr',
          where: ['dom', 'html'],
          re: /\bq:version="(\d[\w.+-]*)"/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'q:version attribute on the Qwik container',
        },
        {
          id: 'qwik-container',
          where: ['dom', 'html'],
          re: /\bq:(container|render|base|manifest-hash)[="]/,
          weight: STRONG,
          desc: 'q:container / q:render container attribute',
        },
        {
          id: 'qwik-expando',
          where: ['prop'],
          re: /^(_qc_|_qwikjson_|document:__q_context__)$/m,
          weight: STRONG,
          desc: '_qc_ Qwik container state on a DOM node',
        },
        {
          id: 'qwik-global',
          where: ['global'],
          re: /^(qwikevents|qSymbolTracker)$/,
          weight: STRONG,
          desc: 'window.qwikevents event replay queue',
        },
      ],
    },

    {
      id: 'lit',
      name: 'Lit',
      category: 'framework',
      color: '#325cff',
      home: 'https://lit.dev',
      // Lit is a web-component base class, routinely used inside a page built
      // with something else.
      coexists: true,
      rules: [
        // Each package pushes its version into a global array, so this is an
        // exact version for free. seen: 3.x (Vite starter), lit.dev
        {
          id: 'lit-element-versions-global',
          where: ['global'],
          re: /^litElementVersions$/,
          weight: STRONG,
          desc: 'litElementVersions registry on window',
        },
        // The same trick for the other packages, but their versions are the
        // lit-html / reactive-element versions, not Lit's own.
        {
          id: 'lit-versions-global',
          where: ['global'],
          re: /^(litHtmlVersions|reactiveElementVersions|litPropertyMetadata)$/,
          weight: STRONG,
          noVersion: true,
          desc: 'litHtmlVersions / reactiveElementVersions registry on window',
        },
        {
          id: 'lit-marker',
          where: ['js'],
          str: '$lit$',
          weight: STRONG,
          desc: '$lit$ template part marker',
        },
        {
          id: 'lit-html-policy',
          where: ['js'],
          str: 'lit-html',
          weight: MEDIUM,
          desc: 'lit-html trusted-types policy name',
        },
        {
          id: 'lit-element-props',
          where: ['prop'],
          all: ['isUpdatePending', 'hasUpdated', 'renderOptions'],
          weight: MEDIUM,
          desc: 'ReactiveElement update bookkeeping on a custom element',
        },
      ],
    },

    {
      id: 'alpine',
      name: 'Alpine.js',
      category: 'framework',
      color: '#77c1d2',
      home: 'https://alpinejs.dev',
      coexists: true,
      rules: [
        // seen: alpinejs.dev -> Alpine.version === '3.16.2'
        {
          id: 'alpine-global',
          where: ['global'],
          re: /^Alpine$/,
          weight: STRONG,
          desc: 'window.Alpine',
        },
        {
          id: 'alpine-expando',
          where: ['prop'],
          re: /^_x_/m,
          weight: STRONG,
          desc: '_x_dataStack / _x_effects state on a DOM node',
        },
        {
          id: 'alpine-directives',
          where: ['dom', 'html'],
          re: /\bx-(data|init|show|bind|on|text|html|model|for|if|cloak|transition|ref)\b/,
          weight: STRONG,
          desc: 'x-data / x-show directive in the markup',
        },
        {
          id: 'alpine-error',
          where: ['js'],
          str: 'Alpine Expression Error',
          weight: STRONG,
          desc: 'Alpine expression error message',
        },
      ],
    },

    {
      id: 'htmx',
      name: 'htmx',
      category: 'framework',
      color: '#3d72d7',
      home: 'https://htmx.org',
      coexists: true,
      rules: [
        // seen: htmx.org -> htmx.version === '2.0.10'
        {
          id: 'htmx-global',
          where: ['global'],
          re: /^htmx$/,
          weight: STRONG,
          desc: 'window.htmx',
        },
        {
          id: 'htmx-attrs',
          where: ['dom', 'html'],
          re: /\bhx-(get|post|put|delete|patch|boost|trigger|target|swap|vals|ext|preserve|indicator)\b/,
          weight: STRONG,
          desc: 'hx-get / hx-boost attribute in the markup',
        },
        {
          id: 'htmx-internal-data',
          where: ['prop'],
          str: 'htmx-internal-data',
          weight: STRONG,
          desc: 'htmx-internal-data on a DOM node',
        },
      ],
    },

    {
      id: 'jquery',
      name: 'jQuery',
      category: 'framework',
      color: '#0868ac',
      home: 'https://jquery.com',
      coexists: true,
      // jQuery is on a large share of the web and is hardly ever the most
      // interesting thing about a page, so anything else found beside it takes
      // the icon -- including Backbone and Knockout, which ship with it.
      rank: -1,
      rules: [
        // seen: jquery.com (4.0.0), stackoverflow.com (3.7.1), angularjs.org (3.6.0)
        {
          id: 'jquery-global',
          where: ['global'],
          re: /^jQuery$/,
          weight: STRONG,
          desc: 'window.jQuery',
        },
        // $ alone is claimed by plenty of other libraries, so it only counts
        // as corroboration.
        {
          id: 'jquery-dollar',
          where: ['global'],
          re: /^\$$/,
          weight: WEAK,
          desc: 'window.$',
        },
        // jQuery caches per-element data under a key containing its version.
        // seen: jQuery3710126183713752006771 on stackoverflow.com
        {
          id: 'jquery-expando',
          where: ['prop'],
          re: /^(document:)?jQuery\d{4,}/m,
          weight: STRONG,
          desc: 'jQuery<version><random> data expando on a DOM node',
        },
        // seen: jquery 3.7.1 dist -> /*! jQuery v3.7.1 | (c) OpenJS Foundation
        {
          id: 'jquery-banner',
          where: ['js'],
          re: /jQuery v(\d[\w.-]*)/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'jQuery banner comment',
        },
        {
          id: 'jquery-url',
          where: ['url'],
          re: /\/jquery[.-][\d.]*(min\.)?js/i,
          weight: MEDIUM,
          desc: 'jquery.js script URL',
        },
      ],
    },

    {
      id: 'stimulus',
      name: 'Stimulus',
      category: 'framework',
      color: '#77e8b9',
      home: 'https://stimulus.hotwired.dev',
      coexists: true,
      rules: [
        {
          id: 'stimulus-global',
          where: ['global'],
          re: /^Stimulus$/,
          weight: STRONG,
          desc: 'window.Stimulus application',
        },
        {
          id: 'stimulus-controller-attr',
          where: ['dom', 'html'],
          re: /\bdata-controller[="]/,
          weight: STRONG,
          desc: 'data-controller attribute',
        },
        {
          id: 'stimulus-action-attr',
          where: ['dom', 'html'],
          re: /\bdata-action[="]/,
          weight: WEAK,
          desc: 'data-action attribute',
        },
      ],
    },

    {
      id: 'ember',
      name: 'Ember.js',
      category: 'framework',
      color: '#e04e39',
      home: 'https://emberjs.com',
      rules: [
        // seen: emberjs.com
        {
          id: 'ember-globals',
          where: ['global'],
          re: /^(EmberENV|__ember_auto_import__|emberAutoImportDynamic|Ember)$/,
          weight: STRONG,
          desc: 'EmberENV / __ember_auto_import__ on window',
        },
        {
          id: 'ember-auto-import-chunk',
          where: ['global', 'js'],
          str: 'webpackChunk_ember_auto_import_',
          weight: STRONG,
          desc: 'ember-auto-import webpack chunk registry',
        },
        {
          id: 'ember-view-class',
          where: ['dom'],
          re: /^\.ember-(view|application)$/m,
          weight: STRONG,
          desc: 'ember-view class on a rendered component',
        },
        {
          id: 'ember-element-id',
          where: ['dom', 'html'],
          re: /\bid="ember\d+"/,
          weight: MEDIUM,
          desc: 'id="ember123" auto-generated element id',
        },
      ],
    },

    {
      id: 'backbone',
      name: 'Backbone.js',
      category: 'framework',
      color: '#0071b5',
      home: 'https://backbonejs.org',
      coexists: true,
      rules: [
        // seen: backbonejs.org -> Backbone.VERSION === '1.6.0'
        {
          id: 'backbone-global',
          where: ['global'],
          re: /^Backbone$/,
          weight: STRONG,
          desc: 'window.Backbone',
        },
        {
          id: 'backbone-js',
          where: ['js'],
          re: /Backbone\.(VERSION|Model|Collection)\s*=/,
          weight: MEDIUM,
          desc: 'Backbone.Model / Backbone.VERSION assignment',
        },
      ],
    },

    {
      id: 'knockout',
      name: 'Knockout',
      category: 'framework',
      color: '#cc3300',
      home: 'https://knockoutjs.com',
      coexists: true,
      rules: [
        // seen: knockoutjs.com -> ko.version === '3.5.3'
        {
          id: 'knockout-global',
          where: ['global'],
          re: /^ko$/,
          weight: STRONG,
          desc: 'window.ko',
        },
        {
          id: 'knockout-expando',
          where: ['prop'],
          re: /^(document:)?__ko__/m,
          weight: STRONG,
          desc: '__ko__ data store on a DOM node',
        },
        {
          id: 'knockout-banner',
          where: ['js'],
          re: /Knockout JavaScript library v(\d[\w.-]*)/,
          weight: STRONG,
          exact: (m) => m[1],
          desc: 'Knockout banner comment',
        },
        {
          id: 'knockout-data-bind',
          where: ['dom', 'html'],
          re: /\bdata-bind="/,
          weight: WEAK,
          desc: 'data-bind attribute',
        },
      ],
    }
  );

  relations.push({
    id: 'preact',
    builtOn: ['react'],
    note: 'preact/compat answers to the React API, so the React markers on this page are attributed to Preact.',
    onlyIfWeaker: true,
  });

  if (typeof module === 'object' && module.exports) module.exports = list;
})(typeof globalThis !== 'undefined' ? globalThis : self);

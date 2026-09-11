// Experimental fixture only; not a production CSS loader or plugin API.
(() => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const physicalParent = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode').get;
  const check = (condition, message, observed) => {
    if (!condition) throw new Error(`${message}; observed=${JSON.stringify(observed)}`);
  };
  async function until(predicate, message, timeout = 1200) {
    const end = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > end) throw new Error(message);
      await pause(5);
    }
  }
  function element(className, parent = document.body) {
    const node = document.createElement('div'); node.className = className;
    parent.append(node); return node;
  }
  function css(text, parent = document.head) {
    const node = document.createElement('style'); node.textContent = text; parent.append(node); return node;
  }
  function actualStyleRoot(node) {
    while (node) {
      if (node instanceof ShadowRoot || node instanceof Document) return node;
      node = physicalParent.call(node);
    }
    throw Error('No connected physical style root');
  }
  const color = node => getComputedStyle(node).color;
  const links = root => [...root.querySelectorAll('link[data-probe-css]')];
  const uniqueURL = path => `${path}?run=${crypto.randomUUID()}`;

  function loader(variant) {
    const byRoot = new Map(), entries = new Set();
    let serial = 0;
    const issue = code => Object.assign(new Error(code), { code });
    function acquireOne(href, requestedRoot) {
      const root = variant === 'document-only' ? document : requestedRoot;
      const cacheRoot = variant === 'url-only-dedupe' ? document : root;
      const cache = byRoot.get(cacheRoot) ?? new Map(); byRoot.set(cacheRoot, cache);
      const url = new URL(href, location.href).href;
      const key = variant === 'no-dedupe' ? `${url}:${++serial}` : url;
      let entry = cache.get(key);
      if (!entry) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url; link.dataset.probeCss = '';
        let resolve, reject;
        const ready = new Promise((a, b) => { resolve = a; reject = b; });
        void ready.catch(() => {});
        entry = { link, ready, refs: 0, state: 'pending', dispose: undefined };
        const current = entry;
        let timer;
        function detach() { clearTimeout(timer); link.onload = null; link.onerror = null; }
        function forget() { if (cache.get(key) === current) cache.delete(key); }
        entry.dispose = () => {
          detach(); link.remove(); forget(); entries.delete(current);
          if (current.state === 'pending') { current.state = 'cancelled'; reject(issue('CSS_CANCELLED')); }
        };
        function fail(code) {
          if (current.state !== 'pending') return;
          current.state = 'failed'; detach();
          if (variant !== 'retain-failed-cache') forget();
          reject(issue(code));
        }
        link.onload = () => { if (current.state === 'pending') { current.state = 'ready'; detach(); resolve(); } };
        link.onerror = () => fail('CSS_LOAD_FAILED');
        if (variant !== 'no-deadline') timer = setTimeout(() => fail('CSS_LOAD_TIMEOUT'), 350);
        cache.set(key, entry); entries.add(entry);
        (root instanceof Document ? root.head : root).append(link);
      }
      const current = entry;
      current.refs++;
      let released = false;
      return { ready: current.ready, release() {
        if (released) return; released = true; current.refs--;
        if (variant === 'no-final-release') return;
        if (variant === 'retain-failed-cache' && current.state === 'failed') { current.link.remove(); return; }
        if (!current.refs || variant === 'no-reference-lifetime') current.dispose();
      } };
    }
    return {
      async acquire(asset, root, signal) {
        // The equivalent variant removes only the { assets: { css } } envelope.
        const files = variant === 'direct-generated-list' ? asset : asset.assets.css;
        const held = files.map(href => acquireOne(href, root));
        const release = () => held.forEach(item => item.release());
        let abort;
        const cancelled = new Promise((_, reject) => { abort = () => reject(issue('CSS_CANCELLED')); });
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        try {
          await Promise.race([Promise.all(held.map(item => item.ready)), cancelled]);
          return { release };
        } catch (error) {
          if (variant !== 'no-failure-rollback') release();
          throw error;
        } finally { signal.removeEventListener('abort', abort); }
      },
      dispose() { for (const entry of [...entries]) entry.dispose(); },
    };
  }

  function fixture(variant, files, options = {}) {
    const { createUiRuntime, createContributionRegistry, UiError } = window.probeCore;
    const resources = loader(variant), registry = createContributionRegistry();
    const target = { kind: 'builtin', render: () => null };
    for (const owner of ['p', 'q']) {
      const transaction = registry.beginActivation(owner);
      transaction.context.registerSurface({ id: 'main', target });
      if (owner === 'p') transaction.context.registerExtensionPoint({ id: 'children', kind: 'surface', contractMajor: 1,
        contextSchema: { type: 'object', properties: {}, additionalProperties: false } });
      else transaction.context.registerExtension({ id: 'child', kind: 'surface', surfaceId: 'main',
        point: { ownerPluginId: 'p', id: 'children', contractMajor: 1 } });
      transaction.commit();
    }
    let core;
    const driver = {
      allocate(anchor) { const node = element('placement', anchor); return { placement: node, dispose: () => node.remove() }; },
      visibility(anchor, hidden) { anchor.hidden = hidden; }, layout() {},
      overlay() {
        const dialog = document.createElement('dialog'); document.body.append(dialog);
        const node = element('overlay-placement', dialog); dialog.showModal();
        return { placement: node, dispose() { dialog.close(); dialog.remove(); }, error() {} };
      },
      async mount(input) {
        const container = input.placement;
        const asset = variant === 'direct-generated-list' ? files : { assets: { css: files } };
        let node, lease;
        const render = () => { node = element(options.className ?? 'owned', container); };
        if (variant === 'no-ready-gate') render();
        try {
          lease = await resources.acquire(asset, actualStyleRoot(container), input.signal);
          if (input.signal.aborted) { lease.release(); throw new UiError('CSS_CANCELLED'); }
          if (!node) render();
        } catch (error) {
          node?.remove();
          if (!input.signal.aborted) core.failAttempt(input.attemptId, error.code ?? 'CSS_LOAD_FAILED', 'artifact');
          throw error;
        }
        if (variant === 'release-on-abort') input.signal.addEventListener('abort', lease.release, { once: true });
        return { async dispose() {
          try { await options.beforeDomRemove?.(node); node.remove(); }
          finally { lease.release(); }
        } };
      },
    };
    core = createUiRuntime({ registry: registry.registry, driver, policy: () => true, canOverlay: () => true });
    return { core, resources,
      async dispose() { await core.dispose(); resources.dispose(); },
    };
  }
  // Do not spread the core's root getters: execution and attemptId change on retry.
  function mount(f, container = element('presentation')) {
    const root = f.core.mountRoot('p', 'main', { kind: 'builtin', render: () => null }, container);
    return { root, container };
  }
  async function ready(root) {
    await until(() => root.execution.phase !== 'starting', 'UI did not leave starting');
    check(root.execution.phase === 'ready', 'Expected ready execution', root.execution);
  }
  async function sandbox(variant = 'baseline', url) {
    const container = element('restricted-container'), name = `probe-${crypto.randomUUID()}`;
    const errors = [];
    await window.wujie.startApp({ name, el: container, url: url ?? uniqueURL('/plugin.html') + `&defaults=${variant === 'plugin-token-defaults'}`,
      alive: true, sync: false, fiber: false, degrade: false, loadError: (url, error) => errors.push({ url, message: error.message }) });
    const root = container.querySelector('wujie-app')?.shadowRoot;
    check(root, 'Wujie did not create its existing ShadowRoot');
    let observer;
    if (variant === 'live-token-copy') {
      const copy = () => root.host.style.setProperty('--nexus-test-color', getComputedStyle(document.documentElement).getPropertyValue('--nexus-test-color'));
      copy(); observer = new MutationObserver(copy); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    return { container, root, errors, async dispose() { observer?.disconnect(); await window.wujie.destroyApp(name); container.remove(); } };
  }
  function platform(variant) {
    if (variant !== 'no-platform-tokens') css(':root{--nexus-test-color:rgb(20, 40, 60)}:root[data-theme=dark]{--nexus-test-color:rgb(180, 200, 220)}');
    document.documentElement.removeAttribute('data-theme');
  }

  const tests = {
    async 'theme-inheritance'(variant) {
      const f = fixture(variant, [uniqueURL('/product.css')]), b = await sandbox(variant);
      const builtin = mount(f), dialog = document.createElement('dialog'); document.body.append(dialog);
      const overlay = mount(f, element('overlay-presentation', dialog)); dialog.showModal();
      try {
        await Promise.all([ready(builtin.root), ready(overlay.root)]);
        const values = () => [color(builtin.container.firstChild), color(b.root.querySelector('.restrictedOwned')), color(overlay.container.firstChild)];
        const light = values(); check(light.every(v => v === 'rgb(20, 40, 60)'), 'Initial semantics differ', light);
        document.documentElement.dataset.theme = 'dark'; await pause(25);
        const dark = values(); check(dark.every(v => v === 'rgb(180, 200, 220)'), 'Live theme did not reach all presentations', dark);
        return { light, dark, explicitBridge: variant === 'live-token-copy' };
      } finally { await f.dispose(); await b.dispose(); dialog.remove(); }
    },
    async 'selector-ownership'(variant) {
      const host = element('hostPrivate'), parent = element('pluginA'), nested = element('pluginB', parent);
      const buttonA = document.createElement('button'), buttonB = document.createElement('button');
      buttonA.className = 'pluginA-button'; buttonB.className = 'pluginB-button'; parent.prepend(buttonA); nested.append(buttonB);
      css('.hostPrivate{color:rgb(1,2,3)}.pluginB-button{color:rgb(3,2,1)}');
      const b = await sandbox(variant);
      try {
        css(variant === 'global-selectors'
          ? '.pluginA button, .hostPrivate{color:rgb(255,0,0)}'
          : '.pluginA-button{color:rgb(255,0,0)}');
        const observed = { host: color(host), own: color(buttonA), nested: color(buttonB), restricted: color(b.root.querySelector('.hostPrivate')) };
        check(observed.host === 'rgb(1, 2, 3)' && observed.nested === 'rgb(3, 2, 1)', 'Another owner was restyled', observed);
        check(observed.own === 'rgb(255, 0, 0)', 'Own style absent', observed);
        check(observed.restricted !== observed.host, 'Host private class crossed Wujie root', observed);
        return observed;
      } finally { await b.dispose(); }
    },
    async 'shared-lifetime'(variant) {
      const f = fixture(variant, [uniqueURL('/product.css')]);
      try {
        const a = mount(f), b = mount(f); await Promise.all([ready(a.root), ready(b.root)]);
        check(links(document).length === 1, 'Concurrent presentations duplicated stylesheet', links(document).length);
        a.root.dispose(); await f.core.settled();
        check(getComputedStyle(b.container.firstChild).padding === '17px', 'First release removed surviving presentation CSS', getComputedStyle(b.container.firstChild).padding);
        b.root.dispose(); await f.core.settled();
        check(links(document).length === 0, 'Last release retained stylesheet', links(document).length);
        return { peakLinks: 1, survivingPadding: '17px', finalLinks: 0 };
      } finally { await f.dispose(); }
    },
    async 'actual-style-root'(variant) {
      const f = fixture(variant, [uniqueURL('/product.css')]), b = await sandbox(variant), c = await sandbox(variant);
      try {
        const a = mount(f); await ready(a.root);
        const insideB = mount(f, b.root.querySelector('#anchor')), insideC = mount(f, c.root.querySelector('#anchor'));
        await Promise.all([ready(insideB.root), ready(insideC.root)]);
        const roots = [document, b.root, c.root];
        const count = roots.map(root => links(root).length);
        const padding = [a, insideB, insideC].map(item => getComputedStyle(item.container.firstChild).padding);
        check(count.every(n => n === 1), 'Same URL must mount once in each existing CSS root', { count, padding });
        check(padding.every(v => v === '17px'), 'Builtin CSS did not reach its physical presentation', padding);
        await f.core.dispose(); check(roots.every(root => !links(root).length), 'Existing roots retained CSS after disposal');
        return { linksPerRoot: count, padding };
      } finally { await f.dispose(); await b.dispose(); await c.dispose(); }
    },
    async 'ready-gate'(variant) {
      const f = fixture(variant, [uniqueURL('/slow.css')]);
      try {
        const a = mount(f); await pause(30);
        check(!a.container.querySelector('.owned'), 'Business DOM appeared before required CSS', a.root.execution);
        await ready(a.root);
        check(getComputedStyle(a.container.firstChild).padding === '17px', 'Ready DOM is unstyled');
        return { beforeCss: 'no-business-dom', afterCss: a.root.execution.phase };
      } finally { await f.dispose(); }
    },
    async 'failure-rollback-retry'(variant) {
      const f = fixture(variant, [uniqueURL('/product.css'), uniqueURL('/flaky.css')]);
      try {
        const a = mount(f); await until(() => a.root.execution.phase === 'failed', 'CSS 404 did not fail UI'); await f.core.settled();
        const failed = a.root.execution;
        check(failed.stage === 'artifact' && !a.container.firstChild, 'Failure attribution or presentation rollback missing', failed);
        check(links(document).length === 0, 'Partial load leaked references', links(document).length);
        a.root.retry(); await ready(a.root);
        const padding = getComputedStyle(a.container.firstChild).padding;
        check(padding === '17px', 'Retry reused failed asset result', padding);
        return { failure: { code: failed.error, stage: failed.stage }, retry: a.root.execution.phase, padding };
      } finally { await f.dispose(); }
    },
    async 'cancel-shared-load'(variant) {
      const f = fixture(variant, [uniqueURL('/slow.css')]);
      try {
        const a = mount(f), b = mount(f); await pause(25); a.root.dispose();
        await ready(b.root); await f.core.settled();
        check(!a.container.firstChild && getComputedStyle(b.container.firstChild).padding === '17px', 'Cancellation affected another consumer');
        b.root.dispose(); await f.core.settled(); await pause(20);
        check(!links(document).length, 'Cancelled/finished load retained resource', links(document).length);
        return { cancelledDom: 0, survivor: 'ready', finalLinks: 0 };
      } finally { await f.dispose(); }
    },
    async 'dom-cleanup-order'(variant) {
      let observed, finish;
      const f = fixture(variant, [uniqueURL('/product.css')], { beforeDomRemove: node => {
        observed = { connected: node.isConnected, padding: getComputedStyle(node).padding };
        return new Promise(resolve => { finish = resolve; });
      } });
      try {
        const a = mount(f); await ready(a.root); a.root.dispose();
        await until(() => observed, 'Dispose did not start');
        check(observed.connected && observed.padding === '17px', 'CSS released before asynchronous DOM cleanup', observed);
        finish(); await f.core.settled();
        check(!links(document).length, 'CSS survived completed DOM cleanup');
        return observed;
      } finally { finish?.(); await f.dispose(); }
    },
    async 'build-asset-identity'(variant, builds) {
      const current = variant === 'versioned-url-no-hash' ? builds.v2stable : builds.v2;
      for (const src of current.js) await new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      const selected = variant === 'handwritten-stale-assets' ? builds.v1.css : current.css;
      const f = fixture(variant, selected, { className: window.buildClass });
      try {
        const a = mount(f); await ready(a.root);
        const observed = { className: window.buildClass, color: color(a.container.firstChild), padding: getComputedStyle(a.container.firstChild).padding };
        check(observed.color === 'rgb(91, 37, 13)' && observed.padding === '14px', 'Rebuilt JS was paired with stale/manual CSS assets', observed);
        a.root.dispose(); await f.core.settled();
        check(!links(document).length, 'Built asset remained after release');
        return observed;
      } finally { await f.dispose(); }
    },
    async 'bounded-failure'(variant) {
      const f = fixture(variant, [uniqueURL('/hang.css')]);
      try {
        const a = mount(f);
        await until(() => a.root.execution.phase === 'failed', 'CSS without a deadline remained starting', 800);
        await f.core.settled();
        check(a.root.execution.error === 'CSS_LOAD_TIMEOUT' && a.root.execution.stage === 'artifact', 'Timeout lost asset attribution', a.root.execution);
        check(!links(document).length, 'Timed-out CSS remained mounted');
        return { error: a.root.execution.error, stage: a.root.execution.stage };
      } finally { await f.dispose(); }
    },
    async 'slot-overlay-lifetime'(variant) {
      const f = fixture(variant, [uniqueURL('/product.css')]);
      try {
        const a = mount(f); await ready(a.root); const anchor = element('slot-anchor', a.container.firstChild);
        const input = { id: 'children', contextKey: 'A', context: {} };
        const occurrence = f.core.mountSlot(a.root.attemptId, anchor, input);
        const child = () => f.core.snapshot(a.root.attemptId).occurrences[0].contributions[0].execution;
        await until(() => child()?.phase === 'ready', 'Child never became ready');
        const childAttempt = child().attemptId;
        f.core.updateSlot(a.root.attemptId, occurrence, { ...input, hidden: true });
        check(child().attemptId === childAttempt, 'Hiding changed execution identity');
        check(links(document).length === 1, 'Shared Slot emitted duplicate stylesheets', links(document).length);
        const handle = f.core.openOverlay(a.root.attemptId, 'main', null);
        await until(() => f.core.overlaySnapshot(a.root.attemptId).overlays.find(o => o.handle === handle)?.execution?.phase === 'ready', 'Overlay never became ready');
        f.core.unmountSlot(a.root.attemptId, occurrence); await f.core.settled();
        const overlayNode = document.querySelector('dialog .owned');
        check(overlayNode && getComputedStyle(overlayNode).padding === '17px', 'Child teardown removed owner/overlay CSS');
        a.root.dispose(); await f.core.settled();
        check(!links(document).length && !document.querySelector('dialog'), 'Owner end leaked overlay or stylesheet');
        return { hiddenAttemptRetained: true, overlaySurvivedChild: true, finalLinks: 0 };
      } finally { await f.dispose(); }
    },
    async 'single-css-owner'(variant) {
      const url = uniqueURL('/product.css');
      let imported;
      if (variant === 'host-static-import') {
        imported = document.createElement('link'); imported.rel = 'stylesheet'; imported.href = url;
        await new Promise((resolve, reject) => { imported.onload = resolve; imported.onerror = reject; document.head.append(imported); });
      }
      const f = fixture(variant, [url]);
      try {
        const a = mount(f); await ready(a.root);
        a.root.dispose(); await f.core.settled();
        const sentinel = element('owned');
        const remaining = [...document.querySelectorAll('link[rel=stylesheet]')].filter(link => link.href === new URL(url, location.href).href).length;
        const padding = getComputedStyle(sentinel).padding;
        check(remaining === 0 && padding === '0px', 'Host static import retained CSS after Runtime release', { remaining, padding });
        return { remaining, padding };
      } finally { await f.dispose(); imported?.remove(); }
    },
  };
  window.runStylingCase = async ({ variant, name, builds }) => {
    platform(variant);
    try { return { passed: true, observed: await tests[name](variant, builds) }; }
    catch (error) { return { passed: false, error: error.message }; }
  };
  window.characterizeWujieRetry = async () => {
    platform('baseline');
    const url = uniqueURL('/retry-plugin.html');
    const first = await sandbox('baseline', url);
    const firstResult = { loadErrors: first.errors.length, padding: getComputedStyle(first.root.querySelector('.owned')).padding };
    await first.dispose();
    const second = await sandbox('baseline', url);
    const secondResult = { loadErrors: second.errors.length, padding: getComputedStyle(second.root.querySelector('.owned')).padding };
    await second.dispose();
    return { first: firstResult, retry: secondResult, recovered: firstResult.loadErrors > 0 && secondResult.loadErrors === 0 && secondResult.padding === '17px' };
  };
})();

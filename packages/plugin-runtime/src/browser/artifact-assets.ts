import { UiError } from '../ui/runtime';

type StyleRoot = Document | ShadowRoot;
interface Entry { link: HTMLLinkElement; ready: Promise<void>; references: number; remove(): void }

/** One store per Browser Runtime. Physical roots and immutable URLs are the identity. */
export function createArtifactAssets(timeoutMs = 15_000) {
  const roots = new Map<StyleRoot, Map<string, Entry>>();
  let closed = false;
  function retain(root: StyleRoot, url: string) {
    let entries = roots.get(root);
    if (!entries) { entries = new Map(); roots.set(root, entries); }
    let entry = entries.get(url);
    if (!entry) {
      const document = root.nodeType === 9 ? root as Document : root.ownerDocument!;
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = url; link.dataset.nexusArtifactCss = '';
      let resolve!: () => void, reject!: (error: unknown) => void;
      const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      // A cancelled last waiter may leave a pending entry with no consumer.
      void ready.catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { clearTimeout(timer); link.removeEventListener('load', loaded); link.removeEventListener('error', failed); };
      const forget = () => {
        if (entries!.get(url) !== fresh) return;
        entries!.delete(url);
        if (!entries!.size && roots.get(root) === entries) roots.delete(root);
      };
      const loaded = () => { cleanup(); resolve(); };
      const fail = (reason: string) => { cleanup(); forget(); link.remove(); reject(new Error(`${reason}: ${url}`)); };
      const failed = () => fail('CSS_LOAD_ERROR');
      const fresh: Entry = { link, ready, references: 0, remove() { cleanup(); forget(); link.remove(); reject(new UiError('STALE_EXECUTION')); } };
      entry = fresh;
      // Publish before insertion: concurrent attempts always join this generation.
      entries.set(url, entry);
      link.addEventListener('load', loaded); link.addEventListener('error', failed);
      timer = setTimeout(() => fail('CSS_LOAD_TIMEOUT'), timeoutMs);
      try { (root.nodeType === 9 ? (root as Document).head : root).appendChild(link); }
      catch (error) { fail(`CSS_INSERT_ERROR ${String(error)}`); }
    }
    ++entry.references;
    let released = false;
    return { ready: entry.ready, release() { if (released) return; released = true; if (--entry.references === 0) entry.remove(); } };
  }
  return {
    async acquire(urls: readonly string[], root: StyleRoot, signal: AbortSignal): Promise<{ release(): void }> {
      if (closed) throw new UiError('UI_RUNTIME_CLOSED');
      if (signal.aborted) throw new UiError('STALE_EXECUTION');
      // Relative URLs must have been resolved by the build, never against the current route.
      const normalized = [...new Set(urls.map(url => {
        try { return new URL(url).href; } catch { throw new Error(`CSS_URL_INVALID: ${url}`); }
      }))];
      const held: ReturnType<typeof retain>[] = [];
      let released = false;
      const release = () => { if (released) return; released = true; for (const item of held) item.release(); };
      let abort!: () => void;
      const cancelled = new Promise<never>((_, reject) => { abort = () => { release(); reject(new UiError('STALE_EXECUTION')); }; });
      signal.addEventListener('abort', abort, { once: true });
      try {
        // Synchronous insertion preserves the artifact's cascade order.
        for (const url of normalized) held.push(retain(root, url));
        await Promise.race([Promise.all(held.map(item => item.ready)), cancelled]);
        if (signal.aborted) throw new UiError('STALE_EXECUTION');
        return { release };
      } catch (error) { release(); throw error; }
      finally { signal.removeEventListener('abort', abort); }
    },
    close() { closed = true; },
    dispose() { closed = true; for (const entries of [...roots.values()]) for (const entry of [...entries.values()]) entry.remove(); roots.clear(); },
  };
}

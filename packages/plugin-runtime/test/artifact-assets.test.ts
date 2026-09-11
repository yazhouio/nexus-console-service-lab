import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactAssets } from '../src/browser/artifact-assets';

class Link extends EventTarget {
  rel = ''; href = ''; dataset = {}; removed = false;
  constructor(readonly links: Link[]) { super(); }
  remove() { this.removed = true; const index = this.links.indexOf(this); if (index >= 0) this.links.splice(index, 1); }
}
function root(shadow = false) {
  const links: Link[] = [];
  const appendChild = (node: Link) => { links.push(node); };
  const document = { nodeType: 9, createElement: () => new Link(links), head: { appendChild } };
  return { links, root: (shadow ? { nodeType: 11, ownerDocument: document, appendChild } : document) as unknown as Document | ShadowRoot };
}
const signal = () => new AbortController();
const url = (name = 'a') => `https://cdn.example/plugin/${name}.css`;
const load = (link: Link) => link.dispatchEvent(new Event('load'));
const fail = (link: Link) => link.dispatchEvent(new Event('error'));
afterEach(() => vi.useRealTimers());

describe('Builtin artifact CSS ownership', () => {
  it('shares pending loads in artifact order and releases only the last reference', async () => {
    const assets = createArtifactAssets(), document = root();
    const a = assets.acquire([url(), url('b')], document.root, signal().signal);
    const b = assets.acquire([url()], document.root, signal().signal);
    expect(document.links.map(link => link.href)).toEqual([url(), url('b')]);
    load(document.links[1]); load(document.links[0]);
    const first = await a, second = await b;
    first.release(); first.release(); expect(document.links.map(link => link.href)).toEqual([url()]);
    second.release(); expect(document.links).toHaveLength(0);
  });
  it('keys by actual root and complete normalized URL, preserving queries and versions', async () => {
    const assets = createArtifactAssets(), document = root(), shadow = root(true);
    const held = [assets.acquire([url(), url() + '?v=2', url('v2/a')], document.root, signal().signal), assets.acquire([url()], shadow.root, signal().signal), assets.acquire(['https://cdn.example/plugin/x/../a.css'], document.root, signal().signal)];
    expect(document.links).toHaveLength(3); expect(shadow.links).toHaveLength(1);
    [...document.links, ...shadow.links].forEach(load);
    (await Promise.all(held)).forEach(item => item.release());
    expect(document.links).toHaveLength(0); expect(shadow.links).toHaveLength(0);
  });
  it('rolls back partial failure without removing another attempt’s CSS and retries a fresh generation', async () => {
    const assets = createArtifactAssets(), document = root();
    const a = assets.acquire([url()], document.root, signal().signal);
    const b = assets.acquire([url(), url('bad')], document.root, signal().signal);
    const rejected = expect(b).rejects.toThrow('CSS_LOAD_ERROR');
    const old = document.links[1]; load(document.links[0]); fail(old);
    await rejected; const first = await a;
    const retry = assets.acquire([url('bad')], document.root, signal().signal);
    expect(document.links).toHaveLength(2);
    fail(old); load(old); expect(document.links).toHaveLength(2);
    load(document.links[1]); (await retry).release(); first.release();
    expect(document.links).toHaveLength(0);
  });
  it('cancels one pending waiter without cancelling another and detaches abort after acquisition', async () => {
    const assets = createArtifactAssets(), document = root(), abortA = signal(), abortB = signal();
    const a = assets.acquire([url()], document.root, abortA.signal);
    const b = assets.acquire([url()], document.root, abortB.signal);
    const rejected = expect(a).rejects.toThrow('STALE_EXECUTION');
    abortA.abort(); await rejected; expect(document.links).toHaveLength(1);
    load(document.links[0]); const held = await b;
    abortB.abort(); expect(document.links).toHaveLength(1); // DOM may still be asynchronously unmounting.
    held.release(); expect(document.links).toHaveLength(0);
  });
  it('removes a last pending reference and ignores late events from that generation', async () => {
    vi.useFakeTimers();
    const assets = createArtifactAssets(100), document = root(), abort = signal();
    const first = assets.acquire([url()], document.root, abort.signal);
    const rejected = expect(first).rejects.toThrow();
    const old = document.links[0]; abort.abort(); await rejected;
    expect(document.links).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    const retry = assets.acquire([url()], document.root, signal().signal);
    fail(old); load(old); expect(document.links).toHaveLength(1);
    load(document.links[0]); (await retry).release(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds loading with an independent deadline and allows retry after timeout', async () => {
    vi.useFakeTimers();
    const assets = createArtifactAssets(100), document = root();
    const loading = assets.acquire([url()], document.root, signal().signal);
    const rejected = expect(loading).rejects.toThrow('CSS_LOAD_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(document.links).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    const retry = assets.acquire([url()], document.root, signal().signal);
    load(document.links[0]); (await retry).release();
  });
  it('closes admission before dispose, settles pending waiters and removes timers', async () => {
    vi.useFakeTimers();
    const assets = createArtifactAssets(), document = root();
    const pending = assets.acquire([url()], document.root, signal().signal);
    const rejected = expect(pending).rejects.toThrow(); assets.close();
    await expect(assets.acquire([url()], document.root, signal().signal)).rejects.toThrow('UI_RUNTIME_CLOSED');
    expect(document.links).toHaveLength(1); assets.dispose(); await rejected;
    expect(document.links).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects relative URLs and already aborted attempts before inserting any nodes', async () => {
    const assets = createArtifactAssets(), document = root(), aborted = signal(); aborted.abort();
    await expect(assets.acquire(['./styles.css'], document.root, signal().signal)).rejects.toThrow();
    await expect(assets.acquire([url()], document.root, aborted.signal)).rejects.toThrow('STALE_EXECUTION');
    expect(document.links).toHaveLength(0);
  });
});

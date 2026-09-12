import { afterEach, expect, it, vi } from 'vitest';
const { loadRemote, createInstance } = vi.hoisted(() => {
  const loadRemote = vi.fn(); return { loadRemote, createInstance: vi.fn(() => ({ loadRemote })) };
});
vi.mock('@module-federation/enhanced/runtime', () => ({ createInstance }));
import { federationBuiltins } from '../src/federation-builtins';
const pin = { id: 'demo', version: '1.0.0', name: 'demo_v1', entry: 'https://cdn.test/v1/remoteEntry.js' };
const plugin = { id: 'demo', version: '1.0.0', requires: [], provides: [], activate: vi.fn() };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });
function prepare(pins = [pin], timeout = 100) {
  vi.stubGlobal('NEXUS_SHARED_VERSIONS', { react: '19.2.8', sdk: '0.1.0' });
  return federationBuiltins(pins, timeout);
}
it('collects partial success without activation and reuses its Federation instance', async () => {
  loadRemote.mockResolvedValueOnce({ plugin, css: ['https://cdn.test/v1/a.css'] }).mockRejectedValueOnce(Error('404'));
  const load = prepare([pin, { ...pin, id: 'other', name: 'other_v1' }]);
  const result = await load();
  expect(result.builtins).toEqual([plugin]); expect(plugin.activate).not.toHaveBeenCalled();
  expect(result.failures[0]).toMatchObject({ id: 'other', stage: 'load', reason: 'Error: 404' });
  await load(); expect(createInstance).toHaveBeenCalledTimes(1);
});
it.each([
  [{ plugin, css: undefined }, 'exports'],
  [{ plugin, css: ['relative.css'] }, 'exports'],
  [{ plugin: { ...plugin, version: '2.0.0' }, css: [] }, 'identity'],
])('rejects invalid artifact %j', async (value, stage) => {
  loadRemote.mockResolvedValue(value);
  const result = await prepare()();
  expect(result.builtins).toEqual([]); expect(result.failures[0].stage).toBe(stage);
});
it('stops waiting and ignores late results', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  loadRemote.mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = prepare()(); await vi.advanceTimersByTimeAsync(101);
  const result = await pending; expect(result.failures[0].stage).toBe('timeout');
  resolve({ plugin, css: [] }); await Promise.resolve();
  expect(result.builtins).toEqual([]); expect(plugin.activate).not.toHaveBeenCalled();
});

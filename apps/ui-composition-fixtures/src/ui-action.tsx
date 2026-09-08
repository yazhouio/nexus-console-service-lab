import { connectActionHost } from '@nexus/plugin-runtime/client';
void connectActionHost(async ({ actionId, context, capabilities, signal }) => {
  if (actionId === 'slow') await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 60_000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(Error('Cancelled')); }, { once: true });
  });
  const current = await capabilities.invoke('routes.query@1', 'current', null);
  return { context, current };
});

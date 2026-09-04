import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { UiProvider } from '@nexus/plugin-runtime/react';
import type { UiClient } from '@nexus/plugin-runtime/client';
import { useHostServices } from './HostContext';
export function UiOwner({ owner, children }: { owner: string; children: ReactNode }) {
  const { ui } = useHostServices(); const root = useRef<HTMLDivElement>(null); const [client, setClient] = useState<UiClient>();
  useLayoutEffect(() => { if (!root.current) return; const bound = ui.attachOwner(owner, root.current); setClient(bound.client); return () => bound.dispose(); }, [ui, owner]);
  return <div ref={root}>{client && <UiProvider client={client}>{children}</UiProvider>}</div>;
}

import { RouteLink } from '@nexus/plugin-runtime/react';
import type { PublicNavigation, PublicRouteLocation } from '@nexus/plugin-runtime';

export function Navigation({ items, current }: { readonly items: readonly PublicNavigation[]; readonly current: PublicRouteLocation | null }) {
  return <ul>{items.map(item => <li key={`${item.ownerPluginId}/${item.id}`}>
    {item.state === 'LINK' && item.routeId ? <RouteLink routeId={item.routeId} params={item.params ?? {}} current={current?.routeId === item.routeId}>{item.label}</RouteLink>
      : item.state === 'DISABLED' ? <span aria-disabled="true" title={item.diagnostic}>{item.label} <small>({item.diagnostic})</small></span> : <span>{item.label}</span>}
    {item.children.length > 0 && <Navigation items={item.children} current={current} />}
  </li>)}</ul>;
}

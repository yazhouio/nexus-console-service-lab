import { RouteLink } from '@nexus/plugin-runtime/react';
import type { PublicNavigation, PublicRouteLocation } from '@nexus/plugin-runtime';

export function Navigation({ items, current }: { readonly items: readonly PublicNavigation[]; readonly current: PublicRouteLocation | null }) {
  return <ul className="core-el-ul core-nav-list">{items.map(item => <li className={"core-el-li " + (`core-nav-item core-nav-item--${item.state.toLowerCase()}`)} key={`${item.ownerPluginId}/${item.id}`}>
    {item.state === 'LINK' && item.routeId ? <RouteLink className="core-el-a" routeId={item.routeId} params={item.params ?? {}} current={current?.routeId === item.routeId}><span className="core-el-span core-nav-icon" aria-hidden="true">{item.label.slice(0, 1)}</span><span className="core-el-span">{item.label}</span></RouteLink>
      : item.state === 'DISABLED' ? <span className="core-el-span" aria-disabled="true" title={item.diagnostic}><span className="core-el-span core-nav-icon" aria-hidden="true">{item.label.slice(0, 1)}</span><span className="core-el-span">{item.label}</span><small className="core-el-small">({item.diagnostic})</small></span> : <span className="core-el-span"><span className="core-el-span core-nav-icon" aria-hidden="true">{item.label.slice(0, 1)}</span><span className="core-el-span">{item.label}</span></span>}
    {item.children.length > 0 && <Navigation items={item.children} current={current} />}
  </li>)}</ul>;
}

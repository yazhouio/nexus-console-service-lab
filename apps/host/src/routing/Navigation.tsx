import { Link, useLocation } from 'react-router';
import type { ResolvedNavigation, RouteModel } from './route-model';

export function Navigation({ model, items = model.navigation }: { readonly model: RouteModel; readonly items?: readonly ResolvedNavigation[] }) {
  const location = useLocation();
  return <ul>{items.map(item => {
    const destination = model.destination(item.contribution.id, location.pathname + location.search);
    return <li key={item.contribution.id}>
      {destination.state === 'LINK' ? <Link to={destination.href} aria-current={location.pathname === destination.href ? 'page' : undefined}>{item.contribution.label}</Link>
        : destination.state === 'DISABLED' ? <span aria-disabled="true" title={destination.diagnostic.code}>{item.contribution.label} <small>({destination.diagnostic.code})</small></span>
        : <span>{item.contribution.label}</span>}
      {item.children.length > 0 && <Navigation model={model} items={item.children} />}
    </li>;
  })}</ul>;
}

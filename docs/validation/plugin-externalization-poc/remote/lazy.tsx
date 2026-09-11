import { createPortal } from 'react-dom';
import { useUiClient } from '@nexus/plugin-runtime/react';
import classes from './lazy.module.css?artifact';
export const reactDomCreatePortal = createPortal;
export function LazyView() {
  const client = useUiClient();
  return <div className={classes.card} data-probe="lazy">Lazy shared client: {typeof client.mountSlot}</div>;
}

import '@nexus/design-tokens/theme.css';
import '@nexus/design-tokens/baseline.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { BrowserHost } from '@nexus/browser-host';
import { distribution } from './distribution';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Host root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserHost distribution={distribution} />
  </StrictMode>,
);


// PROTECTED: mounts the design layer. Cursor may not edit this file.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CommerceProvider, createMockCommerce } from './speedvendors';
import StorefrontApp from './storefront/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommerceProvider commerce={createMockCommerce()}>
      <StorefrontApp />
    </CommerceProvider>
  </StrictMode>,
);

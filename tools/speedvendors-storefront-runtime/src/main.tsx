// PROTECTED: mounts the design layer. Cursor may not edit this file.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CommerceProvider,
  createMockCommerce,
  createStoreApiCommerce,
  hasLiveCommerceConfig,
  readRuntimeConfig,
} from './speedvendors';
import StorefrontApp from './storefront/App';

const cfg = readRuntimeConfig();
const commerce = hasLiveCommerceConfig(cfg)
  ? createStoreApiCommerce({ apiKey: cfg.storeApiKey!, baseUrl: cfg.apiBase! })
  : createMockCommerce();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommerceProvider commerce={commerce}>
      <StorefrontApp />
    </CommerceProvider>
  </StrictMode>,
);

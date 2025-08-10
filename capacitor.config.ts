import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.f5f7031422474e0c9124fa81d2e3fa11',
  appName: 'store-orchestrator',
  webDir: 'dist',
  server: {
    url: 'https://f5f70314-2247-4e0c-9124-fa81d2e3fa11.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  bundledWebRuntime: false
};

export default config;
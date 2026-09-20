import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Hermetic CSS pipeline: an inline postcss config stops Vite from walking up the
  // directory tree and picking up a parent repository's postcss/tailwind config.
  css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1' },
});

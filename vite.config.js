import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 6000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});

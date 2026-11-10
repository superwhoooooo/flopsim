import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: ['index.html', 'drag-drop.html'],
    },
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});

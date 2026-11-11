import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// rapier3d-compat inlines its 3 MB physics WebAssembly as a 4 MB base64 string inside the JS.
// That is slow on phones: a bigger download, a huge string to parse, then decode, then compile.
// The package also ships the identical raw .wasm, so we swap the inlined blob for a fetch() of that
// file: smaller over the wire, compiled while it streams, and cached separately from game code.
const RAPIER_WASM = fileURLToPath(new URL('./node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm', import.meta.url));
function rapierWasmAsFile() {
  return {
    name: 'rapier-wasm-as-file',
    enforce: 'pre',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs/.test(id)) return null;
      const re = /[\w$]+\.toByteArray\("[A-Za-z0-9+/=]{100000,}"\)\.buffer/;
      if (!re.test(code)) this.error('rapier-wasm-as-file: inlined wasm not found (rapier version changed?)');
      return {
        code: `import __rapierWasmUrl from ${JSON.stringify(RAPIER_WASM + '?url')};\n` + code.replace(re, 'fetch(__rapierWasmUrl)'),
        map: null,
      };
    },
    // start downloading the physics engine right away, in parallel with the JS
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const wasm = ctx.bundle && Object.keys(ctx.bundle).find((f) => f.endsWith('.wasm'));
        if (!wasm || !/index\.html$/.test(ctx.path || '')) return html;   // only the game page needs physics
        return html.replace('</title>', `</title>\n  <link rel="preload" href="./${wasm}" as="fetch" type="application/wasm" crossorigin>`);
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [rapierWasmAsFile()],
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: ['index.html', 'drag-drop.html'],
      output: {
        // libraries rarely change: keep them in their own files so a game update doesn't re-download them
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/@dimforge')) return 'rapier';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});

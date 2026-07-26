import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const applicationVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ASRBOX_VERSION__: JSON.stringify(applicationVersion),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) return 'vendor-react';
          if (normalizedId.includes('@tanstack')) return 'vendor-tanstack';
          if (normalizedId.includes('@radix-ui')) return 'vendor-radix';
          if (normalizedId.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
});

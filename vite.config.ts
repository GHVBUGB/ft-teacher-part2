import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { sites } from '@openai/sites-vite-plugin';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  plugins: [react(), ...(existsSync(path('./.openai/hosting.json')) ? [sites()] : []), {name:'ft-live-entry',transformIndexHtml: {order:'pre',handler(html) {
    return process.env.FT_FRONTEND_MODE === 'live' ? html.replace('/src/app/main.tsx','/src/features/production/LiveApp.tsx') : html;
  }}}],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: [
      { find: '@/components/ui', replacement: path('./src/shared/ui') },
      { find: '@/hooks', replacement: path('./src/shared/hooks') },
      { find: '@/lib/utils', replacement: path('./src/shared/utils.ts') },
      { find: '@', replacement: path('./src') },
    ],
  },
  server: { host: 'localhost', port: 3000, proxy: { '/api/speechace': 'http://127.0.0.1:8000', '/api/speechsuper': 'http://127.0.0.1:8000' } },
  build: { outDir: process.env.FT_FRONTEND_MODE === 'live' ? 'dist-production' : 'dist', emptyOutDir: true },
});

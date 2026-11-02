import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Sur GitHub Pages, le site vit sous /hameau/.
  base: process.env.GITHUB_PAGES ? '/hameau/' : '/',
  // La simulation tourne dans un Web Worker en module ES.
  worker: { format: 'es' },
  server: { port: 5173 },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    outDir: '../../dist/apps/frontend',
    emptyOutDir: true,
    sourcemap: true,
  },
});

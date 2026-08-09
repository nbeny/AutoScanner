import * as path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      // The pure @autoscanner/target-parser lib is used for client-side target
      // hinting. Vite has no tsconfig-paths plugin, so alias the workspace path.
      '@autoscanner/target-parser': path.resolve(
        __dirname,
        '../../libs/target-parser/src/index.ts',
      ),
      '@autoscanner/scanner-sdk': path.resolve(__dirname, '../../libs/scanner-sdk/src/index.ts'),
    },
  },
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

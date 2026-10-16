import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@crossfire/shared': path.resolve(__dirname, '../shared/protocol.ts'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:8080',
      },
    },
  },
});

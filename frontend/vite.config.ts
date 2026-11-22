import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The page calls /api on this port; `npm run dev:backend` serves it at :8787.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});

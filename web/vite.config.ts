import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Calc, battle data client and Korean names live in server/src and are shared as-is.
const shared = fileURLToPath(new URL('../server/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': shared },
    dedupe: ['@smogon/calc'],
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
  },
});

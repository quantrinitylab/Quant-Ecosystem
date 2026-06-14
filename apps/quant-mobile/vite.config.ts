import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web layer for the Capacitor mega-shell. `vite build` emits to `dist/`, which
// capacitor.config.ts uses as `webDir` for `npx cap sync`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});

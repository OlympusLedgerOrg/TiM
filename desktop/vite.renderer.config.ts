import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  root: 'splash',
  build: {
    outDir: '../.vite/renderer/splash_window',
  },
});

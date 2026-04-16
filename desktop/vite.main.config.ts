import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'main/main.ts',
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-squirrel-startup',
        'electron-store',
        'path',
        'fs',
        'url',
        'child_process',
        'crypto',
        'net',
        'os',
      ],
    },
    sourcemap: true,
    minify: false,
  },
  resolve: {
    // Required for Node.js built-ins
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});

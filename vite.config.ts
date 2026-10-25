import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: './',
  define: { __CHEERBOARD_BROWSER_PREVIEW__: JSON.stringify(command === 'serve') },
  server: { host: '127.0.0.1' },
  build: {
    target: ['chrome61', 'es2017'],
    cssTarget: 'chrome61',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    cssCodeSplit: false,
    minify: 'esbuild',
    lib: {
      entry: 'src/main.ts',
      name: 'Cheerboard',
      formats: ['iife'],
      fileName: () => 'assets/app.js',
      cssFileName: 'app',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
}));

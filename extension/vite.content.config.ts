import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extname, resolve } from 'node:path';

// Vite config for the content script build.
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content.tsx'),
      },
      output: {
        // Single bundled content script file for MV3.
        entryFileNames: 'content.js',
        assetFileNames: (assetInfo) => {
          if (extname(assetInfo.name ?? '') === '.css') {
            return 'content.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
        inlineDynamicImports: true,
      },
    },
  },
});


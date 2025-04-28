import preact from '@preact/preset-vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// Get current directory path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/ui-assets'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'main.tsx'), // Entry point for the UI
      },
      output: {
        entryFileNames: `assets/main.js`,
        chunkFileNames: `assets/chunk.js`,
        assetFileNames: `assets/style.[ext]`,
      },
    },
  },
  // Optional: Configure base if needed, depends on how HTML is served
  // base: './',
});

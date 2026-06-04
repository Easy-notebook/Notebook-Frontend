import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const aliases = {
  '@': resolve(__dirname, './src'),
  '@Editor': resolve(__dirname, './src/components/Editor'),
  '@Notebook': resolve(__dirname, './src/components/Notebook'),
  '@LeftSidebar': resolve(__dirname, './src/components/Notebook/sections/LeftSidebar'),
  '@RightSidebar': resolve(__dirname, './src/components/Notebook/sections/RightSideBar'),
  '@Store': resolve(__dirname, './src/store'),
  '@Services': resolve(__dirname, './src/services'),
  '@Utils': resolve(__dirname, './src/utils'),
  '@Config': resolve(__dirname, './src/config'),
  '@Types': resolve(__dirname, './src/types'),
  '@WorkflowMode': resolve(__dirname, './src/components/Scenario/Workflow'),
  '@BasicMode': resolve(__dirname, './src/components/Scenario/View'),
  '@Storage': resolve(__dirname, './src/storage'),
  '@Hooks': resolve(__dirname, './src/hooks'),
  'decode-named-character-reference': resolve(
    __dirname,
    './node_modules/decode-named-character-reference/index.js'
  ),
  'hast-util-from-html-isomorphic': resolve(
    __dirname,
    './node_modules/hast-util-from-html-isomorphic/index.js'
  ),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  build: {
    outDir: 'dist/easynotebook',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      cssFileName: 'styles',
      entry: resolve(__dirname, 'src/notebook/index.ts'),
      formats: ['es', 'umd'],
      name: 'EasyNotebook',
      fileName: (format) => (format === 'es' ? 'index.es.js' : 'index.umd.js'),
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOMClient',
        },
      },
    },
  },
});

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AAL_');
  const target = new URL(env.AAL_NOTEBOOK_TARGET || 'http://127.0.0.1:8787');
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('AAL_NOTEBOOK_TARGET must be a loopback HTTP origin');
  }
  const nativeOriginGuard = {
    name: 'native-notebook-origin',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/aal-api/')) return next();
        const host = request.headers.host || '';
        const origin = request.headers.origin;
        if (
          !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`)
        ) {
          response.statusCode = 403;
          response.end('Local same-origin requests required');
          return;
        }
        next();
      });
    },
  };
  return {
    plugins: [react(), nativeOriginGuard],
    server: {
      port: 3000,
      proxy: {
        '/aal-api': {
          target: target.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/aal-api/, '/api'),
          configure: (proxy) => proxy.on('proxyReq', (request) => request.removeHeader('origin')),
        },
      },
    },
    resolve: {
      alias: {
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
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': [
              'antd',
              '@fluentui/react-components',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
            ],
            'charts-vendor': ['recharts', 'react-google-charts'],
            'editor-vendor': ['@tiptap/react', '@tiptap/starter-kit', 'react-quill'],
            'utils-vendor': ['lodash-es', 'date-fns', 'axios'],
          },
        },
      },
    },
  };
});

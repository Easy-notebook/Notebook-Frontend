/* eslint-disable no-undef */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@Editor': resolve(__dirname, './src/components/Editor'),
      '@Notebook': resolve(__dirname, './src/components/Notebook'),
      '@LeftSidebar': resolve(__dirname, './src/components/Notebook/LeftSideBar'),
      '@RightSidebar': resolve(__dirname, './src/components/Notebook/RightSideBar'),
      '@MainContainer': resolve(__dirname, './src/components/Notebook/MainContainer'),
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
});

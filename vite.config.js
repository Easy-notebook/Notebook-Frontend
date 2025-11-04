import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
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
      '@WorkflowMode': resolve(__dirname, './src/components/Senario/WorkflowMode'),
      '@BasicMode': resolve(__dirname, './src/components/Senario/BasicMode'),
      '@Storage': resolve(__dirname, './src/storage'),
      '@Hooks': resolve(__dirname, './src/hooks')
    }
  }
})
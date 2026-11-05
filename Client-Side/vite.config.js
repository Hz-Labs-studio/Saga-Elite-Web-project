import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // load env from workspace root and current dir
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, __dirname, '')
  const backendTarget =
    process.env.VITE_BACKEND_TARGET ||
    localEnv.VITE_BACKEND_TARGET ||
    rootEnv.VITE_BACKEND_TARGET ||
    'http://localhost:5001'

  return {
    plugins: [react()],
    envDir: '../',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      hmr: {
        host: 'localhost',
        protocol: 'ws',
      },
      watch: {
        usePolling: true,
        interval: 1000,
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/health': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
        '/Uploads': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})

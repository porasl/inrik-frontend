import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://192.168.4.76:8082';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    host: true,
    strictPort: true,
    proxy: {
      // All /graphql and /api/* requests are forwarded to the Java backend
      '/graphql': {
        target: BACKEND,
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Origin', BACKEND);
            proxyReq.setHeader('Referer', BACKEND + '/');
          });
        }
      },
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Origin', BACKEND);
            proxyReq.setHeader('Referer', BACKEND + '/');
          });
        }
      },
    },
  },
})

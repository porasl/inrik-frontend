import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { API_ORIGIN } from './app.config.js'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    host: true,
    strictPort: true,
    proxy: {
      // All /graphql and /api/* requests are forwarded to the Java backend
      '/graphql': {
        target: API_ORIGIN,
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Origin', API_ORIGIN);
            proxyReq.setHeader('Referer', API_ORIGIN + '/');
          });
        }
      },
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Origin', API_ORIGIN);
            proxyReq.setHeader('Referer', API_ORIGIN + '/');
          });
        }
      },
    },
  },
})

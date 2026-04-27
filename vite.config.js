import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { LOCAL_CONFIG } from './local.config.js'

export default defineConfig(() => {
  const protocol = LOCAL_CONFIG.APP_PROTOCOL || 'http';
  const host = LOCAL_CONFIG.APPLICATION_HOST || '';
  const apiOrigin = LOCAL_CONFIG.API_ORIGIN || (host && LOCAL_CONFIG.API_PORT ? `${protocol}://${host}:${LOCAL_CONFIG.API_PORT}` : '');

  if (!apiOrigin) {
    throw new Error('Missing VITE_API_ORIGIN or VITE_APPLICATION_HOST/VITE_API_PORT configuration.');
  }

  return {
    plugins: [react()],
    server: {
      port: 4000,
      host: true,
      strictPort: true,
      proxy: {
        '/graphql': {
          target: apiOrigin,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Origin', apiOrigin);
              proxyReq.setHeader('Referer', apiOrigin + '/');
            });
          }
        },
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Origin', apiOrigin);
              proxyReq.setHeader('Referer', apiOrigin + '/');
            });
          }
        },
      },
    },
  };
})

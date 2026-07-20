import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { LOCAL_CONFIG } from './local.config.js'

export default defineConfig(() => {
  const protocol = LOCAL_CONFIG.APP_PROTOCOL || 'http';
  const host = LOCAL_CONFIG.APPLICATION_HOST || '';
  const apiOrigin = LOCAL_CONFIG.API_ORIGIN || (host && LOCAL_CONFIG.API_PORT ? `${protocol}://${host}:${LOCAL_CONFIG.API_PORT}` : '');
  const imageServiceOrigin = LOCAL_CONFIG.IMAGE_SERVICE_ORIGIN
    || (host && LOCAL_CONFIG.IMAGE_SERVICE_PORT ? `${protocol}://${host}:${LOCAL_CONFIG.IMAGE_SERVICE_PORT}` : '');

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
        '/image-tools': {
          target: imageServiceOrigin,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/image-tools/, ''),
        },
        '/graphql': {
          target: apiOrigin,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('Origin', apiOrigin);
              proxyReq.setHeader('Referer', apiOrigin + '/');
              // Preserve Authorization header — never strip it
              const auth = req.headers['authorization'];
              if (auth) proxyReq.setHeader('Authorization', auth);
            });
          }
        },
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('Origin', apiOrigin);
              proxyReq.setHeader('Referer', apiOrigin + '/');
              // Preserve Authorization header — never strip it
              const auth = req.headers['authorization'];
              if (auth) proxyReq.setHeader('Authorization', auth);
            });
          }
        },
        '/stock-proxy.php': {
          target: 'https://bazaartoday.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
})

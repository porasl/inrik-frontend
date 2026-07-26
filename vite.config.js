import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { LOCAL_CONFIG } from './local.config.js'

export default defineConfig(() => {
  const protocol = LOCAL_CONFIG.APP_PROTOCOL || 'http';
  const serviceHost = LOCAL_CONFIG.SERVICE_HOST || '127.0.0.1';
  const apiOrigin = LOCAL_CONFIG.API_ORIGIN || (LOCAL_CONFIG.API_PORT ? `${protocol}://${serviceHost}:${LOCAL_CONFIG.API_PORT}` : '');
  const contentServiceOrigin = LOCAL_CONFIG.CONTENT_SERVICE_ORIGIN
    || (LOCAL_CONFIG.CONTENT_SERVICE_PORT ? `${protocol}://${serviceHost}:${LOCAL_CONFIG.CONTENT_SERVICE_PORT}` : '');

  if (!apiOrigin) {
    throw new Error('Missing API_ORIGIN or API_PORT configuration.');
  }

  return {
    plugins: [react()],
    server: {
      port: 4000,
      host: true,
      strictPort: true,
      proxy: {
        '/content-tools': {
          target: contentServiceOrigin,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/content-tools/, ''),
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

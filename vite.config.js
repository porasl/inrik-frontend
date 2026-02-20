import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://192.168.4.63:8082';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // binds to 0.0.0.0 → accessible at 192.168.4.63:5173
    proxy: {
      // All /graphql and /api/* requests are forwarded to the Java backend
      '/graphql': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
})

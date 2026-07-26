export const LOCAL_CONFIG = {
  APP_PROTOCOL: 'http',
  // Leave blank so browser-facing URLs use the hostname that opened the app.
  APPLICATION_HOST: '',
  // Vite runs on the same machine as the backend services. Keep this separate
  // from the browser-facing host so a LAN address change cannot break APIs.
  SERVICE_HOST: '127.0.0.1',
  API_PORT: '8082',
  CONTENT_SERVICE_PORT: '8083',
  NOTIFY_PORT: '8084',
  PUBLIC_PORT: '3000',
  API_BASE: '',
  API_ORIGIN: '',
  NOTIFY_URL: '',
  PUBLIC_BASE: '',
};

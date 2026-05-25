import { LOCAL_CONFIG } from './local.config.js';

const readConfig = (key, fallback = '') => {
	const value = LOCAL_CONFIG?.[key];
	return value == null || value === '' ? fallback : value;
};

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const APP_PROTOCOL = readConfig('APP_PROTOCOL', 'http');
const browserHost = globalThis.window?.location?.hostname || '';
const configuredHost = readConfig('APPLICATION_HOST', '');
const isLocalBrowserHost = /^(localhost|127\.0\.0\.1)$/i.test(browserHost);
const APPLICATION_HOST = isLocalBrowserHost
	? browserHost
	: (configuredHost || browserHost);

const buildOrigin = (originKey, portKey) => {
	const explicitOrigin = trimTrailingSlash(readConfig(originKey));
	if (explicitOrigin) return explicitOrigin;

	const port = readConfig(portKey);
	if (!APPLICATION_HOST) return '';

	return port
		? `${APP_PROTOCOL}://${APPLICATION_HOST}:${port}`
		: `${APP_PROTOCOL}://${APPLICATION_HOST}`;
};

export const APPLICATION_IP = APPLICATION_HOST;

export const API_PORT = readConfig('API_PORT');
export const NOTIFY_PORT = readConfig('NOTIFY_PORT');
export const PUBLIC_PORT = readConfig('PUBLIC_PORT');

export const API_BASE = trimTrailingSlash(readConfig('API_BASE', ''));
export const API_ORIGIN = buildOrigin('API_ORIGIN', 'API_PORT');
export const NOTIFY_URL = buildOrigin('NOTIFY_URL', 'NOTIFY_PORT');
export const PUBLIC_BASE = buildOrigin('PUBLIC_BASE', 'PUBLIC_PORT');

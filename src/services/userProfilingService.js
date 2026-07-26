import { API_BASE } from '../../app.config.js';

function token() {
  return localStorage.getItem('token') || '';
}

async function request(path, options = {}) {
  const accessToken = token();
  if (!accessToken) return null;
  const response = await fetch(`${API_BASE}/api/profiling${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || `Profiling request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function recordBehavior(payload) {
  return request('/events', { method: 'POST', body: JSON.stringify(payload) });
}

export function rankContent(contents) {
  return request('/rank', { method: 'POST', body: JSON.stringify({ contents }) });
}

export function getPersonalizationProfile() {
  return request('/profile');
}

let locationRequest = null;
let locationToken = '';

function browserApproximateLocation() {
  const language = navigator.language || '';
  let countryCode = '';
  try {
    countryCode = new Intl.Locale(language).region || '';
  } catch {
    const candidate = language.split(/[-_]/).at(-1) || '';
    countryCode = candidate.length === 2 ? candidate.toUpperCase() : '';
  }
  let country = countryCode;
  try {
    country = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
  } catch {
    country = countryCode;
  }
  return {
    countryCode,
    country,
    region: '',
    city: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language,
  };
}

export function observeApproximateLocation() {
  const accessToken = token();
  if (!accessToken) return Promise.resolve(null);
  if (!locationRequest || locationToken !== accessToken) {
    locationToken = accessToken;
    locationRequest = request('/location', {
      method: 'PUT',
      body: JSON.stringify(browserApproximateLocation()),
    }).catch((error) => {
      locationRequest = null;
      throw error;
    });
  }
  return locationRequest;
}

export function getApproximateLocation() {
  return request('/location');
}

export function getPersonalizationPreferences() {
  return request('/preferences');
}

export function updatePersonalizationPreferences(payload) {
  return request('/preferences', { method: 'PUT', body: JSON.stringify(payload) });
}

export function deletePersonalizationBehavior() {
  return request('/behavior', { method: 'DELETE' });
}

export function listPersonalizationUsers() {
  return request('/admin/users');
}

export function listApproximateLocations() {
  return request('/admin/locations');
}

export function comparePersonalizedFeeds(firstUserId, secondUserId, contents) {
  return request('/admin/compare', {
    method: 'POST',
    body: JSON.stringify({ firstUserId, secondUserId, contents }),
  });
}

export function behaviorSessionId() {
  const key = 'profilingSessionId';
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, value);
  }
  return value;
}

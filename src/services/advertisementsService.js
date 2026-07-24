const AD_API = '/content-tools/contentservices/api/advertisements';

function token() {
  return localStorage.getItem('token') || '';
}

async function request(path, options = {}) {
  const accessToken = token();
  if (!accessToken) throw new Error('Please log in to use Advertising Studio.');
  const response = await fetch(`${AD_API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.message || data.error || `Request failed (${response.status})`);
  return data;
}

export function createAdvertisement(payload) {
  return request('', { method: 'POST', body: JSON.stringify(payload) });
}

export function listMyAdvertisements() {
  return request('/mine');
}

export function updateAdvertisementStatus(id, status) {
  return request(`/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function getAdvertisementAnalytics() {
  return request('/admin/analytics');
}

export function serveAdvertisement(context) {
  return request('/serve', { method: 'POST', body: JSON.stringify(context) });
}

export function currentRole() {
  try {
    const payload = JSON.parse(atob(token().split('.')[1]));
    return String(payload.role || 'USER').toUpperCase();
  } catch {
    return 'USER';
  }
}

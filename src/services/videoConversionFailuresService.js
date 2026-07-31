const API = '/content-tools/contentservices/api/admin/video-conversions';

function accessToken() {
  return localStorage.getItem('token') || '';
}

async function request(path = '', options = {}) {
  const token = accessToken();
  if (!token) throw new Error('Administrator login is required.');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.detail || data.message || data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function listVideoConversionFailures() {
  return request();
}

export function reprocessVideoConversion(id) {
  return request(`/${encodeURIComponent(id)}/reprocess`, { method: 'POST' });
}

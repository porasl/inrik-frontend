const API = '/content-tools/contentservices/api/admin/content-health';

export async function getAdminContentHealth() {
  return request('');
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token') || '';
  if (!token) throw new Error('Administrator login is required.');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.detail || data.message || data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function fixAdminContent(attachmentId) {
  return request(`/${encodeURIComponent(attachmentId)}/fix`, { method: 'POST' });
}

export function deleteAdminContent(attachmentId) {
  return request(`/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });
}

export function deleteAllAdminContent(attachmentIds) {
  return request('', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attachmentIds),
  });
}

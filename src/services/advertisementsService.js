const AD_API = '/content-tools/contentservices/api/advertisements';

function token() {
  return localStorage.getItem('token') || '';
}

async function request(path, options = {}, authenticationRequired = true) {
  const accessToken = token();
  if (!accessToken && authenticationRequired) throw new Error('Please log in to use Advertising Studio.');
  const response = await fetch(`${AD_API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.detail || data.message || data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function createAdvertisement(payload) {
  return request('', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAdvertisement(id, payload) {
  return request(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function cancelAdvertisement(id) {
  return request(`/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function getStoreCreditWallet() {
  return request('/wallet');
}

export function getStripeStatus() {
  return request('/stripe/status');
}

export function createStripeCheckout(amount) {
  return request('/stripe/checkout', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function listMyAdvertisements() {
  return request('/mine');
}

export function getAdvertisementViews(id) {
  return request(`/${encodeURIComponent(id)}/views`);
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

export function getAdvertisementConfiguration() {
  return request('/configuration');
}

export function updateAdvertisementConfiguration(alwaysShowForTesting) {
  return request('/configuration', {
    method: 'PUT',
    body: JSON.stringify({ alwaysShowForTesting }),
  });
}

export function serveAdvertisement(context) {
  return request('/serve', { method: 'POST', body: JSON.stringify(context) }, false);
}

export function recordAdvertisementImpression(id, impressionKey, context) {
  return request(`/${encodeURIComponent(id)}/impression`, {
    method: 'POST',
    body: JSON.stringify({ impressionKey, context }),
  }, false);
}

export function currentRole() {
  try {
    const payload = JSON.parse(atob(token().split('.')[1]));
    return String(payload.role || 'USER').toUpperCase();
  } catch {
    return 'USER';
  }
}

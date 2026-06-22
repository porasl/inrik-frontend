import { API_BASE } from '../../app.config.js';

function authHeaders(token, includeJson = false) {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function request(path, options = {}, fetcher = fetch) {
  const response = await fetcher(`${API_BASE}${path}`, options);
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    message = body.message || body.error || message;
  } catch {
    const text = await response.text();
    if (text) message = text;
  }
  throw new Error(message);
}

export function listGroups(token, fetcher) {
  return request('/api/groups', { headers: authHeaders(token) }, fetcher);
}

export function createGroup(token, group, fetcher) {
  return request('/api/groups', {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(group),
  }, fetcher);
}

export function addGroupMember(token, groupId, email, fetcher) {
  return request(`/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ email }),
  }, fetcher);
}

export function removeGroupMember(token, groupId, memberId, fetcher) {
  return request(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    fetcher,
  );
}

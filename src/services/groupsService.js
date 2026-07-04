import { API_BASE } from '../../app.config.js';

const groupUpdateListeners = new Set();

function emitGroupUpdate() {
  groupUpdateListeners.forEach((listener) => listener());
}

export function subscribeGroupUpdates(listener) {
  groupUpdateListeners.add(listener);
  return () => groupUpdateListeners.delete(listener);
}

function authHeaders(token, includeJson = false) {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}, fetcher = fetch) {
  const response = await fetcher(`${API_BASE}${path}`, options);
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  let message = `Request failed (${response.status})`;
  const text = await response.text();
  if (text) {
    try {
      const body = JSON.parse(text);
      message = body.message || body.error || message;
    } catch {
      message = text;
    }
  }
  throw new Error(message);
}

export function listGroups(token, fetcher) {
  return request('/api/groups', { headers: authHeaders(token) }, fetcher);
}

export async function createGroup(token, group, fetcher) {
  const created = await request('/api/groups', {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(group),
  }, fetcher);
  emitGroupUpdate();
  return created;
}

export async function updateGroup(token, groupId, group, fetcher) {
  const updated = await request(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(group),
  }, fetcher);
  emitGroupUpdate();
  return updated;
}

export async function deleteGroup(token, groupId, fetcher) {
  const deleted = await request(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  }, fetcher);
  emitGroupUpdate();
  return deleted;
}

export async function addGroupMember(token, groupId, email, fetcher) {
  const updated = await request(`/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ email }),
  }, fetcher);
  emitGroupUpdate();
  return updated;
}

export async function removeGroupMember(token, groupId, memberId, fetcher) {
  const updated = await request(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    fetcher,
  );
  emitGroupUpdate();
  return updated;
}

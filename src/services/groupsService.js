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

export function listAdminGroups(token, query = '', limit = 100, fetcher) {
  const params = new URLSearchParams({
    query: String(query || '').trim(),
    limit: String(Math.max(1, Math.min(Number(limit) || 100, 100))),
  });
  return request(`/api/groups/admin?${params}`, { headers: authHeaders(token) }, fetcher);
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

export async function changeGroupOwner(token, groupId, email, fetcher) {
  const updated = await request(`/api/groups/${encodeURIComponent(groupId)}/owner`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ email }),
  }, fetcher);
  emitGroupUpdate();
  return updated;
}

export async function setGroupMemberSuspended(token, groupId, memberId, suspended, fetcher) {
  const updated = await request(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}/suspension`,
    {
      method: 'PUT',
      headers: authHeaders(token, true),
      body: JSON.stringify({ suspended: Boolean(suspended) }),
    },
    fetcher,
  );
  emitGroupUpdate();
  return updated;
}

export async function requestGroupMembership(token, groupId, fetcher) {
  const updated = await request(`/api/groups/${encodeURIComponent(groupId)}/membership-request`, {
    method: 'POST',
    headers: authHeaders(token),
  }, fetcher);
  emitGroupUpdate();
  return updated;
}

export async function decideGroupMembership(token, groupId, memberId, accepted, fetcher) {
  const updated = await request(
    `/api/groups/${encodeURIComponent(groupId)}/membership-requests/${encodeURIComponent(memberId)}`,
    {
      method: 'PUT',
      headers: authHeaders(token, true),
      body: JSON.stringify({ accepted: Boolean(accepted) }),
    },
    fetcher,
  );
  emitGroupUpdate();
  return updated;
}

export function sendGroupInvitation(token, groupId, email, fetcher) {
  return request(`/api/groups/${encodeURIComponent(groupId)}/invitations`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ email }),
  }, fetcher);
}

export async function acceptGroupInvitation(token, invitationToken, fetcher) {
  const updated = await request(
    `/api/groups/invitations/${encodeURIComponent(invitationToken)}/accept`,
    { method: 'POST', headers: authHeaders(token) },
    fetcher,
  );
  emitGroupUpdate();
  return updated;
}

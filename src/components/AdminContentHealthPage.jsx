import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteAdminContent,
  deleteAllAdminContent,
  fixAdminContent,
  getAdminContentHealth,
  updateAdminContentMetadata,
} from '../services/adminContentHealthService.js';
import './AdminContentHealthPage.css';

const healthClass = {
  HEALTHY: 'text-bg-success',
  ATTENTION: 'text-bg-danger',
  EMPTY: 'text-bg-secondary',
};

const initials = (user) => {
  const name = String(user?.displayName || user?.email || user?.userId || 'U');
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
};

const dateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

export default function AdminContentHealthPage() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState({ key: 'user', direction: 'asc' });
  const [editing, setEditing] = useState(null);
  const [metadata, setMetadata] = useState({ title: '', description: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await getAdminContentHealth());
    } catch (requestError) {
      setError(requestError.message || 'Content health could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remediate = async (item, action) => {
    if (action === 'delete' && !window.confirm(
      'Delete this broken content registry entry? Shared media files will not be deleted.',
    )) return;
    setActionId(item.id);
    setError('');
    setNotice('');
    try {
      const result = action === 'fix'
        ? await fixAdminContent(item.id)
        : await deleteAdminContent(item.id);
      setNotice(result.message || 'Content was updated.');
      await load();
    } catch (requestError) {
      setError(requestError.message || 'The support action failed.');
    } finally {
      setActionId(null);
    }
  };

  const deleteAllAttention = async () => {
    const attentionItems = selected?.content?.filter((item) => !item.healthy && item.id != null) || [];
    if (!attentionItems.length || !window.confirm(
      `Delete all ${attentionItems.length} attention cases for ${selected.displayName}? Shared media files will not be deleted.`,
    )) return;
    setActionId('all');
    setError('');
    setNotice('');
    try {
      const result = await deleteAllAdminContent(attentionItems.map((item) => item.id));
      setNotice(result.message || 'All attention cases were deleted.');
      await load();
    } catch (requestError) {
      setError(requestError.message || 'The attention cases could not be deleted.');
    } finally {
      setActionId(null);
    }
  };

  const openEditor = (item) => {
    setEditing(item);
    setMetadata({ title: item.title || '', description: item.description || '' });
    setError('');
    setNotice('');
  };

  const saveMetadata = async (event) => {
    event.preventDefault();
    if (!editing?.postId) return;
    setActionId(`edit-${editing.postId}`);
    setError('');
    try {
      await updateAdminContentMetadata(editing.postId, metadata.title, metadata.description);
      setNotice('Title and description were updated.');
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'Title and description could not be updated.');
    } finally {
      setActionId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) => (
      [user.displayName, user.email, user.userId]
        .some((value) => String(value || '').toLowerCase().includes(normalized))
    ));
  }, [query, users]);

  const sortedUsers = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...filteredUsers].sort((left, right) => {
      let comparison;
      if (sort.key === 'user') {
        comparison = String(left.displayName || left.email || left.userId || '')
          .localeCompare(String(right.displayName || right.email || right.userId || ''), undefined, {
            sensitivity: 'base',
            numeric: true,
          });
      } else if (sort.key === 'health') {
        comparison = Number(left.healthPercent || 0) - Number(right.healthPercent || 0);
      } else {
        comparison = Number(left[sort.key] || 0) - Number(right[sort.key] || 0);
      }
      if (comparison === 0) {
        comparison = String(left.displayName || '').localeCompare(String(right.displayName || ''), undefined, {
          sensitivity: 'base',
        });
      }
      return comparison * direction;
    });
  }, [filteredUsers, sort]);

  const toggleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortableHeader = (label, key) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        className={`admin-content-sort ${active ? 'is-active' : ''}`}
        onClick={() => toggleSort(key)}
      >
        {label}
        <i
          className={`bi ${
            active
              ? sort.direction === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill'
              : 'bi-arrow-down-up'
          }`}
          aria-hidden="true"
        ></i>
      </button>
    );
  };

  const selected = users.find((user) => String(user.userId) === String(selectedId));
  const totalVideos = users.reduce((sum, user) => sum + Number(user.videoCount || 0), 0);
  const totalImages = users.reduce((sum, user) => sum + Number(user.imageCount || 0), 0);
  const unhealthy = users.reduce((sum, user) => sum + Number(user.unhealthyCount || 0), 0);

  if (selected) {
    return (
      <section className="admin-content-health-page" id={`admin-user-content-${selected.userId}`}>
        <button type="button" className="btn btn-link px-0 text-decoration-none" onClick={() => setSelectedId('')}>
          <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>
          All users
        </button>
        <div className="admin-content-user-heading">
          <div className="admin-content-avatar">{initials(selected)}</div>
          <div>
            <h2 className="mb-1">{selected.displayName}</h2>
            <div className="text-muted">{selected.email || `User ID ${selected.userId}`}</div>
          </div>
          <span className={`badge ${healthClass[selected.healthStatus] || 'text-bg-secondary'} ms-auto`}>
            {selected.healthStatus}
          </span>
        </div>

        <div className="admin-content-stats">
          <article><strong>{selected.videoCount}</strong><span>Videos</span></article>
          <article><strong>{selected.imageCount}</strong><span>Images</span></article>
          <article><strong>{selected.healthyCount}</strong><span>Healthy</span></article>
          <article><strong>{selected.unhealthyCount}</strong><span>Needs attention</span></article>
        </div>

        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        {selected.content.length === 0 ? (
          <div className="admin-content-empty">This user has not uploaded media.</div>
        ) : (
          <>
          {selected.content.some((item) => !item.healthy && item.id != null) && (
            <div className="d-flex justify-content-end mb-3">
              <button
                type="button"
                className="btn btn-danger"
                disabled={actionId !== null}
                onClick={deleteAllAttention}
              >
                <i className="bi bi-trash me-2" aria-hidden="true"></i>
                Delete All
              </button>
            </div>
          )}
          <div className="table-responsive admin-content-table-wrap">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Type</th><th>Source</th><th>Health</th><th>Uploaded</th><th>Support actions</th></tr></thead>
              <tbody>
                {selected.content.map((item) => (
                  <tr key={`${item.id}-${item.sourcePath}`}>
                    <td><span className="badge text-bg-light border">{item.type}</span></td>
                    <td>
                      <span className="admin-content-path" title={item.sourcePath}>
                        {item.sourcePath || `Record #${item.id} — missing durable link`}
                      </span>
                      {item.title && <strong className="d-block mt-1">{item.title}</strong>}
                      {item.description && <small className="d-block text-muted">{item.description}</small>}
                    </td>
                    <td>
                      <span className={`badge ${item.healthy ? 'text-bg-success' : 'text-bg-danger'}`}>
                        {item.healthy ? 'Healthy' : 'Issue'}
                      </span>
                      <small className="d-block text-muted mt-1">{item.healthMessage}</small>
                    </td>
                    <td>{dateTime(item.createdAt)}</td>
                    <td>
                      <div className="d-flex gap-2 flex-wrap">
                        {item.postId && ['VIDEO', 'IMAGE'].includes(item.type) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={actionId !== null}
                            onClick={() => openEditor(item)}
                          >
                            <i className="bi bi-pencil me-1" aria-hidden="true"></i>Edit
                          </button>
                        )}
                        {!item.healthy && item.id != null && (
                          <>
                          {item.type === 'VIDEO' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={actionId === item.id}
                              onClick={() => remediate(item, 'fix')}
                            >
                              <i className="bi bi-wrench-adjustable me-1" aria-hidden="true"></i>Fix
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={actionId === item.id}
                            onClick={() => remediate(item, 'delete')}
                          >
                            <i className="bi bi-trash me-1" aria-hidden="true"></i>Delete
                          </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing && (
            <div className="admin-content-edit-modal" role="presentation" onMouseDown={() => setEditing(null)}>
              <form
                className="admin-content-edit-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Edit media title and description"
                onSubmit={saveMetadata}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <h3 className="h5 mb-1">Edit {editing.type.toLowerCase()}</h3>
                    <small className="text-muted">This updates the metadata shared by media in post {editing.postId}.</small>
                  </div>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setEditing(null)}></button>
                </div>
                <label className="form-label mt-3">
                  Title
                  <input
                    className="form-control mt-1"
                    value={metadata.title}
                    maxLength={200}
                    onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label className="form-label">
                  Description
                  <textarea
                    className="form-control mt-1"
                    rows={5}
                    value={metadata.description}
                    maxLength={4000}
                    onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))}
                  ></textarea>
                </label>
                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={actionId !== null}>Save changes</button>
                </div>
              </form>
            </div>
          )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="admin-content-health-page">
      <div className="admin-content-health-header">
        <div>
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-activity text-success fs-3" aria-hidden="true"></i>
            <h2 className="mb-0">User content health</h2>
          </div>
          <p className="text-muted mb-0 mt-1">Users, media totals, and the availability of their stored content.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>Refresh
        </button>
      </div>

      <div className="admin-content-stats">
        <article><strong>{users.length}</strong><span>Users</span></article>
        <article><strong>{totalVideos}</strong><span>Videos</span></article>
        <article><strong>{totalImages}</strong><span>Images</span></article>
        <article className={unhealthy ? 'has-issues' : ''}><strong>{unhealthy}</strong><span>Content issues</span></article>
      </div>

      <div className="admin-content-toolbar">
        <div className="input-group">
          <span className="input-group-text"><i className="bi bi-search" aria-hidden="true"></i></span>
          <input
            className="form-control"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or user ID"
            aria-label="Search users"
          />
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading ? (
        <div className="admin-content-empty">
          <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
          Loading user content health…
        </div>
      ) : (
        <div className="table-responsive admin-content-table-wrap">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th aria-sort={sort.key === 'user' ? `${sort.direction}ending` : 'none'}>
                  {sortableHeader('User', 'user')}
                </th>
                <th aria-sort={sort.key === 'videoCount' ? `${sort.direction}ending` : 'none'}>
                  {sortableHeader('Videos', 'videoCount')}
                </th>
                <th aria-sort={sort.key === 'imageCount' ? `${sort.direction}ending` : 'none'}>
                  {sortableHeader('Images', 'imageCount')}
                </th>
                <th aria-sort={sort.key === 'health' ? `${sort.direction}ending` : 'none'}>
                  {sortableHeader('Health', 'health')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div className="admin-content-avatar admin-content-avatar-sm">{initials(user)}</div>
                      <div>
                        <strong className="d-block">{user.displayName}</strong>
                        <small className="text-muted">{user.email || `User ID ${user.userId}`}</small>
                      </div>
                    </div>
                  </td>
                  <td>{user.videoCount}</td>
                  <td>{user.imageCount}</td>
                  <td>
                    <span className={`badge ${healthClass[user.healthStatus] || 'text-bg-secondary'}`}>
                      {user.healthStatus}
                    </span>
                    <small className="d-block text-muted mt-1">{user.healthPercent}% available</small>
                  </td>
                  <td className="text-end">
                    <a
                      href={`#admin-user-content-${encodeURIComponent(user.userId)}`}
                      className="btn btn-sm btn-outline-primary"
                      onClick={(event) => {
                        event.preventDefault();
                        setSelectedId(String(user.userId));
                      }}
                    >
                      View content <i className="bi bi-arrow-right ms-1" aria-hidden="true"></i>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length && <div className="admin-content-empty">No users match this search.</div>}
        </div>
      )}
    </section>
  );
}

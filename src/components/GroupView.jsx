import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../app.config.js';

export default function GroupView() {
  const token = localStorage.getItem('token') || '';
  const userId = localStorage.getItem('userId') || '';

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/groups`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setGroups(Array.isArray(data) ? data : data.groups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    const name = groupName.trim();
    const description = groupDescription.trim();

    if (!name) {
      setCreateError('Group name is required');
      return;
    }

    if (!token) {
      setCreateError('Please log in to create a group');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          userId,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || `Failed to create group (${res.status})`);
      }

      const newGroup = await res.json();
      setGroups([newGroup, ...groups]);
      setGroupName('');
      setGroupDescription('');
      setShowCreateModal(false);
      setCreateSuccess('Group created successfully!');
      setTimeout(() => setCreateSuccess(''), 3000);
    } catch (err) {
      setCreateError(err.message || 'Failed to create group');
    }
  };

  return (
    <div className="border rounded-3 bg-white shadow-sm">
      <div className="p-3 p-md-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Groups</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <i className="bi bi-plus-circle me-2"></i>
          Create Group
        </button>
      </div>

      {createSuccess && (
        <div className="alert alert-success alert-dismissible fade show mb-3" role="alert">
          {createSuccess}
          <button
            type="button"
            className="btn-close"
            onClick={() => setCreateSuccess('')}
          ></button>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div
          className="modal"
          style={{
            display: 'block',
            position: 'fixed',
            zIndex: 2000,
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Group</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowCreateModal(false)}
                ></button>
              </div>
              <form onSubmit={handleCreateGroup}>
                <div className="modal-body">
                  {createError && (
                    <div className="alert alert-danger" role="alert">
                      {createError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="groupName" className="form-label">
                      Group Name *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="groupName"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Enter group name"
                      autoFocus
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="groupDescription" className="form-label">
                      Description
                    </label>
                    <textarea
                      className="form-control"
                      id="groupDescription"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      placeholder="Enter group description (optional)"
                      rows="3"
                    ></textarea>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Group
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Groups List */}
      <div className="row g-3">
        {loading ? (
          <div className="col-12">
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-secondary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="col-12">
            <div className="alert alert-light border text-center py-5" role="alert">
              <i className="bi bi-inbox fs-1 text-secondary d-block mb-2"></i>
              <h6 className="text-muted">No groups yet</h6>
              <p className="text-muted small">Create a group to get started</p>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="col-md-6 col-lg-4">
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-body">
                  <h5 className="card-title text-truncate">{group.name}</h5>
                  {group.description && (
                    <p className="card-text text-muted small">{group.description}</p>
                  )}
                  <div className="text-secondary small">
                    {group.memberCount ? (
                      <span>
                        <i className="bi bi-people me-1"></i>
                        {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-muted">No members yet</span>
                    )}
                  </div>
                </div>
                <div className="card-footer bg-white border-top-0">
                  <button className="btn btn-sm btn-outline-primary w-100">
                    <i className="bi bi-box-arrow-in-right me-1"></i>
                    Join
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addGroupMember,
  deleteGroup,
  createGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
} from '../services/groupsService';
import './GroupView.css';

function getId(value) {
  return String(value?.id || value?._id || '');
}

function initials(value) {
  return String(value || 'G')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';
}

function memberName(member) {
  return member.displayName
    || [member.firstName, member.lastName].filter(Boolean).join(' ')
    || member.email
    || 'Member';
}

function normalizeGroups(payload) {
  const values = Array.isArray(payload) ? payload : payload?.groups || [];
  return values.map((group) => ({
    ...group,
    id: getId(group),
    members: Array.isArray(group.members) ? group.members : [],
  }));
}

export default function GroupView({ authFetch = fetch }) {
  const token = localStorage.getItem('token') || '';
  const currentUserId = String(localStorage.getItem('userId') || '');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [editingGroupId, setEditingGroupId] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState('');

  const isOwner = useCallback((group) => (
    Boolean(group?.isOwner)
    || String(group?.owner?.userId || group?.ownerId || '') === currentUserId
  ), [currentUserId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const editingGroup = useMemo(
    () => groups.find((group) => group.id === editingGroupId) || null,
    [groups, editingGroupId],
  );
  const ownedGroups = useMemo(() => groups.filter((group) => isOwner(group)), [groups, isOwner]);
  const memberGroups = useMemo(() => groups.filter((group) => !isOwner(group)), [groups, isOwner]);

  const loadGroups = useCallback(async () => {
    if (!token) {
      setLoadError('Please log in to view your groups.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      setGroups(normalizeGroups(await listGroups(token, authFetch)));
    } catch (error) {
      setLoadError(error.message || 'Groups could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [token, authFetch]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const applyGroupUpdate = (updated) => {
    const normalized = normalizeGroups([updated])[0];
    setGroups((current) => current.map((group) => (
      group.id === normalized.id ? normalized : group
    )));
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setFormError('Group name is required.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const created = normalizeGroups([await createGroup(token, {
        name,
        description: groupDescription.trim(),
      }, authFetch)])[0];
      setGroups((current) => [created, ...current]);
      setGroupName('');
      setGroupDescription('');
      setShowCreateModal(false);
      setNotice('Group created successfully.');
    } catch (error) {
      setFormError(error.message || 'Group could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || !editingGroup) {
      setFormError('Group name is required.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const updated = normalizeGroups([await updateGroup(token, editingGroup.id, {
        name,
        description: groupDescription.trim(),
      })])[0];
      applyGroupUpdate(updated);
      setNotice('Group updated successfully.');
      setEditingGroupId('');
    } catch (error) {
      setFormError(error.message || 'Group could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (event) => {
    event.preventDefault();
    const email = memberEmail.trim().toLowerCase();
    if (!email || !selectedGroup) return;

    setSaving(true);
    setFormError('');
    try {
      applyGroupUpdate(await addGroupMember(token, selectedGroup.id, email, authFetch));
      setMemberEmail('');
      setNotice(`${email} was added to the group.`);
    } catch (error) {
      setFormError(error.message || 'Member could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedGroup) return;
    const id = getId(member) || String(member.userId || '');
    if (!id || !window.confirm(`Remove ${memberName(member)} from this group?`)) return;

    setRemovingId(id);
    setFormError('');
    try {
      applyGroupUpdate(await removeGroupMember(token, selectedGroup.id, id, authFetch));
      setNotice(`${memberName(member)} was removed from the group.`);
    } catch (error) {
      setFormError(error.message || 'Member could not be removed.');
    } finally {
      setRemovingId('');
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!group || !window.confirm(`Delete ${group.name}? This cannot be undone.`)) return;

    setSaving(true);
    setFormError('');
    try {
      await deleteGroup(token, group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      if (selectedGroupId === group.id) setSelectedGroupId('');
      if (editingGroupId === group.id) setEditingGroupId('');
      setNotice('Group deleted successfully.');
    } catch (error) {
      setFormError(error.message || 'Group could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const openMembers = (group) => {
    setSelectedGroupId(group.id);
    setMemberEmail('');
    setFormError('');
  };

  const openEditGroup = (group) => {
    setEditingGroupId(group.id);
    setGroupName(group.name || '');
    setGroupDescription(group.description || '');
    setFormError('');
  };

  return (
    <div className="groups-shell border rounded-3 bg-white shadow-sm p-3 p-md-4">
      <div className="groups-heading d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">Groups</h2>
          <p className="text-muted mb-0">Create spaces and manage the people in them.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormError(''); setShowCreateModal(true); }}>
          <i className="bi bi-plus-lg me-2" />Create group
        </button>
      </div>

      {notice && (
        <div className="alert alert-success alert-dismissible" role="status">
          {notice}
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice('')} />
        </div>
      )}
      {loadError && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{loadError}</span>
          {token && <button className="btn btn-sm btn-outline-danger" onClick={loadGroups}>Try again</button>}
        </div>
      )}

      {loading ? (
        <div className="text-center py-5" aria-live="polite">
          <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading groups</span></div>
        </div>
      ) : !loadError && groups.length === 0 ? (
        <div className="text-center border rounded-3 bg-light py-5 px-3">
          <i className="bi bi-people fs-1 text-secondary" />
          <h5 className="mt-3">No groups yet</h5>
          <p className="text-muted mb-3">Create your first group and invite members by email.</p>
          <button className="btn btn-outline-primary" onClick={() => setShowCreateModal(true)}>Create a group</button>
        </div>
      ) : (
        <>
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="mb-0">My groups</h5>
            <span className="text-muted small">{ownedGroups.length} owned</span>
          </div>
          <div className="row g-3">
            {ownedGroups.length === 0 ? (
              <div className="col-12">
                <div className="text-muted small border rounded-3 p-3 bg-light">You do not own any groups yet.</div>
              </div>
            ) : ownedGroups.map((group) => {
              const members = group.members || [];
              const memberCount = group.memberCount ?? members.length;
              return (
                <div key={group.id} className="col-md-6 col-xl-4">
                  <article className="group-card h-100 p-3 d-flex flex-column">
                    <div className="d-flex gap-3 align-items-start">
                      <div className="group-avatar" aria-hidden="true">{initials(group.name)}</div>
                      <div className="min-w-0 flex-grow-1">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <h5 className="mb-0 text-break">{group.name}</h5>
                          <span className="owner-chip">OWNER</span>
                        </div>
                        <div className="small text-muted mt-1">
                          Owned by {memberName(group.owner || {})}
                        </div>
                      </div>
                    </div>
                    <p className="group-description text-muted small my-3">
                      {group.description || 'No description provided.'}
                    </p>
                    <div className="mt-auto d-flex flex-wrap gap-2 justify-content-between align-items-center">
                      <span className="small text-secondary">
                        <i className="bi bi-people me-1" />
                        {memberCount} member{memberCount === 1 ? '' : 's'}
                      </span>
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openEditGroup(group)}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteGroup(group)}>
                          Delete
                        </button>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => openMembers(group)}>
                          View members
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="mb-0">Groups I belong to</h5>
            <span className="text-muted small">{memberGroups.length} listed</span>
          </div>
          <div className="row g-3">
          {memberGroups.map((group) => {
            const members = group.members || [];
            const memberCount = group.memberCount ?? members.length;
            return (
              <div key={group.id} className="col-md-6 col-xl-4">
                <article className="group-card h-100 p-3 d-flex flex-column">
                  <div className="d-flex gap-3 align-items-start">
                    <div className="group-avatar" aria-hidden="true">{initials(group.name)}</div>
                    <div className="min-w-0 flex-grow-1">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <h5 className="mb-0 text-break">{group.name}</h5>
                        {isOwner(group) && <span className="owner-chip">OWNER</span>}
                      </div>
                      <div className="small text-muted mt-1">
                        Owned by {memberName(group.owner || {})}
                      </div>
                    </div>
                  </div>
                  <p className="group-description text-muted small my-3">
                    {group.description || 'No description provided.'}
                  </p>
                  <div className="mt-auto d-flex justify-content-between align-items-center">
                    <span className="small text-secondary">
                      <i className="bi bi-people me-1" />
                      {memberCount} member{memberCount === 1 ? '' : 's'}
                    </span>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => openMembers(group)}>
                      View members
                    </button>
                  </div>
                </article>
              </div>
            );
          })}
          </div>
        </div>
        </>
      )}

      {showCreateModal && (
        <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
          <div className="modal-backdrop show" onClick={() => !saving && setShowCreateModal(false)} />
          <div className="modal-dialog modal-dialog-centered position-relative" style={{ zIndex: 1060 }}>
            <div className="modal-content">
              <form onSubmit={handleCreateGroup}>
                <div className="modal-header">
                  <h5 className="modal-title">Create a new group</h5>
                  <button type="button" className="btn-close" disabled={saving} onClick={() => setShowCreateModal(false)} />
                </div>
                <div className="modal-body">
                  {formError && <div className="alert alert-danger">{formError}</div>}
                  <label htmlFor="group-name" className="form-label">Group name</label>
                  <input id="group-name" className="form-control mb-3" maxLength="100" value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus required />
                  <label htmlFor="group-description" className="form-label">Description <span className="text-muted">(optional)</span></label>
                  <textarea id="group-description" className="form-control" rows="3" maxLength="500" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" disabled={saving} onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving && <span className="spinner-border spinner-border-sm me-2" />}Create group
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedGroup && (
        <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
          <div className="modal-backdrop show" onClick={() => setSelectedGroupId('')} />
          <div className="modal-dialog modal-dialog-centered modal-lg position-relative" style={{ zIndex: 1060 }}>
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <h5 className="modal-title">{selectedGroup.name}</h5>
                  <div className="small text-muted">{selectedGroup.members.length} group member{selectedGroup.members.length === 1 ? '' : 's'}</div>
                </div>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedGroupId('')} />
              </div>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                {isOwner(selectedGroup) && (
                  <form className="members-panel p-3 mb-3" onSubmit={handleAddMember}>
                    <label htmlFor="member-email" className="form-label fw-semibold">Add a member</label>
                    <div className="input-group">
                      <input id="member-email" type="email" className="form-control" placeholder="member@example.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required />
                      <button className="btn btn-primary" type="submit" disabled={saving}>
                        {saving ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-person-plus me-2" />Add</>}
                      </button>
                    </div>
                    <div className="form-text">Only the group owner can add or remove members.</div>
                  </form>
                )}

                <div className="members-panel px-3">
                  {selectedGroup.members.length === 0 ? (
                    <p className="text-muted text-center py-4 mb-0">This group has no members.</p>
                  ) : selectedGroup.members.map((member) => {
                    const memberId = getId(member) || String(member.userId || '');
                    const owner = member.role === 'OWNER' || memberId === String(selectedGroup.owner?.userId || selectedGroup.ownerId || '');
                    return (
                      <div key={memberId || member.email} className="member-row d-flex align-items-center gap-3 py-3">
                        <div className="member-avatar">
                          {member.profileImageUrl ? <img src={member.profileImageUrl} alt="" /> : initials(memberName(member))}
                        </div>
                        <div className="flex-grow-1 min-w-0">
                          <div className="fw-semibold text-truncate">{memberName(member)}</div>
                          <div className="small text-muted text-truncate">{member.email}</div>
                        </div>
                        {owner ? <span className="owner-chip">OWNER</span> : isOwner(selectedGroup) && (
                          <button className="btn btn-sm btn-outline-danger" disabled={removingId === memberId} onClick={() => handleRemoveMember(member)} aria-label={`Remove ${memberName(member)}`}>
                            {removingId === memberId ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-person-dash me-1" />Remove</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light" onClick={() => setSelectedGroupId('')}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingGroup && (
        <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
          <div className="modal-backdrop show" onClick={() => !saving && setEditingGroupId('')} />
          <div className="modal-dialog modal-dialog-centered position-relative" style={{ zIndex: 1060 }}>
            <div className="modal-content">
              <form onSubmit={handleEditGroup}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit group</h5>
                  <button type="button" className="btn-close" disabled={saving} onClick={() => setEditingGroupId('')} />
                </div>
                <div className="modal-body">
                  {formError && <div className="alert alert-danger">{formError}</div>}
                  <label htmlFor="edit-group-name" className="form-label">Group name</label>
                  <input id="edit-group-name" className="form-control mb-3" maxLength="100" value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus required />
                  <label htmlFor="edit-group-description" className="form-label">Description <span className="text-muted">(optional)</span></label>
                  <textarea id="edit-group-description" className="form-control" rows="3" maxLength="500" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" disabled={saving} onClick={() => setEditingGroupId('')}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving && <span className="spinner-border spinner-border-sm me-2" />}Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

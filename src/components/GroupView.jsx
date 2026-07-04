import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Hls from 'hls.js';
import {
  addGroupMember,
  deleteGroup,
  createGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
} from '../services/groupsService';
import { API_BASE } from '../../app.config.js';
import { getAllPostsCached, invalidatePostsCache, subscribePostsCacheUpdates } from '../services/postsService';
import UploadModal from './UploadModal';
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

function groupAvatarUrl(group) {
  const raw = String(group?.groupImageUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function memberName(member) {
  return member.displayName
    || [member.firstName, member.lastName].filter(Boolean).join(' ')
    || member.email
    || 'Member';
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const normalized = String(fsPath).replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function resolveHlsVideoUrl(post) {
  const raw = String(post?.hlsUrl || post?.hlsVideoUrls?.[0] || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/\\/g, '/');
  const webdataIdx = normalized.indexOf('webdata/');
  if (webdataIdx >= 0) return `/${normalized.slice(webdataIdx + 'webdata/'.length)}`;
  if (normalized.startsWith('/')) return normalized;
  return `/${normalized}`;
}

function resolveVideoUrl(post) {
  const candidates = [
    ...toArray(post?.videoUrls),
    post?.videoUrl,
    post?.videoPath,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) return raw;
    const normalized = raw.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return normalized;
    return `/${normalized}`;
  }

  return '';
}

function resolveImageUrls(post) {
  return toArray(post?.imageUrls).map(toPublicUrl).filter(Boolean);
}

function resolveAudioUrls(post) {
  return [...toArray(post?.audioUrls), ...toArray(post?.hlsAudioUrls), post?.audioUrl]
    .map(toPublicUrl)
    .filter(Boolean);
}

function resolveDocumentUrls(post) {
  return [...toArray(post?.documentUrls), ...toArray(post?.documents)]
    .map((entry) => (typeof entry === 'string' ? entry : entry?.url || entry?.path || entry?.fileUrl || entry?.documentUrl || ''))
    .map(toPublicUrl)
    .filter(Boolean);
}

function renderMediaPreview(post) {
  const imageUrls = resolveImageUrls(post);
  const audioUrls = resolveAudioUrls(post);
  const documentUrls = resolveDocumentUrls(post);
  const hlsVideoUrl = resolveHlsVideoUrl(post);
  const videoUrl = resolveVideoUrl(post);
  const attachmentCount = imageUrls.length + audioUrls.length + documentUrls.length + (hlsVideoUrl || videoUrl ? 1 : 0);

  if (!attachmentCount) {
    return (
      <div className="text-muted border rounded-3 p-3 bg-light">
        No preview available for this post.
      </div>
    );
  }

  return (
    <div className="group-media-stack d-grid gap-3">
      {imageUrls.length > 0 && (
        <div>
          <div className="small text-muted text-uppercase mb-2">
            <i className="bi bi-images me-1" />
            Images ({imageUrls.length})
          </div>
          <div className="d-grid gap-2">
            {imageUrls.slice(0, 3).map((url, index) => (
              <img key={`${url}-${index}`} src={url} alt="" className="img-fluid rounded-3 border" style={{ maxHeight: 220, objectFit: 'cover', width: '100%' }} />
            ))}
          </div>
        </div>
      )}

      {audioUrls.length > 0 && (
        <div>
          <div className="small text-muted text-uppercase mb-2">
            <i className="bi bi-music-note-beamed me-1" />
            Audio ({audioUrls.length})
          </div>
          <div className="d-grid gap-2">
            {audioUrls.slice(0, 2).map((url, index) => (
              <audio key={`${url}-${index}`} controls preload="metadata" className="w-100">
                <source src={url} />
              </audio>
            ))}
          </div>
        </div>
      )}

      {(hlsVideoUrl || videoUrl) && (
        <div>
          <div className="small text-muted text-uppercase mb-2">
            <i className="bi bi-film me-1" />
            Video
          </div>
          <div className="ratio ratio-16x9 rounded-3 overflow-hidden border bg-dark">
            <video
              controls
              playsInline
              preload="metadata"
              className="w-100 h-100"
              ref={(video) => {
                if (!video) return;
                const src = hlsVideoUrl || videoUrl;
                if (!hlsVideoUrl) {
                  video.src = src;
                  return;
                }
                if (Hls.isSupported()) {
                  const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                  hls.loadSource(src);
                  hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                  video.src = src;
                }
              }}
            />
          </div>
        </div>
      )}

      {documentUrls.length > 0 && (
        <div>
          <div className="small text-muted text-uppercase mb-2">
            <i className="bi bi-file-earmark-text me-1" />
            Documents ({documentUrls.length})
          </div>
          <div className="d-grid gap-2">
            {documentUrls.slice(0, 3).map((url, index) => (
              <a key={`${url}-${index}`} className="btn btn-outline-secondary w-100 text-start" href={url} target="_blank" rel="noreferrer">
                Open attachment
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  const [groupPosts, setGroupPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [postsError, setPostsError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGroupImagePicker, setShowGroupImagePicker] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupPublicGroup, setGroupPublicGroup] = useState(false);
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
  const selectedGroupPosts = useMemo(
    () => groupPosts.filter((post) => String(post?.groupId || '') === String(selectedGroupId || '')),
    [groupPosts, selectedGroupId],
  );

  const editingGroup = useMemo(
    () => groups.find((group) => group.id === editingGroupId) || null,
    [groups, editingGroupId],
  );
  const ownedGroups = useMemo(() => groups.filter((group) => isOwner(group)), [groups, isOwner]);
  const memberGroups = useMemo(() => groups.filter((group) => !isOwner(group)), [groups, isOwner]);

  const loadGroups = useCallback(async () => {
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

  const loadGroupPosts = useCallback(async () => {
    if (!token) return;
    setPostsLoading(true);
    setPostsError('');
    try {
      const posts = await getAllPostsCached({ forceRefresh: true });
      setGroupPosts(Array.isArray(posts) ? posts : []);
    } catch (error) {
      setPostsError(error.message || 'Group content could not be loaded.');
    } finally {
      setPostsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadGroupPosts();
    const unsubscribe = subscribePostsCacheUpdates(({ items }) => {
      if (Array.isArray(items)) setGroupPosts(items);
    });
    return unsubscribe;
  }, [loadGroupPosts]);

  useEffect(() => {
    if (selectedGroupId) {
      loadGroupPosts();
    }
  }, [selectedGroupId, loadGroupPosts]);

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
        publicGroup: groupPublicGroup,
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
        publicGroup: groupPublicGroup,
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

  const openGroupPage = (group) => {
    setSelectedGroupId(group.id);
    setMemberEmail('');
    setFormError('');
  };

  const openMembers = (group) => {
    setSelectedGroupId(group.id);
    setMemberEmail('');
    setFormError('');
  };

  const handleUploadGroupImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedGroup) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await authFetch(`${API_BASE}/api/groups/${encodeURIComponent(selectedGroup.id)}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const updated = normalizeGroups([await response.json()])[0];
      applyGroupUpdate(updated);
      setNotice('Group image updated successfully.');
    } catch (error) {
      setFormError(error.message || 'Group image could not be uploaded.');
    }
  };

  const openEditGroup = (group) => {
    setEditingGroupId(group.id);
    setGroupName(group.name || '');
    setGroupDescription(group.description || '');
    setGroupPublicGroup(Boolean(group.publicGroup));
    setFormError('');
  };

  return (
    <div className="groups-shell border rounded-3 bg-white shadow-sm p-3 p-md-4">
      <div className="groups-heading d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">Groups</h2>
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
                  <article
                    className="group-card h-100 p-3 d-flex flex-column"
                    role="button"
                    tabIndex={0}
                    onClick={() => openGroupPage(group)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openGroupPage(group);
                      }
                    }}
                  >
                      <div className="d-flex gap-3 align-items-start">
                      <div className="group-avatar" aria-hidden="true">
                        {groupAvatarUrl(group) ? (
                          <img src={groupAvatarUrl(group)} alt="" />
                        ) : initials(group.name)}
                      </div>
                      <div className="min-w-0 flex-grow-1">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <h5 className="mb-0 text-break">{group.name}</h5>
                          <span className="owner-chip">OWNER</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto d-flex flex-wrap gap-2 justify-content-between align-items-center">
                      <span className="small text-secondary">
                        <i className="bi bi-people me-1" />
                        {memberCount} member{memberCount === 1 ? '' : 's'}
                      </span>
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-primary" onClick={() => openGroupPage(group)}>
                          Open
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openEditGroup(group)}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteGroup(group)}>
                          Delete
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            openGroupPage(group);
                          }}
                        >
                          Enter
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
          <div className="row g-3">
          {memberGroups.map((group) => {
            const members = group.members || [];
            const memberCount = group.memberCount ?? members.length;
              return (
                <div key={group.id} className="col-md-6 col-xl-4">
                <article
                  className="group-card h-100 p-3 d-flex flex-column"
                  role="button"
                  tabIndex={0}
                  onClick={() => openGroupPage(group)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openGroupPage(group);
                    }
                  }}
                >
                    <div className="d-flex gap-3 align-items-start">
                    <div className="group-avatar" aria-hidden="true">
                      {groupAvatarUrl(group) ? (
                        <img src={groupAvatarUrl(group)} alt="" />
                      ) : initials(group.name)}
                    </div>
                    <div className="min-w-0 flex-grow-1">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <h5 className="mb-0 text-break">{group.name}</h5>
                        {isOwner(group) && <span className="owner-chip">OWNER</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto d-flex justify-content-between align-items-center">
                    <span className="small text-secondary">
                      <i className="bi bi-people me-1" />
                      {memberCount} member{memberCount === 1 ? '' : 's'}
                    </span>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={(event) => {
                        event.stopPropagation();
                        openGroupPage(group);
                      }}
                    >
                      Enter
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

      {selectedGroup && (
        <div className="border rounded-3 bg-white shadow-sm p-3 p-md-4 mt-4">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
            <div className="d-flex align-items-center gap-3">
              <div className="group-avatar group-avatar--lg" aria-hidden="true">
                {groupAvatarUrl(selectedGroup) ? (
                  <img src={groupAvatarUrl(selectedGroup)} alt="" />
                ) : initials(selectedGroup.name)}
              </div>
              <div>
              <h3 className="mb-1">{selectedGroup.name}</h3>
              </div>
            </div>
            <div className="d-flex gap-2">
              <label className="btn btn-outline-primary mb-0">
                <i className="bi bi-image me-2" />
                {selectedGroup.groupImageUrl ? 'Change image' : 'Upload image'}
                <input type="file" accept="image/*" className="d-none" onChange={handleUploadGroupImage} />
              </label>
              <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                <i className="bi bi-cloud-upload me-2" />
                Upload to group
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setSelectedGroupId('')}>
                Close
              </button>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="border rounded-3 p-3 h-100 bg-light">
                <div className="small text-muted text-uppercase mb-1">Owner</div>
                <div className="fw-semibold">{memberName(selectedGroup.owner || {})}</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="border rounded-3 p-3 h-100 bg-light">
                <div className="small text-muted text-uppercase mb-1">Members</div>
                <div className="fw-semibold">{selectedGroup.members.length}</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="border rounded-3 p-3 h-100 bg-light">
                <div className="small text-muted text-uppercase mb-1">Group ID</div>
                <div className="fw-semibold text-truncate">{selectedGroup.id}</div>
              </div>
            </div>
          </div>

          {isOwner(selectedGroup) && (
            <div className="border rounded-3 p-3 bg-light mb-4">
              <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="small text-muted text-uppercase mb-1">Members</div>
                  <h6 className="mb-0">Invite a member</h6>
                </div>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => openMembers(selectedGroup)}>
                  <i className="bi bi-people me-2" />
                  Focus this group
                </button>
              </div>
              <form className="row g-2 align-items-end" onSubmit={handleAddMember}>
                <div className="col-md-8">
                  <label className="form-label" htmlFor="group-member-email">Member email</label>
                  <input
                    id="group-member-email"
                    className="form-control"
                    type="email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="col-md-4 d-flex gap-2">
                  <button className="btn btn-primary flex-grow-1" type="submit" disabled={saving || !memberEmail.trim()}>
                    {saving ? 'Adding...' : 'Add member'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="mb-0">Published content</h5>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadGroupPosts} disabled={postsLoading}>
              Refresh
            </button>
          </div>
          {postsError ? (
            <div className="alert alert-danger">{postsError}</div>
          ) : postsLoading ? (
            <div className="text-muted py-3">Loading group content...</div>
          ) : selectedGroupPosts.length === 0 ? (
            <div className="text-muted border rounded-3 p-3 bg-light">No content has been uploaded to this group yet.</div>
          ) : (
            <div className="row g-3">
              {selectedGroupPosts.map((post) => (
                <div key={post.id} className="col-md-6 col-xl-4">
                  <article className="border rounded-3 p-3 h-100 bg-white">
                    <div className="small text-uppercase text-muted mb-1">Post</div>
                    <h6 className="mb-2 text-truncate">{post.title || post.description || 'Untitled post'}</h6>
                    <p className="small text-muted mb-2 text-truncate">{post.description || 'No description provided.'}</p>
                    {renderMediaPreview(post)}
                  </article>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {showUploadModal && selectedGroup && (
        <UploadModal
          apiBase={API_BASE}
          groupId={selectedGroup.id}
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {
            setShowUploadModal(false);
            invalidatePostsCache();
            loadGroupPosts();
          }}
        />
      )}
    </div>
  );
}

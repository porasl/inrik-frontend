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
import { PUBLIC_BASE } from '../../app.config.js';
import { getAllPostsCached, invalidatePostsCache, subscribePostsCacheUpdates } from '../services/postsService';
import { getUserProfileCached } from '../services/userProfileService';
import UploadModal from './UploadModal';
import PostComments from './PostComments';
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

function isLikelyFileLabel(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /[\w-]+\.(jpg|jpeg|png|gif|webp|bmp|svg|mp3|wav|aac|ogg|m4a|flac|mp4|mov|avi|mkv|webm|pdf|docx?|xlsx?|csv|txt)$/i.test(text)
    || /^[\w-]+(?:_[\w-]+)+$/i.test(text);
}

function postHeading(post) {
  const title = String(post?.title || '').trim();
  const description = String(post?.description || '').trim();

  if (description) return description;
  if (title && !isLikelyFileLabel(title)) return title;
  return '';
}

function resolveOwnerAvatar(post) {
  const candidate = post?.user?.avatar
    || post?.userProfileImageUrl
    || post?.user?.profileImageUrl
    || post?.profileImageUrl
    || post?.profile_image_url
    || '';
  return toPublicUrl(candidate);
}

function GroupPostOwnerAvatar({ post }) {
  const owner = ownerLabel(post);
  const [avatar, setAvatar] = useState(resolveOwnerAvatar(post));
  const [hasError, setHasError] = useState(false);
  const email = ownerEmail(post);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    setAvatar(resolveOwnerAvatar(post));

    if (resolveOwnerAvatar(post)) return () => { cancelled = true; };
    if (!email || !email.includes('@')) return () => { cancelled = true; };

    getUserProfileCached(email.toLowerCase())
      .then((profile) => {
        if (cancelled) return;
        const profileAvatar = String(profile?.profileImageUrl || '').trim();
        if (profileAvatar) setAvatar(toPublicUrl(profileAvatar));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [post, email]);

  return (
    <div
      title={email || owner}
      aria-label={email || owner}
      className="group-post-owner-wrap"
    >
      {avatar && !hasError ? (
        <img
          src={avatar}
          alt={owner}
          className="postview-owner-avatar group-post-owner-avatar"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="postview-owner-fallback postview-owner-fallback--group group-post-owner-avatar" aria-hidden="true">
          <i className="bi bi-person-fill" />
        </div>
      )}
    </div>
  );
}

function ownerLabel(post) {
  return [post?.userFirstName, post?.userLastName].filter(Boolean).join(' ')
    || post?.author
    || post?.email
    || 'User';
}

function ownerEmail(post) {
  return String(post?.email || post?.author || '').trim();
}

function canCurrentUserEditPost(post) {
  const viewerEmail = String(localStorage.getItem('email') || localStorage.getItem('author') || '').trim().toLowerCase();
  const viewerId = String(localStorage.getItem('userId') || '').trim().toLowerCase();
  const postEmailCandidates = [
    post?.email,
    post?.author,
    post?.user?.email,
    post?.userEmail,
    post?.ownerEmail,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const postUserIdCandidates = [
    post?.userId,
    post?.ownerId,
    post?.user?.id,
    post?.user?.userId,
    post?.authorId,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (!viewerEmail && !viewerId) return false;
  if (viewerEmail && postEmailCandidates.includes(viewerEmail)) return true;
  if (viewerId && postUserIdCandidates.includes(viewerId)) return true;
  return false;
}

function postIconLabel(post) {
  return post?.type || 'Post';
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const normalized = String(fsPath).replace(/\\/g, '/');
  if (normalized.includes('/videos/')) {
    return `${PUBLIC_BASE}${normalized.slice(normalized.indexOf('/videos/'))}`;
  }
  const rel = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${PUBLIC_BASE}${rel}`;
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
  return [
    ...toArray(post?.imageUrls),
    post?.imageUrl,
    post?.photoUrls?.[0],
    post?.photoUrl,
  ].map(toPublicUrl).filter(Boolean);
}

function ImageGallery({ imageUrls }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLens, setShowLens] = useState(false);
  const [lensPos, setLensPos] = useState({ x: 0, y: 0, rectW: 1, rectH: 1 });
  const [likedByUrl, setLikedByUrl] = useState({});
  const imageSignature = imageUrls.join('|');

  useEffect(() => {
    setActiveIndex(0);
  }, [imageSignature]);

  if (!imageUrls.length) return null;

  const featured = imageUrls[Math.min(activeIndex, imageUrls.length - 1)] || imageUrls[0];
  const liked = !!likedByUrl[featured];
  const thumbnails = imageUrls.slice(0, 8);
  const zoom = 1.8;

  return (
    <div className="group-image-gallery">
      <div
        className="group-image-feature group-image-feature--interactive"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
          const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
          setLensPos({ x, y, rectW: rect.width, rectH: rect.height });
          setShowLens(true);
        }}
        onMouseLeave={() => setShowLens(false)}
        >
        <img src={featured} alt="" className="group-image-feature-img" />
        {showLens && (
          <div
            className="group-image-lens"
            aria-hidden="true"
            style={{
              left: lensPos.x - 70,
              top: lensPos.y - 70,
              backgroundImage: `url(${featured})`,
              backgroundSize: `${lensPos.rectW * zoom}px ${lensPos.rectH * zoom}px`,
              backgroundPosition: `${((lensPos.x / lensPos.rectW) * 100).toFixed(2)}% ${((lensPos.y / lensPos.rectH) * 100).toFixed(2)}%`,
            }}
          />
        )}
        <button
          type="button"
          className={`group-image-like ${liked ? 'is-liked' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setLikedByUrl((current) => ({
              ...current,
              [featured]: !current[featured],
            }));
          }}
        >
          <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`} />
          Like
        </button>
      </div>
      {imageUrls.length > 1 && (
        <div className="group-image-strip">
          {thumbnails.map((url, index) => (
            <button
              key={url}
              type="button"
              className={`group-image-thumb ${index === activeIndex ? 'is-active' : ''}`}
              onClick={() => {
                setActiveIndex(index);
              }}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function resolveAudioUrls(post) {
  const candidates = [
    ...toArray(post?.audioUrls),
    ...toArray(post?.hlsAudioUrls),
    post?.audioUrl,
  ].filter(Boolean);

  return candidates.map((value) => {
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;

    const normalized = raw.replace(/\\/g, '/');
    const webdataIdx = normalized.indexOf('webdata/');
    if (webdataIdx >= 0) {
      return `${PUBLIC_BASE}/${normalized.slice(webdataIdx + 'webdata/'.length)}`;
    }

    const audiosIdx = normalized.indexOf('/audios/');
    if (audiosIdx >= 0) {
      return `${PUBLIC_BASE}${normalized.slice(audiosIdx)}`;
    }

    if (normalized.startsWith('audios/')) {
      return `${PUBLIC_BASE}/${normalized}`;
    }

    const rel = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${PUBLIC_BASE}${rel}`;
  }).filter(Boolean);
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
          <ImageGallery key={imageUrls.join('|')} imageUrls={imageUrls} />
        </div>
      )}

      {audioUrls.length > 0 && (
        <div>
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
  const [openCommentsFor, setOpenCommentsFor] = useState('');
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

  const handleToggleLike = async (post) => {
    const tokenValue = localStorage.getItem('token');
    if (!tokenValue) {
      setFormError('Please log in to like posts.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValue}`,
        },
        body: JSON.stringify({
          query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }`,
        }),
      });
      const json = await response.json();
      const updated = json?.data?.toggleLike;
      if (updated) {
        setGroupPosts((current) => current.map((item) => (
          item.id === post.id ? { ...item, likes: updated.likes || 0, isLikedByCurrentUser: !!updated.isLikedByCurrentUser } : item
        )));
      }
    } catch (error) {
      setFormError(error.message || 'Could not like the post.');
    }
  };

  const handleIncrementView = async (post) => {
    const tokenValue = localStorage.getItem('token');
    try {
      if (!tokenValue) {
        setGroupPosts((current) => current.map((item) => (
          item.id === post.id ? { ...item, views: (item.views || 0) + 1 } : item
        )));
        return;
      }

      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValue}`,
        },
        body: JSON.stringify({
          query: `mutation { incrementPostViews(postId: "${post.id}") { id views } }`,
        }),
      });
      const json = await response.json();
      const updated = json?.data?.incrementPostViews;
      if (updated && typeof updated.views === 'number') {
        setGroupPosts((current) => current.map((item) => (
          item.id === post.id ? { ...item, views: updated.views } : item
        )));
      }
    } catch (error) {
      setFormError(error.message || 'Could not update post views.');
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `mutation($postId: String!) { deletePost(postId: $postId) }`,
          variables: { postId: post.id },
        }),
      });
      if (!response.ok) throw new Error('Delete failed');
      setGroupPosts((current) => current.filter((item) => item.id !== post.id));
      setNotice('Post deleted successfully.');
    } catch (error) {
      setFormError(error.message || 'Could not delete the post.');
    }
  };

  const handleEditPost = async (post) => {
    const nextDescription = window.prompt('Edit post description', String(post?.description || ''));
    if (nextDescription == null) return;

    try {
      const response = await fetch(`${API_BASE}/api/posts/update`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: post.id,
          description: nextDescription.trim(),
          author: post.author || post.email || '',
          email: post.email || post.author || '',
          ispublic: post.ispublic ?? true,
          ismemory: post.ismemory ?? false,
          isevent: post.isevent ?? false,
          isslice: post.isslice ?? false,
          groupId: post.groupId || '',
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setGroupPosts((current) => current.map((item) => (
        item.id === post.id ? { ...item, description: nextDescription.trim() } : item
      )));
      setNotice('Post updated successfully.');
    } catch (error) {
      setFormError(error.message || 'Could not update the post.');
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
    <div className="groups-shell border rounded-3 bg-white shadow-sm p-3 p-md-3">
      <div className="groups-heading d-flex justify-content-between align-items-center mb-2">
        <div>
          <h4 className="mb-1">Groups</h4>
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
      ) : selectedGroup ? (
        <div className="selected-group-panel border rounded-3 bg-white shadow-sm p-2 p-md-2 mt-2">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
            <div className="d-flex align-items-center gap-3 min-w-0">
              <div className="group-avatar group-avatar--sm" aria-hidden="true">
                {groupAvatarUrl(selectedGroup) ? (
                  <img src={groupAvatarUrl(selectedGroup)} alt="" />
                ) : initials(selectedGroup.name)}
              </div>
              <div className="min-w-0">
                <h6 className="mb-0 text-truncate group-title-small">{selectedGroup.name}</h6>
                <div className="small text-muted group-role-small">
                  {isOwner(selectedGroup) ? 'Owner' : 'Member'}
                  <span className="mx-2">•</span>
                  {selectedGroup.members.length} member{selectedGroup.members.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedGroupId('')}>
                <i className="bi bi-arrow-left me-1" />
                Back to groups
              </button>
              <button className="btn btn-primary" onClick={() => setShowUploadModal(true)} aria-label="Upload to group" title="Upload to group">
                <i className="bi bi-cloud-upload" />
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={loadGroupPosts}
                disabled={postsLoading}
                aria-label="Refresh group content"
                title="Refresh group content"
              >
                <i className={`bi ${postsLoading ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`} />
              </button>
            </div>
          </div>

          {postsError ? (
            <div className="alert alert-danger">{postsError}</div>
          ) : postsLoading ? (
            <div className="text-muted py-3">Loading group content...</div>
          ) : selectedGroupPosts.length === 0 ? (
            <div className="text-muted border rounded-3 p-3 bg-light">No content has been uploaded to this group yet.</div>
          ) : (
            <div className="d-grid gap-3">
              {selectedGroupPosts.map((post) => (
                <article key={post.id} className="border rounded-3 p-2 bg-white w-100">
                  <div className="d-flex align-items-start gap-2 mb-2">
                    <div className="min-w-0 flex-grow-1">
                      {postHeading(post) && <h6 className="mb-1 text-truncate">{postHeading(post)}</h6>}
                      {String(post?.description || '').trim() && (
                        <div className="small text-muted">{post.description}</div>
                      )}
                    </div>
                  </div>
                  {renderMediaPreview(post)}
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3 pt-2 border-top">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <div className="d-flex align-items-center gap-2">
                        <GroupPostOwnerAvatar post={post} />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setOpenCommentsFor((current) => (current === post.id ? '' : post.id))}
                        >
                          <i className="bi bi-chat-left-text me-1" />
                          Comments
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm ${post.isLikedByCurrentUser ? 'btn-danger' : 'btn-outline-secondary'}`}
                        onClick={() => handleToggleLike(post)}
                      >
                        <i className={`bi ${post.isLikedByCurrentUser ? 'bi-heart-fill' : 'bi-heart'} me-1`} />
                        {post.likes || 0}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => handleIncrementView(post)}
                      >
                        <i className="bi bi-eye me-1" />
                        {post.views || 0}
                      </button>
                    </div>
                    {canCurrentUserEditPost(post) && (
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleEditPost(post)}
                        >
                          <i className="bi bi-pencil-square me-1" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeletePost(post)}
                        >
                          <i className="bi bi-trash me-1" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {openCommentsFor === post.id && (
                    <PostComments postId={post.id} className="mt-3 pt-2 border-top" compact autoLoad />
                  )}
                </article>
              ))}
            </div>
          )}
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

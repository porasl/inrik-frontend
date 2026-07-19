import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getAllPostsCached, invalidatePostsCache } from '../services/postsService';
import { getUserProfileCached } from '../services/userProfileService';
import PostComments from './PostComments';

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replaceAll('\\', '/');

  if (norm.includes('/videos/')) {
    return `${PUBLIC_BASE}${norm.slice(norm.indexOf('/videos/'))}`;
  }

  if (norm.startsWith('videos/')) {
    return `${PUBLIC_BASE}/${norm}`;
  }

  const cleanPath = norm.startsWith('/') ? norm : `/${norm}`;
  return `${PUBLIC_BASE}${cleanPath}`;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveVideoUrl(post) {
  const candidates = [
    ...toArray(post?.hlsVideoUrls),
    ...toArray(post?.videoUrls),
    post?.hlsUrl,
    post?.videoUrl,
    post?.videoPath,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw) continue;

    if (/^https?:\/\//i.test(raw)) return raw;

    const normalized = raw.replaceAll('\\', '/');
    const webdataIdx = normalized.indexOf('webdata/');
    if (webdataIdx >= 0) return `${PUBLIC_BASE}/${normalized.slice(webdataIdx + 'webdata/'.length)}`;

    const videosIdx = normalized.indexOf('/videos/');
    if (videosIdx >= 0) return `${PUBLIC_BASE}${normalized.slice(videosIdx)}`;

    if (normalized.startsWith('videos/')) return `${PUBLIC_BASE}/${normalized}`;
  }

  return '';
}

function resolveImageUrls(post) {
  return toArray(post?.imageUrls)
    .map(toPublicUrl)
    .filter(Boolean);
}

function ImageGallery({ imageUrls, onImageOpen }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLens, setShowLens] = useState(false);
  const [lensPos, setLensPos] = useState({ x: 0, y: 0, rectW: 1, rectH: 1 });
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [imageUrls]);

  if (!imageUrls.length) return null;

  const featured = imageUrls[Math.min(activeIndex, imageUrls.length - 1)] || imageUrls[0];
  const thumbnails = imageUrls.slice(0, 8);
  const zoom = 1.8;

  return (
    <div className="postview-image-gallery">
      <div
        className="postview-image-feature postview-image-feature--interactive"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
          const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
          setLensPos({ x, y, rectW: rect.width, rectH: rect.height });
          setShowLens(true);
        }}
        onMouseLeave={() => setShowLens(false)}
      >
        <img src={featured} alt="Attachment" className="postview-image-feature-img" />
        {showLens && (
          <div
            className="postview-image-lens"
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
          className={`postview-image-like ${liked ? 'is-liked' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setLiked((value) => !value);
          }}
        >
          <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`} />
          Like
        </button>
      </div>
      {imageUrls.length > 1 && (
        <div className="postview-image-strip">
          {thumbnails.map((url, index) => (
            <button
              key={url}
              type="button"
              className={`postview-image-thumb ${index === activeIndex ? 'is-active' : ''}`}
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
  return [
    ...toArray(post?.audioUrls),
    ...toArray(post?.hlsAudioUrls),
    post?.audioUrl,
  ]
    .map(toPublicUrl)
    .filter(Boolean);
}

function resolveDocumentUrls(post) {
  const rawDocs = [
    ...toArray(post?.documentUrls),
    ...toArray(post?.documents),
  ];

  return rawDocs
    .map((entry) => (typeof entry === 'string' ? entry : entry?.url || entry?.path || entry?.fileUrl || entry?.documentUrl || ''))
    .map(toPublicUrl)
    .filter(Boolean);
}

function toEditableStringArray(value) {
  if (!value) return [];
  const source = Array.isArray(value) ? value : [value];
  return source
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.url || entry?.path || entry?.fileUrl || entry?.documentUrl || '';
    })
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function resolveEditableDocuments(post) {
  const unique = new Set();
  [...toEditableStringArray(post?.documentUrls), ...toEditableStringArray(post?.documents)].forEach((entry) => {
    unique.add(entry);
  });
  return [...unique];
}

function resolveEditableVideos(post) {
  const unique = new Set();
  [
    ...toEditableStringArray(post?.hlsVideoUrls),
    ...toEditableStringArray(post?.videoUrls),
    post?.videoUrl,
    post?.videoPath,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .forEach((entry) => unique.add(entry));
  return [...unique];
}

function resolveEditableImages(post) {
  return toEditableStringArray(post?.imageUrls);
}

function resolveEditableAudios(post) {
  const unique = new Set();
  [
    ...toEditableStringArray(post?.audioUrls),
    ...toEditableStringArray(post?.hlsAudioUrls),
    post?.audioUrl,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .forEach((entry) => unique.add(entry));
  return [...unique];
}

function resolvePostDescription(post) {
  return String(post?.description || post?.title || '').trim();
}

function resolveAuthorIdentity(post) {
  const token = localStorage.getItem('token');
  let payload = null;

  if (token) {
    try {
      payload = JSON.parse(atob(token.split('.')[1] || ''));
    } catch {
      payload = null;
    }
  }

  const email = String(localStorage.getItem('email') || '').trim();
  const author = String(localStorage.getItem('author') || '').trim();
  const userId = String(localStorage.getItem('userId') || '').trim();
  const tokenEmail = String(
    payload?.email || payload?.preferred_username || payload?.upn || post?.email || ''
  ).trim();

  const authorEmail = email || (author.includes('@') ? author : '') || tokenEmail;
  return {
    token,
    userId,
    author: authorEmail,
    email: authorEmail,
  };
}

function getCurrentViewerIdentity() {
  const email = String(localStorage.getItem('email') || '').trim().toLowerCase();
  const userId = String(localStorage.getItem('userId') || '').trim().toLowerCase();
  return { email, userId };
}

export function canCurrentUserEditPost(post) {
  const viewer = getCurrentViewerIdentity();
  // Must be logged in to edit/delete
  if (!viewer.email && !viewer.userId) return false;

  const storedAuthor = String(localStorage.getItem('author') || '').trim().toLowerCase();

  const postEmailCandidates = [post?.email, post?.author, post?.user?.email, storedAuthor]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.includes('@'));

  // Check email match
  if (viewer.email && postEmailCandidates.includes(viewer.email)) {
    return true;
  }

  const postUserIdCandidates = [post?.userId, post?.ownerId, post?.user?.id, post?.user?.userId]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  // Check userId match
  if (viewer.userId && postUserIdCandidates.includes(viewer.userId)) {
    return true;
  }

  // If no ownership markers found, reject edit/delete to be safe
  return false;
}

function getFileKind(file) {
  const mime = (file?.type || '').toLowerCase();
  const ext = (file?.name?.split('.').pop() || '').toLowerCase();

  if (mime.startsWith('video/')) return 'videos';
  if (mime.startsWith('audio/')) return 'audios';
  if (mime.startsWith('image/')) return 'images';
  if (['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audios';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'm3u8'].includes(ext)) return 'videos';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'images';
  return 'documents';
}

export function EditPostModal({ post, onClose = () => {}, onSaved = async () => {} }) {
  const [title, setTitle] = useState(String(post?.title || '').trim());
  const [description, setDescription] = useState(resolvePostDescription(post));
  const [attachments, setAttachments] = useState({
    videos: resolveEditableVideos(post),
    images: resolveEditableImages(post),
    audios: resolveEditableAudios(post),
    documents: resolveEditableDocuments(post),
  });
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  const handleRemoveAttachment = (bucket, value) => {
    setAttachments((prev) => ({
      ...prev,
      [bucket]: prev[bucket].filter((item) => item !== value),
    }));
  };

  const handleFilePick = (event) => {
    const picked = Array.from(event.target.files || []);
    setNewFiles((prev) => [...prev, ...picked]);
    event.target.value = '';
  };

  const removeNewFile = (idx) => {
    setNewFiles((prev) => prev.filter((_, index) => index !== idx));
  };

  const uploadFile = (file, identity, effectiveDescription) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('postId', String(post?.id || ''));
    formData.append('userId', identity.userId || '');
    formData.append('author', identity.author || '');
    formData.append('email', identity.email || identity.author || '');
    formData.append('description', effectiveDescription || file.name || 'Post content');
    formData.append('ispublic', String(post?.ispublic ?? true));
    formData.append('ismemory', String(post?.ismemory ?? false));
    formData.append('isevent', String(post?.isevent ?? false));
    formData.append('isslice', String(post?.isslice ?? false));
    formData.append('groupId', String(post?.groupId || ''));

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/upload`, true);

      if (identity.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${identity.token}`);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let data = {};
          try {
            data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch {
            data = {};
          }
          resolve({ ok: true, data });
          return;
        }
        resolve({ ok: false, error: `Upload failed (${xhr.status})` });
      };

      xhr.onerror = () => {
        resolve({ ok: false, error: 'Network error during file upload' });
      };

      xhr.send(formData);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    const identity = resolveAuthorIdentity(post);
    if (!identity.token) {
      setSaving(false);
      setError('Please log in again before editing this post.');
      return;
    }

    try {
      const effectiveDescription = String(description || title || 'Updated post').trim();

      const nextAttachments = {
        videos: [...attachments.videos],
        images: [...attachments.images],
        audios: [...attachments.audios],
        documents: [...attachments.documents],
      };

      for (const file of newFiles) {
        const uploaded = await uploadFile(file, identity, effectiveDescription);
        if (!uploaded.ok) {
          throw new Error(uploaded.error || 'Failed to upload new content.');
        }

        const bucket = getFileKind(file);
        const uploadedPath = String(
          uploaded?.data?.filePath
          || uploaded?.data?.url
          || uploaded?.data?.videoUrl
          || uploaded?.data?.audioUrl
          || uploaded?.data?.imageUrl
          || uploaded?.data?.documentUrl
          || ''
        ).trim();

        if (uploadedPath && !nextAttachments[bucket].includes(uploadedPath)) {
          nextAttachments[bucket].push(uploadedPath);
        }
      }

      setAttachments(nextAttachments);

      const payload = {
        id: post?.id,
        title: String(title || '').trim(),
        description: effectiveDescription,
        userId: identity.userId || '',
        author: identity.author || post?.email || '',
        email: identity.email || post?.email || '',
        ispublic: post?.ispublic ?? true,
        ismemory: post?.ismemory ?? false,
        isevent: post?.isevent ?? false,
        isslice: post?.isslice ?? false,
        groupId: post?.groupId || '',
        videoUrls: nextAttachments.videos,
        imageUrls: nextAttachments.images,
        audioUrls: nextAttachments.audios,
        documentUrls: nextAttachments.documents,
      };

      const res = await fetch(`${API_BASE}/api/posts/update`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${identity.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let details = '';
        try {
          details = await res.text();
        } catch {
          details = '';
        }
        throw new Error(details || `Update failed (${res.status})`);
      }

      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Failed to update post.');
    } finally {
      setSaving(false);
    }
  };

  const titleInputId = `post-edit-title-${post?.id || 'x'}`;
  const descriptionInputId = `post-edit-description-${post?.id || 'x'}`;
  const fileInputId = `post-edit-files-${post?.id || 'x'}`;

  return (
    <div
      className="postview-edit-overlay"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close edit post dialog"
    >
      <div
        className="postview-edit-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit post"
      >
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0">Edit Post</h5>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>

        <div className="postview-edit-tabs mb-3">
          {[
            { key: 'details', label: 'Details' },
            { key: 'videos', label: `Videos (${attachments.videos.length})` },
            { key: 'images', label: `Images (${attachments.images.length})` },
            { key: 'audios', label: `Audios (${attachments.audios.length})` },
            { key: 'documents', label: `Documents (${attachments.documents.length})` },
            { key: 'new', label: `Add Content (${newFiles.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'details' && (
        <>
        <div className="mb-3">
          <label className="form-label small fw-semibold" htmlFor={titleInputId}>Title</label>
          <input
            id={titleInputId}
            className="form-control"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Post title"
          />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold" htmlFor={descriptionInputId}>Description</label>
          <textarea
            id={descriptionInputId}
            className="form-control"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Post description"
          />
        </div>
        </>
        )}

        {['videos', 'images', 'audios', 'documents'].includes(activeTab) && (
        <div className="postview-edit-section">
          <div className="postview-edit-section-title">Current Content</div>
          <div className="postview-edit-list-block">
            <div className="text-capitalize small fw-semibold mb-1">{activeTab}</div>
            {attachments[activeTab].length === 0 ? (
              <div className="small text-secondary">No {activeTab} attached.</div>
            ) : (
              <ul className="postview-edit-list">
                {attachments[activeTab].map((item) => (
                  <li key={`${activeTab}-${item}`}>
                    <span className="text-truncate">{String(item).split('/').pop() || item}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleRemoveAttachment(activeTab, item)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        )}

        {activeTab === 'new' && (
        <div className="mb-3">
          <label className="form-label small fw-semibold" htmlFor={fileInputId}>Add New Content</label>
          <input id={fileInputId} type="file" className="form-control" multiple onChange={handleFilePick} />
          {newFiles.length > 0 && (
            <ul className="postview-edit-list mt-2">
              {newFiles.map((file, idx) => (
                <li key={`${file.name}-${idx}`}>
                  <span className="text-truncate">{file.name}</span>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => removeNewFile(idx)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

EditPostModal.propTypes = {
  post: PropTypes.shape({}).isRequired,
  onClose: PropTypes.func,
  onSaved: PropTypes.func,
};

function resolveOwnerAvatar(post) {
  const candidate = post?.user?.avatar
    || post?.userProfileImageUrl
    || post?.profileImageUrl
    || post?.profile_image_url
    || '';

  return toPublicUrl(candidate);
}

function OwnerLine({ post }) {
  const owner = [post?.userFirstName, post?.userLastName].filter(Boolean).join(' ') || post?.author || post?.email || 'User';
  const [avatar, setAvatar] = useState(resolveOwnerAvatar(post));
  const [hasAvatarError, setHasAvatarError] = useState(false);
  const ownerEmail = String(post?.email || post?.author || '').trim();

  useEffect(() => {
    let cancelled = false;

    const directAvatar = resolveOwnerAvatar(post);
    setAvatar(directAvatar);
    setHasAvatarError(false);

    if (directAvatar) return () => { cancelled = true; };

    const ownerEmail = String(post?.email || post?.author || '').trim().toLowerCase();
    if (!ownerEmail || !ownerEmail.includes('@')) {
      return () => { cancelled = true; };
    }

    getUserProfileCached(ownerEmail)
      .then((profile) => {
        if (cancelled) return;
        const profileAvatar = String(profile?.profileImageUrl || '').trim();
        if (!profileAvatar) return;
        setAvatar(toPublicUrl(profileAvatar));
      })
      .catch(() => {
        // Keep fallback icon if profile lookup fails.
      });

    return () => {
      cancelled = true;
    };
  }, [post]);

  return (
    <div className="postview-owner-row" title={ownerEmail || owner}>
      {avatar && !hasAvatarError ? (
        <img
          src={avatar}
          alt={owner}
          className="postview-owner-avatar"
          onError={() => setHasAvatarError(true)}
        />
      ) : (
        <div
          className="postview-owner-fallback"
          aria-hidden="true"
        >
          <i className="bi bi-person-fill" />
        </div>
      )}
    </div>
  );
}

OwnerLine.propTypes = {
  post: PropTypes.shape({
    userFirstName: PropTypes.string,
    userLastName: PropTypes.string,
    author: PropTypes.string,
    email: PropTypes.string,
    userProfileImageUrl: PropTypes.string,
    profileImageUrl: PropTypes.string,
    profile_image_url: PropTypes.string,
    user: PropTypes.shape({
      avatar: PropTypes.string,
    }),
  }),
};

function PostVideoPlayer({ src, onPlay }) {
  const videoRef = useRef(null);
  const isHls = /\.m3u8(\?|$)/i.test(String(src || ''));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    }

    video.src = src;
    return undefined;
  }, [src, isHls]);

  return (
    <video
      ref={videoRef}
      className="postview-video"
      controls
      preload="metadata"
      src={isHls ? undefined : src}
      onPlay={onPlay}
    />
  );
}

PostVideoPlayer.propTypes = {
  src: PropTypes.string,
  onPlay: PropTypes.func,
};

function PostCard({ post, onDelete, onUpdated, canEdit = false }) {
  const [hidden, setHidden] = useState(false);
  const [likes, setLikes] = useState(post?.likes || 0);
  const [liked, setLiked] = useState(!!post?.isLikedByCurrentUser);
  const [views, setViews] = useState(post?.views || 0);
  const [showComments, setShowComments] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const title = String(post?.title || post?.description || 'Untitled Post').trim();
  const videoUrl = useMemo(() => resolveVideoUrl(post), [post]);
  const imageUrls = useMemo(() => resolveImageUrls(post), [post]);
  const audioUrls = useMemo(() => resolveAudioUrls(post), [post]);
  const documentUrls = useMemo(() => resolveDocumentUrls(post), [post]);

  if (hidden) return null;

  const toggleLike = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to like.');
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)));

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }`,
        }),
      });
      const json = await res.json();
      const updated = json?.data?.toggleLike;
      if (updated) {
        setLiked(!!updated.isLikedByCurrentUser);
        setLikes(updated.likes || 0);
      }
    } catch {
      setLiked(!nextLiked);
      setLikes((c) => (nextLiked ? Math.max(0, c - 1) : c + 1));
    }
  };

  const incrementView = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setViews((v) => v + 1);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `mutation { incrementPostViews(postId: "${post.id}") { id views } }`,
        }),
      });
      const json = await res.json();
      const updated = json?.data?.incrementPostViews;
      if (updated && typeof updated.views === 'number') {
        setViews(updated.views);
      } else {
        setViews((v) => v + 1);
      }
    } catch {
      setViews((v) => v + 1);
    }
  };

  const handleDelete = async () => {
    if (!globalThis.confirm('Delete this post?')) return;
    await onDelete?.(post.id);
  };

  return (
    <article className="postview-card card-clean">
      <header className="postview-card-head">
        <div className="postview-title-wrap">
          <h6 className="postview-title">{title}</h6>
        </div>
      </header>

      <div className="postview-body">
        {videoUrl && (
          <div className="postview-attachment-block">
            <div className="postview-attachment-label"><i className="bi bi-play-btn me-1"></i>Video</div>
            <PostVideoPlayer src={videoUrl} onPlay={incrementView} />
          </div>
        )}

        {imageUrls.length > 0 && (
          <div className="postview-attachment-block">
            <div className="postview-attachment-label"><i className="bi bi-images me-1"></i>Images ({imageUrls.length})</div>
            <ImageGallery imageUrls={imageUrls} />
          </div>
        )}

        {audioUrls.length > 0 && (
          <div className="postview-attachment-block">
            <div className="postview-attachment-label"><i className="bi bi-music-note-beamed me-1"></i>Audio ({audioUrls.length})</div>
            <div className="postview-audio-list">
              {audioUrls.map((url) => (
                <audio key={url} controls preload="none" src={url} onPlay={incrementView} />
              ))}
            </div>
          </div>
        )}

        {documentUrls.length > 0 && (
          <div className="postview-attachment-block">
            <div className="postview-attachment-label"><i className="bi bi-file-earmark-text me-1"></i>Documents ({documentUrls.length})</div>
            <ul className="postview-doc-list">
              {documentUrls.map((url) => {
                const name = decodeURIComponent(String(url).split('?')[0].split('/').pop() || 'Document');
                return (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" onClick={incrementView}>{name}</a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <footer className="postview-footer">
        <div className="postview-footer-left">
          <OwnerLine post={post} />
          <button type="button" className={`btn btn-sm ${liked ? 'btn-danger' : 'btn-outline-secondary'}`} onClick={toggleLike}>
            <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>{likes}
          </button>

          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={incrementView}>
            <i className="bi bi-eye me-1"></i>{views}
          </button>

          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setShowComments((s) => !s)}>
            <i className="bi bi-chat-left-text me-1"></i>Comments
          </button>
        </div>

        <div className="postview-footer-actions">
          {canEdit && (
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setShowEditModal(true)}>
              <i className="bi bi-pencil-square"></i>
            </button>
          )}
          <button type="button" className="btn btn-sm btn-light" onClick={() => setHidden(true)}>
            <i className="bi bi-eye-slash"></i>
          </button>
          {canEdit && (
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
              <i className="bi bi-trash"></i>
            </button>
          )}
        </div>
      </footer>

      {showComments && <PostComments postId={post.id} className="postview-comments" compact autoLoad canModerate={canEdit} />}
      {showEditModal && (
        <EditPostModal
          post={post}
          onClose={() => setShowEditModal(false)}
          onSaved={onUpdated}
        />
      )}
    </article>
  );
}

PostCard.propTypes = {
  post: PropTypes.shape({}).isRequired,
  onDelete: PropTypes.func,
  onUpdated: PropTypes.func,
  canEdit: PropTypes.bool,
};

export default function PostView({ posts = [], isLoggedIn = false, onUpload, onDelete }) {
  const [dbPosts, setDbPosts] = useState([]);
  const [isLoadingDbPosts, setIsLoadingDbPosts] = useState(false);
  const [saveToast, setSaveToast] = useState('');

  const refreshPosts = useCallback(async (forceRefresh = true) => {
    setIsLoadingDbPosts(true);
    try {
      if (forceRefresh) {
        invalidatePostsCache();
      }
      const items = await getAllPostsCached({ forceRefresh });
      setDbPosts(Array.isArray(items) ? items.filter(Boolean) : []);
    } catch {
      setDbPosts([]);
    } finally {
      setIsLoadingDbPosts(false);
    }
  }, []);

  const refreshPostsAfterEdit = useCallback(async () => {
    await refreshPosts(true);
    setSaveToast('Post updated successfully.');
    globalThis.setTimeout(() => setSaveToast(''), 2400);
  }, [refreshPosts]);

  useEffect(() => {
    let cancelled = false;

    const loadDbPosts = async () => {
      try {
        const items = await getAllPostsCached({ forceRefresh: true });
        if (!cancelled) {
          setDbPosts(Array.isArray(items) ? items.filter(Boolean) : []);
          setIsLoadingDbPosts(false);
        }
      } catch {
        if (!cancelled) {
          setDbPosts([]);
          setIsLoadingDbPosts(false);
        }
      }
    };

    setIsLoadingDbPosts(true);
    loadDbPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  const visiblePosts = useMemo(() => {
    if (dbPosts.length > 0) return dbPosts;
    return posts.filter(Boolean);
  }, [dbPosts, posts]);

  return (
    <section className="postview-root">
      {!isLoggedIn && (
        <div className="alert alert-light border small mb-3">Log in to upload, like, comment, and manage posts.</div>
      )}

      {saveToast && (
        <div className="postview-toast" role="status" aria-live="polite">{saveToast}</div>
      )}

      <div className="postview-feed">
        {isLoadingDbPosts && (
          <div className="text-secondary small">Loading posts from database...</div>
        )}

        {!isLoadingDbPosts && visiblePosts.length === 0 && (
          <div className="text-secondary small">No posts found in database.</div>
        )}

        {visiblePosts.map((post) => (
          <PostCard
            key={post.id || `${post.title}-${post.author}`}
            post={post}
            onDelete={onDelete}
            onUpdated={refreshPostsAfterEdit}
            canEdit={canCurrentUserEditPost(post)}
          />
        ))}
      </div>
    </section>
  );
}

PostView.propTypes = {
  posts: PropTypes.arrayOf(PropTypes.shape({})),
  isLoggedIn: PropTypes.bool,
  onUpload: PropTypes.func,
  onDelete: PropTypes.func,
};

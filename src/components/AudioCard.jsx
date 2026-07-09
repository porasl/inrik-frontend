import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getUserProfileCached } from '../services/userProfileService';
import PostComments from './PostComments';

function fileNameFromUrl(url) {
  if (!url) return 'Audio';
  try {
    const clean = String(url).split('?')[0];
    return decodeURIComponent(clean.split('/').pop() || 'Audio');
  } catch {
    return 'Audio';
  }
}

function toPublicUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = String(value).replaceAll('\\', '/');
  const relative = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${PUBLIC_BASE}${relative}`;
}

function initialsFromName(name) {
  return String(name || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

export default function AudioCard({ post, audioUrl }) {
  const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [views, setViews] = useState(post.views || 0);
  const [countedView, setCountedView] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [ownerAvatar, setOwnerAvatar] = useState(() => toPublicUrl(post.userProfileImageUrl || post.profileImageUrl || post.profile_image_url || post.user?.avatar || ''));
  const [avatarError, setAvatarError] = useState(false);

  const audioTitle = useMemo(() => {
    const preferred = (post.title || '').trim();
    return preferred || fileNameFromUrl(audioUrl);
  }, [post.title, audioUrl]);

  const ownerName = useMemo(() => {
    return [post.userFirstName, post.userLastName].filter(Boolean).join(' ') || post.author || post.email || post.user?.name || 'User';
  }, [post.userFirstName, post.userLastName, post.author, post.email, post.user?.name]);

  const ownerEmail = useMemo(() => {
    const author = String(post.author || '').trim();
    return String(post.email || post.user?.email || (author.includes('@') ? author : '') || '').trim().toLowerCase();
  }, [post.author, post.email, post.user?.email]);

  useEffect(() => {
    let cancelled = false;
    const directAvatar = toPublicUrl(post.userProfileImageUrl || post.profileImageUrl || post.profile_image_url || post.user?.avatar || '');

    setOwnerAvatar(directAvatar);
    setAvatarError(false);

    if (directAvatar || !ownerEmail) {
      return () => {
        cancelled = true;
      };
    }

    getUserProfileCached(ownerEmail)
      .then((profile) => {
        if (cancelled) return;
        const profileAvatar = toPublicUrl(profile?.profileImageUrl || '');
        if (profileAvatar) {
          setOwnerAvatar(profileAvatar);
          setAvatarError(false);
        }
      })
      .catch(() => {
        // Initials fallback remains available if profile lookup fails.
      });

    return () => {
      cancelled = true;
    };
  }, [ownerEmail, post.profileImageUrl, post.profile_image_url, post.user?.avatar, post.userProfileImageUrl]);

  const toggleLike = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to like.');
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)));

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }`,
        }),
      });

      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message || 'Failed');

      const updated = json?.data?.toggleLike;
      if (updated) {
        setLiked(!!updated.isLikedByCurrentUser);
        setLikeCount(updated.likes || 0);
      }
    } catch {
      setLiked(!nextLiked);
      setLikeCount((c) => (nextLiked ? Math.max(0, c - 1) : c + 1));
    }
  };

  const incrementView = async () => {
    if (countedView) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setCountedView(true);

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

  return (
    <div className="card border-0 shadow-sm rounded-4 p-3 mb-3">
      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div className="d-flex align-items-center gap-2 min-w-0">
          <div
            className="rounded-circle overflow-hidden flex-shrink-0 d-flex align-items-center justify-content-center border bg-primary"
            style={{ width: 38, height: 38 }}
            title={ownerName}
          >
            {ownerAvatar && !avatarError ? (
              <img
                src={ownerAvatar}
                alt={ownerName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span className="text-white fw-bold small">{initialsFromName(ownerName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <h6 className="mb-1 fw-bold text-dark text-truncate" title={audioTitle}>{audioTitle}</h6>
            <p className="mb-0 small text-muted text-truncate">{ownerName}</p>
          </div>
        </div>
      </div>

      <audio
        className="w-100 mb-2"
        controls
        preload="none"
        src={audioUrl}
        onPlay={incrementView}
      >
        Your browser does not support the audio element.
      </audio>

      <p className="small text-secondary mb-2">{post.title || 'No description provided.'}</p>

      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3 text-secondary small">
          <span><i className="bi bi-eye me-1"></i>{views}</span>
          <button
            type="button"
            className="btn btn-link p-0 text-decoration-none"
            style={{ color: liked ? '#dc3545' : '#6c757d' }}
            onClick={toggleLike}
            title={liked ? 'Unlike' : 'Like'}
          >
            <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>
            {likeCount}
          </button>
          <button
            type="button"
            className="btn btn-link p-0 text-secondary text-decoration-none"
            onClick={() => setShowComments((value) => !value)}
          >
            <i className="bi bi-chat-left-text me-1"></i>
            Comments
          </button>
        </div>
      </div>

      {showComments && (
        <PostComments
          postId={String(post.id)}
          className="border-top mt-3 pt-3"
          compact
          autoLoad
        />
      )}
    </div>
  );
}

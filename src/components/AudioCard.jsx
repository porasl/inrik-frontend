import React, { useMemo, useState } from 'react';
import { API_BASE } from '../../app.config.js';

function fileNameFromUrl(url) {
  if (!url) return 'Audio';
  try {
    const clean = String(url).split('?')[0];
    return decodeURIComponent(clean.split('/').pop() || 'Audio');
  } catch {
    return 'Audio';
  }
}

export default function AudioCard({ post, audioUrl }) {
  const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [views, setViews] = useState(post.views || 0);
  const [countedView, setCountedView] = useState(false);

  const audioTitle = useMemo(() => {
    const preferred = (post.title || '').trim();
    return preferred || fileNameFromUrl(audioUrl);
  }, [post.title, audioUrl]);

  const ownerName = useMemo(() => {
    return [post.userFirstName, post.userLastName].filter(Boolean).join(' ') || post.author || post.email || 'User';
  }, [post.userFirstName, post.userLastName, post.author, post.email]);

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
        <div>
          <h6 className="mb-1 fw-bold text-dark" title={audioTitle}>{audioTitle}</h6>
          <p className="mb-0 small text-muted">{ownerName}</p>
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
        </div>
      </div>
    </div>
  );
}

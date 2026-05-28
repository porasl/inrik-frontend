import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getAllPostsCached } from '../services/postsService';

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

function OwnerLine({ post }) {
  const owner = [post?.userFirstName, post?.userLastName].filter(Boolean).join(' ') || post?.author || post?.email || 'User';
  return <span className="postview-owner">{owner}</span>;
}

OwnerLine.propTypes = {
  post: PropTypes.shape({
    userFirstName: PropTypes.string,
    userLastName: PropTypes.string,
    author: PropTypes.string,
    email: PropTypes.string,
  }),
};

function CommentsPanel({ postId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadComments = async () => {
    if (loaded || !postId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `query { getComments(postId: "${postId}") { id text userEmail createdAt } }`,
        }),
      });
      const json = await res.json();
      setComments(json?.data?.getComments || []);
      setLoaded(true);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to comment.');
      return;
    }

    const trimmed = String(text || '').trim();
    if (!trimmed) return;

    try {
      const escaped = trimmed.replace(/"/g, '\\"');
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `mutation { addComment(postId: "${postId}", text: "${escaped}") { id text userEmail createdAt } }`,
        }),
      });

      const json = await res.json();
      const newComment = json?.data?.addComment;
      if (newComment) {
        setComments((prev) => [newComment, ...prev]);
      }
      setText('');
    } catch {
      // Ignore network/mutation errors in UI.
    }
  };

  return (
    <section className="postview-comments" onMouseEnter={loadComments}>
      <form className="postview-comment-form" onSubmit={addComment}>
        <input
          className="form-control"
          placeholder="Write a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary">Comment</button>
      </form>

      {loading && <div className="small text-secondary">Loading comments...</div>}

      {!loading && comments.length === 0 && (
        <div className="small text-secondary">No comments yet.</div>
      )}

      <div className="postview-comment-list">
        {comments.map((c) => (
          <article key={c.id} className="postview-comment-item">
            <div className="postview-comment-user">{c.userEmail || 'User'}</div>
            <div>{c.text}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

CommentsPanel.propTypes = {
  postId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
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

function PostCard({ post, onDelete }) {
  const [hidden, setHidden] = useState(false);
  const [likes, setLikes] = useState(post?.likes || 0);
  const [liked, setLiked] = useState(!!post?.isLikedByCurrentUser);
  const [views, setViews] = useState(post?.views || 0);
  const [showComments, setShowComments] = useState(false);

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
          <OwnerLine post={post} />
        </div>
        <div className="postview-head-actions">
          <button type="button" className="btn btn-sm btn-light" onClick={() => setHidden(true)}>
            <i className="bi bi-eye-slash"></i>
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
            <i className="bi bi-trash"></i>
          </button>
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
            <div className="postview-image-grid">
              {imageUrls.map((url) => (
                <img key={url} src={url} alt="Attachment" className="postview-image" onClick={incrementView} />
              ))}
            </div>
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
        <button type="button" className={`btn btn-sm ${liked ? 'btn-danger' : 'btn-outline-secondary'}`} onClick={toggleLike}>
          <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>{likes}
        </button>

        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={incrementView}>
          <i className="bi bi-eye me-1"></i>{views}
        </button>

        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setShowComments((s) => !s)}>
          <i className="bi bi-chat-left-text me-1"></i>Comments
        </button>
      </footer>

      {showComments && <CommentsPanel postId={post.id} />}
    </article>
  );
}

PostCard.propTypes = {
  post: PropTypes.shape({}).isRequired,
  onDelete: PropTypes.func,
};

export default function PostView({ posts = [], isLoggedIn = false, onUpload, onDelete }) {
  const [dbPosts, setDbPosts] = useState([]);
  const [isLoadingDbPosts, setIsLoadingDbPosts] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadDbPosts = async () => {
      setIsLoadingDbPosts(true);
      try {
        const items = await getAllPostsCached({ forceRefresh: true });
        if (!cancelled) {
          setDbPosts(Array.isArray(items) ? items.filter(Boolean) : []);
        }
      } catch {
        if (!cancelled) {
          setDbPosts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDbPosts(false);
        }
      }
    };

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

      <div className="postview-feed">
        {isLoadingDbPosts && (
          <div className="text-secondary small">Loading posts from database...</div>
        )}

        {!isLoadingDbPosts && visiblePosts.length === 0 && (
          <div className="text-secondary small">No posts found in database.</div>
        )}

        {visiblePosts.map((post) => (
          <PostCard key={post.id || `${post.title}-${post.author}`} post={post} onDelete={onDelete} />
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PUBLIC_BASE } from '../../app.config.js';
import { getSlicePostsCached, subscribePostsCacheUpdates, subscribePostsRefreshStatus } from '../services/postsService';
import useDelayedVisibility from '../hooks/useDelayedVisibility';

function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  const idx = norm.indexOf("/videos/");
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

/* ── Single full-screen Slice player ── */
function SlicePlayer({ post, onNext, onPrev, isFirst, isLast, total, index }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const controlsTimer = useRef(null);

  const hls0 = post.hlsVideoUrls?.[0] || "";
  const hlsUrl = hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : "";
  const thumb = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? ""));
  const ownerName = [post.userFirstName, post.userLastName].filter(Boolean).join(" ") || post.email || "User";
  const avatarUrl = post.userProfileImageUrl && !post.userProfileImageUrl.includes('@')
    ? toPublicUrl(post.userProfileImageUrl) : null;

  /* ── HLS setup ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    // Destroy previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
    } else {
      import('./hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: false });
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hlsRef.current = hls;
        }
      });
    }

    video.loop = true;
    video.muted = false;
    video.playsInline = true;
    video.play().catch(() => {});

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [hlsUrl]);

  /* ── Sync liked state when post changes ── */
  useEffect(() => {
    setLiked(!!post.isLikedByCurrentUser);
    setLikeCount(post.likes || 0);
    setAvatarError(false);
  }, [post.id]);

  /* ── Toggle play/pause on video click ── */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setPaused(false); }
    else { video.pause(); setPaused(true); }
    flashControls();
  };

  const flashControls = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2000);
  };

  /* ── Like ── */
  const handleLike = async (e) => {
    e.stopPropagation();
    const token = localStorage.getItem("token");
    if (!token) { alert("Please log in to like."); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }` }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const updated = json.data?.toggleLike;
      if (updated) { setLikeCount(updated.likes); setLiked(updated.isLikedByCurrentUser); }
    } catch {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  };

  /* ── Keyboard navigation ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") onNext?.();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") onPrev?.();
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev]);

  const initials = ownerName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const avatarBg = ['#4e73df','#1cc88a','#36b9cc','#f6c23e','#e74a3b','#6f42c1','#fd7e14'][
    ownerName.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 7
  ];

  return (
    <div className="slice-page-player" onClick={togglePlay} onMouseMove={flashControls}>

      {/* VIDEO */}
      <video
        ref={videoRef}
        className="slice-page-video"
        poster={thumb}
        playsInline
        loop
      />

      {/* Pause overlay */}
      {paused && (
        <div className="slice-pause-overlay">
          <i className="bi bi-play-fill" />
        </div>
      )}

      {/* Progress indicator */}
      <div className="slice-page-progress">
        <span>{index + 1} / {total}</span>
      </div>

      {/* TOP gradient */}
      <div className="slice-page-top-gradient" />

      {/* BOTTOM info overlay */}
      <div className="slice-page-info" onClick={e => e.stopPropagation()}>
        {/* Owner */}
        <div className="slice-page-owner">
          <div className="slice-page-avatar" style={{ background: avatarBg }}>
            {avatarUrl && !avatarError
              ? <img src={avatarUrl} alt={ownerName} onError={() => setAvatarError(true)} />
              : <span>{initials}</span>
            }
          </div>
          <span className="slice-page-owner-name">{ownerName}</span>
        </div>

        {/* Title */}
        {post.title && (
          <p className="slice-page-title">{post.title}</p>
        )}
      </div>

      {/* RIGHT action buttons */}
      <div className="slice-page-actions" onClick={e => e.stopPropagation()}>
        {/* Like */}
        <button className={`slice-action-btn ${liked ? 'liked' : ''}`} onClick={handleLike} title="Like">
          <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`} />
          <span>{likeCount}</span>
        </button>

        {/* Views */}
        <div className="slice-action-btn static" title="Views">
          <i className="bi bi-eye" />
          <span>{post.views || 0}</span>
        </div>
      </div>

      {/* PREV / NEXT arrows */}
      <button
        className={`slice-page-nav slice-page-nav--prev ${isFirst ? 'hidden' : ''}`}
        onClick={e => { e.stopPropagation(); onPrev?.(); }}
        aria-label="Previous"
      >
        <i className="bi bi-chevron-up" />
      </button>

      <button
        className={`slice-page-nav slice-page-nav--next ${isLast ? 'hidden' : ''}`}
        onClick={e => { e.stopPropagation(); onNext?.(); }}
        aria-label="Next"
      >
        <i className="bi bi-chevron-down" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN SlicePage COMPONENT
═══════════════════════════════════════ */
export default function SlicePage({ startPostId = null, onClose }) {
  const [posts, setPosts] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const showRefreshing = useDelayedVisibility(isRefreshing, {
    showDelayMs: 120,
    minVisibleMs: 420,
  });
  const didRunInitialFetch = useRef(false);
  const activePostIdRef = useRef(null);

  useEffect(() => {
    activePostIdRef.current = posts[index]?.id || null;
  }, [posts, index]);

  useEffect(() => {
    if (didRunInitialFetch.current && posts.length) {
      if (startPostId) {
        const idx = posts.findIndex((p) => p.id === startPostId);
        if (idx >= 0) setIndex(idx);
      }
      return;
    }

    didRunInitialFetch.current = true;

    getSlicePostsCached()
      .then(fetched => {
        setPosts(fetched);
        // Jump to the clicked post if a startPostId was provided
        if (startPostId) {
          const idx = fetched.findIndex(p => p.id === startPostId);
          if (idx >= 0) setIndex(idx);
        }
      })
      .catch(err => console.error("SlicePage fetch error:", err))
      .finally(() => setLoading(false));
  }, [startPostId, posts]);

  useEffect(() => {
    const unsubscribe = subscribePostsCacheUpdates(({ key, items }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (key !== tokenKey) return;

      const nextSlicePosts = items.filter((p) => p.slice === true);
      setPosts(nextSlicePosts);

      if (!nextSlicePosts.length) {
        setIndex(0);
        return;
      }

      const currentId = activePostIdRef.current;
      if (currentId) {
        const nextIdx = nextSlicePosts.findIndex((p) => p.id === currentId);
        if (nextIdx >= 0) {
          setIndex(nextIdx);
          return;
        }
      }

      setIndex((prev) => Math.max(0, Math.min(prev, nextSlicePosts.length - 1)));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePostsRefreshStatus(({ key, refreshing }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (key !== tokenKey) return;
      setIsRefreshing(refreshing);
    });

    return unsubscribe;
  }, []);

  const goNext = useCallback(() => setIndex(i => Math.min(i + 1, posts.length - 1)), [posts.length]);
  const goPrev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  /* ── Touch/swipe support ── */
  const touchStart = useRef(null);
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientY;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
    touchStart.current = null;
  };

  if (loading) {
    return (
      <div className="slice-page-loading">
        <button
          className="slice-page-close"
          onClick={onClose}
          type="button"
          aria-label="Close Slice page"
        >
          <i className="bi bi-x-lg" />
        </button>
        <div className="slice-page-spinner" />
        <p>Loading Slices…</p>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="slice-page-empty">
        <button
          className="slice-page-close"
          onClick={onClose}
          type="button"
          aria-label="Close Slice page"
        >
          <i className="bi bi-x-lg" />
        </button>
        <i className="bi bi-film" />
        <h3>No Slice videos yet</h3>
        <p>Upload a short video and mark it as a Slice to see it here.</p>
      </div>
    );
  }

  return (
    <div
      className="slice-page-container"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {showRefreshing && (
        <div className="position-absolute top-0 start-0 m-3" style={{ zIndex: 30 }}>
          <span className="badge rounded-pill text-bg-light border text-secondary d-inline-flex align-items-center gap-2">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            Refreshing slices...
          </span>
        </div>
      )}

      <button
        className="slice-page-close"
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        type="button"
        aria-label="Close Slice page"
      >
        <i className="bi bi-x-lg" />
      </button>

      <SlicePlayer
        key={posts[index].id}
        post={posts[index]}
        index={index}
        total={posts.length}
        onNext={goNext}
        onPrev={goPrev}
        isFirst={index === 0}
        isLast={index === posts.length - 1}
      />

      {/* Thumbnail strip at bottom */}
      <div className="slice-page-strip">
        {posts.map((p, i) => {
          const thumb = toPublicUrl(p.videoImagePath || (p.imageUrls?.[0] ?? ""));
          return (
            <button
              key={p.id}
              className={`slice-strip-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              title={p.title || `Slice ${i + 1}`}
            >
              {thumb
                ? <img src={thumb} alt="" />
                : <div className="slice-strip-dot-placeholder" />
              }
            </button>
          );
        })}
      </div>
    </div>
  );
}

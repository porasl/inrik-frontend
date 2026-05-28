import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { PUBLIC_BASE } from '../../app.config.js';
import { getUserProfileCached } from '../services/userProfileService';

function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  if (norm.indexOf("/videos/") >= 0) {
    const rel = norm.slice(norm.indexOf("/videos/"));
    return `${PUBLIC_BASE}${rel}`;
  }
  const cleanPath = norm.startsWith("/") ? norm : `/${norm}`;
  return `${PUBLIC_BASE}${cleanPath}`;
}

function isNumericLike(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function resolveThumbnailUrl(post) {
  const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const candidates = [
    post?.videoImagePath,
    post?.thumbnailUrl,
    ...toArray(post?.imageUrls),
    post?.imageUrl,
  ].filter(Boolean);

  const validImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i;

  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw || isNumericLike(raw) || raw.includes('@')) continue;

    const resolved = toPublicUrl(raw);
    if (!resolved) continue;

    const looksLikeImage = validImageExt.test(resolved)
      || resolved.includes('/images/')
      || resolved.includes('/videos/')
      || resolved.includes('/thumbnails/')
      || resolved.startsWith('data:image/');

    if (looksLikeImage) return resolved;
  }

  return '';
}

function resolvePlayableVideoUrl(post) {
  const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const candidates = [
    ...toArray(post?.hlsVideoUrls),
    ...toArray(post?.videoUrls),
    post?.hlsUrl,
    post?.videoUrl,
    post?.videoPath,
  ].filter(Boolean);

  const normalize = (value) => {
    const raw = String(value).trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) return raw;

    const norm = raw.replace(/\\/g, '/');
    const webdataIdx = norm.indexOf('webdata/');
    if (webdataIdx >= 0) {
      return `${PUBLIC_BASE}/${norm.slice(webdataIdx + 'webdata/'.length)}`;
    }

    const videosIdx = norm.indexOf('/videos/');
    if (videosIdx >= 0) {
      return `${PUBLIC_BASE}${norm.slice(videosIdx)}`;
    }

    if (norm.startsWith('videos/')) {
      return `${PUBLIC_BASE}/${norm}`;
    }

    return '';
  };

  const validExt = /\.(m3u8|mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;
  return candidates
    .map(normalize)
    .find((u) => u && (validExt.test(u) || /\.m3u8(\?|$)/i.test(u))) || '';
}

/* ── Format seconds → m:ss ── */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Owner avatar with initials fallback ── */
const avatarCache = {};

function OwnerAvatar({ post }) {
  const user = post.user || {};
  const authorValue = String(post.author || '').trim();
  const userNameValue = String(user.name || '').trim();
  const ownerEmail = post.email || user.email || (authorValue.includes('@') ? authorValue : '');

  const fallbackName = [post.userFirstName, post.userLastName].filter(Boolean).join(' ')
    || (!isNumericLike(userNameValue) ? userNameValue : '')
    || (!isNumericLike(authorValue) ? authorValue : '')
    || ownerEmail
    || 'User';

  const [avatarUrl, setAvatarUrl] = useState(() => {
    const raw = post.userProfileImageUrl || user.avatar || null;
    if (!raw || String(raw).includes('@')) return null;
    return toPublicUrl(raw);
  });

  const [resolvedName, setResolvedName] = useState(fallbackName);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!ownerEmail) return;
    if (avatarCache[ownerEmail]) {
      setAvatarUrl(avatarCache[ownerEmail].url);
      setResolvedName(avatarCache[ownerEmail].name);
      return;
    }

    getUserProfileCached(ownerEmail)
      .then((profile) => {
        const fetchedName = profile ? [profile.firstname, profile.lastname].filter(Boolean).join(' ') : null;
        const finalName = fetchedName || fallbackName;

        const url = profile?.profileImageUrl;
        if (url) {
          const fullUrl = toPublicUrl(url);
          avatarCache[ownerEmail] = { url: fullUrl, name: finalName };
          setHasError(false);
          setAvatarUrl(fullUrl);
          setResolvedName(finalName);
        } else {
          const local = ownerEmail.split('@')[0];
          const probeUrl = toPublicUrl(`/profileImages/${local}.jpg`);
          avatarCache[ownerEmail] = { url: probeUrl, name: finalName };
          setHasError(false);
          setAvatarUrl(probeUrl);
          setResolvedName(finalName);
        }
      })
      .catch(() => {
        const local = ownerEmail.split('@')[0];
        setHasError(false);
        setAvatarUrl(toPublicUrl(`/profileImages/${local}.jpg`));
        setResolvedName(fallbackName); // Ensure name is set even on fetch error
      });
  }, [ownerEmail, fallbackName]);

  const safeName = String(resolvedName || '').trim() && String(resolvedName || '').trim() !== '?'
    ? String(resolvedName || '').trim()
    : 'User';
  const initials = safeName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "U";
  const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6f42c1', '#fd7e14'];
  const bg = colors[safeName.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length];

  return (
    <div className="d-flex align-items-center gap-2" title={safeName} style={{ cursor: 'default' }}>
      <div
        className="rounded-circle overflow-hidden flex-shrink-0 d-flex align-items-center justify-content-center border"
        style={{ width: 30, height: 30, background: bg }}
      >
        {avatarUrl && !hasError ? (
          <img
            src={avatarUrl}
            alt={safeName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { setHasError(true); e.target.style.display = 'none'; }}
          />
        ) : (
          <span className="text-white fw-bold" style={{ fontSize: 13 }}>{initials}</span>
        )}
      </div>
    </div>
  );
}

/* ── EMBED MODAL COMPONENT ── */
function EmbedModal({ postId, onClose }) {
  const iframeCode = `<iframe src="${window.location.origin}/embed/${postId}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content-custom bg-white p-4 shadow-lg rounded" style={{ maxWidth: 520, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0 fw-bold"><i className="bi bi-code-slash me-2 text-primary"></i>Embed Video</h5>
          <button className="btn-close" onClick={onClose}></button>
        </div>
        <p className="text-secondary small mb-2">Copy and paste this code into your website:</p>
        <textarea className="form-control bg-light mb-3" rows="3" readOnly value={iframeCode} style={{ fontSize: '0.8rem', fontFamily: 'monospace' }} />
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-primary btn-sm px-3" onClick={() => { navigator.clipboard.writeText(iframeCode); alert("Copied to clipboard!"); }}>
            <i className="bi bi-clipboard me-1"></i>Copy
          </button>
          <button className="btn btn-light btn-sm border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN VIDEOCARD COMPONENT
═══════════════════════════════════════════ */
export default function VideoCard({ post, onDelete, onWatch }) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [liked, setLiked] = useState(!!post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [views, setViews] = useState(post.views || 0);
  const [duration, setDuration] = useState(""); // video length for thumbnail badge

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const menuRef = useRef(null);

  const playableVideoUrl = resolvePlayableVideoUrl(post);
  const isHlsVideo = /\.m3u8(\?|$)/i.test(playableVideoUrl);
  const thumbSrc = resolveThumbnailUrl(post);

  if (!playableVideoUrl) return null;

  // Reset likes/views if post data changes (handles navigation from other pages)
  useEffect(() => {
    setLiked(!!post.isLikedByCurrentUser);
    setLikeCount(post.likes || 0);
    setViews(post.views || 0);
  }, [post.likes, post.isLikedByCurrentUser, post.views]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Load HLS on hover, capture duration from loadedmetadata */
  useEffect(() => {
    if (isHovered && playableVideoUrl && videoRef.current) {
      const video = videoRef.current;

      const onMeta = () => {
        if (video.duration && isFinite(video.duration)) {
          setDuration(formatDuration(video.duration));
        }
      };
      video.addEventListener('loadedmetadata', onMeta);

      if (isHlsVideo && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(playableVideoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => { });
        });
        hlsRef.current = hls;
      } else {
        video.src = playableVideoUrl;
        video.play().catch(() => { });
      }

      return () => {
        video.removeEventListener('loadedmetadata', onMeta);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }
  }, [isHovered, playableVideoUrl, isHlsVideo]);

  /* Like / unlike — uses toggleLike mutation */
  const toggleLike = async (e) => {
    e.stopPropagation();
    const token = localStorage.getItem("token");
    if (!token) { alert("Please log in to like."); return; }

    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));

    try {
      const res = await fetch(`/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ query: `mutation { toggleLike(postId: "${post.id}") { id likes isLikedByCurrentUser } }` })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);

      // Update with exact numbers from backend if returned
      const updatedPost = json.data?.toggleLike;
      if (updatedPost) {
        setLikeCount(updatedPost.likes);
        setLiked(updatedPost.isLikedByCurrentUser);
      }
    } catch (err) {
      console.error("Like toggle failed:", err);
      // Revert on failure
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  };

  /* Click card → watch page + bump local view count */
  const handleWatch = () => {
    setViews(v => v + 1);
    onWatch?.(post);
  };

  if (isHidden) return null;

  return (
    <>
      <div
        className="video-card card-clean hover-lift overflow-hidden position-relative shadow-sm"
        style={{ background: '#fff', borderRadius: '12px', cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleWatch}
      >
        {/* ── Thumbnail / hover video ── */}
        <div className="video-card-media position-relative bg-black">
          {isHovered && playableVideoUrl ? (
            <video
              ref={videoRef}
              muted
              playsInline
              controls
              crossOrigin="anonymous"
              className="w-100 h-100"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <img
              src={thumbSrc}
              className="w-100 h-100"
              style={{ objectFit: 'cover', opacity: isHovered ? 0.8 : 1 }}
              alt={post.title}
            />
          )}

          {/* Duration badge (bottom-right of thumbnail) */}
          {duration && (
            <span
              className="position-absolute bottom-0 end-0 bg-black bg-opacity-75 text-white px-2 py-1 m-2 rounded"
              style={{ fontSize: '0.7rem', fontWeight: 600 }}
            >
              {duration}
            </span>
          )}

          {/* Three-dot menu (top-right) */}
          <div className="position-absolute top-0 end-0 m-2" ref={menuRef} style={{ zIndex: 100 }}>
            <button
              className="btn btn-sm bg-white bg-opacity-75 rounded-circle shadow-sm d-flex align-items-center justify-content-center"
              style={{ width: 28, height: 28 }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            >
              <i className="bi bi-three-dots-vertical"></i>
            </button>

            {menuOpen && (
              <div className="shadow-lg bg-white position-absolute end-0 mt-1 rounded py-1 border" style={{ minWidth: '130px' }}>
                <button className="dropdown-item py-2 px-3 small d-flex align-items-center gap-2 text-dark"
                  onClick={(e) => { e.stopPropagation(); setIsHidden(true); setMenuOpen(false); }}>
                  <i className="bi bi-eye-slash"></i> Hide
                </button>
                <button className="dropdown-item py-2 px-3 small d-flex align-items-center gap-2 text-dark"
                  onClick={(e) => { e.stopPropagation(); setShowEmbed(true); setMenuOpen(false); }}>
                  <i className="bi bi-code-slash"></i> Embed
                </button>
                <hr className="my-1" />
                <button className="dropdown-item py-2 px-3 small text-danger d-flex align-items-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this video permanently?")) onDelete?.();
                    setMenuOpen(false);
                  }}>
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Card info row ── */}
        <div className="p-3">
          <h6 className="text-truncate fw-bold mb-2" title={post.title} style={{ color: '#2c3e50' }}>
            {post.title || "Untitled Video"}
          </h6>

          <div className="d-flex align-items-center justify-content-between mt-1">
            <OwnerAvatar post={post} />

            <div className="d-flex align-items-center gap-3">
              {/* View count */}
              <div className="d-flex align-items-center gap-1 text-secondary" style={{ fontSize: 13 }} title={`${views} Views`}>
                <i className="bi bi-eye"></i>
                <span>{views}</span>
              </div>

              {/* Like button */}
              <button
                className="btn btn-link p-0 d-flex align-items-center gap-1 text-decoration-none"
                style={{ fontSize: 13, color: liked ? '#e74a3b' : '#6c757d', border: 'none', background: 'none' }}
                onClick={toggleLike}
                title={liked ? 'Unlike' : 'Like'}
              >
                <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                <span>{likeCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEmbed && <EmbedModal postId={post.id} onClose={() => setShowEmbed(false)} />}
    </>
  );
}
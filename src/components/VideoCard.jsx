import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

const APPLICATION_IP = "192.168.4.76";
const PUBLIC_BASE = `http://${APPLICATION_IP}:3000`;

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
  const ownerEmail = post.email || post.author || '';

  const fallbackName = [post.userFirstName, post.userLastName].filter(Boolean).join(' ')
    || user.name || post.author || ownerEmail || 'User';

  const [avatarUrl, setAvatarUrl] = useState(() => {
    const raw = post.userProfileImageUrl || user.avatar || null;
    return (raw) ? toPublicUrl(raw) : null;
  });

  const [resolvedName, setResolvedName] = useState(fallbackName);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!ownerEmail) return;
    if (avatarCache[ownerEmail]) {
      setAvatarUrl(avatarCache[ownerEmail].url);
      setResolvedName(avatarCache[ownerEmail].name);
      return;
    }

    // Attempt to resolve avatar and real name via GraphQL API
    fetch(`/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query GetUserProfile($email: String!) { getUserProfile(email: $email) { firstname lastname profileImageUrl } }`,
        variables: { email: ownerEmail }
      })
    })
      .then(r => r.json())
      .then(data => {
        const profile = data?.data?.getUserProfile;
        const fetchedName = profile ? [profile.firstname, profile.lastname].filter(Boolean).join(' ') : null;
        const finalName = fetchedName || fallbackName;

        const url = profile?.profileImageUrl;
        if (url) {
          const fullUrl = toPublicUrl(url);
          avatarCache[ownerEmail] = { url: fullUrl, name: finalName };
          setAvatarUrl(fullUrl);
          setResolvedName(finalName);
        } else {
          const local = ownerEmail.split('@')[0];
          const probeUrl = toPublicUrl(`/profileImages/${local}.jpg`);
          avatarCache[ownerEmail] = { url: probeUrl, name: finalName };
          setAvatarUrl(probeUrl);
          setResolvedName(finalName);
        }
      })
      .catch(() => {
        const local = ownerEmail.split('@')[0];
        setAvatarUrl(toPublicUrl(`/profileImages/${local}.jpg`));
        setResolvedName(fallbackName); // Ensure name is set even on fetch error
      });
  }, [ownerEmail, fallbackName]);

  return (
    <div className="d-flex align-items-center gap-2" title={resolvedName} style={{ cursor: 'help' }}>
      <div
        className="rounded-circle overflow-hidden flex-shrink-0 d-flex align-items-center justify-content-center bg-light"
        style={{ width: 30, height: 30, flexShrink: 0 }}
      >
        {avatarUrl && !hasError ? (
          <img
            src={avatarUrl}
            alt={resolvedName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { setHasError(true); e.target.style.display = 'none'; }}
          />
        ) : (
          <i className="bi bi-person-circle text-secondary" style={{ fontSize: 30, lineHeight: 1 }}></i>
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

  const hls0 = post.hlsVideoUrls?.[0] || "";
  const hlsUrl = hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : "";
  const thumbSrc = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? "")) || post.thumbnailUrl || "";

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
    if (isHovered && hlsUrl && videoRef.current) {
      const video = videoRef.current;

      const onMeta = () => {
        if (video.duration && isFinite(video.duration)) {
          setDuration(formatDuration(video.duration));
        }
      };
      video.addEventListener('loadedmetadata', onMeta);

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => { });
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
      }

      return () => {
        video.removeEventListener('loadedmetadata', onMeta);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }
  }, [isHovered, hlsUrl]);

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
        className="card-clean hover-lift overflow-hidden position-relative shadow-sm"
        style={{ width: 300, background: '#fff', borderRadius: '12px', cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleWatch}
      >
        {/* ── Thumbnail / hover video ── */}
        <div className="position-relative bg-black" style={{ height: 170 }}>
          {isHovered && hlsUrl ? (
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
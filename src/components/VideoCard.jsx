import React, { useState, useEffect, useRef } from 'react';

const APPLICATION_IP = "192.168.4.63";
const PUBLIC_BASE = `http://${APPLICATION_IP}:3000`;

/* ── helpers ── */
function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  const idx = norm.indexOf("/videos/");
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

/* ── Owner avatar ── */
function OwnerAvatar({ post }) {
  const firstName = post.userFirstName || "";
  const lastName = post.userLastName || "";
  const email = post.email || post.author || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || "User";
  const initials = ((firstName.charAt(0) || "") + (lastName.charAt(0) || email.charAt(0) || "")).toUpperCase() || "U";

  const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6f42c1', '#fd7e14'];
  const colorIdx = email.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
  const avatarUrl = toPublicUrl(post.userProfileImageUrl);

  return (
    <div className="d-flex align-items-center gap-2">
      <div
        className="rounded-circle overflow-hidden flex-shrink-0"
        style={{ width: 26, height: 26, background: colors[colorIdx] }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div className="w-100 h-100 d-flex align-items-center justify-content-center text-white fw-bold" style={{ fontSize: 10 }}>
            {initials}
          </div>
        )}
      </div>
      <span className="text-truncate text-secondary" style={{ fontSize: 12, maxWidth: 150 }}>
        {displayName}
      </span>.
    </div>
  );
}

/* ── Embed modal ── */
function EmbedModal({ postId, onClose }) {
  const iframeCode = `<iframe src="${window.location.origin}/embed/${postId}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-custom" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0 fw-bold"><i className="bi bi-code-slash me-2 text-primary"></i>Embed Video</h5>
          <button className="btn-close" onClick={onClose}></button>
        </div>
        <p className="text-secondary small mb-2">Copy and paste this code into your website:</p>
        <div className="embed-code-box" onClick={e => { e.target.select?.(); }}>{iframeCode}</div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard.writeText(iframeCode); }}>
            <i className="bi bi-clipboard me-1"></i>Copy Code
          </button>
          <button className="btn btn-light btn-sm border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main VideoCard ── */
export default function VideoCard({ post, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (hidden) return null;

  /* Choose best image to show (mirrors app.js firstThumb) */
  const thumbSrc = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? "")) || post.thumbnailUrl || "";

  /* All images for the gallery strip */
  const allImages = (post.imageUrls || []).map(toPublicUrl).filter(Boolean);

  const handleAction = async (action) => {
    setMenuOpen(false);
    if (action === 'hide') {
      setHidden(true);
    } else if (action === 'delete') {
      onDelete?.();
    } else if (action === 'embed') {
      setShowEmbed(true);
    }
  };

  return (
    <>
      <div className="card-clean hover-lift overflow-hidden" style={{ width: 300 }}>

        {/* ── Thumbnail ── */}
        <div className="position-relative bg-light" style={{ height: 170 }}>
          {thumbSrc ? (
            <img
              src={thumbSrc}
              className="w-100 h-100"
              alt={post.title || "Thumbnail"}
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary-subtle">
              <i className="bi bi-play-circle" style={{ fontSize: '2.5rem' }}></i>
            </div>
          )}

          {/* Views badge */}
          <span
            className="position-absolute bottom-0 end-0 bg-black bg-opacity-75 text-white px-2 py-1 m-2 rounded"
            style={{ fontSize: '0.7rem' }}
          >
            <i className="bi bi-eye me-1"></i>{post.views || 0}
          </span>

          {/* ⋮ Options button (top-right) */}
          <div className="options-container position-absolute top-0 end-0 m-2" ref={menuRef}>
            <button className="options-btn bg-white bg-opacity-75 shadow-sm" onClick={() => setMenuOpen(o => !o)}>
              <i className="bi bi-three-dots-vertical"></i>
            </button>

            {menuOpen && (
              <div className="custom-options-menu">
                <button onClick={() => handleAction('hide')}>
                  <i className="bi bi-eye-slash"></i> Hide
                </button>
                <button onClick={() => handleAction('embed')}>
                  <i className="bi bi-code-slash"></i> Embed
                </button>
                <button className="danger" onClick={() => handleAction('delete')}>
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Image strip (if post has multiple images) ── */}
        {allImages.length > 1 && (
          <div className="d-flex gap-1 px-2 pt-2 overflow-hidden" style={{ height: 52 }}>
            {allImages.slice(0, 4).map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="rounded"
                style={{ width: 44, height: 44, objectFit: 'cover', flexShrink: 0 }}
              />
            ))}
            {allImages.length > 4 && (
              <div className="d-flex align-items-center justify-content-center rounded bg-secondary text-white" style={{ width: 44, height: 44, fontSize: 11, flexShrink: 0 }}>
                +{allImages.length - 4}
              </div>
            )}
          </div>
        )}

        {/* ── Card body ── */}
        <div className="p-3">
          {/* Title */}
          <h6 className="card-title text-truncate fw-bold mb-2" title={post.title}>
            {post.title || "Untitled Video"}
          </h6>

          {/* Like / Comment row */}
          <div className="d-flex align-items-center gap-2">
            <OwnerAvatar post={post} />
            <button className="btn btn-sm btn-light rounded-pill d-flex align-items-center gap-1 px-3">
              <i className={`bi ${post.isLikedByCurrentUser ? 'bi-heart-fill' : 'bi-heart'} text-danger`}></i>
              <span className="small fw-medium">{post.likes || 0}</span>
            </button>
            <button className="btn btn-sm btn-light rounded-circle" style={{ width: 32, height: 32 }}>
              <i className="bi bi-chat text-secondary"></i>
            </button>
          </div>
        </div>

      </div>

      {/* Embed modal */}
      {showEmbed && <EmbedModal postId={post.id} onClose={() => setShowEmbed(false)} />}
    </>
  );
}
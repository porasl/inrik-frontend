import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

const APPLICATION_IP = "192.168.4.63";
const PUBLIC_BASE = `http://${APPLICATION_IP}:3000`;

/* ── HELPERS ── */
function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  const idx = norm.indexOf("/videos/");
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

/* ── OWNER AVATAR COMPONENT ── */
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
      <span className="text-truncate text-secondary fw-medium" style={{ fontSize: 12, maxWidth: 110 }}>
        {displayName}
      </span>
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
        <textarea
          className="form-control bg-light mb-3"
          rows="3"
          readOnly
          value={iframeCode}
          style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
        />
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-primary btn-sm px-3" onClick={() => {
            navigator.clipboard.writeText(iframeCode);
            alert("Copied to clipboard!");
          }}>
            <i className="bi bi-clipboard me-1"></i>Copy
          </button>
          <button className="btn btn-light btn-sm border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN VIDEOCARD COMPONENT ── */
export default function VideoCard({ post, onDelete }) {
  // 1. ALL HOOKS DECLARED AT THE TOP (The Fix for the Uncaught Error)
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const menuRef = useRef(null);

  const hls0 = post.hlsVideoUrls?.[0] || "";
  const hlsUrl = hls0 ? (`${PUBLIC_BASE}/` + hls0.split("webdata/")[1]) : "";
  const thumbSrc = toPublicUrl(post.videoImagePath || (post.imageUrls?.[0] ?? "")) || post.thumbnailUrl || "";

  // 2. ALL EFFECTS DECLARED BEFORE THE EARLY RETURN
  useEffect(() => {
    const clickHandler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    return () => document.removeEventListener('mousedown', clickHandler);
  }, []);

  useEffect(() => {
    if (isHovered && hlsUrl && videoRef.current) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current.play().catch(() => { });
        });
        hlsRef.current = hls;
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
      }
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isHovered, hlsUrl]);

  // 3. EARLY RETURN AFTER HOOKS (This prevents the React error)
  if (isHidden) return null;

  // 4. MAIN JSX
  return (
    <>
      <div
        className="card-clean hover-lift overflow-hidden position-relative shadow-sm"
        style={{ width: 300, background: '#fff', borderRadius: '12px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
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

          <span className="position-absolute bottom-0 end-0 bg-black bg-opacity-75 text-white px-2 py-1 m-2 rounded" style={{ fontSize: '0.7rem' }}>
            <i className="bi bi-eye me-1"></i>{post.views || 0}
          </span>

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

        <div className="p-3">
          <h6 className="text-truncate fw-bold mb-2" title={post.title} style={{ color: '#2c3e50' }}>
            {post.title || "Untitled Video"}
          </h6>

          <div className="d-flex align-items-center justify-content-between mt-2">
            <OwnerAvatar post={post} />
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center gap-1 text-secondary" style={{ fontSize: 13 }}>
                <i className={`bi ${post.isLikedByCurrentUser ? 'bi-heart-fill text-danger' : 'bi-heart'}`}></i>
                <span>{post.likes || 0}</span>
              </div>
              <i className="bi bi-chat text-secondary" style={{ fontSize: 13 }}></i>
            </div>
          </div>
        </div>
      </div>

      {showEmbed && <EmbedModal postId={post.id} onClose={() => setShowEmbed(false)} />}
    </>
  );
}
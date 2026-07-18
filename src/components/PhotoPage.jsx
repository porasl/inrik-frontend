import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getMyPhotosPage, getPublicPhotosPage, subscribePhotoCacheUpdates, subscribePhotoRefreshStatus } from '../services/photoService';
import useDelayedVisibility from '../hooks/useDelayedVisibility';

/* ─── Helpers ─── */
function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, '/');
  const rel = norm.startsWith('/') ? norm : `/${norm}`;
  return `${PUBLIC_BASE}${rel}`;
}

function isImageUrl(url) {
  if (!url) return false;
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.startsWith('data:image/')) return true;

  // Photo APIs already return imageUrls; only exclude explicit video/stream files.
  if (['.m3u8', '.mp4', '.mov', '.avi', '.mkv', '.webm'].some(ext => clean.endsWith(ext))) {
    return false;
  }

  return true;
}

function extractImages(post) {
  const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  };

  const urls = [
    ...toArray(post.imageUrls),
    ...toArray(post.images),
    ...toArray(post.photoUrls),
    ...toArray(post.imageUrl),
    ...toArray(post.imageurl),
    ...toArray(post.imageURL),
    ...toArray(post.photoUrl),
    ...toArray(post.photoURL),
  ];

  const uniqueUrls = Array.from(new Set(urls
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter(Boolean)));
  return uniqueUrls
    .filter(isImageUrl)
    .map(url => ({ url: toPublicUrl(url), post }));
}

function mergePageIntoPhotos(previous, pageNum, pageSize, pagePhotos) {
  const start = pageNum * pageSize;
  const prefix = previous.slice(0, start);
  const suffix = previous.slice(start + pagePhotos.length);
  return [...prefix, ...pagePhotos, ...suffix];
}

function getEmbedMarkup(imageUrl, postId) {
  const safeAlt = `photo-${postId || 'image'}`;
  return `<img src="${imageUrl}" alt="${safeAlt}" style="max-width:100%;height:auto;" />`;
}

function formatPublishedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initialsFromName(value) {
  return String(value || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

function photoGridMinWidth(photoCount, activeTab) {
  if (activeTab !== 'public') return 220;
  if (photoCount >= 30) return 132;
  if (photoCount >= 18) return 150;
  if (photoCount >= 10) return 170;
  if (photoCount >= 6) return 190;
  return 220;
}

function PhotoEmbedModal({ photo, onClose }) {
  const imageUrl = photo?.url || '';
  const embedMarkup = getEmbedMarkup(imageUrl, photo?.post?.id);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2100, display: 'grid', placeItems: 'center', padding: '1rem' }}
    >
      <div className="bg-white rounded-3 shadow p-3" style={{ width: 'min(680px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="m-0 fw-bold">Embed Photo</h6>
          <button className="btn-close" onClick={onClose} aria-label="Close" />
        </div>
        <p className="text-secondary small mb-2">Use this URL or embed code on third-party pages.</p>

        <label className="form-label small text-secondary mb-1">Image URL</label>
        <div className="input-group input-group-sm mb-3">
          <input className="form-control" value={imageUrl} readOnly />
          <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard.writeText(imageUrl)}>Copy</button>
        </div>

        <label className="form-label small text-secondary mb-1">Embed HTML</label>
        <textarea className="form-control" rows="4" readOnly value={embedMarkup} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />

        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-primary btn-sm" onClick={() => navigator.clipboard.writeText(embedMarkup)}>Copy Embed</button>
        </div>
      </div>
    </div>
  );
}

const BINOCULAR_LENS_SIZE = 140;

function BinocularLens({ imageUrl, position, zoom, size = BINOCULAR_LENS_SIZE }) {
  const bgX = position.rectW
    ? `${((position.x / position.rectW) * 100).toFixed(2)}%`
    : '50%';
  const bgY = position.rectH
    ? `${((position.y / position.rectH) * 100).toFixed(2)}%`
    : '50%';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: position.x - size / 2,
        top: position.y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.9)',
        boxShadow: '0 0 0 3px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.6)',
        backgroundImage: `url(${imageUrl})`,
        // Pixel dimensions make the lens magnify relative to the rendered image.
        backgroundSize: `${position.rectW * zoom}px ${position.rectH * zoom}px`,
        backgroundPosition: `${bgX} ${bgY}`,
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 10,
      }}
    />
  );
}

/* ─── Binocular Zoom Popup ─── */
function PhotoViewer({ photo, onClose, onPrev, onNext, hasPrev, hasNext, stats, isLoggedIn, onLike, onDownload, onEmbed, zoom, onZoomChange }) {
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [showLens, setShowLens] = useState(false);
  const [binocularEnabled, setBinocularEnabled] = useState(true);
  const [touchDx, setTouchDx] = useState(0);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const imgRef = useRef(null);
  const overlayRef = useRef(null);
  const touchStartRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    if (!binocularEnabled) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setShowLens(false);
      return;
    }
    setShowLens(true);
    setLensPos({ x, y, rectW: rect.width, rectH: rect.height });
  }, [binocularEnabled]);

  const handleMouseLeave = useCallback(() => setShowLens(false), []);

  const onTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsTouchDragging(true);
    setTouchDx(0);
  };

  const onTouchMove = (e) => {
    const touch = e.touches?.[0];
    const start = touchStartRef.current;
    if (!touch || !start) return;
    const dx = touch.clientX - start.x;
    const clamped = Math.max(-220, Math.min(220, dx));
    setTouchDx(clamped);
  };

  const onTouchEnd = (e) => {
    const touch = e.changedTouches?.[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;
    setIsTouchDragging(false);
    if (!touch || !start) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const horizontalEnough = Math.abs(dx) >= 48;
    const mostlyHorizontal = Math.abs(dx) > Math.abs(dy);
    if (!horizontalEnough || !mostlyHorizontal) {
      setTouchDx(0);
      return;
    }

    if (dx < 0 && hasNext) onNext();
    if (dx > 0 && hasPrev) onPrev();
    setTouchDx(0);
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const authorName = [photo.post.userFirstName, photo.post.userLastName].filter(Boolean).join(' ')
    || photo.post.email || 'Unknown';

  return (
    <div
      ref={overlayRef}
      className="photo-viewer-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', padding: '1rem',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 20, background: 'none', border: 'none',
          color: '#fff', fontSize: '2rem', cursor: 'pointer', lineHeight: 1, zIndex: 2001,
        }}
        aria-label="Close"
      >
        <i className="bi bi-x-lg" />
      </button>

      {/* Previous / Next buttons */}
      <button
        type="button"
        className="btn btn-dark btn-sm rounded-circle"
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous photo"
        style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, zIndex: 2002, opacity: hasPrev ? 0.95 : 0.45 }}
      >
        <i className="bi bi-chevron-left" />
      </button>
      <button
        type="button"
        className="btn btn-dark btn-sm rounded-circle"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next photo"
        style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, zIndex: 2002, opacity: hasNext ? 0.95 : 0.45 }}
      >
        <i className="bi bi-chevron-right" />
      </button>

      {/* Binocular controller */}
      <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2001 }}>
        <button
          type="button"
          className={`btn btn-sm ${binocularEnabled ? 'btn-primary' : 'btn-dark'}`}
          onClick={() => {
            setBinocularEnabled((enabled) => !enabled);
            setShowLens(false);
          }}
          title={binocularEnabled ? 'Turn binocular off' : 'Turn binocular on'}
          aria-pressed={binocularEnabled}
          aria-label="Toggle binocular zoom"
        >
          <i className="bi bi-binoculars-fill" />
        </button>
        <input
          type="range"
          min={1.5}
          max={6}
          step={0.5}
          value={zoom}
          onChange={e => onZoomChange(Number(e.target.value))}
          style={{ width: 120, accentColor: '#0d6efd' }}
          aria-label="Binocular zoom strength"
        />
        <span style={{ color: '#fff', fontSize: '0.8rem', minWidth: 30 }}>{zoom}x</span>
      </div>

      {/* Image + lens */}
      {/* Image + side actions row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, maxHeight: '80vh', maxWidth: '95vw' }}>
        {/* Image + lens wrapper */}
        <div
          style={{
            position: 'relative',
            maxHeight: '80vh',
            maxWidth: '80vw',
            display: 'inline-block',
            cursor: binocularEnabled ? 'none' : 'default',
            transform: `translateX(${touchDx}px)`,
          transition: isTouchDragging ? 'none' : 'transform 220ms ease-out',
            flexShrink: 0,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <img
            key={photo.url}
            ref={imgRef}
            src={photo.url}
            alt={photo.post.description || 'Photo'}
            style={{
              maxHeight: '72vh',
              maxWidth: '78vw',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 8,

            }}
            draggable={false}
          />

          {/* Binocular lens */}
          {binocularEnabled && showLens && (
            <BinocularLens imageUrl={photo.url} position={lensPos} zoom={zoom} />
          )}
        </div>

        {/* Right-side action panel */}
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Views */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#ccc' }}>
            <i className="bi bi-eye" style={{ fontSize: '1.6rem' }} />
            <span style={{ fontSize: '0.85rem', marginTop: 2 }}>{stats?.views ?? 0}</span>
          </div>

          {/* Like */}
          <button
            className={`btn p-0 border-0 bg-transparent d-flex flex-column align-items-center ${stats?.liked ? 'text-danger' : 'text-white'}`}
            title={isLoggedIn ? 'Like' : 'Login to like'}
            onClick={() => onLike && onLike(photo)}
            disabled={!isLoggedIn}
            style={{ opacity: isLoggedIn ? 1 : 0.5 }}
          >
            <i className={`bi ${stats?.liked ? 'bi-heart-fill' : 'bi-heart'}`} style={{ fontSize: '1.6rem' }} />
            <span style={{ fontSize: '0.85rem', marginTop: 2 }}>{stats?.likes ?? 0}</span>
          </button>

          {/* Download */}
          <button
            className="btn p-0 border-0 bg-transparent text-white d-flex flex-column align-items-center"
            title="Download"
            onClick={() => onDownload && onDownload(photo)}
          >
            <i className="bi bi-download" style={{ fontSize: '1.6rem' }} />
          </button>

          {/* Embed */}
          <button
            className="btn p-0 border-0 bg-transparent text-white d-flex flex-column align-items-center"
            title="Embed"
            onClick={() => onEmbed && onEmbed(photo)}
          >
            <i className="bi bi-code-slash" style={{ fontSize: '1.6rem' }} />
          </button>
        </div>
      </div>

      {/* Caption */}
      <div style={{ marginTop: 10, color: '#ccc', fontSize: '0.9rem', textAlign: 'center', maxWidth: 600 }}>
        {photo.post.description && (
          <p style={{ margin: '0 0 2px', color: '#fff' }}>{photo.post.description}</p>
        )}
        <span style={{ fontSize: '0.78rem' }}>by {authorName}</span>
      </div>


    </div>
  );
}

/* ─── Photo Grid Card ─── */
function PhotoCard({ photo, stats, isLoggedIn, onOpen, onLike, onDownload, onEmbed, zoom, compact = false }) {
  const [loaded, setLoaded] = useState(false);
  const [binocularEnabled, setBinocularEnabled] = useState(false);
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [showLens, setShowLens] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const imageRef = useRef(null);
  const authorName = [photo.post.userFirstName, photo.post.userLastName].filter(Boolean).join(' ')
    || photo.post.email || '';
  const publishedDate = formatPublishedDate(photo.post.createdAt || photo.post.publishedAt || photo.post.created_at);
  const avatarUrl = toPublicUrl(photo.post.userProfileImageUrl || photo.post.profileImageUrl || photo.post.profile_image_url || '');

  return (
    <div
      className="photo-card"
      onClick={() => onOpen(photo)}
      style={{
        cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
        background: '#111', position: 'relative', aspectRatio: compact ? '4/3' : '1/1',
        transition: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
        setShowLens(false);
      }}
      onMouseMove={(e) => {
        if (!binocularEnabled || !imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        setLensPos({
          x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
          y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
          rectW: rect.width,
          rectH: rect.height,
        });
        setShowLens(true);
      }}
    >
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, background: '#222',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
        </div>
      )}
      <img
        ref={imageRef}
        src={photo.url}
        alt={photo.post.description || 'Photo'}
        onLoad={() => setLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: loaded ? 'block' : 'none',
          transition: 'none',
        }}
        draggable={false}
      />
      {binocularEnabled && showLens && (
        <BinocularLens imageUrl={photo.url} position={lensPos} zoom={zoom} size={120} />
      )}
      {/* Hover overlay */}
      <div
        className="photo-card-hover"
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: compact ? '6px' : '8px',
          transition: 'background 0.18s',
        }}
      >
        <div className="d-flex align-items-center gap-2 photo-publisher-strip">
          <div
            className="rounded-circle overflow-hidden flex-shrink-0 d-flex align-items-center justify-content-center border border-light"
            style={{ width: compact ? 24 : 30, height: compact ? 24 : 30, background: '#34506f' }}
            title={authorName || 'Publisher'}
          >
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={authorName || 'Publisher'}
                onError={() => setAvatarFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span className="text-white fw-bold" style={{ fontSize: compact ? 10 : 12 }}>
                {initialsFromName(authorName || photo.post.email)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-white fw-semibold text-truncate" style={{ fontSize: compact ? '0.68rem' : '0.76rem', lineHeight: 1.1 }}>
              {authorName || 'Unknown publisher'}
            </div>
            {publishedDate && (
              <div className="text-white-50 text-truncate" style={{ fontSize: compact ? '0.62rem' : '0.68rem', lineHeight: 1.1 }}>
                {publishedDate}
              </div>
            )}
          </div>
        </div>

        <div className="d-flex align-items-end justify-content-between gap-2">
          <span className="photo-meta-label" style={{ fontSize: compact ? '0.66rem' : '0.72rem', color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 4, transition: 'opacity 0.18s' }}>
            <i className="bi bi-eye me-1" />{stats.views} <i className="bi bi-heart ms-2 me-1" />{stats.likes}
          </span>

          <div className="photo-actions d-flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              className={`btn btn-sm ${binocularEnabled ? 'btn-primary' : 'btn-light'} py-0 px-2`}
              title={binocularEnabled ? 'Turn binocular off' : 'Inspect with binocular'}
              aria-pressed={binocularEnabled}
              onClick={() => {
                setBinocularEnabled((enabled) => !enabled);
                setShowLens(false);
              }}
            >
              <i className="bi bi-binoculars-fill" />
            </button>
            <button
              className={`btn btn-sm ${stats.liked ? 'btn-danger' : 'btn-light'} py-0 px-2`}
              title={isLoggedIn ? 'Like' : 'Login to like'}
              onClick={() => onLike(photo)}
              disabled={!isLoggedIn}
            >
              <i className={`bi ${stats.liked ? 'bi-heart-fill' : 'bi-heart'}`} />
            </button>
            <button className="btn btn-sm btn-light py-0 px-2" title="Download" onClick={() => onDownload(photo)}>
              <i className="bi bi-download" />
            </button>
            <button className="btn btn-sm btn-light py-0 px-2" title="Embed" onClick={() => onEmbed(photo)}>
              <i className="bi bi-code-slash" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main PhotoPage ─── */
export default function PhotoPage({ isLoggedIn, onUpload }) {
  const [activeTab, setActiveTab] = useState(isLoggedIn ? 'mine' : 'public');
  const [myPhotos, setMyPhotos] = useState([]);
  const [publicPhotos, setPublicPhotos] = useState([]);
  const [myPage, setMyPage] = useState(0);
  const [publicPage, setPublicPage] = useState(0);
  const [myHasNext, setMyHasNext] = useState(true);
  const [pubHasNext, setPubHasNext] = useState(true);
  const [myLoading, setMyLoading] = useState(false);
  const [pubLoading, setPubLoading] = useState(false);
  const [myRefreshing, setMyRefreshing] = useState(false);
  const [publicRefreshing, setPublicRefreshing] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [embedPhoto, setEmbedPhoto] = useState(null);
  const [binocularZoom, setBinocularZoom] = useState(2.5);

  const [postStats, setPostStats] = useState({});
  const didLoadInitialMine = useRef(false);
  const didLoadInitialPublic = useRef(false);

  const fetchMyPhotos = useCallback(async (pageNum = 0, append = false) => {
    if (myLoading) return;
    setMyLoading(true);
    try {
      const data = await getMyPhotosPage(pageNum, 24);
      if (!data) return;
      const images = (data.items || []).flatMap(extractImages);
      setMyPhotos(prev => append ? [...prev, ...images] : images);
      setMyHasNext(data.pageInfo?.hasNext ?? false);
      setMyPage(pageNum);
    } catch (err) {
      console.error('Failed to load my photos:', err);
    } finally {
      setMyLoading(false);
    }
  }, [myLoading]);

  const fetchPublicPhotos = useCallback(async (pageNum = 0, append = false) => {
    if (pubLoading) return;
    setPubLoading(true);
    try {
      const data = await getPublicPhotosPage(pageNum, 24);
      if (!data) return;
      const images = (data.items || []).flatMap(extractImages);
      setPublicPhotos(prev => append ? [...prev, ...images] : images);
      setPubHasNext(data.pageInfo?.hasNext ?? false);
      setPublicPage(pageNum);
    } catch (err) {
      console.error('Failed to load public photos:', err);
    } finally {
      setPubLoading(false);
    }
  }, [pubLoading]);

  // Load on tab switch
  useEffect(() => {
    if (activeTab === 'mine' && isLoggedIn && myPhotos.length === 0 && !didLoadInitialMine.current) {
      didLoadInitialMine.current = true;
      fetchMyPhotos(0, false);
    }
    if (activeTab === 'public' && publicPhotos.length === 0 && !didLoadInitialPublic.current) {
      didLoadInitialPublic.current = true;
      fetchPublicPhotos(0, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isLoggedIn]);

  useEffect(() => {
    const unsubscribe = subscribePhotoCacheUpdates(({ key, type, page, size, payload }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (!key.startsWith(`${tokenKey}::`)) return;

      const pagePhotos = (payload?.items || []).flatMap(extractImages);
      const hasNext = payload?.pageInfo?.hasNext ?? false;

      if (type === 'mine') {
        setMyPhotos((prev) => mergePageIntoPhotos(prev, page, size, pagePhotos));
        setMyHasNext(hasNext);
      }

      if (type === 'public') {
        setPublicPhotos((prev) => mergePageIntoPhotos(prev, page, size, pagePhotos));
        setPubHasNext(hasNext);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePhotoRefreshStatus(({ key, type, refreshing }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (!key.startsWith(`${tokenKey}::`)) return;

      if (type === 'mine') setMyRefreshing(refreshing);
      if (type === 'public') setPublicRefreshing(refreshing);
    });

    return unsubscribe;
  }, []);

  const photosFromApi = activeTab === 'mine' ? myPhotos : publicPhotos;
  const photos = photosFromApi;
  const gridMinWidth = photoGridMinWidth(photos.length, activeTab);
  const compactCards = gridMinWidth < 190;
  const hasNext = activeTab === 'mine' ? myHasNext : pubHasNext;
  const isLoading = activeTab === 'mine' ? myLoading : pubLoading;
  const isRefreshing = activeTab === 'mine' ? myRefreshing : publicRefreshing;
  const showRefreshing = useDelayedVisibility(isRefreshing, {
    showDelayMs: 260,
    minVisibleMs: 760,
  });
  const loadMore = () =>
    activeTab === 'mine'
      ? fetchMyPhotos(myPage + 1, true)
      : fetchPublicPhotos(publicPage + 1, true);

  const viewerPhoto = viewerIndex === null ? null : photos[viewerIndex] || null;

  useEffect(() => {
    if (viewerIndex === null) return;
    if (viewerIndex < 0 || viewerIndex >= photos.length) {
      setViewerIndex(null);
    }
  }, [viewerIndex, photos.length]);

  useEffect(() => {
    if (!photos.length) return;
    setPostStats((prev) => {
      const next = { ...prev };
      photos.forEach((photo) => {
        const pid = photo?.post?.id;
        if (!pid) return;
        if (!next[pid]) {
          next[pid] = {
            likes: photo.post.likes || 0,
            liked: !!photo.post.isLikedByCurrentUser,
            views: photo.post.views || 0,
          };
        }
      });
      return next;
    });
  }, [photos]);

  const incrementPhotoView = async (photo) => {
    if (!isLoggedIn) return;
    const token = localStorage.getItem('token');
    const postId = photo?.post?.id;
    if (!token || !postId) return;

    setPostStats((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || { likes: 0, liked: false, views: 0 }),
        views: (prev[postId]?.views ?? 0) + 1,
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: `mutation { incrementPostViews(postId: "${postId}") { id views } }` }),
      });
      const json = await res.json();
      const updated = json?.data?.incrementPostViews;
      if (updated) {
        setPostStats((prev) => ({
          ...prev,
          [postId]: {
            ...(prev[postId] || { likes: 0, liked: false, views: 0 }),
            views: updated.views,
          },
        }));
      }
    } catch {
      // Keep optimistic value on network failure.
    }
  };

  const openPhoto = async (photo, index) => {
    await incrementPhotoView(photo);
    setViewerIndex(index);
  };

  const togglePhotoLike = async (photo) => {
    if (!isLoggedIn) {
      alert('Please log in to like photos.');
      return;
    }

    const token = localStorage.getItem('token');
    const postId = photo?.post?.id;
    if (!token || !postId) return;

    const current = postStats[postId] || {
      likes: photo?.post?.likes || 0,
      liked: !!photo?.post?.isLikedByCurrentUser,
      views: photo?.post?.views || 0,
    };
    const nextLiked = !current.liked;

    setPostStats((prev) => ({
      ...prev,
      [postId]: {
        ...current,
        liked: nextLiked,
        likes: nextLiked ? current.likes + 1 : Math.max(0, current.likes - 1),
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: `mutation { toggleLike(postId: "${postId}") { id likes isLikedByCurrentUser } }` }),
      });
      const json = await res.json();
      const updated = json?.data?.toggleLike;
      if (updated) {
        setPostStats((prev) => ({
          ...prev,
          [postId]: {
            ...(prev[postId] || current),
            likes: updated.likes,
            liked: updated.isLikedByCurrentUser,
          },
        }));
      }
    } catch {
      setPostStats((prev) => ({
        ...prev,
        [postId]: current,
      }));
    }
  };

  const downloadPhoto = async (photo) => {
    const link = document.createElement('a');
    link.href = photo.url;
    const baseName = (photo?.post?.description || `photo-${photo?.post?.id || 'image'}`).replace(/\s+/g, '-').toLowerCase();
    link.download = `${baseName}.jpg`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="container-fluid px-0">
      {/* Tabs and compact controls */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <ul className="nav nav-tabs mb-0">
          {isLoggedIn && (
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'mine' ? 'active' : ''}`}
                onClick={() => setActiveTab('mine')}
              >
                <i className="bi bi-person me-1" />My Photos
              </button>
            </li>
          )}
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'public' ? 'active' : ''}`}
              onClick={() => setActiveTab('public')}
            >
              <i className="bi bi-globe me-1" />Public &amp; Shared
            </button>
          </li>
        </ul>

        <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
          {showRefreshing && (
            <span className="badge rounded-pill text-bg-light border text-secondary d-inline-flex align-items-center gap-2">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              Refreshing
            </span>
          )}
          <div className="d-flex align-items-center gap-2" title="Binocular zoom strength">
            <i className="bi bi-binoculars-fill text-secondary" />
            <input
              type="range"
              min="1.5"
              max="6"
              step="0.5"
              value={binocularZoom}
              onChange={(e) => setBinocularZoom(Number(e.target.value))}
              aria-label="Binocular zoom strength"
              style={{ width: 110, accentColor: '#0d6efd' }}
            />
            <span className="small text-secondary" style={{ minWidth: 28 }}>{binocularZoom}x</span>
          </div>
          {isLoggedIn && (
            <button className="btn btn-primary btn-sm d-flex align-items-center" onClick={onUpload} aria-label="Upload photo" title="Upload photo">
              <i className="bi bi-cloud-upload" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {photos.length === 0 && !isLoading ? (
        <div className="text-center text-secondary py-5">
          <i className="bi bi-image" style={{ fontSize: '3rem', opacity: 0.3 }} />
          <p className="mt-2">No photos yet</p>
          {isLoggedIn && activeTab === 'mine' && (
            <button className="btn btn-outline-primary btn-sm" onClick={onUpload}>
              Upload your first photo
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}px, 1fr))`,
            gap: compactCards ? '8px' : '12px',
          }}
        >
          {photos.map((photo, idx) => (
            <PhotoCard
              key={`${photo.post.id}-${idx}`}
              photo={photo}
              stats={postStats[photo.post.id] || {
                likes: photo.post.likes || 0,
                liked: !!photo.post.isLikedByCurrentUser,
                views: photo.post.views || 0,
              }}
              isLoggedIn={isLoggedIn}
              onOpen={(selectedPhoto) => openPhoto(selectedPhoto, idx)}
              onLike={togglePhotoLike}
              onDownload={downloadPhoto}
              onEmbed={setEmbedPhoto}
              zoom={binocularZoom}
              compact={compactCards}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNext && !isLoading && (
        <div className="text-center mt-4">
          <button className="btn btn-outline-secondary" onClick={loadMore}>
            Load more
          </button>
        </div>
      )}
      {isLoading && (
        <div className="text-center my-4">
          <div className="spinner-border text-secondary" role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
        </div>
      )}

      {/* Viewer popup */}
      {viewerPhoto && (
        <PhotoViewer
          photo={viewerPhoto}
          onClose={() => setViewerIndex(null)}
          onPrev={() => setViewerIndex((prev) => (prev > 0 ? prev - 1 : prev))}
          onNext={() => setViewerIndex((prev) => (prev < photos.length - 1 ? prev + 1 : prev))}
          hasPrev={viewerIndex > 0}
          hasNext={viewerIndex < photos.length - 1}
          stats={postStats[viewerPhoto.post.id] || { likes: 0, liked: false, views: 0 }}
          isLoggedIn={isLoggedIn}
          onLike={togglePhotoLike}
          onDownload={downloadPhoto}
          onEmbed={(photo) => { setViewerIndex(null); setEmbedPhoto(photo); }}
          zoom={binocularZoom}
          onZoomChange={setBinocularZoom}
        />
      )}
      {embedPhoto && (
        <PhotoEmbedModal photo={embedPhoto} onClose={() => setEmbedPhoto(null)} />
      )}

      <style>{`
        .photo-publisher-strip {
          max-width: 100%;
          padding: 4px 6px;
          border-radius: 999px;
          background: rgba(0,0,0,0.58);
          backdrop-filter: blur(3px);
        }
        .photo-card:hover .photo-card-hover { background: rgba(0,0,0,0.28) !important; }
        .photo-card .photo-actions { opacity: 0; transition: opacity .18s; }
        .photo-card:hover .photo-actions { opacity: 1; }
        .photo-card .photo-actions,
        .photo-card .photo-meta-label,
        .photo-card .photo-publisher-strip {
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .photo-card .photo-actions { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

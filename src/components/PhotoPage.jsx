import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PUBLIC_BASE } from '../../app.config.js';
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
  if (clean.includes('/images/') || clean.includes('/image/')) return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].some(ext => clean.endsWith(`.${ext}`));
}

function extractImages(post) {
  const urls = Array.isArray(post.imageUrls) ? post.imageUrls : [];
  return urls
    .filter(isImageUrl)
    .map(url => ({ url: toPublicUrl(url), post }));
}

function mergePageIntoPhotos(previous, pageNum, pageSize, pagePhotos) {
  const start = pageNum * pageSize;
  const prefix = previous.slice(0, start);
  const suffix = previous.slice(start + pagePhotos.length);
  return [...prefix, ...pagePhotos, ...suffix];
}

/* ─── Binocular Zoom Popup ─── */
function PhotoViewer({ photo, onClose }) {
  const [zoom, setZoom] = useState(2.5);
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [showLens, setShowLens] = useState(false);
  const imgRef = useRef(null);
  const overlayRef = useRef(null);

  const LENS_SIZE = 140;

  const handleMouseMove = useCallback((e) => {
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
  }, []);

  const handleMouseLeave = useCallback(() => setShowLens(false), []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Zoomfactor clamp
  const bgX = lensPos.rectW
    ? `${((lensPos.x / lensPos.rectW) * 100).toFixed(2)}%`
    : '50%';
  const bgY = lensPos.rectH
    ? `${((lensPos.y / lensPos.rectH) * 100).toFixed(2)}%`
    : '50%';

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

      {/* Zoom slider */}
      <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2001 }}>
        <i className="bi bi-zoom-in" style={{ color: '#fff', fontSize: '1.1rem' }} />
        <input
          type="range"
          min={1.5}
          max={6}
          step={0.5}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ width: 100, accentColor: '#0d6efd' }}
          aria-label="Zoom level"
        />
        <span style={{ color: '#ccc', fontSize: '0.8rem' }}>{zoom}×</span>
      </div>

      {/* Image + lens */}
      <div
        style={{ position: 'relative', maxHeight: '80vh', maxWidth: '90vw', display: 'inline-block', cursor: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <img
          ref={imgRef}
          src={photo.url}
          alt={photo.post.description || 'Photo'}
          style={{ maxHeight: '80vh', maxWidth: '90vw', objectFit: 'contain', display: 'block', borderRadius: 8 }}
          draggable={false}
        />

        {/* Binocular lens */}
        {showLens && (
          <div
            style={{
              position: 'absolute',
              left: lensPos.x - LENS_SIZE / 2,
              top: lensPos.y - LENS_SIZE / 2,
              width: LENS_SIZE,
              height: LENS_SIZE,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.85)',
              boxShadow: '0 0 0 3px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.6)',
              backgroundImage: `url(${photo.url})`,
              backgroundSize: `${zoom * 100}%`,
              backgroundPosition: `${bgX} ${bgY}`,
              backgroundRepeat: 'no-repeat',
              pointerEvents: 'none',
              overflow: 'hidden',
              zIndex: 10,
            }}
          >
            {/* Binocular cross-hair lines */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              borderRadius: '50%',
            }} />
          </div>
        )}
      </div>

      {/* Caption */}
      <div style={{ marginTop: 12, color: '#ccc', fontSize: '0.9rem', textAlign: 'center', maxWidth: 600 }}>
        {photo.post.description && (
          <p style={{ margin: '0 0 4px', color: '#fff' }}>{photo.post.description}</p>
        )}
        <span style={{ fontSize: '0.78rem' }}>by {authorName}</span>
        {!showLens && (
          <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#aaa' }}>
            <i className="bi bi-binoculars me-1" />Hover over the image to zoom
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Photo Grid Card ─── */
function PhotoCard({ photo, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const authorName = [photo.post.userFirstName, photo.post.userLastName].filter(Boolean).join(' ')
    || photo.post.email || '';

  return (
    <div
      className="photo-card"
      onClick={() => onClick(photo)}
      style={{
        cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
        background: '#111', position: 'relative', aspectRatio: '1/1',
        transition: 'transform 0.18s, box-shadow 0.18s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.03)';
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
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
        src={photo.url}
        alt={photo.post.description || 'Photo'}
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: loaded ? 'block' : 'none' }}
        draggable={false}
      />
      {/* Hover overlay */}
      <div
        className="photo-card-hover"
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)',
          display: 'flex', alignItems: 'flex-end', padding: '8px',
          transition: 'background 0.18s',
        }}
      >
        {authorName && (
          <span style={{
            fontSize: '0.72rem', color: '#fff', background: 'rgba(0,0,0,0.55)',
            padding: '2px 6px', borderRadius: 4, opacity: 0,
            transition: 'opacity 0.18s',
          }}
            className="photo-author-label"
          >
            {authorName}
          </span>
        )}
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
  const [viewerPhoto, setViewerPhoto] = useState(null);
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

  const photos = activeTab === 'mine' ? myPhotos : publicPhotos;
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

  return (
    <div className="container-fluid px-0">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h4 className="mb-1 fw-bold">
            <i className="bi bi-images me-2" />Photos
          </h4>
          <p className="mb-0 text-secondary small">
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </p>
          {showRefreshing && (
            <div className="mt-1">
              <span className="badge rounded-pill text-bg-light border text-secondary d-inline-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                Refreshing photos...
              </span>
            </div>
          )}
        </div>
        {isLoggedIn && (
          <button className="btn btn-primary btn-sm d-flex align-items-center gap-1" onClick={onUpload}>
            <i className="bi bi-cloud-upload" />
            Upload Photo
          </button>
        )}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px',
          }}
        >
          {photos.map((photo, idx) => (
            <PhotoCard
              key={`${photo.post.id}-${idx}`}
              photo={photo}
              onClick={setViewerPhoto}
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
        <PhotoViewer photo={viewerPhoto} onClose={() => setViewerPhoto(null)} />
      )}

      <style>{`
        .photo-card:hover .photo-author-label { opacity: 1 !important; }
        .photo-card:hover .photo-card-hover { background: rgba(0,0,0,0.28) !important; }
      `}</style>
    </div>
  );
}

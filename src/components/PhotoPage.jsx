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

function ImageStudioModal({ onClose }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [operation, setOperation] = useState('colorize');
  const [scale, setScale] = useState('2');
  const [restoreFaces, setRestoreFaces] = useState(false);
  const [colorModel, setColorModel] = useState('artistic');
  const [neutralizeAgedTint, setNeutralizeAgedTint] = useState(true);
  const [repairScratches, setRepairScratches] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const selectFile = (selected) => {
    if (!selected || !selected.type?.startsWith('image/')) {
      setError('Please choose a valid image file.');
      return;
    }
    setError('');
    setFile(selected);
    setInputUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(selected);
    });
    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return '';
    });
  };

  const processImage = async () => {
    if (!file) {
      setError('Drop or choose an image first.');
      return;
    }
    setProcessing(true);
    setError('');
    const body = new FormData();
    body.append('file', file);
    body.append('operation', operation);
    body.append('scale', scale);
    body.append('restore_faces', String(restoreFaces));
    body.append('color_model', colorModel);
    body.append('neutralize_aged_tint', String(neutralizeAgedTint));
    body.append('repair_scratches', String(repairScratches));
    try {
      const response = await fetch('/image-tools/api/images/process', { method: 'POST', body });
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.detail || `Image processing failed (${response.status})`);
      }
      const blob = await response.blob();
      setResultUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (requestError) {
      setError(requestError.message || 'Could not process the image.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(4,12,24,.72)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div className="bg-white rounded-4 shadow-lg p-3 p-md-4" onClick={(event) => event.stopPropagation()} style={{ width: 'min(960px, 100%)', maxHeight: '94vh', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h4 className="mb-1 fw-bold"><i className="bi bi-stars me-2 text-primary" />AI Image Studio</h4>
            <p className="text-secondary mb-0 small">Add plausible color, improve resolution and detail, or do both.</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close image studio" />
        </div>

        <div
          className="rounded-4 border border-2 border-primary-subtle bg-light text-center p-4 mb-3"
          style={{ borderStyle: 'dashed !important', cursor: 'pointer' }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex="0"
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
        >
          <i className="bi bi-cloud-arrow-up text-primary" style={{ fontSize: '2.4rem' }} />
          <div className="fw-semibold">Drop an image here or click to browse</div>
          <div className="small text-secondary">JPEG, PNG, WebP, AVIF and other browser-supported images</div>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
        </div>

        {inputUrl && (
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="small text-secondary fw-semibold mb-1">Original</div>
              <img src={inputUrl} alt="Original upload" className="w-100 rounded-3 bg-dark" style={{ height: 320, objectFit: 'contain' }} />
            </div>
            <div className="col-md-6">
              <div className="small text-secondary fw-semibold mb-1">Result</div>
              {resultUrl ? (
                <img src={resultUrl} alt="Processed result" className="w-100 rounded-3 bg-dark" style={{ height: 320, objectFit: 'contain' }} />
              ) : (
                <div className="rounded-3 bg-light border d-grid text-secondary" style={{ height: 320, placeItems: 'center' }}>Your result will appear here</div>
              )}
            </div>
          </div>
        )}

        <div className="d-flex flex-wrap align-items-end gap-3">
          <div>
            <label className="form-label small fw-semibold mb-1">Action</label>
            <select className="form-select" value={operation} onChange={(event) => setOperation(event.target.value)}>
              <option value="colorize">Colorize</option>
              <option value="enhance">Enhance resolution</option>
              <option value="both">Enhance first + Colorize</option>
            </select>
          </div>
          {operation !== 'colorize' && (
            <div>
              <label className="form-label small fw-semibold mb-1">Enhancement scale</label>
              <select className="form-select" value={scale} onChange={(event) => setScale(event.target.value)}>
                <option value="2">2x</option>
                <option value="4">4x</option>
              </select>
            </div>
          )}
          {operation !== 'enhance' && (
            <div>
              <label className="form-label small fw-semibold mb-1">Color style</label>
              <select className="form-select" value={colorModel} onChange={(event) => setColorModel(event.target.value)}>
                <option value="artistic">Natural — fewer artifacts</option>
                <option value="modelscope">Vivid — stronger colors</option>
              </select>
            </div>
          )}
          {operation !== 'enhance' && (
            <div className="form-check align-self-center mt-3">
              <input className="form-check-input" id="neutralize-aged-tint" type="checkbox" checked={neutralizeAgedTint} onChange={(event) => setNeutralizeAgedTint(event.target.checked)} />
              <label className="form-check-label" htmlFor="neutralize-aged-tint">
                Remove aged tint first <span className="text-secondary small">(recommended)</span>
              </label>
            </div>
          )}
          <div className="form-check align-self-center mt-3">
            <input className="form-check-input" id="repair-scratches" type="checkbox" checked={repairScratches} onChange={(event) => setRepairScratches(event.target.checked)} />
            <label className="form-check-label" htmlFor="repair-scratches">
              Repair scratches + sharpen <span className="text-secondary small">(conservative)</span>
            </label>
          </div>
          <div className="form-check align-self-center mt-3">
            <input className="form-check-input" id="restore-faces" type="checkbox" checked={restoreFaces} onChange={(event) => setRestoreFaces(event.target.checked)} />
            <label className="form-check-label" htmlFor="restore-faces">
              Restore faces <span className="text-secondary small">(may alter identity)</span>
            </label>
          </div>
          <button className="btn btn-primary px-4" disabled={!file || processing} onClick={processImage}>
            {processing ? <><span className="spinner-border spinner-border-sm me-2" />Processing…</> : <><i className="bi bi-stars me-2" />Process image</>}
          </button>
          {resultUrl && <a className="btn btn-outline-secondary" href={resultUrl} download="processed-image.png"><i className="bi bi-download me-2" />Download</a>}
        </div>
        {error && <div className="alert alert-danger mt-3 mb-0 py-2">{error}</div>}
      </div>
    </div>
  );
}

const BINOCULAR_LENS_SIZE = 140;
const IMAGE_ANIMATION_MODES = [
  { key: 'none', icon: 'bi-pause-fill', title: 'Image animation off' },
  { key: 'kenburns', icon: 'bi-arrows-fullscreen', title: 'Animate image: cinematic zoom' },
  { key: 'float', icon: 'bi-wind', title: 'Animate image: float' },
  { key: 'pan', icon: 'bi-arrow-left-right', title: 'Animate image: pan' },
];

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
  const [animationModeIndex, setAnimationModeIndex] = useState(0);
  const [aiAnimationUrl, setAiAnimationUrl] = useState('');
  const [aiAnimationLoading, setAiAnimationLoading] = useState(false);
  const [aiAnimationError, setAiAnimationError] = useState('');
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
    setAiAnimationUrl('');
    setAiAnimationError('');
    setAiAnimationLoading(false);
    setAnimationModeIndex(0);
    setShowLens(false);
  }, [photo.url]);

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
  const animationMode = IMAGE_ANIMATION_MODES[animationModeIndex] || IMAGE_ANIMATION_MODES[0];
  const animationEnabled = animationMode.key !== 'none' && !aiAnimationUrl;

  const requestAiAnimation = async () => {
    if (aiAnimationLoading) return;

    setAiAnimationLoading(true);
    setAiAnimationError('');
    setAiAnimationUrl('');
    setShowLens(false);
    setBinocularEnabled(false);
    setAnimationModeIndex(0);

    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/api/image-animation/animate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: photo.url,
          seconds: 4,
          prompt: 'Animate natural motion in visible people or animals while preserving the original image.',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || `Animation request failed (${response.status})`);
      }
      const nextUrl = data?.videoUrl || data?.animationUrl || data?.url;
      if (!nextUrl) throw new Error('Animation service did not return a video URL.');
      setAiAnimationUrl(toPublicUrl(nextUrl));
    } catch (error) {
      setAiAnimationError(error?.message || 'Could not animate this image.');
    } finally {
      setAiAnimationLoading(false);
    }
  };

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
          className={`photo-viewer-image-wrap ${animationEnabled ? `photo-viewer-image-wrap--${animationMode.key}` : ''}`}
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
          {aiAnimationUrl ? (
            <video
              key={aiAnimationUrl}
              src={aiAnimationUrl}
              className="photo-viewer-image"
              controls
              autoPlay
              loop
              muted
              playsInline
              style={{
                maxHeight: '72vh',
                maxWidth: '78vw',
                objectFit: 'contain',
                display: 'block',
                borderRadius: 8,
                background: '#000',
              }}
            />
          ) : (
            <img
              key={photo.url}
              ref={imgRef}
              src={photo.url}
              alt={photo.post.description || 'Photo'}
              className={`photo-viewer-image ${animationEnabled ? `photo-viewer-image--${animationMode.key}` : ''}`}
              style={{
                maxHeight: '72vh',
                maxWidth: '78vw',
                objectFit: 'contain',
                display: 'block',
                borderRadius: 8,

              }}
              draggable={false}
            />
          )}

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

          {/* Animate */}
          <button
            className="btn p-0 border-0 bg-transparent text-white d-flex flex-column align-items-center"
            title={animationMode.title}
            disabled={!!aiAnimationUrl}
            onClick={() => {
              setAnimationModeIndex((index) => (index + 1) % IMAGE_ANIMATION_MODES.length);
              setShowLens(false);
            }}
          >
            <i className={`bi ${animationMode.icon}`} style={{ fontSize: '1.6rem' }} />
            <span style={{ fontSize: '0.72rem', marginTop: 2 }}>{animationEnabled ? animationMode.key : 'Still'}</span>
          </button>

          {/* AI Animate */}
          <button
            className="btn p-0 border-0 bg-transparent text-white d-flex flex-column align-items-center"
            title="Animate people or animals with local AI"
            onClick={requestAiAnimation}
            disabled={aiAnimationLoading}
            style={{ opacity: aiAnimationLoading ? 0.65 : 1 }}
          >
            <i className={`bi ${aiAnimationLoading ? 'bi-hourglass-split' : 'bi-stars'}`} style={{ fontSize: '1.6rem' }} />
            <span style={{ fontSize: '0.72rem', marginTop: 2 }}>{aiAnimationLoading ? 'AI...' : 'AI'}</span>
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
        {aiAnimationError && (
          <div className="text-warning mt-2" style={{ fontSize: '0.78rem' }}>{aiAnimationError}</div>
        )}
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
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 0,
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
            {publishedDate && (
              <div className="text-white-50 text-truncate" style={{ fontSize: compact ? '0.62rem' : '0.68rem', lineHeight: 1.1 }}>
                {publishedDate}
              </div>
            )}
          </div>
        </div>

        <div className="d-flex align-items-end justify-content-between gap-2" style={{ padding: compact ? '6px' : '8px' }}>
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
  const [showImageStudio, setShowImageStudio] = useState(false);
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
          <button className="btn btn-outline-primary btn-sm d-flex align-items-center" onClick={() => setShowImageStudio(true)} title="Colorize or enhance an image">
            <i className="bi bi-stars me-1" />Image Studio
          </button>
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
      {showImageStudio && <ImageStudioModal onClose={() => setShowImageStudio(false)} />}

      <style>{`
        .photo-publisher-strip {
          max-width: 100%;
          padding: 0;
        }
        .photo-card:hover .photo-card-hover { background: rgba(0,0,0,0.28) !important; }
        .photo-card .photo-actions { opacity: 0; transition: opacity .18s; }
        .photo-card:hover .photo-actions { opacity: 1; }
        .photo-card .photo-actions,
        .photo-card .photo-meta-label,
        .photo-card .photo-publisher-strip {
          white-space: nowrap;
        }

        .photo-viewer-image-wrap {
          overflow: hidden;
          border-radius: 8px;
        }

        .photo-viewer-image {
          transform-origin: center;
          will-change: transform, filter;
        }

        .photo-viewer-image--kenburns {
          animation: photoKenBurns 9s ease-in-out infinite alternate;
        }

        .photo-viewer-image--float {
          animation: photoFloat 4.8s ease-in-out infinite;
        }

        .photo-viewer-image--pan {
          animation: photoPan 7s ease-in-out infinite alternate;
        }

        @keyframes photoKenBurns {
          0% { transform: scale(1) translate3d(-1.5%, 1%, 0); filter: saturate(1); }
          100% { transform: scale(1.12) translate3d(1.5%, -1%, 0); filter: saturate(1.08); }
        }

        @keyframes photoFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -10px, 0) scale(1.025); }
        }

        @keyframes photoPan {
          0% { transform: scale(1.08) translate3d(-2.4%, 0, 0); }
          100% { transform: scale(1.08) translate3d(2.4%, 0, 0); }
        }

        @media (max-width: 768px) {
          .photo-card .photo-actions { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .photo-viewer-image--kenburns,
          .photo-viewer-image--float,
          .photo-viewer-image--pan {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

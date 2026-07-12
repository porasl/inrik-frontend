import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { PUBLIC_BASE } from '../../app.config.js';
import { getAllPostsCached } from '../services/postsService';
import { listGroups, subscribeGroupUpdates } from '../services/groupsService';

const CAPTION_TRACK_SRC = 'data:text/vtt,WEBVTT%0A%0A';

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replaceAll('\\', '/');
  const idx = norm.indexOf('/videos/');
  let rel = norm;
  if (idx >= 0) {
    rel = norm.slice(idx);
  } else if (!norm.startsWith('/')) {
    rel = `/${norm}`;
  }
  return `${PUBLIC_BASE}${rel}`;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function normalizeText(value) {
  return String(value || '').trim();
}

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(String(token).split('.')[1] || ''));
  } catch {
    return null;
  }
}

function getOwnerIdentity(user = null) {
  const tokenPayload = decodeJwtPayload(localStorage.getItem('token'));

  const emailCandidates = [
    user?.email,
    localStorage.getItem('email'),
    localStorage.getItem('author'),
    tokenPayload?.email,
    tokenPayload?.preferred_username,
    tokenPayload?.upn,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  const idCandidates = [
    user?.id,
    user?.userId,
    localStorage.getItem('userId'),
    tokenPayload?.userId,
    tokenPayload?.uid,
    tokenPayload?.id,
    tokenPayload?.sub,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  const nameCandidates = [
    user?.name,
    localStorage.getItem('userName'),
    `${normalizeText(localStorage.getItem('userFirstName'))} ${normalizeText(localStorage.getItem('userLastName'))}`,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  return {
    emails: [...new Set(emailCandidates)],
    userIds: [...new Set(idCandidates)],
    userNames: [...new Set(nameCandidates)],
  };
}

function matchesOwner(post, identity) {
  const ownerCandidates = new Set([
    post?.email,
    post?.author,
    post?.userEmail,
    post?.ownerEmail,
    post?.userProfileImageOwner,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean));

  const idCandidates = new Set([
    post?.userId,
    post?.ownerId,
    post?.authorId,
    post?.createdById,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean));

  const nameCandidates = new Set([
    post?.name,
    post?.userName,
    [post?.userFirstName, post?.userLastName].filter(Boolean).join(' '),
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean));

  if (identity.emails.some((email) => ownerCandidates.has(email))) return true;
  if (identity.userIds.some((id) => idCandidates.has(id))) return true;
  if (identity.userNames.some((name) => nameCandidates.has(name))) return true;
  return false;
}

function classifyDocument(rawName = '') {
  const ext = normalizeText(rawName).split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  return 'docs';
}

function getBaseName(value, fallback = 'file') {
  const raw = normalizeText(value);
  if (!raw) return fallback;
  const clean = raw.split('?')[0].replaceAll('\\', '/');
  const tail = clean.split('/').pop() || fallback;
  return tail || fallback;
}

function getUniqueMediaValues(...sources) {
  const seen = new Set();
  const values = [];

  sources.forEach((source) => {
    toArray(source).forEach((raw) => {
      const normalized = normalizeText(raw);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      values.push(raw);
    });
  });

  return values;
}

function getUniqueResolvedMediaValues(...sources) {
  const seen = new Set();
  const values = [];

  getUniqueMediaValues(...sources).forEach((raw) => {
    const resolved = toPublicUrl(raw);
    const key = normalizeText(resolved || raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    values.push(raw);
  });

  return values;
}

function toCanonicalVideoKey(raw) {
  const resolved = toPublicUrl(raw);
  const base = normalizeText(resolved || raw).toLowerCase();
  if (!base) return '';

  const withoutQuery = base.split('#')[0].split('?')[0];
  return withoutQuery
    .replaceAll('\\', '/')
    .replace(/\/stream\.m3u8$/i, '/')
    .replace(/\/$/, '');
}

function resolveMediaEntries(posts) {
  const folders = {
    videos: [],
    audios: [],
    images: [],
    documents: [],
  };
  const seenVideoUrls = new Set();

  posts.forEach((post) => {
    const title = normalizeText(post?.title || post?.description || 'Untitled');
    const owner = [post?.userFirstName, post?.userLastName].filter(Boolean).join(' ') || post?.email || post?.author || 'User';

    const addEntry = (folder, item) => {
      folders[folder].push({
        id: `${post?.id || 'post'}-${folder}-${item.name}-${item.url}`,
        post,
        folder,
        owner,
        title,
        ...item,
      });
    };

    const addUrls = (folder, urls, kind) => {
      toArray(urls).forEach((raw) => {
        if (!raw) return;
        const url = toPublicUrl(raw);
        if (!url) return;
        addEntry(folder, {
          kind,
          name: getBaseName(raw, kind),
          url,
          rawUrl: raw,
          ext: getBaseName(raw).split('.').pop().toLowerCase(),
        });
      });
    };

    const addVideoEntry = () => {
      const rawVideos = getUniqueResolvedMediaValues(
        post?.hlsVideoUrls,
        post?.videoUrls,
        post?.videoUrl,
        post?.videoPath,
      );

      if (!rawVideos.length) return;

      // One post should surface as one video in Private View.
      // Prefer HLS/stream source when present.
      const sortedCandidates = [...rawVideos].sort((a, b) => {
        const aRaw = String(a || '').toLowerCase();
        const bRaw = String(b || '').toLowerCase();
        const aIsHls = aRaw.includes('.m3u8') || aRaw.includes('/stream');
        const bIsHls = bRaw.includes('.m3u8') || bRaw.includes('/stream');
        if (aIsHls === bIsHls) return 0;
        return aIsHls ? -1 : 1;
      });

      const rawVideo = sortedCandidates[0];
      const url = toPublicUrl(rawVideo);
      if (!url) return;

      const videoKey = toCanonicalVideoKey(url);
      if (!videoKey) return;
      if (seenVideoUrls.has(videoKey)) return;
      seenVideoUrls.add(videoKey);

      addEntry('videos', {
        kind: 'video',
        name: title,
        url,
        rawUrl: rawVideo,
        ext: getBaseName(rawVideo).split('.').pop().toLowerCase(),
      });
    };

    addVideoEntry();

    addUrls('audios', post?.audioUrls, 'audio');
    addUrls('audios', post?.hlsAudioUrls, 'audio');
    addUrls('audios', post?.audioUrl, 'audio');

    addUrls('images', post?.imageUrls, 'image');
    addUrls('images', post?.photoUrls, 'image');
    addUrls('images', post?.imageUrl, 'image');
    addUrls('images', post?.photoUrl, 'image');

    const docCandidates = [
      ...toArray(post?.documentUrls),
      ...toArray(post?.documents),
    ];

    docCandidates.forEach((rawItem, index) => {
      if (!rawItem) return;
      const rawUrl = typeof rawItem === 'string'
        ? rawItem
        : (rawItem.url || rawItem.path || rawItem.fileUrl || rawItem.documentUrl || rawItem.href || '');
      const url = toPublicUrl(rawUrl);
      if (!url) return;
      const candidateName = typeof rawItem === 'string'
        ? getBaseName(rawItem, 'document')
        : normalizeText(rawItem.name || rawItem.filename || rawItem.title || rawItem.label || `document-${index + 1}`);
      const group = classifyDocument(candidateName || rawUrl);
      addEntry('documents', {
        kind: 'document',
        group,
        name: candidateName,
        url,
        rawUrl,
        ext: getBaseName(candidateName || rawUrl).split('.').pop().toLowerCase(),
      });
    });
  });

  return folders;
}

function getFolderMeta(label, count, icon, color = '#fff', folder = '', group = '') {
  return { kind: 'folder', label, count, icon, color, folder, group };
}

function getCurrentFolderLabel(path) {
  if (path.length === 1) return 'Drive';
  if (path.length === 2) return path[1].charAt(0).toUpperCase() + path[1].slice(1);
  return path[2].toUpperCase();
}

function getItemIcon(item) {
  if (item.kind === 'group') return 'bi-people-fill';
  if (item.kind === 'video') return 'bi-play-btn-fill';
  if (item.kind === 'audio') return 'bi-music-note-beamed';
  if (item.kind === 'image') return 'bi-image';
  if (item.group === 'pdf') return 'bi-file-earmark-pdf';
  if (item.group === 'excel') return 'bi-file-earmark-spreadsheet';
  if (item.group === 'ppt') return 'bi-file-earmark-slides';
  return 'bi-file-earmark-text';
}

function resolveVideoThumbnail(item) {
  if (item?.kind !== 'video') return '';

  const post = item.post || {};
  const candidates = [
    post.videoImagePath,
    post.thumbnailUrl,
    ...toArray(post.imageUrls),
    post.imageUrl,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = toPublicUrl(candidate);
    if (!resolved) continue;
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(resolved)) return resolved;
    if (resolved.includes('/videos/')) return resolved;
  }

  const streamUrl = String(item.url || '');
  if (/\/videos\/[^/]+\/stream\.m3u8(\?|$)/i.test(streamUrl)) {
    return streamUrl.replace(/stream\.m3u8(\?.*)?$/i, 'videoImage.gif');
  }

  return '';
}

function EmbedModal({ item, onClose }) {
  const postId = item?.post?.id || item?.postId || item?.id || '';
  const iframeCode = `<iframe src="${globalThis.location.origin}/embed/${postId}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;

  return (
    <div className="boxview-embed-overlay">
      <dialog className="boxview-embed-dialog" open aria-label="Embed Video">
        <div className="modal-content-custom bg-white p-4 shadow-lg rounded boxview-embed-content">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0 fw-bold"><i className="bi bi-code-slash me-2 text-primary"></i>Embed Video</h5>
          <button className="btn-close" onClick={onClose}></button>
        </div>
        <p className="text-secondary small mb-2">Copy and paste this code into your website:</p>
        <textarea className="form-control bg-light mb-3" rows="3" readOnly value={iframeCode} style={{ fontSize: '0.8rem', fontFamily: 'monospace' }} />
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-primary btn-sm px-3" onClick={() => { navigator.clipboard.writeText(iframeCode); alert('Copied to clipboard!'); }}>
            <i className="bi bi-clipboard me-1"></i>Copy
          </button>
          <button className="btn btn-light btn-sm border" onClick={onClose}>Close</button>
        </div>
        </div>
      </dialog>
    </div>
  );
}

EmbedModal.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string,
    postId: PropTypes.string,
    post: PropTypes.shape({
      id: PropTypes.string,
    }),
  }),
  onClose: PropTypes.func.isRequired,
};

function MediaPreview({ item, onOpenGroups }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const playableUrl = useMemo(() => {
    if (!item) return '';
    if (item.kind === 'video' || item.kind === 'audio') {
      return item.url;
    }
    return item.url;
  }, [item]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || item?.kind !== 'video' || !playableUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = playableUrl;
    } else if (/\.m3u8(\?|$)/i.test(playableUrl) && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(playableUrl);
      hls.attachMedia(el);
      hlsRef.current = hls;
    } else {
      el.src = playableUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [item, playableUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || item?.kind !== 'video') return;

    const onLoaded = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setCurrentTime(el.currentTime || 0);
      setIsMuted(el.muted);
      setPlaybackRate(el.playbackRate || 1);
    };
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolume = () => setIsMuted(el.muted);
    const onRate = () => setPlaybackRate(el.playbackRate || 1);

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('volumechange', onVolume);
    el.addEventListener('ratechange', onRate);

    onLoaded();

    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('ratechange', onRate);
    };
  }, [item, playableUrl]);

  useEffect(() => () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  if (!item) {
    return (
      <div className="boxview-preview-empty">
        <i className="bi bi-window-stack"></i>
        <h5>Select a file</h5>
        <p>Choose a video, image, audio, or document from the explorer.</p>
      </div>
    );
  }

  if (item.kind === 'group') {
    const group = item.groupData || {};
    const members = Array.isArray(group.members) ? group.members : [];
    return (
      <div className="boxview-preview-empty">
        <i className="bi bi-people-fill"></i>
        <h5>{group.name || item.name}</h5>
        <p>{group.description || 'No group description.'}</p>
        <div className="d-flex align-items-center gap-2 mb-3">
          <span className={`badge ${group.isOwner ? 'text-bg-warning' : 'text-bg-light border text-secondary'}`}>
            {group.isOwner ? 'OWNER' : 'MEMBER'}
          </span>
          <span className="small text-secondary">
            {group.memberCount ?? members.length} member{(group.memberCount ?? members.length) === 1 ? '' : 's'}
          </span>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={onOpenGroups}>
          Open group
        </button>
      </div>
    );
  }

  if (item.kind === 'image') {
    return (
      <div className="boxview-preview-media">
        <img src={item.url} alt={item.name} className="boxview-preview-image" />
        <div className="boxview-preview-meta">
          <strong>{item.name}</strong>
          <span>{item.owner}</span>
        </div>
      </div>
    );
  }

  if (item.kind === 'video') {
    const togglePlay = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    };

    const toggleMute = () => {
      const el = videoRef.current;
      if (!el) return;
      el.muted = !el.muted;
      setIsMuted(el.muted);
    };

    const onSeek = (e) => {
      const el = videoRef.current;
      if (!el) return;
      const next = Number(e.target.value || 0);
      el.currentTime = next;
      setCurrentTime(next);
    };

    const onRate = (e) => {
      const el = videoRef.current;
      if (!el) return;
      const nextRate = Number(e.target.value || 1);
      el.playbackRate = nextRate;
      setPlaybackRate(nextRate);
    };

    const onFullscreen = async () => {
      const el = videoRef.current;
      if (!el) return;
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if (el.requestFullscreen) {
          await el.requestFullscreen();
        }
      } catch {
        // Ignore fullscreen failures silently.
      }
    };

    const fmt = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const total = Math.floor(seconds);
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    return (
      <div className="boxview-preview-media">
        <video ref={videoRef} controls={false} autoPlay playsInline className="boxview-preview-video" poster={item.post?.videoImagePath ? toPublicUrl(item.post.videoImagePath) : ''}>
          <track kind="captions" label="English captions" srcLang="en" src={CAPTION_TRACK_SRC} />
        </video>
        <fieldset className="boxview-preview-controls" aria-label="Video controls">
          <button type="button" className="boxview-preview-control-btn" onClick={togglePlay}>
            <i className={`bi ${isPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`}></i>
          </button>
          <button type="button" className="boxview-preview-control-btn" onClick={toggleMute}>
            <i className={`bi ${isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`}></i>
          </button>
          <span className="boxview-preview-time">{fmt(currentTime)} / {fmt(duration)}</span>
          <input
            type="range"
            className="boxview-preview-seek"
            min="0"
            max={Math.max(duration, 0)}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            aria-label="Seek"
          />
          <select className="boxview-preview-rate" value={playbackRate} onChange={onRate} aria-label="Playback speed">
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
          <button type="button" className="boxview-preview-control-btn" onClick={onFullscreen}>
            <i className="bi bi-arrows-fullscreen"></i>
          </button>
        </fieldset>
        <div className="boxview-preview-meta">
          <strong>{item.name}</strong>
          <span>{item.owner}</span>
        </div>
      </div>
    );
  }

  if (item.kind === 'audio') {
    return (
      <div className="boxview-preview-media boxview-preview-audio">
        <div className="boxview-preview-audio-card">
          <i className="bi bi-music-note-beamed"></i>
          <strong>{item.name}</strong>
          <span>{item.owner}</span>
          <audio controls autoPlay src={item.url}>
            <track kind="captions" label="English captions" srcLang="en" src={CAPTION_TRACK_SRC} />
          </audio>
        </div>
      </div>
    );
  }

  const isPdf = /\.pdf(\?|$)/i.test(item.url) || item.group === 'pdf';
  return (
    <div className="boxview-preview-media boxview-preview-document">
      {isPdf ? (
        <iframe title={item.name} src={item.url} className="boxview-preview-frame" />
      ) : (
        <div className="boxview-preview-document-card">
          <i className={`bi ${getItemIcon(item)}`}></i>
          <strong>{item.name}</strong>
          <span>{item.owner}</span>
          <p>Preview is not available for this document type.</p>
        </div>
      )}
      <div className="boxview-preview-meta">
        <strong>{item.name}</strong>
        <span>{item.owner}</span>
      </div>
    </div>
  );
}

MediaPreview.propTypes = {
  item: PropTypes.shape({
    kind: PropTypes.string,
    url: PropTypes.string,
    name: PropTypes.string,
    owner: PropTypes.string,
    group: PropTypes.string,
    post: PropTypes.shape({
      videoImagePath: PropTypes.string,
    }),
    groupData: PropTypes.shape({}),
  }),
  onOpenGroups: PropTypes.func,
};

function renderExplorerItem(item, selectItem, onDelete, onEmbed, canDelete = false) {
  if (item.kind === 'folder') {
    return (
      <button key={item.label} type="button" className="boxview-folder-card boxview-folder-card--inline" onClick={() => selectItem(item)}>
        <i className={`bi ${item.icon}`}></i>
        <strong>{item.label}</strong>
        <span>{item.count} {item.folder === 'groups' ? 'groups' : 'files'}</span>
      </button>
    );
  }

  const videoThumb = resolveVideoThumbnail(item);
  const isVideo = item.kind === 'video';

  return (
    <div key={item.id} className={`boxview-file-card ${isVideo ? 'boxview-file-card--video' : ''}`}>
      <button type="button" className="boxview-file-card-main" onClick={() => selectItem(item)}>
        {isVideo ? (
          <div className="boxview-file-thumb">
            {videoThumb ? (
              <img src={videoThumb} alt={item.title || item.name || 'Video thumbnail'} className="boxview-file-thumb-img" />
            ) : (
              <div className="boxview-file-thumb-placeholder">
                <i className={`bi ${getItemIcon(item)}`}></i>
              </div>
            )}
          </div>
        ) : (
          <div className="boxview-file-icon">
            <i className={`bi ${getItemIcon(item)}`}></i>
          </div>
        )}
        <div className="boxview-file-text">
          <strong>{item.name || item.label}</strong>
          <span>{item.owner || 'INRIK user'}</span>
        </div>
      </button>

      {isVideo && (
        <div className="boxview-file-footer">
          <div className="boxview-file-stats">
            <span><i className="bi bi-eye me-1"></i>{item.post?.views ?? item.views ?? 0}</span>
            <span><i className="bi bi-heart me-1"></i>{item.post?.likes ?? item.likes ?? 0}</span>
          </div>

          <details className="boxview-file-menu">
            <summary className="boxview-file-menu-toggle" aria-label="More options">
              <i className="bi bi-three-dots"></i>
            </summary>
            <div className="boxview-file-menu-panel" role="menu">
              <button type="button" className="boxview-file-menu-item" onClick={() => onEmbed?.(item)}>
                <i className="bi bi-code-slash"></i>
                <span>Embed</span>
              </button>
              {canDelete && (
                <button type="button" className="boxview-file-menu-item boxview-file-menu-item--danger" onClick={() => onDelete?.(item)}>
                  <i className="bi bi-trash"></i>
                  <span>Delete</span>
                </button>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function BoxView({ posts = [], user = null, isLoggedIn = false, onHome, onDelete, authFetch = fetch, onOpenGroups }) {
  const identity = useMemo(() => {
    // Get CURRENTLY LOGGED-IN user identity from localStorage
    if (!isLoggedIn) {
      return { emails: [], userIds: [], userNames: [] };
    }

    const token = localStorage.getItem('token');
    let tokenPayload = null;
    if (token) {
      try {
        tokenPayload = JSON.parse(atob(token.split('.')[1] || ''));
      } catch {
        tokenPayload = null;
      }
    }

    const emailCandidates = [
      localStorage.getItem('email'),
      localStorage.getItem('author'),
      tokenPayload?.email,
      tokenPayload?.preferred_username,
      tokenPayload?.upn,
    ]
      .map((v) => normalizeText(v).toLowerCase())
      .filter(Boolean);

    const idCandidates = [
      localStorage.getItem('userId'),
      tokenPayload?.userId,
      tokenPayload?.uid,
      tokenPayload?.id,
      tokenPayload?.sub,
    ]
      .map((v) => normalizeText(v).toLowerCase())
      .filter(Boolean);

    return {
      emails: [...new Set(emailCandidates)],
      userIds: [...new Set(idCandidates)],
      userNames: [],
    };
  }, [isLoggedIn]);
  const [started, setStarted] = useState(true);
  const [path, setPath] = useState(['inrik']);
  const [previewItem, setPreviewItem] = useState(null);
  const [embedItem, setEmbedItem] = useState(null);
  const [allPosts, setAllPosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [mobileVideoIndex, setMobileVideoIndex] = useState(-1);
  const authFetchRef = useRef(authFetch);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const loadGroups = useCallback(async () => {
    if (!isLoggedIn) {
      setGroups([]);
      return;
    }

    const token = localStorage.getItem('token') || '';
    if (!token) return;

    try {
      const payload = await listGroups(token, authFetchRef.current);
      setGroups(Array.isArray(payload) ? payload : payload?.groups || []);
    } catch {
      setGroups([]);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadGroups();
    return subscribeGroupUpdates(loadGroups);
  }, [loadGroups]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isLoggedIn) {
      setAllPosts([]);
      return () => {
        cancelled = true;
      };
    }

    const loadAllPosts = async () => {
      try {
        const items = await getAllPostsCached({ forceRefresh: true });
        if (!cancelled) {
          setAllPosts(Array.isArray(items) ? items : []);
        }
      } catch {
        if (!cancelled) {
          setAllPosts([]);
        }
      }
    };

    loadAllPosts();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // On mobile, auto-open the videos folder
  useEffect(() => {
    if (isMobile && started && path.length === 1) {
      setPath(['inrik', 'videos']);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, started]);

  useEffect(() => {
    if (!started) return;
    if (path.length === 1) {
      setPreviewItem(null);
      return;
    }

    const currentItems = getCurrentItems();
    if (!currentItems.length) {
      setPreviewItem(null);
      return;
    }

    if (!previewItem || !currentItems.some((item) => item.id === previewItem.id)) {
      setPreviewItem(currentItems[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, started, posts]);

  const sourcePosts = useMemo(() => {
    if (!isLoggedIn) return [];
    return allPosts.length > 0 ? allPosts : posts;
  }, [allPosts, posts, isLoggedIn]);

  const ownedPosts = useMemo(() => {
    if (!isLoggedIn) return [];
    return sourcePosts.filter((post) => matchesOwner(post, identity));
  }, [sourcePosts, identity, isLoggedIn]);

  const scopedPosts = useMemo(() => {
    if (!isLoggedIn) return [];
    // If owner matching is too strict, fallback to all posts
    return ownedPosts.length > 0 ? ownedPosts : sourcePosts;
  }, [isLoggedIn, ownedPosts, sourcePosts]);

  const catalog = useMemo(() => resolveMediaEntries(scopedPosts), [scopedPosts]);
  const groupItems = useMemo(() => groups.map((group) => ({
    id: `group-${group.id}`,
    kind: 'group',
    name: group.name || 'Untitled group',
    owner: `${group.isOwner ? 'Owner' : 'Member'} - ${group.memberCount ?? group.members?.length ?? 0} members`,
    groupData: group,
  })), [groups]);

  const documentGroups = useMemo(() => {
    const groups = {
      docs: catalog.documents.filter((item) => item.group === 'docs'),
      pdf: catalog.documents.filter((item) => item.group === 'pdf'),
      excel: catalog.documents.filter((item) => item.group === 'excel'),
      ppt: catalog.documents.filter((item) => item.group === 'ppt'),
    };
    return groups;
  }, [catalog.documents]);

  function getCurrentItems() {
    if (path.length === 1) return [];
    const [, section, subSection] = path;

    if (section === 'videos') return catalog.videos;
    if (section === 'audios') return catalog.audios;
    if (section === 'images') return catalog.images;
    if (section === 'groups') return groupItems;

    if (section === 'documents') {
      if (!subSection) {
        return [
          getFolderMeta('Docs', documentGroups.docs.length, 'bi-file-earmark-text', '#94a3b8', 'documents', 'docs'),
          getFolderMeta('PDF', documentGroups.pdf.length, 'bi-file-earmark-pdf', '#ef4444', 'documents', 'pdf'),
          getFolderMeta('Excel', documentGroups.excel.length, 'bi-file-earmark-spreadsheet', '#22c55e', 'documents', 'excel'),
          getFolderMeta('PPT', documentGroups.ppt.length, 'bi-file-earmark-slides', '#f97316', 'documents', 'ppt'),
        ];
      }
      return documentGroups[subSection] || [];
    }

    return [];
  }

  const currentItems = getCurrentItems();

  const openDrive = () => {
    setStarted(true);
    setPath(['inrik']);
    setPreviewItem(null);
  };

  const openFolder = (folder) => {
    setStarted(true);
    if (folder === 'documents') {
      setPath(['inrik', 'documents']);
      setPreviewItem(null);
      return;
    }
    setPath(['inrik', folder]);
    setPreviewItem(null);
  };

  const openDocumentGroup = (group) => {
    setPath(['inrik', 'documents', group]);
    setPreviewItem(null);
  };

  const goBack = () => {
    if (path.length <= 1) {
      if (started) {
        setStarted(false);
        setPreviewItem(null);
      }
      return;
    }

    if (path.length === 2) {
      setPath(['inrik']);
      setPreviewItem(null);
      return;
    }

    setPath(['inrik', 'documents']);
    setPreviewItem(null);
  };

  const selectItem = (item) => {
    if (!item) return;
    if (item.kind === 'folder') {
      if (item.folder === 'documents' && item.group) {
        openDocumentGroup(item.group);
        return;
      }
      openFolder(item.folder || 'videos');
      return;
    }
    if (item.kind === 'group') {
      setPreviewItem(item);
      return;
    }
    if (isMobile && item.kind === 'video') {
      const currentItems = getCurrentItems();
      const idx = currentItems.findIndex((v) => v.id === item.id);
      setMobileVideoIndex(Math.max(0, idx));
      return;
    }
    setPreviewItem(item);
  };

  const handleDelete = async (item) => {
    const postId = item?.post?.id || item?.postId || item?.id;
    if (!postId) return;

    // Only owner of logged-in user can delete
    if (!isLoggedIn) {
      alert('You must be logged in to delete.');
      return;
    }

    if (!matchesOwner(item.post, identity)) {
      alert('You can only delete your own videos.');
      return;
    }

    if (!globalThis.confirm('Delete this video permanently?')) return;
    await onDelete?.(postId);
  };

  const renderExplorerBody = () => {
    if (!isLoggedIn) {
      return (
        <div className="boxview-login-screen">
          <div className="boxview-login-card">
            <i className="bi bi-lock-fill"></i>
            <h5>Sign in to open INRIK</h5>
            <p>The drive view shows your personal folders for videos, audios, documents, and images.</p>
          </div>
        </div>
      );
    }


    return (
      <div className="boxview-explorer-window">
        <div className="boxview-titlebar">
          <div className="boxview-titlegroup">
            <i className="bi bi-window-stack"></i>
            <span>Inrik Private Explorer</span>
            <small>{path.join(' / ')}</small>
          </div>
          <div className="boxview-title-actions">
            {path.length >= 2 && (
              <button type="button" onClick={goBack} className="boxview-mini-btn" aria-label="Back">
                <i className="bi bi-arrow-left"></i>
              </button>
            )}
          </div>
        </div>

        <div className="boxview-window-body">
          <aside className="boxview-tree">
            <button type="button" className={`boxview-tree-item ${path.length === 1 ? 'active' : ''}`} onClick={openDrive}>
              <i className="bi bi-hdd-network"></i>
              <span>INRIK</span>
            </button>
            <button type="button" className={`boxview-tree-item ${path[1] === 'videos' ? 'active' : ''}`} onClick={() => openFolder('videos')}>
              <i className="bi bi-film"></i>
              <span>Videos</span>
            </button>
            <button type="button" className={`boxview-tree-item ${path[1] === 'audios' ? 'active' : ''}`} onClick={() => openFolder('audios')}>
              <i className="bi bi-music-note-beamed"></i>
              <span>Audios</span>
            </button>
            <button type="button" className={`boxview-tree-item ${path[1] === 'documents' ? 'active' : ''}`} onClick={() => openFolder('documents')}>
              <i className="bi bi-file-earmark-text"></i>
              <span>Documents</span>
            </button>
            <button type="button" className={`boxview-tree-item ${path[1] === 'images' ? 'active' : ''}`} onClick={() => openFolder('images')}>
              <i className="bi bi-images"></i>
              <span>Images</span>
            </button>
            <button type="button" className={`boxview-tree-item ${path[1] === 'groups' ? 'active' : ''}`} onClick={() => openFolder('groups')}>
              <i className="bi bi-people-fill"></i>
              <span>Groups</span>
            </button>
          </aside>

          <section className="boxview-browser">
            <div className="boxview-browser-grid">
              {currentItems.length ? (
                currentItems.map((item) => renderExplorerItem(
                  item,
                  selectItem,
                  handleDelete,
                  setEmbedItem,
                  isLoggedIn && item.post && matchesOwner(item.post, identity)
                ))
              ) : (
                <div className="boxview-empty-state">
                  <i className="bi bi-folder2-open"></i>
                  <strong>{path.length === 1 ? 'Select a folder' : 'No items here'}</strong>
                  <span>{path.length === 1 ? 'Choose Videos, Audios, Documents, Images, or Groups from the left.' : 'Upload files to see them in this explorer.'}</span>
                </div>
              )}
            </div>
          </section>

          <aside className="boxview-preview-panel">
            <MediaPreview item={previewItem} onOpenGroups={onOpenGroups} />
          </aside>
        </div>
      </div>
    );
  };

  const mobileVideoItems = isMobile && path[1] === 'videos' ? (getCurrentItems().filter((v) => v.kind === 'video') || []) : [];
  const mobileCurrentVideo = mobileVideoIndex >= 0 && mobileVideoIndex < mobileVideoItems.length ? mobileVideoItems[mobileVideoIndex] : null;

  const goMobileNext = () => {
    if (mobileVideoIndex < mobileVideoItems.length - 1) {
      setMobileVideoIndex(mobileVideoIndex + 1);
    }
  };

  const goMobilePrev = () => {
    if (mobileVideoIndex > 0) {
      setMobileVideoIndex(mobileVideoIndex - 1);
    }
  };

  const deleteMobileVideo = async (item) => {
    const postId = item?.post?.id || item?.postId || item?.id;
    if (!postId) return;

    // Only logged-in owner can delete
    if (!isLoggedIn) {
      alert('You must be logged in to delete.');
      return;
    }

    if (!matchesOwner(item.post, identity)) {
      alert('You can only delete your own videos.');
      return;
    }

    if (!globalThis.confirm('Delete this video permanently?')) return;
    await onDelete?.(postId);
    const newIdx = Math.max(0, mobileVideoIndex - 1);
    setMobileVideoIndex(newIdx);
  };

  return (
    <div className="boxview-shell boxview-shell--plain">
      {renderExplorerBody()}

      {embedItem && <EmbedModal item={embedItem} onClose={() => setEmbedItem(null)} />}

      {isMobile && mobileCurrentVideo && (
        <div className="boxview-mobile-overlay">
          <div className="boxview-mobile-overlay-header">
            <button
              type="button"
              className="boxview-mobile-overlay-close"
              onClick={() => setMobileVideoIndex(-1)}
              aria-label="Close video"
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <div className="boxview-mobile-overlay-title">
              <strong>{mobileCurrentVideo.name}</strong>
              <span className="text-secondary small">{mobileVideoIndex + 1} / {mobileVideoItems.length}</span>
            </div>
          </div>

          <div className="boxview-mobile-overlay-player">
            <MediaPreview item={mobileCurrentVideo} />
          </div>

          <div className="boxview-mobile-overlay-nav">
            <button
              type="button"
              className="boxview-mobile-overlay-btn"
              onClick={goMobilePrev}
              disabled={mobileVideoIndex === 0}
              aria-label="Previous video"
            >
              <i className="bi bi-chevron-left"></i>
            </button>
            {isLoggedIn && mobileCurrentVideo && matchesOwner(mobileCurrentVideo.post, identity) && (
              <button
                type="button"
                className="boxview-mobile-overlay-btn boxview-mobile-overlay-btn--danger"
                onClick={() => deleteMobileVideo(mobileCurrentVideo)}
                aria-label="Delete video"
              >
                <i className="bi bi-trash"></i>
              </button>
            )}
            <button
              type="button"
              className="boxview-mobile-overlay-btn"
              onClick={goMobileNext}
              disabled={mobileVideoIndex === mobileVideoItems.length - 1}
              aria-label="Next video"
            >
              <i className="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

BoxView.propTypes = {
  posts: PropTypes.arrayOf(PropTypes.shape({})),
  user: PropTypes.oneOfType([PropTypes.shape({}), PropTypes.oneOf([null])]),
  isLoggedIn: PropTypes.bool,
  onHome: PropTypes.func,
  onDelete: PropTypes.func,
  authFetch: PropTypes.func,
  onOpenGroups: PropTypes.func,
};

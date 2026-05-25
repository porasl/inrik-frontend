import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { PUBLIC_BASE } from '../../app.config.js';

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

function getOwnerIdentity() {
  const email = normalizeText(localStorage.getItem('email') || localStorage.getItem('author'));
  const userId = normalizeText(localStorage.getItem('userId'));
  const userName = normalizeText(localStorage.getItem('userName'));
  return { email: email.toLowerCase(), userId: userId.toLowerCase(), userName: userName.toLowerCase() };
}

function matchesOwner(post, identity) {
  const ownerCandidates = [
    post?.email,
    post?.author,
    post?.userEmail,
    post?.ownerEmail,
    post?.userProfileImageOwner,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  const idCandidates = [
    post?.userId,
    post?.ownerId,
    post?.authorId,
    post?.createdById,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  if (identity.email && ownerCandidates.includes(identity.email)) return true;
  if (identity.userId && idCandidates.includes(identity.userId)) return true;
  if (identity.userName && [post?.userName, post?.name].map((value) => normalizeText(value).toLowerCase()).includes(identity.userName)) return true;
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

function resolveMediaEntries(posts) {
  const folders = {
    videos: [],
    audios: [],
    images: [],
    documents: [],
  };

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

    addUrls('videos', post?.hlsVideoUrls, 'video');
    addUrls('videos', post?.videoUrls, 'video');
    addUrls('videos', post?.videoUrl, 'video');
    addUrls('videos', post?.videoPath, 'video');

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
  if (item.kind === 'video') return 'bi-play-btn-fill';
  if (item.kind === 'audio') return 'bi-music-note-beamed';
  if (item.kind === 'image') return 'bi-image';
  if (item.group === 'pdf') return 'bi-file-earmark-pdf';
  if (item.group === 'excel') return 'bi-file-earmark-spreadsheet';
  if (item.group === 'ppt') return 'bi-file-earmark-slides';
  return 'bi-file-earmark-text';
}

function MediaPreview({ item }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

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
    return (
      <div className="boxview-preview-media">
        <video ref={videoRef} controls autoPlay playsInline className="boxview-preview-video" poster={item.post?.videoImagePath ? toPublicUrl(item.post.videoImagePath) : ''}>
          <track kind="captions" label="English captions" srcLang="en" src={CAPTION_TRACK_SRC} />
        </video>
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
  }),
};

function renderExplorerItem(item, selectItem) {
  if (item.kind === 'folder') {
    return (
      <button key={item.label} type="button" className="boxview-folder-card boxview-folder-card--inline" onClick={() => selectItem(item)}>
        <i className={`bi ${item.icon}`}></i>
        <strong>{item.label}</strong>
        <span>{item.count} files</span>
      </button>
    );
  }

  return (
    <button key={item.id} type="button" className="boxview-file-card" onClick={() => selectItem(item)}>
      <div className="boxview-file-icon">
        <i className={`bi ${getItemIcon(item)}`}></i>
      </div>
      <div className="boxview-file-text">
        <strong>{item.name || item.label}</strong>
        <span>{item.owner || 'INRIK user'}</span>
      </div>
    </button>
  );
}

export default function BoxView({ posts = [], user = null, isLoggedIn = false, onHome }) {
  const identity = useMemo(() => getOwnerIdentity(), []);
  const [started, setStarted] = useState(false);
  const [path, setPath] = useState(['inrik']);
  const [previewItem, setPreviewItem] = useState(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

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

  const ownedPosts = useMemo(() => {
    if (!isLoggedIn) return [];
    return posts.filter((post) => matchesOwner(post, identity));
  }, [posts, identity, isLoggedIn]);

  const catalog = useMemo(() => resolveMediaEntries(ownedPosts), [ownedPosts]);

  const documentGroups = useMemo(() => {
    const groups = {
      docs: catalog.documents.filter((item) => item.group === 'docs'),
      pdf: catalog.documents.filter((item) => item.group === 'pdf'),
      excel: catalog.documents.filter((item) => item.group === 'excel'),
      ppt: catalog.documents.filter((item) => item.group === 'ppt'),
    };
    return groups;
  }, [catalog.documents]);

  const rootFolders = [
    getFolderMeta('Videos', catalog.videos.length, 'bi-film', '#4ade80', 'videos'),
    getFolderMeta('Audios', catalog.audios.length, 'bi-music-note-beamed', '#60a5fa', 'audios'),
    getFolderMeta('Documents', catalog.documents.length, 'bi-file-earmark-text', '#f59e0b', 'documents'),
    getFolderMeta('Images', catalog.images.length, 'bi-images', '#f472b6', 'images'),
  ];

  function getCurrentItems() {
    if (path.length === 1) return rootFolders;
    const [, section, subSection] = path;

    if (section === 'videos') return catalog.videos;
    if (section === 'audios') return catalog.audios;
    if (section === 'images') return catalog.images;

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
  const currentFolderLabel = getCurrentFolderLabel(path);

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
    setPreviewItem(item);
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

    if (!started) {
      return (
        <div className="boxview-drive-screen">
          <button type="button" className="boxview-drive" onClick={openDrive} aria-label="Open INRIK drive">
            <i className="bi bi-hdd-network"></i>
            <span>INRIK</span>
          </button>
          <p className="boxview-drive-help">Open the INRIK drive to browse your media</p>
        </div>
      );
    }

    return (
      <div className="boxview-explorer-window">
        <div className="boxview-titlebar">
          <div className="boxview-titlegroup">
            <i className="bi bi-window-stack"></i>
            <span>INRIK Explorer</span>
            <small>{path.join(' / ')}</small>
          </div>
          <div className="boxview-title-actions">
            <button type="button" onClick={goBack} className="boxview-mini-btn" aria-label="Back">
              <i className="bi bi-arrow-left"></i>
            </button>
            <button type="button" onClick={() => setStarted(false)} className="boxview-mini-btn" aria-label="Close explorer">
              <i className="bi bi-x-lg"></i>
            </button>
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
          </aside>

          <section className="boxview-browser">
            <div className="boxview-browser-header">
              <div>
                <strong>{currentFolderLabel}</strong>
                <div className="text-secondary small">{currentItems.length} item{currentItems.length === 1 ? '' : 's'}</div>
              </div>
              <div className="boxview-breadcrumbs">
                {path.map((part, index) => (
                  <button
                    key={`${part}-${index}`}
                    type="button"
                    className="boxview-breadcrumb"
                    onClick={() => {
                      if (index === 0) {
                        setPath(['inrik']);
                        setPreviewItem(null);
                        return;
                      }
                      if (index === 1) {
                        setPath(['inrik', part]);
                        setPreviewItem(null);
                        return;
                      }
                      setPath(['inrik', 'documents', part]);
                      setPreviewItem(null);
                    }}
                  >
                    {part}
                  </button>
                ))}
              </div>
            </div>

            <div className="boxview-browser-grid">
              {currentItems.length ? (
                currentItems.map((item) => renderExplorerItem(item, selectItem))
              ) : (
                <div className="boxview-empty-state">
                  <i className="bi bi-folder2-open"></i>
                  <strong>No items here</strong>
                  <span>Upload files to see them in this explorer.</span>
                </div>
              )}
            </div>
          </section>

          <aside className="boxview-preview-panel">
            <MediaPreview item={previewItem} />
          </aside>
        </div>
      </div>
    );
  };

  return (
    <div className="boxview-shell">
      <div className="boxview-topbar">
        <div className="boxview-topbar-brand">
          <i className="bi bi-window-sidebar"></i>
          <strong>BoxView</strong>
          <span>INRIK workstation simulation</span>
        </div>
        <div className="boxview-topbar-user">
          <span>{user?.name || user?.email || 'Guest'}</span>
          <button type="button" className="btn btn-sm btn-light" onClick={onHome}>
            <i className="bi bi-house-door me-1"></i>Home
          </button>
        </div>
      </div>

      <div className="boxview-desktop-bg">
        <div className="boxview-drive-float">
          <button type="button" className="boxview-drive-mini" onClick={openDrive}>
            <i className="bi bi-hdd-network"></i>
            <span>INRIK</span>
          </button>
        </div>

        {renderExplorerBody()}
      </div>

      <footer className="boxview-taskbar">
        <button type="button" className="boxview-start-btn" onClick={onHome}>
          <i className="bi bi-windows"></i>
          <span>Start</span>
        </button>
        <div className="boxview-taskbar-center">
          <span>INRIK Explorer</span>
          <span className="boxview-taskbar-status">{started ? currentFolderLabel : 'Desktop'}</span>
        </div>
        <div className="boxview-clock">
          <span>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <small>{clock.toLocaleDateString([], { month: 'short', day: '2-digit' })}</small>
        </div>
      </footer>
    </div>
  );
}

BoxView.propTypes = {
  posts: PropTypes.arrayOf(PropTypes.shape({})),
  user: PropTypes.oneOfType([PropTypes.shape({}), PropTypes.oneOf([null])]),
  isLoggedIn: PropTypes.bool,
  onHome: PropTypes.func,
};

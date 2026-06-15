import React, { useMemo } from 'react';
import AudioCard from './AudioCard';
import { PUBLIC_BASE } from '../../app.config.js';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac', 'opus'];

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const normalized = String(fsPath).replaceAll('\\', '/');

  // Convert absolute server file paths to browser-accessible public paths.
  const webdataIndex = normalized.indexOf('webdata/');
  if (webdataIndex >= 0) {
    return `${PUBLIC_BASE}/${normalized.slice(webdataIndex + 'webdata/'.length)}`;
  }

  const audiosIndex = normalized.indexOf('/audios/');
  if (audiosIndex >= 0) {
    return `${PUBLIC_BASE}${normalized.slice(audiosIndex)}`;
  }

  if (normalized.startsWith('audios/')) {
    return `${PUBLIC_BASE}/${normalized}`;
  }

  const relative = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${PUBLIC_BASE}${relative}`;
}

function isAudioUrl(url) {
  if (!url) return false;
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.includes('/audio/')) return true;
  return AUDIO_EXTENSIONS.some((ext) => clean.endsWith(`.${ext}`));
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function audioEntriesFromPosts(posts) {
  const entries = [];

  posts.forEach((post) => {
    const candidates = [
      ...toArray(post.audioUrls),
      ...toArray(post.hlsAudioUrls),
      ...toArray(post.hlsVideoUrls),
      ...toArray(post.videoUrls),
      ...toArray(post.imageUrls),
      ...toArray(post.documentUrls),
    ];

    const unique = [...new Set(candidates.filter(Boolean))];

    unique.forEach((rawUrl) => {
      if (!isAudioUrl(rawUrl)) return;
      entries.push({
        id: `${post.id}-${rawUrl}`,
        post,
        audioUrl: toPublicUrl(rawUrl),
      });
    });
  });

  return entries.sort((a, b) => {
    const aLabel = (a.post.title || a.audioUrl || '').toLowerCase();
    const bLabel = (b.post.title || b.audioUrl || '').toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export default function AudioPage({
  posts = [],
  isLoggedIn = false,
  onUploadAudio,
  hasNext = false,
  isLoading = false,
  onLoadMore,
}) {
  const audioEntries = useMemo(() => audioEntriesFromPosts(posts), [posts]);

  return (
    <div className="container-fluid px-0">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h4 className="mb-1 fw-bold">Audio Library</h4>
          <p className="mb-0 text-secondary small">{audioEntries.length} audio item{audioEntries.length === 1 ? '' : 's'} sorted by title</p>
        </div>

        {isLoggedIn && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onUploadAudio}
          >
            <i className="bi bi-upload me-1"></i> Upload Audio
          </button>
        )}
      </div>

      {!audioEntries.length ? (
        <div className="card border-0 shadow-sm rounded-4 p-4 text-center text-secondary">
          <i className="bi bi-music-note-list fs-2 mb-2"></i>
          <p className="mb-2">No audio found yet.</p>
          {isLoggedIn ? (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={onUploadAudio}
            >
              Upload your first audio
            </button>
          ) : (
            <p className="small mb-0">Log in to upload MP3 and other audio files.</p>
          )}
        </div>
      ) : (
        <div>
          {audioEntries.map((entry) => (
            <AudioCard
              key={entry.id}
              post={entry.post}
              audioUrl={entry.audioUrl}
            />
          ))}

          {hasNext && !isLoading && (
            <div className="text-center my-3">
              <button type="button" className="btn btn-outline-secondary" onClick={onLoadMore}>
                Load more audios
              </button>
            </div>
          )}

          {isLoading && (
            <div className="text-center my-3">
              <div className="spinner-border spinner-border-sm text-secondary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

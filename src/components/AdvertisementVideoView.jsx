import React, { useEffect, useState } from 'react';
import { currentRole, listAdminAdvertisementVideos } from '../services/advertisementsService';

export default function AdvertisementVideoView() {
  const [videos, setVideos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('Loading advertisement videos…');
  const isAdmin = currentRole() === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) {
      setStatus('Administrator role is required.');
      return;
    }
    listAdminAdvertisementVideos()
      .then((items) => {
        setVideos(items || []);
        setStatus('');
      })
      .catch((error) => setStatus(error.message));
  }, [isAdmin]);

  if (!isAdmin) {
    return <section className="advertisement-video-view"><div className="alert alert-danger">Administrator role is required.</div></section>;
  }

  return (
    <section className="advertisement-video-view">
      <header>
        <div>
          <span>Admin media library</span>
          <h2>Advertisement Video View</h2>
          <p>Campaign videos tagged as advertisement media. This page is available only to administrators.</p>
        </div>
        <strong>{videos.length} videos</strong>
      </header>

      {status && <div className="alert alert-info">{status}</div>}
      {!status && videos.length === 0 && (
        <div className="advertisement-video-view__empty">
          <i className="bi bi-camera-video" />
          <strong>No advertisement videos yet</strong>
          <span>Upload a video in Advertising Studio and save the campaign to list it here.</span>
        </div>
      )}
      <div className="advertisement-video-view__grid">
        {videos.map((advertisement) => (
          <article key={advertisement.id}>
            <button type="button" className="advertisement-video-view__player" onClick={() => setSelected(advertisement)}>
              <video src={advertisement.mediaUrl} muted preload="metadata" playsInline />
              <span><i className="bi bi-play-fill" /></span>
            </button>
            <div>
              <span className="badge text-bg-primary">{advertisement.mediaTag || 'ADVERTISEMENT_VIDEO'}</span>
              <h3>{advertisement.headline || 'Untitled advertisement'}</h3>
              <p>{advertisement.message || 'No description'}</p>
              <small>{advertisement.ownerEmail} · {advertisement.status}</small>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="advertising-video-modal" role="presentation" onMouseDown={() => setSelected(null)}>
          <section role="dialog" aria-modal="true" aria-label={selected.headline || 'Advertisement video'} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Close advertisement video" onClick={() => setSelected(null)}>×</button>
            <video src={selected.mediaUrl} controls autoPlay playsInline />
          </section>
        </div>
      )}
    </section>
  );
}

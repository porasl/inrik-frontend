import React, { useEffect, useMemo, useState } from 'react';
import { serveAdvertisement } from '../services/advertisementsService';

const SAFE_POSITIONS = [
  { top: '12%', left: '8%' }, { top: '12%', right: '8%' },
  { top: '38%', left: '10%' }, { top: '36%', right: '10%' },
  { bottom: '12%', left: '12%' }, { bottom: '12%', right: '12%' },
];

function profileContext() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    profileTags: JSON.parse(localStorage.getItem('advertisementProfileTags') || '[]'),
    profile: {
      name: [localStorage.getItem('userFirstName'), localStorage.getItem('userLastName')].filter(Boolean).join(' '),
    },
  };
}

export default function PersonalizedAdvertisement({ isLoggedIn }) {
  const [advertisement, setAdvertisement] = useState(null);
  const [closed, setClosed] = useState(false);
  const position = useMemo(() => SAFE_POSITIONS[Math.floor(Math.random() * SAFE_POSITIONS.length)], [advertisement?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || !localStorage.getItem('token')) {
      setAdvertisement(null);
      return () => { cancelled = true; };
    }
    serveAdvertisement(profileContext())
      .then((item) => {
        if (!cancelled) {
          setAdvertisement(item);
          setClosed(false);
        }
      })
      .catch((error) => console.warn('Advertisement delivery failed:', error.message));
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  if (!advertisement || closed) return null;
  return (
    <aside
      className={`personalized-ad personalized-ad--${advertisement.templateId || 'transparent-popup'}`}
      style={{ ...position, '--ad-opacity': (advertisement.opacity || 82) / 100 }}
      aria-label="Sponsored advertisement"
    >
      <button type="button" className="personalized-ad__close" aria-label="Close advertisement" onClick={() => setClosed(true)}>×</button>
      <span>Sponsored</span>
      <strong>{advertisement.headline}</strong>
      {advertisement.message && <p>{advertisement.message}</p>}
      <a href={advertisement.destination} target="_blank" rel="noopener noreferrer">
        {advertisement.buttonLabel || 'Learn more'}
      </a>
    </aside>
  );
}

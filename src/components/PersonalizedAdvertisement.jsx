import React, { useEffect, useState } from 'react';
import { serveAdvertisement } from '../services/advertisementsService';

const SAFE_POSITIONS = [
  { name: 'top-left', style: { top: '12%', left: '8%' } },
  { name: 'top-right', style: { top: '12%', right: '8%' } },
  { name: 'middle-left', style: { top: '38%', left: '10%' } },
  { name: 'middle-right', style: { top: '36%', right: '10%' } },
  { name: 'bottom-left', style: { bottom: '12%', left: '12%' } },
  { name: 'bottom-right', style: { bottom: '12%', right: '12%' } },
];

function profileContext(placement) {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    profileTags: JSON.parse(localStorage.getItem('advertisementProfileTags') || '[]'),
    profile: {
      name: [localStorage.getItem('userFirstName'), localStorage.getItem('userLastName')].filter(Boolean).join(' '),
    },
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    placement,
    deviceType: window.matchMedia('(max-width: 720px)').matches ? 'mobile' : window.matchMedia('(max-width: 1180px)').matches ? 'tablet' : 'desktop',
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

export default function PersonalizedAdvertisement({ isLoggedIn }) {
  const [advertisement, setAdvertisement] = useState(null);
  const [closed, setClosed] = useState(false);
  const [positionIndex, setPositionIndex] = useState(0);
  const position = SAFE_POSITIONS[positionIndex];

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || !localStorage.getItem('token')) {
      setAdvertisement(null);
      return () => { cancelled = true; };
    }
    const nextPosition = Math.floor(Math.random() * SAFE_POSITIONS.length);
    setPositionIndex(nextPosition);
    serveAdvertisement(profileContext(SAFE_POSITIONS[nextPosition].name))
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
      style={{ ...position.style, '--ad-opacity': (advertisement.opacity || 82) / 100 }}
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

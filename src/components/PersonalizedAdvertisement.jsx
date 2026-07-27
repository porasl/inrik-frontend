import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { recordAdvertisementImpression, serveAdvertisement } from '../services/advertisementsService';
import { observeApproximateLocation } from '../services/userProfilingService';

const SAFE_POSITIONS = [
  { name: 'top-left', style: { top: '12%', left: '8%' } },
  { name: 'top-right', style: { top: '12%', right: '8%' } },
  { name: 'middle-left', style: { top: '38%', left: '10%' } },
  { name: 'middle-right', style: { top: '36%', right: '10%' } },
  { name: 'bottom-left', style: { bottom: '12%', left: '12%' } },
  { name: 'bottom-right', style: { bottom: '12%', right: '12%' } },
];
const LOCATION_WAIT_MS = 1200;

function locationWithTimeout() {
  return Promise.race([
    observeApproximateLocation().catch((error) => {
      console.warn('Approximate location could not be recorded:', error.message);
      return null;
    }),
    new Promise((resolve) => globalThis.setTimeout(() => resolve(null), LOCATION_WAIT_MS)),
  ]);
}

function getSessionId() {
  const key = 'advertisementSessionId';
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, value);
  }
  return value;
}

function profileContext(placement, content, location) {
  let profileTags = [];
  try {
    profileTags = JSON.parse(localStorage.getItem('advertisementProfileTags') || '[]');
  } catch {
    profileTags = [];
  }
  return {
    countryCode: location?.countryCode || '',
    country: location?.country || '',
    region: location?.region || '',
    city: location?.city || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    profileTags: Array.isArray(profileTags) ? profileTags : [],
    profile: {
      name: [localStorage.getItem('userFirstName'), localStorage.getItem('userLastName')].filter(Boolean).join(' '),
    },
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    placement,
    sessionId: getSessionId(),
    contentId: content.id,
    contentTitle: content.title,
    contentDescription: content.description,
    contentCategories: content.categories,
    deviceType: window.matchMedia('(max-width: 720px)').matches ? 'mobile' : window.matchMedia('(max-width: 1180px)').matches ? 'tablet' : 'desktop',
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

export default function PersonalizedAdvertisement({
  isLoggedIn,
  placement = 'page',
  contentId = '',
  contentTitle = '',
  contentDescription = '',
  contentCategories = [],
  embedded = false,
  variant = 'popup',
  onDismiss,
}) {
  const [advertisement, setAdvertisement] = useState(null);
  const [deliveryContext, setDeliveryContext] = useState(null);
  const [closed, setClosed] = useState(false);
  const [positionIndex, setPositionIndex] = useState(0);
  const popupRef = useRef(null);
  const impressionKeyRef = useRef('');
  const impressionRecordedRef = useRef(false);
  const position = SAFE_POSITIONS[positionIndex];
  const dismiss = () => {
    setClosed(true);
    onDismiss?.();
  };

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || !localStorage.getItem('token')) {
      setAdvertisement(null);
      return () => { cancelled = true; };
    }
    setAdvertisement(null);
    setDeliveryContext(null);
    setClosed(false);
    impressionRecordedRef.current = false;
    impressionKeyRef.current = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextPosition = Math.floor(Math.random() * SAFE_POSITIONS.length);
    setPositionIndex(nextPosition);
    const placementName = `${placement}:${SAFE_POSITIONS[nextPosition].name}`;
    locationWithTimeout()
      .then((location) => {
        const context = profileContext(placementName, {
        id: contentId,
        title: contentTitle,
        description: contentDescription,
        categories: contentCategories,
        }, location);
        return serveAdvertisement(context).then((item) => ({ item, context }));
      })
      .then(({ item, context }) => {
        if (!cancelled) {
          setAdvertisement(item);
          setDeliveryContext(context);
          setClosed(false);
        }
      })
      .catch((error) => console.warn('Advertisement delivery failed:', error.message));
    return () => { cancelled = true; };
  }, [isLoggedIn, placement, contentId, contentTitle, contentDescription, JSON.stringify(contentCategories)]);

  useEffect(() => {
    if (!advertisement || !deliveryContext || closed || !popupRef.current || impressionRecordedRef.current) return;
    const element = popupRef.current;
    const timer = globalThis.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const style = globalThis.getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0
        && rect.top < globalThis.innerHeight && rect.left < globalThis.innerWidth
        && style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0;
      if (!visible || impressionRecordedRef.current) return;
      impressionRecordedRef.current = true;
      recordAdvertisementImpression(
        advertisement.id, impressionKeyRef.current, deliveryContext,
      ).catch((error) => {
        impressionRecordedRef.current = false;
        console.warn('Advertisement impression could not be recorded:', error.message);
      });
    }, 600);
    return () => globalThis.clearTimeout(timer);
  }, [advertisement, deliveryContext, closed]);

  if (!advertisement || closed) return null;
  const isFeedCard = variant === 'feed-card';
  const isPreRoll = variant === 'pre-roll';
  const popup = (
    <aside
      ref={popupRef}
      className={[
        'personalized-ad',
        `personalized-ad--${advertisement.templateId || 'transparent-popup'}`,
        embedded ? 'personalized-ad--embedded' : '',
        isFeedCard ? 'personalized-ad--feed-card' : '',
        isPreRoll ? 'personalized-ad--pre-roll' : '',
      ].filter(Boolean).join(' ')}
      style={{ ...position.style, '--ad-opacity': (advertisement.opacity || 82) / 100 }}
      aria-label="Sponsored advertisement"
    >
      <button type="button" className="personalized-ad__close" aria-label="Close advertisement" onClick={dismiss}>×</button>
      <span>Sponsored</span>
      <strong>{advertisement.headline}</strong>
      {advertisement.message && <p>{advertisement.message}</p>}
      <a href={advertisement.destination} target="_blank" rel="noopener noreferrer">
        {advertisement.buttonLabel || 'Learn more'}
      </a>
      {isPreRoll && <button type="button" className="personalized-ad__continue" onClick={dismiss}>Continue to video</button>}
    </aside>
  );
  return embedded || isFeedCard ? popup : createPortal(popup, document.body);
}

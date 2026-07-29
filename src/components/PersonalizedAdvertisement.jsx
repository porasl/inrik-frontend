import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  recordAdvertisementClick, recordAdvertisementImpression, serveAdvertisement,
} from '../services/advertisementsService';
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
const RECENT_ADVERTISEMENTS_KEY = 'recentAdvertisementIds';
const RECENT_ADVERTISEMENTS_LIMIT = 5;

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

function recentAdvertisementIds() {
  try {
    const values = JSON.parse(sessionStorage.getItem(RECENT_ADVERTISEMENTS_KEY) || '[]');
    return Array.isArray(values) ? values.filter(Boolean).slice(0, RECENT_ADVERTISEMENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberAdvertisement(id) {
  if (!id) return;
  const values = recentAdvertisementIds().filter((value) => value !== id);
  sessionStorage.setItem(
    RECENT_ADVERTISEMENTS_KEY,
    JSON.stringify([id, ...values].slice(0, RECENT_ADVERTISEMENTS_LIMIT)),
  );
}

function browserLocation() {
  const language = navigator.language || '';
  let countryCode = '';
  try {
    countryCode = new Intl.Locale(language).region || '';
  } catch {
    const candidate = language.split(/[-_]/).at(-1) || '';
    countryCode = candidate.length === 2 ? candidate.toUpperCase() : '';
  }
  let country = countryCode;
  try {
    country = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
  } catch {
    country = countryCode;
  }
  return { countryCode, country };
}

function profileContext(placement, content, location, authenticated) {
  const approximateLocation = location || browserLocation();
  let profileTags = [];
  if (authenticated) {
    try {
      profileTags = JSON.parse(localStorage.getItem('advertisementProfileTags') || '[]');
    } catch {
      profileTags = [];
    }
  }
  return {
    countryCode: approximateLocation?.countryCode || '',
    country: approximateLocation?.country || '',
    region: approximateLocation?.region || '',
    city: approximateLocation?.city || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    profileTags: Array.isArray(profileTags) ? profileTags : [],
    profile: authenticated ? {
      name: [localStorage.getItem('userFirstName'), localStorage.getItem('userLastName')].filter(Boolean).join(' '),
    } : {},
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
    excludedAdvertisementIds: recentAdvertisementIds(),
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
  const isMediaPlacement = ['video', 'slice-video', 'image'].includes(placement);
  const [advertisement, setAdvertisement] = useState(null);
  const [deliveryContext, setDeliveryContext] = useState(null);
  const [closed, setClosed] = useState(false);
  const [positionIndex, setPositionIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const popupRef = useRef(null);
  const impressionKeyRef = useRef('');
  const impressionRecordedRef = useRef(false);
  const impressionPromiseRef = useRef(null);
  const position = SAFE_POSITIONS[positionIndex];
  const dismiss = () => {
    setClosed(true);
    onDismiss?.();
  };

  useEffect(() => {
    let cancelled = false;
    const authenticated = Boolean(isLoggedIn && localStorage.getItem('token'));
    setAdvertisement(null);
    setDeliveryContext(null);
    setClosed(false);
    setVideoOpen(false);
    impressionRecordedRef.current = false;
    impressionPromiseRef.current = null;
    impressionKeyRef.current = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextPosition = Math.floor(Math.random() * SAFE_POSITIONS.length);
    setPositionIndex(nextPosition);
    const placementName = `${placement}:${isMediaPlacement ? 'bottom' : SAFE_POSITIONS[nextPosition].name}`;
    locationWithTimeout()
      .then((location) => {
        const context = profileContext(placementName, {
        id: contentId,
        title: contentTitle,
        description: contentDescription,
        categories: contentCategories,
        }, location, authenticated);
        return serveAdvertisement(context).then((item) => ({ item, context }));
      })
      .then(({ item, context }) => {
        if (!cancelled) {
          rememberAdvertisement(item?.id);
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
      impressionPromiseRef.current = recordAdvertisementImpression(
        advertisement.id, impressionKeyRef.current, deliveryContext,
      ).catch((error) => {
        impressionRecordedRef.current = false;
        impressionPromiseRef.current = null;
        console.warn('Advertisement impression could not be recorded:', error.message);
        throw error;
      });
    }, 600);
    return () => globalThis.clearTimeout(timer);
  }, [advertisement, deliveryContext, closed]);

  if (!advertisement || closed) return null;
  const isFeedCard = variant === 'feed-card';
  const isPreRoll = variant === 'pre-roll';
  const hasMedia = Boolean(advertisement.mediaUrl && ['IMAGE', 'VIDEO'].includes(advertisement.mediaType));
  const recordClick = () => {
    if (!impressionPromiseRef.current) {
      impressionRecordedRef.current = true;
      impressionPromiseRef.current = recordAdvertisementImpression(
        advertisement.id, impressionKeyRef.current, deliveryContext,
      );
    }
    impressionPromiseRef.current
      .then(() => recordAdvertisementClick(advertisement.id, impressionKeyRef.current))
      .catch((error) => console.warn('Advertisement click could not be recorded:', error.message));
  };
  const popup = (
    <aside
      ref={popupRef}
      className={[
        'personalized-ad',
        `personalized-ad--${advertisement.templateId || 'transparent-popup'}`,
        embedded ? 'personalized-ad--embedded' : '',
        isMediaPlacement ? 'personalized-ad--media-overlay' : '',
        placement === 'slice-video' ? 'personalized-ad--slice-overlay' : '',
        placement === 'image' ? 'personalized-ad--image-overlay' : '',
        'personalized-ad--has-media',
        isFeedCard ? 'personalized-ad--feed-card' : '',
        isPreRoll ? 'personalized-ad--pre-roll' : '',
      ].filter(Boolean).join(' ')}
      style={{ ...(isMediaPlacement ? {} : position.style), '--ad-opacity': (advertisement.opacity || 82) / 100 }}
      aria-label="Advertisement popup"
    >
      <div className="personalized-ad__layout">
        <div className="personalized-ad__copy">
          {advertisement.message && <p>{advertisement.message}</p>}
        </div>
        <div className="personalized-ad__media-column">
          <a
            className="personalized-ad__media-link"
            href={advertisement.destination || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open advertisement destination"
            onClick={(event) => {
              event.stopPropagation();
              recordClick();
              if (advertisement.mediaType === 'VIDEO' && advertisement.mediaUrl) {
                event.preventDefault();
                setVideoOpen(true);
              }
            }}
          >
            {advertisement.mediaType === 'IMAGE' && advertisement.mediaUrl && (
              <img className="personalized-ad__media" src={advertisement.mediaUrl} alt="Advertisement" />
            )}
            {advertisement.mediaType === 'VIDEO' && advertisement.mediaUrl && (
              <video className="personalized-ad__media" src={advertisement.mediaUrl} muted loop autoPlay playsInline preload="metadata" />
            )}
            {!hasMedia && (
              <span className="personalized-ad__media-placeholder" aria-hidden="true">
                <img src="/resources/images/advertisement-placeholder.svg" alt="" />
              </span>
            )}
          </a>
          <button
            type="button"
            className="personalized-ad__close"
            aria-label="Close advertisement"
            onClick={(event) => {
              event.stopPropagation();
              dismiss();
            }}
          >
            ×
          </button>
        </div>
      </div>
      {isPreRoll && <button type="button" className="personalized-ad__continue" onClick={dismiss}>Continue to video</button>}
      {videoOpen && createPortal(
        <div className="advertising-video-modal" role="presentation" onMouseDown={() => setVideoOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="Advertisement video" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Close advertisement video" onClick={() => setVideoOpen(false)}>×</button>
            <video src={advertisement.mediaUrl} controls autoPlay playsInline />
          </section>
        </div>,
        document.body,
      )}
    </aside>
  );
  return embedded || isFeedCard ? popup : createPortal(popup, document.body);
}

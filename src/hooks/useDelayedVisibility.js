import { useEffect, useRef, useState } from 'react';

export default function useDelayedVisibility(active, options = {}) {
  const {
    showDelayMs = 180,
    minVisibleMs = 500,
  } = options;

  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const shownAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (active) {
      if (visible) return;
      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        shownAtRef.current = Date.now();
      }, showDelayMs);
      return;
    }

    if (!visible) return;

    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, remaining);
  }, [active, visible, showDelayMs, minVisibleMs]);

  return visible;
}

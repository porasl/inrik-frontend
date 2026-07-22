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
  const [resultBlob, setResultBlob] = useState(null);
  const [resultDownloadUrl, setResultDownloadUrl] = useState('');
  const [resultMediaType, setResultMediaType] = useState('image/png');
  const [operation, setOperation] = useState('colorize');
  const [animationPreset, setAnimationPreset] = useState('gentle_alive');
  const [animationFormat, setAnimationFormat] = useState('gif');
  const [animationDuration, setAnimationDuration] = useState(4);
  const [speechText, setSpeechText] = useState('');
  const [speechVoice, setSpeechVoice] = useState('samantha');
  const [speechRate, setSpeechRate] = useState(145);
  const [speechStyle, setSpeechStyle] = useState('gentle');
  const [lipSyncModel, setLipSyncModel] = useState('audio_reactive');
  const [speakingMotion, setSpeakingMotion] = useState('gentle_body');
  const [motionSource, setMotionSource] = useState(() => localStorage.getItem('imageStudio.motionSource') || 'built_in');
  const [savedMotions, setSavedMotions] = useState([]);
  const [selectedMotionId, setSelectedMotionId] = useState(() => localStorage.getItem('imageStudio.motionId') || '');
  const [movementName, setMovementName] = useState('');
  const [drivingVideo, setDrivingVideo] = useState(null);
  const [savingMovement, setSavingMovement] = useState(false);
  const [scale, setScale] = useState('2');
  const [restoreFaces, setRestoreFaces] = useState(false);
  const [colorModel, setColorModel] = useState('artistic');
  const [neutralizeAgedTint, setNeutralizeAgedTint] = useState(true);
  const [repairScratches, setRepairScratches] = useState(false);
  const [autoRepair, setAutoRepair] = useState(true);
  const [autoUpscale, setAutoUpscale] = useState(true);
  const [scanSummary, setScanSummary] = useState('');
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [resultBinocularEnabled, setResultBinocularEnabled] = useState(false);
  const [resultZoom, setResultZoom] = useState(2.5);
  const [resultLensVisible, setResultLensVisible] = useState(false);
  const [resultLensPosition, setResultLensPosition] = useState({ x: 0, y: 0, rectW: 0, rectH: 0 });
  const [resultExpanded, setResultExpanded] = useState(false);
  const [editorSharpness, setEditorSharpness] = useState(0);
  const [editorShadows, setEditorShadows] = useState(0);
  const [editorZoom, setEditorZoom] = useState(1);
  const [editorRendering, setEditorRendering] = useState(false);
  const resultImageRef = useRef(null);
  const editorCanvasRef = useRef(null);
  const isTalkingOperation = operation === 'talking' || operation === 'both_talking';
  const isAnimationOperation = operation === 'animate' || operation === 'both_animate' || isTalkingOperation;
  const effectiveAnimationFormat = isTalkingOperation ? 'mp4' : animationFormat;
  const directResultDownloadUrl = resultDownloadUrl
    ? `${globalThis.location.protocol}//${globalThis.location.hostname}:8083${resultDownloadUrl.replace(/^\/content-tools/, '')}`
    : '';

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const ensureAccessToken = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (currentToken) return currentToken;
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return '';
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh-token`, {
        method: 'POST', headers: { Authorization: `Bearer ${refreshToken}` },
      });
      if (!response.ok) return '';
      const data = await response.json();
      const accessToken = data?.access_token || data?.accessToken || data?.token || data?.jwt || '';
      if (!accessToken) return '';
      localStorage.setItem('token', accessToken);
      const replacementRefreshToken = data?.refresh_token || data?.refreshToken;
      if (replacementRefreshToken) localStorage.setItem('refresh_token', replacementRefreshToken);
      return accessToken;
    } catch {
      return '';
    }
  }, []);

  const loadSavedMotions = useCallback(async () => {
    try {
      const response = await fetch('/content-tools/contentservices/api/motions', { headers: authHeaders() });
      if (response.ok) setSavedMotions(await response.json());
    } catch {
      // The built-in motions remain usable while ContentService is unavailable.
    }
  }, [authHeaders]);

  useEffect(() => { loadSavedMotions(); }, [loadSavedMotions]);
  useEffect(() => { localStorage.setItem('imageStudio.motionSource', motionSource); }, [motionSource]);
  useEffect(() => {
    if (selectedMotionId) localStorage.setItem('imageStudio.motionId', selectedMotionId);
  }, [selectedMotionId]);

  const apiError = (details, fallback) => {
    if (!details) return fallback;
    if (typeof details.detail === 'string') return details.detail;
    if (Array.isArray(details.detail)) return details.detail.map((item) => item.msg || JSON.stringify(item)).join('; ');
    if (typeof details.message === 'string') return details.message;
    return fallback;
  };

  const saveMovement = async ({ propagate = false } = {}) => {
    if (!drivingVideo) {
      setError('Choose a short driving video first.');
      return;
    }
    const resolvedMovementName = movementName.trim()
      || drivingVideo.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ').trim()
      || 'My movement';
    setSavingMovement(true);
    setError('');
    try {
      const accessToken = await ensureAccessToken();
      const extractionBody = new FormData();
      extractionBody.append('driving_video', drivingVideo);
      const extractionResponse = await fetch('/content-tools/contentservices/api/image-studio/motions/extract', { method: 'POST', body: extractionBody });
      if (!extractionResponse.ok) {
        const details = await extractionResponse.json().catch(() => null);
        throw new Error(apiError(details, `Movement extraction failed (${extractionResponse.status})`));
      }
      const template = await extractionResponse.blob();
      const storageBody = new FormData();
      storageBody.append('name', resolvedMovementName);
      storageBody.append('durationSeconds', '0');
      storageBody.append('template', template, 'motion-template.pkl');
      const storageResponse = await fetch('/content-tools/contentservices/api/motions', {
        method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, body: storageBody,
      });
      if (!storageResponse.ok) {
        if (storageResponse.status === 401) {
          throw new Error('Movement storage authentication failed. Refresh the page and try again.');
        }
        const details = await storageResponse.json().catch(() => null);
        throw new Error(apiError(details, `Could not save movement (${storageResponse.status})`));
      }
      const saved = await storageResponse.json();
      // Show the newly persisted movement immediately. The background list
      // refresh remains useful, but a slow/unavailable second request should
      // never make a successful save look missing from the dropdown.
      setSavedMotions((previous) => [saved, ...previous.filter((motion) => String(motion.id) !== String(saved.id))]);
      setMotionSource('saved');
      setSelectedMotionId(String(saved.id));
      await loadSavedMotions();
      setMovementName('');
      setDrivingVideo(null);
      setScanSummary(`Saved “${saved.name}” to My Movements.`);
      return { saved, template };
    } catch (saveError) {
      setError(saveError.message || 'Could not save movement.');
      if (propagate) throw saveError;
      return null;
    } finally {
      setSavingMovement(false);
    }
  };

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
    setResultBlob(null);
    setResultMediaType('image/png');
  };

  const processImage = async () => {
    if (!file) {
      setError('Drop or choose an image first.');
      return;
    }
    setProcessing(true);
    setError('');
    setResultDownloadUrl('');
    const body = new FormData();
    body.append('file', file);
    if (isAnimationOperation) {
      body.append('preset', isTalkingOperation ? 'talking' : animationPreset);
      body.append('output_format', effectiveAnimationFormat);
      body.append('duration', String(animationDuration));
      body.append('fps', '10');
      if (isTalkingOperation) {
        body.append('speech_text', speechText.trim());
        body.append('speech_voice', speechVoice);
        body.append('speech_rate', String(speechRate));
        body.append('speech_style', speechStyle);
        body.append('lip_sync_model', lipSyncModel);
        body.append('speaking_motion', speakingMotion);
      }
    } else {
      body.append('operation', operation);
    }
    body.append('scale', scale);
    body.append('restore_faces', String(restoreFaces));
    body.append('color_model', colorModel);
    body.append('neutralize_aged_tint', String(neutralizeAgedTint));
    body.append('repair_scratches', String(repairScratches));
    body.append('auto_repair', String(autoRepair));
    body.append('auto_upscale', String(autoUpscale));
    try {
      // An uploaded driving video is automatically extracted and persisted as
      // part of the first animation run. Reuse the extracted Blob immediately
      // so the user never has to upload the same template again.
      const autoSavedMotion = isAnimationOperation && drivingVideo
        ? await saveMovement({ propagate: true })
        : null;
      let requestBody = body;
      let endpoint = isAnimationOperation
        ? '/content-tools/contentservices/api/image-studio/images/animate'
        : '/content-tools/contentservices/api/image-studio/images/process';
      if (operation === 'both_animate' || operation === 'both_talking') {
        const restorationBody = new FormData();
        restorationBody.append('file', file);
        restorationBody.append('operation', 'both');
        restorationBody.append('scale', scale);
        restorationBody.append('restore_faces', String(restoreFaces));
        restorationBody.append('color_model', colorModel);
        restorationBody.append('neutralize_aged_tint', String(neutralizeAgedTint));
        restorationBody.append('repair_scratches', String(repairScratches));
        restorationBody.append('auto_repair', String(autoRepair));
        restorationBody.append('auto_upscale', String(autoUpscale));
        const restorationResponse = await fetch('/content-tools/contentservices/api/image-studio/images/process', { method: 'POST', body: restorationBody });
        if (!restorationResponse.ok) {
          const details = await restorationResponse.json().catch(() => null);
          throw new Error(apiError(details, `Enhancement and colorization failed (${restorationResponse.status})`));
        }
        const restoredImage = await restorationResponse.blob();
        requestBody = new FormData();
        requestBody.append('file', restoredImage, 'enhanced-colorized-image.png');
        requestBody.append('preset', isTalkingOperation ? 'talking' : animationPreset);
        requestBody.append('output_format', effectiveAnimationFormat);
        requestBody.append('duration', String(animationDuration));
        requestBody.append('fps', '10');
        if (isTalkingOperation) {
          requestBody.append('speech_text', speechText.trim());
          requestBody.append('speech_voice', speechVoice);
          requestBody.append('speech_rate', String(speechRate));
          requestBody.append('speech_style', speechStyle);
          requestBody.append('lip_sync_model', lipSyncModel);
          requestBody.append('speaking_motion', speakingMotion);
        }
        endpoint = '/content-tools/contentservices/api/image-studio/images/animate';
      }
      if (autoSavedMotion?.template) {
        requestBody.append('motion_template', autoSavedMotion.template, 'saved-motion.pkl');
      } else if (isAnimationOperation && motionSource === 'saved') {
        const selectedMotion = savedMotions.find((motion) => String(motion.id) === String(selectedMotionId));
        if (!selectedMotion) throw new Error('Select a movement from My Movements.');
        const accessToken = await ensureAccessToken();
        const templateResponse = await fetch(selectedMotion.fileUrl, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
        if (!templateResponse.ok) throw new Error(`Could not load saved movement (${templateResponse.status})`);
        const template = await templateResponse.blob();
        requestBody.append('motion_template', template, 'saved-motion.pkl');
      }
      const response = await fetch(endpoint, { method: 'POST', body: requestBody });
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(apiError(details, `Image ${isAnimationOperation ? 'animation' : 'processing'} failed (${response.status})`));
      }
      const blob = await response.blob();
      setResultBlob(blob);
      setResultDownloadUrl(response.headers.get('X-Image-Studio-Download') || '');
      setResultMediaType(blob.type || (effectiveAnimationFormat === 'gif' ? 'image/gif' : 'video/mp4'));
      if (isAnimationOperation) {
        setScanSummary(isTalkingOperation ? `${operation === 'both_talking' ? 'Enhanced, colorized and animated talking portrait' : 'Talking portrait'} ready with embedded speech audio.` : `${operation === 'both_animate' ? 'Enhanced, colorized and animated' : 'Animation ready'}: ${animationPreset.replaceAll('_', ' ')}, ${animationDuration}s, ${effectiveAnimationFormat.toUpperCase()}.`);
      } else {
      const scratchesDetected = response.headers.get('X-Image-Scratches-Detected') === 'true';
      const scratchRepairApplied = response.headers.get('X-Image-Scratch-Repair-Applied') === 'true';
      const sharpenApplied = response.headers.get('X-Image-Sharpen-Applied') === 'true';
      const blurScore = response.headers.get('X-Image-Blur-Score');
      const autoUpscaleApplied = response.headers.get('X-Image-Auto-Upscale-Applied') === 'true';
      setScanSummary(`Scan: ${scratchesDetected ? 'scratches detected' : 'no safe scratch mask'}; ${scratchRepairApplied ? 'scratch repair applied' : 'scratch repair skipped'}; ${sharpenApplied ? 'sharpening applied' : 'sharpening skipped'}; ${autoUpscaleApplied ? 'automatic 2x AI upscale applied' : 'automatic upscale skipped'}${blurScore ? ` (blur score ${blurScore})` : ''}.`);
      }
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

  const downloadResult = () => {
    if (!resultBlob || downloading) return;
    const normalizedType = (resultBlob.type || '').split(';', 1)[0].toLowerCase();
    const extension = normalizedType === 'video/mp4'
      ? 'mp4'
      : (normalizedType === 'image/gif' ? 'gif' : 'png');
    const filename = extension === 'png' ? 'processed-image.png' : `animated-portrait.${extension}`;
    setDownloading(true);
    try {
      if (resultDownloadUrl) {
        const link = document.createElement('a');
        link.href = resultDownloadUrl;
        link.download = filename;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setScanSummary((previous) => `${previous ? `${previous} ` : ''}Download started from ContentServices: ${filename}.`);
        return;
      }
      const downloadUrl = URL.createObjectURL(resultBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Some browsers consume Blob URLs asynchronously after the synthetic
      // click. Keep it alive long enough for large MP4 files to finish.
      globalThis.setTimeout(() => URL.revokeObjectURL(downloadUrl), 300000);
      setScanSummary((previous) => `${previous ? `${previous} ` : ''}Download started: ${filename}.`);
    } catch (downloadError) {
      setError(downloadError.message || 'Could not start the download.');
    } finally {
      setDownloading(false);
    }
  };

  const moveResultLens = (event) => {
    if (!resultBinocularEnabled) return;
    const rect = resultImageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setResultLensPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      rectW: rect.width,
      rectH: rect.height,
    });
    setResultLensVisible(true);
  };

  useEffect(() => {
    if (!resultExpanded || !resultUrl) return undefined;
    let cancelled = false;
    const timer = globalThis.setTimeout(() => {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const canvas = editorCanvasRef.current;
        const context = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !context) return;
        setEditorRendering(true);
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0);

        if (editorShadows !== 0 || editorSharpness !== 0) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = pixels.data;

          if (editorShadows !== 0) {
            for (let index = 0; index < data.length; index += 4) {
              const luminance = (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
              const shadowWeight = (1 - luminance) ** 2;
              const adjustment = editorShadows * 0.8 * shadowWeight;
              data[index] = Math.max(0, Math.min(255, data[index] + adjustment));
              data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + adjustment));
              data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + adjustment));
            }
          }

          if (editorSharpness > 0 && canvas.width > 2 && canvas.height > 2) {
            const source = new Uint8ClampedArray(data);
            const amount = (editorSharpness / 100) * 1.15;
            const rowBytes = canvas.width * 4;
            for (let y = 1; y < canvas.height - 1; y += 1) {
              for (let x = 1; x < canvas.width - 1; x += 1) {
                const index = y * rowBytes + x * 4;
                for (let channel = 0; channel < 3; channel += 1) {
                  const center = source[index + channel];
                  const neighbors = source[index - 4 + channel] + source[index + 4 + channel]
                    + source[index - rowBytes + channel] + source[index + rowBytes + channel];
                  data[index + channel] = Math.max(0, Math.min(255, center + amount * (4 * center - neighbors)));
                }
              }
            }
          }
          context.putImageData(pixels, 0, 0);
        }
        setEditorRendering(false);
      };
      image.src = resultUrl;
    }, 90);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [resultExpanded, resultUrl, editorSharpness, editorShadows]);

  const resetResultEditor = () => {
    setEditorSharpness(0);
    setEditorShadows(0);
    setEditorZoom(1);
  };

  const openResultEditor = () => {
    setResultExpanded(true);
  };

  const saveEditedResult = () => {
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'edited-colorized-image.png';
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(4,12,24,.72)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div className="bg-white rounded-4 shadow-lg p-3 p-md-4" onClick={(event) => event.stopPropagation()} style={{ width: 'min(960px, 100%)', maxHeight: '94vh', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h4 className="mb-1 fw-bold"><i className="bi bi-stars me-2 text-primary" />AI Image Studio</h4>
            <p className="text-secondary mb-0 small">Colorize, restore, upscale or animate a portrait and save it as GIF or MP4.</p>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close image studio" />
        </div>

        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
        {!file ? (
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
          </div>
        ) : (
          <div className="d-flex align-items-center justify-content-between gap-3 rounded-3 border bg-light px-3 py-2 mb-3">
            <div className="text-truncate small"><i className="bi bi-check-circle-fill text-success me-2" /><span className="fw-semibold">Image selected:</span> {file.name}</div>
            <button type="button" className="btn btn-sm btn-outline-primary flex-shrink-0" onClick={() => inputRef.current?.click()}>
              <i className="bi bi-arrow-repeat me-1" />Change image
            </button>
          </div>
        )}

        {inputUrl && (
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="small text-secondary fw-semibold mb-1">Original</div>
              <img src={inputUrl} alt="Original upload" className="w-100 rounded-3 bg-dark" style={{ height: 320, objectFit: 'contain' }} />
            </div>
            <div className="col-md-6">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                <div className="small text-secondary fw-semibold">Result</div>
                {resultUrl && !isAnimationOperation && (
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${resultBinocularEnabled ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => { setResultBinocularEnabled((enabled) => !enabled); setResultLensVisible(false); }}
                      title="Toggle binocular zoom"
                      aria-pressed={resultBinocularEnabled}
                    >
                      <i className="bi bi-binoculars-fill" />
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={openResultEditor} title="Edit and enlarge result">
                      <i className="bi bi-sliders me-1" />Edit
                    </button>
                    {resultBinocularEnabled && (
                      <>
                        <input
                          type="range"
                          min="1.5"
                          max="6"
                          step="0.5"
                          value={resultZoom}
                          onChange={(event) => setResultZoom(Number(event.target.value))}
                          aria-label="Result binocular zoom level"
                          style={{ width: 92, accentColor: '#0d6efd' }}
                        />
                        <span className="small text-secondary" style={{ minWidth: 28 }}>{resultZoom}x</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              {resultUrl ? (resultMediaType === 'video/mp4' ? (
                <video src={resultUrl} className="w-100 rounded-3 bg-dark" style={{ height: 320, objectFit: 'contain' }} autoPlay loop muted controls />
              ) : (
                <div
                  className="position-relative rounded-3 bg-dark overflow-hidden"
                  style={{ height: 320, cursor: 'zoom-in' }}
                  onMouseMove={moveResultLens}
                  onMouseLeave={() => setResultLensVisible(false)}
                  onClick={() => { if (!isAnimationOperation) openResultEditor(); }}
                  title={isAnimationOperation ? 'Animated GIF preview' : 'Click to edit and enlarge'}
                >
                  <img ref={resultImageRef} src={resultUrl} alt="Processed result" className="w-100 h-100" style={{ objectFit: 'contain' }} />
                  {resultBinocularEnabled && resultLensVisible && (
                    <BinocularLens imageUrl={resultUrl} position={resultLensPosition} zoom={resultZoom} />
                  )}
                  {!isAnimationOperation && <span className="position-absolute bottom-0 end-0 m-2 badge text-bg-dark opacity-75"><i className="bi bi-sliders me-1" />Edit &amp; enlarge</span>}
                </div>
              )) : (
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
              <option value="animate">Animate portrait</option>
              <option value="both_animate">Enhance + Colorize + Animate</option>
              <option value="talking">Talking portrait — read text</option>
              <option value="both_talking">Enhance + Colorize + Read text</option>
            </select>
          </div>
          {isAnimationOperation && (
            <>
              {!isTalkingOperation && <div>
                <label className="form-label small fw-semibold mb-1">Movement source</label>
                <select className="form-select" value={motionSource} onChange={(event) => setMotionSource(event.target.value)}>
                  <option value="built_in">Built-in movement</option>
                  <option value="saved">My Movements</option>
                </select>
              </div>}
              {!isTalkingOperation && (motionSource === 'built_in' ? <div>
                <label className="form-label small fw-semibold mb-1">Built-in movement</label>
                <select className="form-select" value={animationPreset} onChange={(event) => setAnimationPreset(event.target.value)}>
                  <option value="gentle_alive">Gentle continuous life — combined</option>
                  <option value="smile">Smile</option>
                  <option value="blink">Blink</option>
                  <option value="wink">Wink</option>
                  <option value="turn_left">Turn head left</option>
                  <option value="turn_right">Turn head right</option>
                  <option value="nod">Nod head</option>
                  <option value="smile_nod">Smile and nod</option>
                  <option value="look_around">Look around</option>
                  <option value="gentle_sway">Smile + gentle body sway</option>
                </select>
              </div> : <div>
                <label className="form-label small fw-semibold mb-1">Saved movement</label>
                <select className="form-select" value={selectedMotionId} onChange={(event) => setSelectedMotionId(event.target.value)}>
                  <option value="">Select movement…</option>
                  {savedMotions.map((motion) => <option key={motion.id} value={motion.id}>{motion.name}</option>)}
                </select>
              </div>)}
              {!isTalkingOperation && <div>
                <label className="form-label small fw-semibold mb-1">Save as</label>
                <select className="form-select" value={animationFormat} onChange={(event) => setAnimationFormat(event.target.value)}>
                  <option value="gif">Animated GIF</option>
                  <option value="mp4">MP4 video</option>
                </select>
              </div>}
              {!isTalkingOperation && <div>
                <label className="form-label small fw-semibold mb-1">Duration</label>
                <select className="form-select" value={animationDuration} onChange={(event) => setAnimationDuration(Number(event.target.value))}>
                  <option value="1.5">1.5 seconds</option>
                  <option value="2">2 seconds</option>
                  <option value="3">3 seconds</option>
                  <option value="4">4 seconds</option>
                </select>
              </div>}
            </>
          )}
          {isTalkingOperation && <div className="w-100 border rounded-3 p-3 d-grid gap-3">
            <div>
              <label className="form-label fw-semibold mb-1">1. Upload and save an animation movement</label>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <input className="form-control" style={{ maxWidth: 360 }} value={movementName} maxLength="120" placeholder="Movement name" onChange={(event) => setMovementName(event.target.value)} />
                <input className="form-control" style={{ maxWidth: 420 }} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi" onChange={(event) => setDrivingVideo(event.target.files?.[0] || null)} />
                <button type="button" className="btn btn-outline-primary" disabled={!drivingVideo || savingMovement} onClick={() => saveMovement()}>
                  {savingMovement ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</> : 'Save to My Movements'}
                </button>
              </div>
              <div className="small text-secondary mt-1">Use a short front-facing MP4, MOV, WebM or AVI. It is saved automatically when you create the animation; the Save button is optional.</div>
            </div>
            <div>
              <label className="form-label fw-semibold mb-1">2. Select the movement model</label>
              <div className="d-flex flex-wrap gap-2">
                <select className="form-select" style={{ maxWidth: 240 }} value={motionSource} onChange={(event) => setMotionSource(event.target.value)}>
                  <option value="built_in">Built-in talking movement</option>
                  <option value="saved">My saved movement</option>
                </select>
                {motionSource === 'saved' && <select className="form-select" style={{ maxWidth: 360 }} value={selectedMotionId} onChange={(event) => setSelectedMotionId(event.target.value)}>
                  <option value="">Select movement…</option>
                  {savedMotions.map((motion) => <option key={motion.id} value={motion.id}>{motion.name}</option>)}
                </select>}
              </div>
              <div className="small text-secondary mt-1">Your selection is remembered for the next visit.</div>
            </div>
            <div className="d-flex flex-wrap gap-3">
              <div>
                <label className="form-label fw-semibold mb-1">3. Lip synchronization model</label>
                <select className="form-select" style={{ minWidth: 280 }} value={lipSyncModel} onChange={(event) => setLipSyncModel(event.target.value)}>
                  <option value="audio_reactive">Audio-reactive lips — synchronized</option>
                  <option value="motion_loop">Uploaded/repeated motion — legacy</option>
                </select>
                <div className="small text-secondary mt-1">Audio-reactive follows the speech waveform. Legacy preserves the original repeated movement.</div>
              </div>
              <div>
                <label className="form-label fw-semibold mb-1">Head and body movement</label>
                <select className="form-select" style={{ minWidth: 220 }} value={speakingMotion} onChange={(event) => setSpeakingMotion(event.target.value)}>
                  <option value="still">Still — mouth only</option>
                  <option value="gentle_body">Gentle body motion</option>
                  <option value="head_nod">Head nod</option>
                  <option value="head_sway">Head turn / sway</option>
                </select>
              </div>
            </div>
            <div>
              <label className="form-label fw-semibold mb-1">4. Enter the text to read</label>
              <textarea className="form-control" rows="6" maxLength="10000" value={speechText} placeholder="Enter what the person should read…" onChange={(event) => setSpeechText(event.target.value)} />
              <div className="d-flex justify-content-between mt-1">
                <span className="small text-secondary">Video length follows the complete spoken text.</span>
                <span className="small text-secondary">{speechText.length}/10,000</span>
              </div>
              <div className="d-flex flex-wrap gap-3 mt-2 align-items-end">
                <div>
                  <label className="form-label small fw-semibold mb-1">Reader voice</label>
                  <select className="form-select" style={{ minWidth: 210 }} value={speechVoice} onChange={(event) => setSpeechVoice(event.target.value)}>
                    <option value="samantha">Samantha — US</option>
                    <option value="karen">Karen — Australian</option>
                    <option value="moira">Moira — Irish</option>
                    <option value="tessa">Tessa — South African</option>
                    <option value="alex">Alex — US</option>
                    <option value="daniel">Daniel — British</option>
                  </select>
                </div>
                <div>
                  <label className="form-label small fw-semibold mb-1">Delivery</label>
                  <select className="form-select" value={speechStyle} onChange={(event) => setSpeechStyle(event.target.value)}>
                    <option value="gentle">Gentle, with pauses</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </div>
                <div style={{ minWidth: 260 }}>
                  <label className="form-label small fw-semibold mb-1">Reading speed: {speechRate} words/min</label>
                  <input className="form-range" type="range" min="90" max="240" step="5" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} />
                  <div className="d-flex justify-content-between small text-secondary"><span>Slower</span><span>Faster</span></div>
                </div>
              </div>
              <div className="small text-secondary mt-2">Commas create short pauses; periods and paragraph breaks create longer pauses. Shorter sentences sound more natural.</div>
            </div>
            <div>
              <label className="form-label fw-semibold mb-1">5. Select output format</label>
              <select className="form-select" style={{ maxWidth: 240 }} value="mp4" disabled>
                <option value="mp4">MP4 video with audio</option>
              </select>
              <div className="small text-secondary mt-1">MP4 is required because GIF cannot contain speech audio.</div>
            </div>
          </div>}
          {operation !== 'colorize' && operation !== 'animate' && (
            <div>
              <label className="form-label small fw-semibold mb-1">Enhancement scale</label>
              <select className="form-select" value={scale} onChange={(event) => setScale(event.target.value)}>
                <option value="2">2x</option>
                <option value="4">4x</option>
              </select>
            </div>
          )}
          {operation !== 'enhance' && operation !== 'animate' && (
            <div>
              <label className="form-label small fw-semibold mb-1">Color style</label>
              <select className="form-select" value={colorModel} onChange={(event) => setColorModel(event.target.value)}>
                <option value="artistic">Natural — fewer artifacts</option>
                <option value="modelscope">Vivid — stronger colors</option>
              </select>
            </div>
          )}
          {operation !== 'enhance' && operation !== 'animate' && (
            <div className="form-check align-self-center mt-3">
              <input className="form-check-input" id="neutralize-aged-tint" type="checkbox" checked={neutralizeAgedTint} onChange={(event) => setNeutralizeAgedTint(event.target.checked)} />
              <label className="form-check-label" htmlFor="neutralize-aged-tint">
                Remove aged tint first <span className="text-secondary small">(recommended)</span>
              </label>
            </div>
          )}
          {operation !== 'animate' && <div className="form-check align-self-center mt-3">
            <input className="form-check-input" id="auto-repair" type="checkbox" checked={autoRepair} onChange={(event) => setAutoRepair(event.target.checked)} />
            <label className="form-check-label" htmlFor="auto-repair">
              Automatic damage scan <span className="text-secondary small">(recommended)</span>
            </label>
          </div>}
          {operation === 'colorize' && (
            <div className="form-check align-self-center mt-3">
              <input className="form-check-input" id="auto-upscale" type="checkbox" checked={autoUpscale} onChange={(event) => setAutoUpscale(event.target.checked)} />
              <label className="form-check-label" htmlFor="auto-upscale">
                Auto-upscale low-resolution images <span className="text-secondary small">(2x AI)</span>
              </label>
            </div>
          )}
          {operation !== 'animate' && <div className="form-check align-self-center mt-3">
            <input className="form-check-input" id="repair-scratches" type="checkbox" checked={repairScratches} onChange={(event) => setRepairScratches(event.target.checked)} />
            <label className="form-check-label" htmlFor="repair-scratches">
              Repair scratches + sharpen <span className="text-secondary small">(conservative)</span>
            </label>
          </div>}
          {operation !== 'animate' && <div className="form-check align-self-center mt-3">
            <input className="form-check-input" id="restore-faces" type="checkbox" checked={restoreFaces} onChange={(event) => setRestoreFaces(event.target.checked)} />
            <label className="form-check-label" htmlFor="restore-faces">
              Restore faces <span className="text-secondary small">(may alter identity)</span>
            </label>
          </div>}
          <button className="btn btn-primary px-4" disabled={!file || processing || (isTalkingOperation && (!speechText.trim() || (motionSource === 'saved' && !selectedMotionId && !drivingVideo)))} onClick={processImage}>
            {processing ? <><span className="spinner-border spinner-border-sm me-2" />{operation === 'both_talking' ? 'Enhancing, colorizing & speaking…' : (isAnimationOperation ? 'Animating…' : 'Processing…')}</> : <><i className={`bi ${isAnimationOperation ? 'bi-film' : 'bi-stars'} me-2`} />{operation === 'both_talking' ? 'Create talking portrait' : (isAnimationOperation ? (operation === 'both_animate' ? 'Restore & animate' : 'Animate image') : 'Process image')}</>}
          </button>
          {resultUrl && directResultDownloadUrl && (
            <a
              className="btn btn-outline-secondary"
              href={directResultDownloadUrl}
              download={resultMediaType === 'video/mp4' ? 'animated-portrait.mp4' : 'animated-portrait.gif'}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="bi bi-download me-2" />Download {resultMediaType === 'video/mp4' ? 'MP4' : 'GIF'}
            </a>
          )}
          {resultUrl && !directResultDownloadUrl && <button type="button" className="btn btn-outline-secondary" disabled={downloading} onClick={downloadResult}>{downloading ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</> : <><i className="bi bi-download me-2" />Download {isAnimationOperation ? effectiveAnimationFormat.toUpperCase() : ''}</>}</button>}
        </div>
        {isAnimationOperation && !isTalkingOperation && (
          <details className="border rounded-3 p-3 mt-3">
            <summary className="fw-semibold" style={{ cursor: 'pointer' }}><i className="bi bi-camera-video me-2" />Capture and save a movement</summary>
            <p className="small text-secondary mt-2 mb-2">Upload a short, front-facing video demonstrating the complete movement. It is converted to a reusable private motion template.</p>
            <div className="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label className="form-label small mb-1">Movement name</label>
                <input className="form-control" value={movementName} maxLength="120" placeholder="Smile, look left, then nod" onChange={(event) => setMovementName(event.target.value)} />
              </div>
              <div>
                <label className="form-label small mb-1">Driving video</label>
                <input
                  className="form-control"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi"
                  onChange={(event) => {
                    const selectedVideo = event.target.files?.[0] || null;
                    setDrivingVideo(selectedVideo);
                    if (selectedVideo && !movementName.trim()) {
                      setMovementName(selectedVideo.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' ').trim());
                    }
                  }}
                />
              </div>
              <button type="button" className="btn btn-outline-primary" disabled={savingMovement || !drivingVideo} onClick={saveMovement}>
                {savingMovement ? <><span className="spinner-border spinner-border-sm me-2" />Learning movement…</> : <><i className="bi bi-save me-2" />Save to My Movements</>}
              </button>
            </div>
          </details>
        )}
        {scanSummary && <div className="alert alert-info mt-3 mb-0 py-2 small"><i className="bi bi-activity me-2" />{scanSummary}</div>}
        {error && <div className="alert alert-danger mt-3 mb-0 py-2">{error}</div>}
      </div>
      {resultExpanded && resultUrl && !isAnimationOperation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged processed image"
          onClick={(event) => { event.stopPropagation(); setResultExpanded(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 2300, background: 'rgba(0,0,0,.94)', display: 'flex', flexDirection: 'column', padding: '1rem' }}
        >
          <div
            className="d-flex flex-wrap align-items-center gap-3 text-white rounded-3 p-2 px-3 mb-2 shadow"
            onClick={(event) => event.stopPropagation()}
            style={{ position: 'sticky', top: 0, zIndex: 2, flex: '0 0 auto', minHeight: 52, background: '#151a20', border: '1px solid rgba(255,255,255,.28)' }}
          >
            <strong className="me-2"><i className="bi bi-sliders me-2" />Edit result</strong>
            <label className="d-flex align-items-center gap-2 small">
              Sharpen
              <input type="range" min="0" max="100" step="5" value={editorSharpness} onChange={(event) => setEditorSharpness(Number(event.target.value))} aria-label="Sharpen image" />
              <span style={{ minWidth: 28 }}>{editorSharpness}</span>
            </label>
            <label className="d-flex align-items-center gap-2 small">
              Shadows
              <input type="range" min="-100" max="100" step="5" value={editorShadows} onChange={(event) => setEditorShadows(Number(event.target.value))} aria-label="Adjust image shadows" />
              <span style={{ minWidth: 36 }}>{editorShadows > 0 ? `+${editorShadows}` : editorShadows}</span>
            </label>
            <div className="btn-group btn-group-sm" role="group" aria-label="Image zoom controls">
              <button className="btn btn-outline-light" onClick={() => setEditorZoom((zoom) => Math.max(0.5, zoom - 0.25))} title="Zoom out"><i className="bi bi-zoom-out" /></button>
              <button className="btn btn-outline-light disabled" tabIndex="-1">{Math.round(editorZoom * 100)}%</button>
              <button className="btn btn-outline-light" onClick={() => setEditorZoom((zoom) => Math.min(4, zoom + 0.25))} title="Zoom in"><i className="bi bi-zoom-in" /></button>
            </div>
            <button className="btn btn-sm btn-outline-light" onClick={resetResultEditor}><i className="bi bi-arrow-counterclockwise me-1" />Reset</button>
            <button className="btn btn-sm btn-success" onClick={saveEditedResult} disabled={editorRendering}><i className="bi bi-download me-1" />Save</button>
            {editorRendering && <span className="spinner-border spinner-border-sm" aria-label="Applying edits" />}
            <button className="btn btn-sm btn-light ms-auto" onClick={() => setResultExpanded(false)} aria-label="Close enlarged image"><i className="bi bi-x-lg" /></button>
          </div>
          <div className="flex-grow-1 overflow-auto d-flex align-items-start justify-content-center rounded-3" onClick={(event) => event.stopPropagation()} style={{ minHeight: 0 }}>
            <canvas
              ref={editorCanvasRef}
              aria-label="Editable processed result"
              style={{ width: `${editorZoom * 100}%`, height: 'auto', flex: '0 0 auto', background: '#111', boxShadow: '0 12px 48px rgba(0,0,0,.5)' }}
            />
          </div>
        </div>
      )}
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

import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';

export default function ContentEmbedModal({ postId, label = 'Content', onClose }) {
  const [copied, setCopied] = useState('');
  const embedUrl = useMemo(
    () => `${globalThis.location.origin}/embed/${encodeURIComponent(postId)}`,
    [postId],
  );
  const embedCode = `<iframe src="${embedUrl}" width="560" height="315" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;

  const copy = async (value, kind) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    globalThis.setTimeout(() => setCopied(''), 1800);
  };

  return (
    <div className="content-embed-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="content-embed-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Embed ${label}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h2 className="h5 mb-0"><i className="bi bi-code-slash me-2 text-primary"></i>Embed {label}</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
        </div>
        <p className="small text-muted">Copy the direct URL or iframe code into another website.</p>
        <label className="form-label fw-semibold">
          Direct URL
          <div className="input-group mt-1">
            <input className="form-control" readOnly value={embedUrl} />
            <button type="button" className="btn btn-outline-primary" onClick={() => copy(embedUrl, 'url')}>
              {copied === 'url' ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </label>
        <label className="form-label fw-semibold mt-3">
          Embed HTML
          <textarea className="form-control mt-1 font-monospace" rows={5} readOnly value={embedCode}></textarea>
        </label>
        <div className="d-flex justify-content-end mt-3">
          <button type="button" className="btn btn-primary" onClick={() => copy(embedCode, 'code')}>
            <i className="bi bi-clipboard me-2"></i>{copied === 'code' ? 'Copied' : 'Copy Embed'}
          </button>
        </div>
      </section>
    </div>
  );
}

ContentEmbedModal.propTypes = {
  postId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  label: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

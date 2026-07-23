import React, { useMemo, useState } from 'react';

const TEMPLATES = [
  {
    id: 'transparent-popup',
    name: 'Transparent image popup',
    description: 'A dismissible glass popup that appears at a randomized position over an image.',
    icon: 'bi-window-stack',
  },
  {
    id: 'lower-third',
    name: 'Lower-third promotion',
    description: 'A clean promotional strip anchored to the bottom of visual content.',
    icon: 'bi-layout-text-window-reverse',
  },
  {
    id: 'corner-card',
    name: 'Corner offer card',
    description: 'A compact offer card that leaves the main image visible.',
    icon: 'bi-badge-ad',
  },
];

const POSITIONS = [
  { top: '8%', left: '7%' },
  { top: '10%', right: '7%' },
  { top: '34%', left: '8%' },
  { top: '32%', right: '8%' },
  { bottom: '9%', left: '9%' },
  { bottom: '9%', right: '9%' },
];

export default function AdvertisingStudio() {
  const [templateId, setTemplateId] = useState('transparent-popup');
  const [headline, setHeadline] = useState('A brighter story starts here');
  const [message, setMessage] = useState('Introduce your product with a short, clear message.');
  const [buttonLabel, setButtonLabel] = useState('Learn more');
  const [destination, setDestination] = useState('https://');
  const [opacity, setOpacity] = useState(82);
  const [randomPlacement, setRandomPlacement] = useState(true);
  const [positionIndex, setPositionIndex] = useState(1);
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState('');

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId) || TEMPLATES[0],
    [templateId],
  );

  const reshuffle = () => {
    setPositionIndex((current) => {
      if (!randomPlacement) return current;
      const choices = POSITIONS.map((_, index) => index).filter((index) => index !== current);
      return choices[Math.floor(Math.random() * choices.length)];
    });
    setVisible(true);
  };

  const selectTemplate = (id) => {
    setTemplateId(id);
    setVisible(true);
    setStatus('');
  };

  const saveDraft = () => {
    localStorage.setItem('advertisingStudio.draft', JSON.stringify({
      templateId, headline, message, buttonLabel, destination, opacity, randomPlacement,
    }));
    setStatus('Draft saved in this browser.');
  };

  return (
    <section className="advertising-studio">
      <header className="advertising-studio__header">
        <div>
          <span className="advertising-studio__eyebrow">Campaign builder</span>
          <h2>Advertising Studio</h2>
          <p>Create tasteful advertising overlays and preview them before publishing.</p>
        </div>
        <button type="button" className="btn btn-dark" onClick={saveDraft}>
          <i className="bi bi-cloud-check me-2" />Save draft
        </button>
      </header>

      <div className="advertising-studio__workspace">
        <aside className="advertising-studio__templates">
          <div className="advertising-studio__section-title">
            <span>Templates</span><small>{TEMPLATES.length} available</small>
          </div>
          {TEMPLATES.map((template, index) => (
            <button
              type="button"
              key={template.id}
              className={`advertising-template ${templateId === template.id ? 'is-selected' : ''}`}
              onClick={() => selectTemplate(template.id)}
            >
              <span className="advertising-template__number">0{index + 1}</span>
              <i className={`bi ${template.icon}`} />
              <span><strong>{template.name}</strong><small>{template.description}</small></span>
            </button>
          ))}
        </aside>

        <div className="advertising-studio__editor">
          <div className="advertising-studio__section-title">
            <span>Customize</span><small>{selectedTemplate.name}</small>
          </div>
          <label>Headline<input value={headline} maxLength="70" onChange={(event) => setHeadline(event.target.value)} /></label>
          <label>Message<textarea value={message} rows="3" maxLength="180" onChange={(event) => setMessage(event.target.value)} /></label>
          <div className="advertising-studio__field-row">
            <label>Button label<input value={buttonLabel} maxLength="30" onChange={(event) => setButtonLabel(event.target.value)} /></label>
            <label>Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
          </div>
          <label className="advertising-studio__range">
            <span>Background opacity <b>{opacity}%</b></span>
            <input type="range" min="35" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>
          <label className="advertising-studio__switch">
            <input type="checkbox" checked={randomPlacement} onChange={(event) => setRandomPlacement(event.target.checked)} />
            <span><strong>Random image placement</strong><small>Choose a new safe image position for each appearance.</small></span>
          </label>
          {status && <div className="alert alert-success py-2 mb-0">{status}</div>}
        </div>

        <div className="advertising-studio__preview-panel">
          <div className="advertising-studio__section-title">
            <span>Live preview</span>
            <button type="button" onClick={reshuffle}><i className="bi bi-shuffle" /> Randomize</button>
          </div>
          <div className="advertising-preview">
            <div className="advertising-preview__scene">
              <span className="advertising-preview__caption">Image placement preview</span>
              {visible && (
                <div
                  className={`advertising-preview__ad advertising-preview__ad--${templateId}`}
                  style={{ ...POSITIONS[positionIndex], '--ad-opacity': opacity / 100 }}
                >
                  <button type="button" className="advertising-preview__close" aria-label="Close advertisement" onClick={() => setVisible(false)}>×</button>
                  <span className="advertising-preview__sponsor">Sponsored</span>
                  <strong>{headline || 'Your headline'}</strong>
                  <p>{message || 'Your advertisement message.'}</p>
                  <button type="button" className="advertising-preview__cta">{buttonLabel || 'Learn more'}</button>
                </div>
              )}
              {!visible && (
                <button type="button" className="advertising-preview__restore" onClick={() => setVisible(true)}>
                  Preview closed · Show again
                </button>
              )}
            </div>
          </div>
          <div className="advertising-studio__notes">
            <span><i className="bi bi-x-circle" /> Dismissible</span>
            <span><i className="bi bi-transparency" /> Transparent</span>
            <span><i className="bi bi-shuffle" /> Random placement</span>
          </div>
        </div>
      </div>
    </section>
  );
}

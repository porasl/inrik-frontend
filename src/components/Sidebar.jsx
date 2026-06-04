import React, { useState } from 'react';
import PropTypes from 'prop-types';

export default function Sidebar({ onVideos, onPosts, onBox, onGroups, onAudio, onPhotos, onSlice, onNotes }) {
  const [collapsedSections, setCollapsedSections] = useState({
    views: false,
    groups: false,
    bazaar: false,
  });

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleBazaar = (e) => {
    e.preventDefault();
    globalThis.open('https://Bazaartoday.com', '_blank', 'noreferrer');
  };

  const handleVideos = (e) => {
    e.preventDefault();
    onVideos?.();
  };

  const handlePosts = (e) => {
    e.preventDefault();
    onPosts?.();
  };

  const handleBox = (e) => {
    e.preventDefault();
    onBox?.();
  };

  const handleGroups = (e) => {
    e.preventDefault();
    onGroups?.();
  };

  const handleAudio = (e) => {
    e.preventDefault();
    onAudio?.();
  };

  const handlePhotos = (e) => {
    e.preventDefault();
    onPhotos?.();
  };

  const handleSlice = (e) => {
    e.preventDefault();
    onSlice?.();
  };

  const handleNotes = (e) => {
    e.preventDefault();
    onNotes?.();
  };

  return (
    <div className="leftbar">
      <ul className="nav flex-column w-100 px-2">
        {/* Spacer */}
        <li className="nav-item mb-1"></li>

        <li className="nav-item">
          <button
            type="button"
            className="leftbar-section-title leftbar-section-toggle"
            onClick={() => toggleSection('views')}
            aria-expanded={!collapsedSections.views}
          >
            <span>Views</span>
            <i className={`bi ${collapsedSections.views ? 'bi-chevron-down' : 'bi-chevron-up'}`} aria-hidden="true"></i>
          </button>
        </li>

        {!collapsedSections.views && (
          <>
            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handleBox}>
                <i className="bi bi-window-stack fs-5 text-secondary"></i>
                <span className="fw-medium">Private</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handlePosts}>
                <i className="bi bi-card-text fs-5 text-secondary"></i>
                <span className="fw-medium">Post</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handleVideos}>
                <i className="bi bi-play-btn fs-5 text-secondary"></i>
                <span className="fw-medium">Video</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handleAudio}>
                <i className="bi bi-music-note-beamed fs-5 text-secondary"></i>
                <span className="fw-medium">Audio</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handlePhotos}>
                <i className="bi bi-image fs-5 text-secondary"></i>
                <span className="fw-medium">Images</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handleSlice}>
                <i className="bi bi-film fs-5 text-secondary"></i>
                <span className="fw-medium">Slice</span>
              </a>
            </li>

            <li className="nav-item w-100 mb-0">
              <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
                href="#" onClick={handleNotes}>
                <i className="bi bi-pencil fs-5 text-secondary"></i>
                <span className="fw-medium">Notes</span>
              </a>
            </li>
          </>
        )}

        <li className="nav-item mb-1"></li>

        <li className="nav-item">
          <button
            type="button"
            className="leftbar-section-title leftbar-section-toggle"
            onClick={() => toggleSection('groups')}
            aria-expanded={!collapsedSections.groups}
          >
            <span>Groups</span>
            <i className={`bi ${collapsedSections.groups ? 'bi-chevron-down' : 'bi-chevron-up'}`} aria-hidden="true"></i>
          </button>
        </li>

        {!collapsedSections.groups && (
          <li className="nav-item w-100 mb-0">
            <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
              href="#" onClick={handleGroups}>
              <i className="bi bi-people-fill fs-5 text-secondary"></i>
              <span className="fw-medium">Groups</span>
            </a>
          </li>
        )}

        <li className="nav-item mb-1"></li>

        <li className="nav-item">
          <button
            type="button"
            className="leftbar-section-title leftbar-section-title-muted leftbar-section-toggle"
            onClick={() => toggleSection('bazaar')}
            aria-expanded={!collapsedSections.bazaar}
          >
            <span>BazaarToday</span>
            <i className={`bi ${collapsedSections.bazaar ? 'bi-chevron-down' : 'bi-chevron-up'}`} aria-hidden="true"></i>
          </button>
        </li>

        {!collapsedSections.bazaar && (
          <li className="nav-item w-100 mb-0">
            <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
              href="https://Bazaartoday.com" target="_blank" rel="noreferrer" onClick={handleBazaar}>
              <img src="/resources/images/bazaar_icon.svg" alt="BazaarToday" style={{ width: '96px', height: '96px', objectFit: 'contain', display: 'block', opacity: 0.7 }} />
            </a>
          </li>
        )}

      </ul>
    </div>
  );
}

Sidebar.propTypes = {
  onVideos: PropTypes.func,
  onPosts: PropTypes.func,
  onBox: PropTypes.func,
  onGroups: PropTypes.func,
  onAudio: PropTypes.func,
  onPhotos: PropTypes.func,
  onSlice: PropTypes.func,
  onNotes: PropTypes.func,
};

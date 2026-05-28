import React from 'react';
import PropTypes from 'prop-types';

export default function Sidebar({ onHome, onSlice, onVideos, onPosts, onAudio, onPhotos, onBox }) {
  const handleNav = (e) => {
    e.preventDefault();
    onHome?.();
  };

  const handleSlice = (e) => {
    e.preventDefault();
    onSlice?.();
  };

  const handleVideos = (e) => {
    e.preventDefault();
    onVideos?.();
  };

  const handleAudio = (e) => {
    e.preventDefault();
    onAudio?.();
  };

  const handlePosts = (e) => {
    e.preventDefault();
    onPosts?.();
  };

  const handlePhotos = (e) => {
    e.preventDefault();
    onPhotos?.();
  };

  const handleBox = (e) => {
    e.preventDefault();
    onBox?.();
  };

  return (
    <div className="leftbar">
      <ul className="nav flex-column w-100 px-2">
        {/* Spacer */}
        <li className="nav-item mb-3"></li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handleNav}>
            <i className="bi bi-house-door fs-5 text-secondary"></i>
            <span className="fw-medium">Home</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handleVideos}>
            <i className="bi bi-play-btn fs-5 text-secondary"></i>
            <span className="fw-medium">Videos</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handlePosts}>
            <i className="bi bi-card-text fs-5 text-secondary"></i>
            <span className="fw-medium">PostView</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handleSlice}>
            <i className="bi bi-film fs-5 text-secondary"></i>
            <span className="fw-medium">Slice</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handleBox}>
            <i className="bi bi-window-stack fs-5 text-secondary"></i>
            <span className="fw-medium">BoxView</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light" href="#" onClick={handleAudio}>
            <i className="bi bi-music-note-beamed fs-5 text-secondary"></i>
            <span className="fw-medium">Audio</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light" href="#" onClick={handlePhotos}>
            <i className="bi bi-images fs-5 text-secondary"></i>
            <span className="fw-medium">Photos</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-0 px-3 py-1 rounded-3 text-dark hover-bg-light" href="#" onClick={handleNav}>
            <i className="bi bi-journal-text fs-5 text-secondary"></i>
            <span className="fw-medium">Notes</span>
          </a>
        </li>
      </ul>
    </div>
  );
}

Sidebar.propTypes = {
  onHome: PropTypes.func,
  onSlice: PropTypes.func,
  onVideos: PropTypes.func,
  onPosts: PropTypes.func,
  onAudio: PropTypes.func,
  onPhotos: PropTypes.func,
  onBox: PropTypes.func,
};
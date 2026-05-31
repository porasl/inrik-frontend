import React from 'react';
import PropTypes from 'prop-types';

export default function Sidebar({ onVideos, onPosts, onBox }) {

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

  return (
    <div className="leftbar">
      <ul className="nav flex-column w-100 px-2">
        {/* Spacer */}
        <li className="nav-item mb-3"></li>

        <li className="nav-item px-3 py-1 text-uppercase text-secondary fw-semibold" style={{ fontSize: '12px', letterSpacing: '0.06em' }}>
          Views
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
            href="#" onClick={handlePosts}>
            <i className="bi bi-card-text fs-5 text-secondary"></i>
            <span className="fw-medium">Post</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-0">
          <a className="nav-link d-flex align-items-center gap-2 px-3 py-1 rounded-3 text-dark hover-bg-light"
            href="#" onClick={handleBox}>
            <i className="bi bi-window-stack fs-5 text-secondary"></i>
            <span className="fw-medium">Private</span>
          </a>
        </li>

      </ul>
    </div>
  );
}

Sidebar.propTypes = {
  onVideos: PropTypes.func,
  onPosts: PropTypes.func,
  onBox: PropTypes.func,
};
import React from 'react';

export default function Sidebar() {
  return (
    <div className="leftbar">
      <ul className="nav flex-column w-100 px-2">
        {/* Spacer */}
        <li className="nav-item mb-3"></li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-house-door fs-5 text-secondary"></i>
            <span className="fw-medium">Home</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-play-btn fs-5 text-secondary"></i>
            <span className="fw-medium">Videos</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-film fs-5 text-secondary"></i>
            <span className="fw-medium">Slice</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-music-note-beamed fs-5 text-secondary"></i>
            <span className="fw-medium">Audio</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-images fs-5 text-secondary"></i>
            <span className="fw-medium">Photos</span>
          </a>
        </li>

        <li className="nav-item w-100 mb-1">
          <a className="nav-link d-flex align-items-center gap-3 px-3 py-2 rounded-3 text-dark hover-bg-light" href="#">
            <i className="bi bi-journal-text fs-5 text-secondary"></i>
            <span className="fw-medium">Notes</span>
          </a>
        </li>
      </ul>
    </div>
  );
}
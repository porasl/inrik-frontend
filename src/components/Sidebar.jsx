import React from 'react';

export default function Sidebar() {
  return (
    <div className="leftbar">
      <ul className="nav flex-column align-items-center">
        {/* Spacer to keep items below the header */}
        <li className="nav-item leftbar-spacer" aria-hidden="true"></li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/home.png" className="w-40" alt="Home" />
            <span className="left-label">Home</span>
          </a>
        </li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/video.png" className="w-40" alt="Videos" />
            <span className="left-label">Videos</span>
          </a>
        </li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/cut.png" className="w-60" alt="Slice" />
            <span className="left-label">Slice</span>
          </a>
        </li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/music.png" className="w-40" alt="Audio" />
            <span className="left-label">Audio</span>
          </a>
        </li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/photo.png" className="w-40" alt="Photos" />
            <span className="left-label">Photos</span>
          </a>
        </li>

        <li className="nav-item">
          <a className="nav-link" href="#">
            <img src="resources/images/memoryNotes.png" className="w-40" alt="Notes" />
            <span className="left-label">Notes</span>
          </a>
        </li>
      </ul>
    </div>
  );
}
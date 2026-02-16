import React from 'react';

export default function Rightbar() {
  return (
    <aside className="rightbar d-none d-lg-block">
      <div className="rightbar-inner">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="m-0 text-white">Connections</h6>
          <button className="btn btn-sm btn-outline-secondary" type="button">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        {/* Search Bar */}
        <div className="input-group input-group-sm mb-3">
          <span className="input-group-text bg-dark border-secondary text-white">
            <i className="bi bi-search"></i>
          </span>
          <input type="text" className="form-control bg-dark border-secondary text-white" placeholder="Find a contact" />
        </div>

        {/* Contact List */}
        <ul className="list-unstyled small mb-0" id="contactsList">
          <li className="p-2 text-secondary">No connections yet...</li>
        </ul>
      </div>
    </aside>
  );
}
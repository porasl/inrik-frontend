import React from 'react';

export default function Rightbar() {
  return (
    /* 1. Added id="rightbar-id" so the Navbar button can find it */
    /* 2. Removed d-none and d-lg-block to let our custom CSS handle the logic */
    <aside id="rightbar-id" className="rightbar">
      <div className="rightbar-inner">
        <div className="d-flex align-items-center justify-content-between mb-3">
          {/* Changed text-white to text-dark if your rightbar background is white */}
          <h6 className="m-0 fw-bold">Connections</h6>
          <button className="btn btn-sm btn-outline-secondary" type="button">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        {/* Search Bar */}
        <div className="input-group input-group-sm mb-3">
          <span className="input-group-text bg-light border-secondary">
            <i className="bi bi-search"></i>
          </span>
          <input 
            type="text" 
            className="form-control bg-light border-secondary" 
            placeholder="Find a contact" 
          />
        </div>

        {/* Contact List */}
        <ul className="list-unstyled small mb-0" id="contactsList">
          <li className="p-2 text-muted text-center">No connections yet...</li>
        </ul>
      </div>
    </aside>
  );
}
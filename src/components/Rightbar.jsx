import React, { useState } from 'react';

export default function Rightbar({ connections = [] }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter connections based on what the user types
  const filteredConnections = connections.filter(conn =>
    conn.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside id="rightbar-id" className="rightbar">
      <div className="rightbar-inner">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="m-0 fw-bold">Connections ({connections.length})</h6>
          <button className="btn btn-sm btn-outline-secondary" type="button">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        {/* --- SEARCH FIELD (Restored) --- */}
        <div className="mb-4">
          <div className="input-group">
            <span className="input-group-text bg-white border-end-0 rounded-start-pill ps-3">
              <i className="bi bi-search text-secondary"></i>
            </span>
            <input
              type="text"
              className="form-control border-start-0 rounded-end-pill bg-white"
              placeholder="Find a contact"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ boxShadow: 'none' }}
            />
          </div>
        </div>

        {/* --- CONTACT LIST --- */}
        <ul className="list-unstyled mb-0">
          {filteredConnections.length > 0 ? (
            filteredConnections.map(conn => (
              <li key={conn.id} className="d-flex align-items-center gap-3 mb-2 p-2 rounded hover-bg-light cursor-pointer transition-base">
                <div className="position-relative">
                  {conn.avatar ? (
                    <img
                      src={conn.avatar}
                      className="rounded-circle object-fit-cover"
                      style={{ width: '40px', height: '40px' }}
                      alt={conn.name}
                    />
                  ) : (
                    <div className="rounded-circle bg-light d-flex align-items-center justify-content-center text-secondary" style={{ width: '40px', height: '40px' }}>
                      <i className="bi bi-person-fill fs-5"></i>
                    </div>
                  )}
                  {/* Presence Indicator Dot */}
                  <span
                    className={`position-absolute bottom-0 end-0 border border-white rounded-circle p-1 ${conn.status === 'online' ? 'bg-success' : 'bg-secondary'}`}
                    style={{ width: '12px', height: '12px' }}
                  ></span>
                </div>
                <span className="fw-medium text-dark">{conn.name}</span>
              </li>
            ))
          ) : (
            <li className="p-3 text-muted text-center small bg-light rounded-3">
              <i className="bi bi-people fs-4 d-block mb-2 text-secondary-subtle"></i>
              {searchTerm ? "No matches found" : "No connections yet"}
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
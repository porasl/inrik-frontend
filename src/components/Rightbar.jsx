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
        <div className="input-group input-group-sm mb-3">
          <span className="input-group-text bg-light border-secondary">
            <i className="bi bi-search"></i>
          </span>
          <input 
            type="text" 
            className="form-control bg-light border-secondary" 
            placeholder="Find a contact" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* --- CONTACT LIST --- */}
        <ul className="list-unstyled small mb-0">
          {filteredConnections.length > 0 ? (
            filteredConnections.map(conn => (
              <li key={conn.id} className="d-flex align-items-center gap-2 mb-3 p-1 rounded hover-effect">
                <div className="position-relative">
                  <img 
                    src={conn.avatar || 'resources/images/default-avatar.png'} 
                    className="rounded-circle border" 
                    style={{ width: '35px', height: '35px', objectFit: 'cover' }} 
                    alt={conn.name}
                  />
                  {/* Presence Indicator Dot */}
                  <span 
                    className={`position-absolute bottom-0 end-0 border border-white rounded-circle p-1 ${conn.status === 'online' ? 'bg-success' : 'bg-secondary'}`}
                    style={{ width: '10px', height: '10px' }}
                  ></span>
                </div>
                <span className="small fw-medium text-dark">{conn.name}</span>
              </li>
            ))
          ) : (
            <li className="p-2 text-muted text-center small">
              {searchTerm ? "No matches found" : "No connections yet..."}
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
import React from 'react';

export default function ConnectionRequestsModal({ requests, onAccept, onReject, onClose }) {
  if (!requests || requests.length === 0) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '28px',
          width: 'min(480px, 94vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 fw-bold">
            <i className="bi bi-people-fill text-primary me-2"></i>
            Connection Requests
          </h5>
          <button
            type="button"
            className="btn btn-sm btn-light"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <p className="text-muted small mb-3">
          {requests.length === 1
            ? 'Someone wants to connect with you.'
            : `${requests.length} people want to connect with you.`}
        </p>

        <ul className="list-unstyled mb-0">
          {requests.map((req) => (
            <li
              key={req.id}
              className="d-flex align-items-center justify-content-between gap-3 p-3 mb-2 rounded-3 border"
            >
              <div className="d-flex align-items-center gap-3 min-w-0">
                {req.avatar ? (
                  <img
                    src={req.avatar}
                    className="rounded-circle object-fit-cover flex-shrink-0"
                    style={{ width: 44, height: 44 }}
                    alt={req.name}
                  />
                ) : (
                  <div
                    className="rounded-circle bg-light d-flex align-items-center justify-content-center text-secondary flex-shrink-0"
                    style={{ width: 44, height: 44 }}
                  >
                    <i className="bi bi-person-fill fs-5"></i>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="fw-semibold text-dark text-truncate">{req.name || req.email || `User ${req.id}`}</div>
                  {req.email && (
                    <div className="text-muted text-truncate" style={{ fontSize: '0.8rem' }}>{req.email}</div>
                  )}
                </div>
              </div>

              <div className="d-flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-sm btn-primary px-3"
                  onClick={() => onAccept(req)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger px-3"
                  onClick={() => onReject(req)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

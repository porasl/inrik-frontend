import React, { useState } from 'react';

function shouldShowPendingBadge(connection) {
  if (connection?.pending === true) return true;

  const markers = [
    connection?.requestStatus,
    connection?.status,
    connection?.connectionStatus,
    connection?.connectionState,
    connection?.inviteStatus,
    connection?.state,
    connection?.rawConnection?.status,
    connection?.rawConnection?.requestStatus,
    connection?.rawConnection?.connectionStatus,
    connection?.rawConnection?.connectionState,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  const rawMarkers = JSON.stringify(connection?.rawConnection || {})
    .toLowerCase();

  return markers.some((value) => (
    value === 'pending'
    || value === 'pending_connection'
    || value === 'pending-connection'
    || value === 'requested'
    || value === 'request_sent'
    || value === 'request-sent'
    || value === 'awaiting_acceptance'
    || value === 'awaiting-acceptance'
    || value === 'waiting'
  )) || rawMarkers.includes('pending');
}

export default function Rightbar({
  connections = [],
  isLoggedIn = false,
  onSearchUserById,
  onAddConnection,
}) {
  const [userIdInput, setUserIdInput] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [addingConnection, setAddingConnection] = useState(false);
  const [showTargetPlaceholder, setShowTargetPlaceholder] = useState(false);
  const [showSearchResultPopup, setShowSearchResultPopup] = useState(false);

  const normalizedQuery = userIdInput.trim().toLowerCase();
  const filteredConnections = !normalizedQuery
    ? connections
    : connections.filter((conn) => {
      const name = String(conn?.name || '').trim().toLowerCase();
      const emailCandidates = [
        conn?.email,
        conn?.rawConnection?.email,
        conn?.rawConnection?.userEmail,
        conn?.rawConnection?.senderEmail,
        conn?.rawConnection?.requesterEmail,
        conn?.rawConnection?.receiverEmail,
        conn?.rawConnection?.recipientEmail,
        conn?.rawConnection?.targetEmail,
      ]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean);
      const idCandidates = [
        conn?.id,
        conn?.connectionId,
        conn?.rawConnection?.id,
        conn?.rawConnection?.userId,
        conn?.rawConnection?.senderId,
        conn?.rawConnection?.requesterId,
        conn?.rawConnection?.connectionId,
        conn?.rawConnection?.requestId,
      ]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean);

      const nameTokens = name.split(/\s+/).filter(Boolean);
      const startsWith = (value) => value.startsWith(normalizedQuery);

      return startsWith(name)
        || nameTokens.some(startsWith)
        || emailCandidates.some(startsWith)
        || idCandidates.some(startsWith);
    });
  const canSuggestAdd = isLoggedIn && normalizedQuery && filteredConnections.length === 0;

  const handleSearchUser = async () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) {
      setSearchError('Enter a userId first.');
      setSearchResult(null);
      return;
    }

    setSearchingUser(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const found = await onSearchUserById?.(trimmed);
      if (!found) {
        setSearchError('No user found for this userId.');
        return;
      }

      const foundEmail = String(found?.email || '').trim().toLowerCase();
      const foundUserId = String(found?.id || found?.userId || '').trim().toLowerCase();
      const alreadyConnected = connections.some((conn) => {
        const connEmail = String(conn?.email || conn?.rawConnection?.email || conn?.rawConnection?.userEmail || '').trim().toLowerCase();
        const connUserId = String(conn?.rawConnection?.userId || conn?.rawConnection?.senderId || conn?.rawConnection?.requesterId || '').trim().toLowerCase();
        return (foundEmail && connEmail === foundEmail) || (foundUserId && connUserId === foundUserId);
      });

      if (alreadyConnected) {
        setSearchError('This user is already in your connections or pending list.');
        setShowSearchResultPopup(false);
        return;
      }

      setSearchResult(found);
      setShowSearchResultPopup(true);
    } catch (err) {
      setSearchError(err?.message || 'Search failed.');
    } finally {
      setSearchingUser(false);
    }
  };

  const handleAddConnection = async () => {
    if (!searchResult?.id) return;
    setShowSearchResultPopup(false);
    setAddingConnection(true);
    setSearchError('');
    try {
      await onAddConnection?.(searchResult);
      setShowTargetPlaceholder(true);
      setUserIdInput('');
      setSearchResult(null);
    } catch (err) {
      setSearchError(err?.message || 'Could not add connection.');
    } finally {
      setAddingConnection(false);
    }
  };

  return (
    <aside id="rightbar-id" className="rightbar">
      <div className="rightbar-inner">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="m-0 fw-bold">Connections ({connections.length})</h6>
          <button className="btn btn-sm btn-outline-secondary" type="button">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        {isLoggedIn && (
          <div className="mb-3">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 rounded-start-pill ps-3">
                <i className="bi bi-binoculars text-secondary"></i>
              </span>
              <input
                type="text"
                className="form-control border-start-0 bg-white"
                placeholder="Search userId"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchUser();
                  }
                }}
                style={{ boxShadow: 'none' }}
              />
              <button
                className="btn btn-outline-primary rounded-end-pill"
                type="button"
                disabled={searchingUser}
                onClick={handleSearchUser}
              >
                {searchingUser ? '...' : <i className="bi bi-search" />}
              </button>
            </div>
          </div>
        )}

        {searchError && (
          <div className="text-danger mb-2" style={{ fontSize: '12px' }}>{searchError}</div>
        )}

        {/* --- CONTACT LIST --- */}
        <ul className="list-unstyled mb-0">
          {filteredConnections.length > 0 ? (
            filteredConnections.map((conn) => {
              const isPending = shouldShowPendingBadge(conn);

              return (
              <li key={conn.requestKey || conn.id || conn.email} className="d-flex align-items-center justify-content-between gap-2 mb-2 p-2 rounded hover-bg-light cursor-pointer transition-base">
                <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
                  <div className="position-relative flex-shrink-0">
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
                  <span className="fw-medium text-dark text-truncate" style={{ minWidth: 0 }}>{conn.name}</span>
                </div>
                {isPending && (
                  <span
                    className="badge flex-shrink-0"
                    style={{ backgroundColor: '#ffe08a', color: '#7a4b00', fontWeight: 700, letterSpacing: '0.06em' }}
                  >
                    PENDING
                  </span>
                )}
              </li>
              );
            })
          ) : canSuggestAdd ? (
            <li className="p-3 small bg-light rounded-3 border d-flex align-items-center justify-content-between gap-2">
              <div className="text-secondary">
                No connection starts with "{userIdInput.trim()}".
              </div>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                onClick={handleSearchUser}
                disabled={searchingUser || addingConnection}
              >
                {searchingUser ? 'Searching...' : 'Find & Add'}
              </button>
            </li>
          ) : (
            <li className="p-3 text-muted text-center small bg-light rounded-3">
              <i className="bi bi-people fs-4 d-block mb-2 text-secondary-subtle"></i>
              {normalizedQuery ? 'No matching connections' : 'No connections yet'}
            </li>
          )}
        </ul>
      </div>

      {showTargetPlaceholder && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2200 }}
          onClick={() => setShowTargetPlaceholder(false)}
        >
          <div
            className="bg-white rounded-3 shadow p-3"
            style={{ width: 'min(460px, 92vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h6 className="mb-2 fw-bold">Request Placeholder</h6>
            <p className="mb-2 text-secondary" style={{ fontSize: '0.9rem' }}>
              Connection is auto-accepted for now.
            </p>
            <p className="mb-3 text-secondary" style={{ fontSize: '0.82rem' }}>
              Placeholder: in the next step, the target user should see a popup to Accept/Reject the request.
            </p>
            <div className="d-flex justify-content-end">
              <button className="btn btn-sm btn-primary" onClick={() => setShowTargetPlaceholder(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {showSearchResultPopup && searchResult && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2200 }}
          onClick={() => setShowSearchResultPopup(false)}
        >
          <div
            className="bg-white rounded-3 shadow p-3"
            style={{ width: 'min(460px, 92vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h6 className="mb-2 fw-bold">User Found</h6>
            <div className="d-flex align-items-center gap-2 mb-2">
              {searchResult.avatar ? (
                <img
                  src={searchResult.avatar}
                  alt={searchResult.name || 'User'}
                  className="rounded-circle object-fit-cover"
                  style={{ width: 42, height: 42 }}
                />
              ) : (
                <div className="rounded-circle bg-light d-flex align-items-center justify-content-center text-secondary" style={{ width: 42, height: 42 }}>
                  <i className="bi bi-person-fill"></i>
                </div>
              )}
              <div>
                <div className="fw-semibold text-dark" style={{ fontSize: '0.95rem' }}>{searchResult.name || 'User'}</div>
              </div>
            </div>
            {searchResult.email && (
              <div className="text-secondary" style={{ fontSize: '0.82rem' }}>{searchResult.email}</div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
              <button className="btn btn-sm btn-light border" onClick={() => setShowSearchResultPopup(false)}>Cancel</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleAddConnection}
                disabled={addingConnection}
              >
                {addingConnection ? 'Adding...' : 'Add Connection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
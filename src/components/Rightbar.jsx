import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listGroups, subscribeGroupUpdates } from '../services/groupsService';

function groupInitials(name) {
  return String(name || 'G')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';
}

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
  onRemoveConnection,
  onFetchSentMessages,
  onSendMessage,
  authFetch = fetch,
  onOpenGroups,
}) {
  const [userIdInput, setUserIdInput] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [addingConnection, setAddingConnection] = useState(false);
  const [showSearchResultPopup, setShowSearchResultPopup] = useState(false);
  const [selectedConnectionKey, setSelectedConnectionKey] = useState('');
  const [actionError, setActionError] = useState('');
  const [removingConnection, setRemovingConnection] = useState(false);
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [connectionToRemove, setConnectionToRemove] = useState(null);

  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTarget, setMessageTarget] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [groupsCollapsed, setGroupsCollapsed] = useState(true);
  const authFetchRef = useRef(authFetch);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const loadGroups = useCallback(async () => {
    if (!isLoggedIn) {
      setGroups([]);
      setGroupsError('');
      return;
    }

    const token = localStorage.getItem('token') || '';
    if (!token) return;

    setGroupsLoading(true);
    setGroupsError('');
    try {
      const payload = await listGroups(token, authFetchRef.current);
      setGroups(Array.isArray(payload) ? payload : payload?.groups || []);
    } catch (error) {
      setGroups([]);
      setGroupsError(error?.message || 'Groups could not be loaded.');
    } finally {
      setGroupsLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadGroups();
    return subscribeGroupUpdates(loadGroups);
  }, [loadGroups]);

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
  const filteredGroups = !normalizedQuery
    ? groups
    : groups.filter((group) => {
      const searchable = [
        group?.name,
        group?.description,
        group?.owner?.email,
        group?.owner?.firstName,
        group?.owner?.lastName,
      ].map((value) => String(value || '').toLowerCase());
      return searchable.some((value) => value.includes(normalizedQuery));
    });
  const canSuggestAdd = isLoggedIn
    && normalizedQuery
    && filteredConnections.length === 0
    && filteredGroups.length === 0;

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
      setUserIdInput('');
      setSearchResult(null);
    } catch (err) {
      setSearchError(err?.message || 'Could not add connection.');
    } finally {
      setAddingConnection(false);
    }
  };

  const loadMessages = async (conn) => {
    setMessagesLoading(true);
    setMessagesError('');
    try {
      const list = await onFetchSentMessages?.(conn);
      setMessages(Array.isArray(list) ? list : []);
    } catch (err) {
      setMessages([]);
      setMessagesError(err?.message || 'Could not load messages.');
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleOpenMessage = async (conn) => {
    setMessageTarget(conn);
    setShowMessageModal(true);
    setNewMessageText('');
    await loadMessages(conn);
  };

  const handleSendMessage = async () => {
    if (!messageTarget) return;
    const text = String(newMessageText || '').trim();
    if (!text) {
      setMessagesError('Please write a message first.');
      return;
    }

    setSendingMessage(true);
    setMessagesError('');
    try {
      await onSendMessage?.(messageTarget, text);
      setNewMessageText('');
      await loadMessages(messageTarget);
    } catch (err) {
      setMessagesError(err?.message || 'Could not send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleRemoveSelectedConnection = async (conn) => {
    setActionError('');
    setConnectionToRemove(conn);
    setShowRemoveConfirmModal(true);
  };

  const confirmRemoveSelectedConnection = async () => {
    if (!connectionToRemove) return;
    setRemovingConnection(true);
    try {
      await onRemoveConnection?.(connectionToRemove);
      setSelectedConnectionKey('');
      setShowRemoveConfirmModal(false);
      setConnectionToRemove(null);
    } catch (err) {
      setActionError(err?.message || 'Could not remove connection.');
    } finally {
      setRemovingConnection(false);
    }
  };

  return (
    <aside id="rightbar-id" className="rightbar">
      <div className="rightbar-inner">
        <a
          href="https://bazaartoday.com"
          target="_blank"
          rel="noreferrer"
          className="d-block text-decoration-none mb-3 rightbar-ad-link"
        >
          <div className="rounded-3 border p-2 shadow-sm rightbar-ad-card" style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffffff 100%)' }}>
            <div className="d-flex align-items-start gap-2 rightbar-ad-row">
              <div className="flex-shrink-0 rounded-3 d-flex align-items-center justify-content-center overflow-hidden rightbar-ad-logo" style={{ background: '#fff' }}>
                <img
                  src="/resources/images/bazaartoday.png"
                  alt="Bazaar Today"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div className="min-w-0">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="badge text-bg-warning text-dark">Advertisement</span>
                  <span className="small text-muted">Sponsored</span>
                </div>
                <div className="fw-bold text-dark text-truncate">Visit bazaartoday.com</div>
                <div className="small text-secondary" style={{ lineHeight: 1.35 }}>
                  Discover deals, listings, and fresh content from Bazaar Today.
                </div>
              </div>
            </div>
          </div>
        </a>

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
              <button
                className="btn btn-outline-secondary rounded-end-pill ms-2"
                type="button"
                title="Refresh groups"
                aria-label="Refresh groups"
                disabled={groupsLoading}
                onClick={loadGroups}
              >
                <i className="bi bi-arrow-clockwise" />
              </button>
            </div>
          </div>
        )}

        {searchError && (
          <div className="text-danger mb-2" style={{ fontSize: '12px' }}>{searchError}</div>
        )}

        {actionError && (
          <div className="text-danger mb-2" style={{ fontSize: '12px' }}>{actionError}</div>
        )}

        {isLoggedIn && (
          <>
            <section className="mb-3 p-3 bg-white border rounded-3 shadow-sm" aria-labelledby="rightbar-groups-heading">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 id="rightbar-groups-heading" className="small fw-bold text-secondary mb-0">
                  Groups ({groups.length})
                </h6>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  onClick={() => setGroupsCollapsed((current) => !current)}
                  aria-expanded={!groupsCollapsed}
                  aria-controls="rightbar-groups-list"
                  title={groupsCollapsed ? 'Expand groups list' : 'Collapse groups list'}
                >
                  <i className={`bi ${groupsCollapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} />
                </button>
              </div>

              {!groupsCollapsed && groupsError ? (
                <div className="small text-danger p-2 border rounded">{groupsError}</div>
              ) : !groupsCollapsed && groupsLoading && groups.length === 0 ? (
                <div className="small text-secondary p-2">
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  Loading groups
                </div>
              ) : !groupsCollapsed && filteredGroups.length > 0 ? (
                <ul id="rightbar-groups-list" className="list-unstyled mb-0">
                  {filteredGroups.map((group) => (
                    <li key={group.id} className="mb-1">
                      <button
                        type="button"
                        className="btn w-100 border-0 d-flex align-items-center gap-2 p-2 text-start rightbar-group-row"
                        onClick={onOpenGroups}
                      >
                        <span
                          className="d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
                          style={{ width: 40, height: 40, borderRadius: 8, background: '#e8eeff', color: '#315ec7' }}
                          aria-hidden="true"
                        >
                          {groupInitials(group.name)}
                        </span>
                        <span className="min-w-0 flex-grow-1">
                          <span className="d-block fw-medium text-dark text-truncate">{group.name}</span>
                        </span>
                        <span className={`badge flex-shrink-0 ${group.isOwner ? 'text-bg-warning' : 'text-bg-light border text-secondary'}`}>
                          {group.isOwner ? 'OWNER' : 'MEMBER'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !groupsCollapsed ? (
                <div className="small text-secondary p-2 bg-light rounded">
                  {normalizedQuery ? 'No matching groups' : 'No groups yet'}
                </div>
              ) : null}
            </section>

            <section className="p-3 bg-white border rounded-3 shadow-sm" aria-labelledby="rightbar-connections-heading">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h6 id="rightbar-connections-heading" className="small fw-bold text-secondary mb-0">
                  People ({connections.length})
                </h6>
              </div>
              <ul className="list-unstyled mb-0">
                {filteredConnections.length > 0 ? (
                  filteredConnections.map((conn) => {
              const isPending = shouldShowPendingBadge(conn);
              const rowKey = String(conn.requestKey || conn.id || conn.email);
              const isSelected = selectedConnectionKey === rowKey;

              return (
              <li key={rowKey} className="mb-2 p-2 rounded hover-bg-light transition-base border border-transparent">
                <div
                  className="d-flex align-items-center justify-content-between gap-2 cursor-pointer"
                  onClick={() => setSelectedConnectionKey(isSelected ? '' : rowKey)}
                >
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
                    <span
                      className={`position-absolute bottom-0 end-0 border border-white rounded-circle p-1 ${conn.status === 'online' ? 'bg-success' : 'bg-secondary'}`}
                      style={{ width: '12px', height: '12px' }}
                    ></span>
                    </div>
                    <span className="fw-medium text-dark text-truncate" style={{ minWidth: 0 }}>{conn.name}</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {isPending && (
                      <span
                        className="badge flex-shrink-0"
                        style={{ backgroundColor: '#ffe08a', color: '#7a4b00', fontWeight: 700, letterSpacing: '0.06em' }}
                      >
                        PENDING
                      </span>
                    )}
                    <i className={`bi ${isSelected ? 'bi-chevron-up' : 'bi-chevron-down'} text-secondary`}></i>
                  </div>
                </div>

                {isSelected && (
                  <div className="d-grid gap-2 mt-2 ps-5" style={{ maxWidth: '180px' }}>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      type="button"
                      disabled={removingConnection}
                      onClick={() => handleRemoveSelectedConnection(conn)}
                    >
                      {removingConnection ? 'Removing...' : 'Remove'}
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      type="button"
                      onClick={() => handleOpenMessage(conn)}
                    >
                      Message
                    </button>
                  </div>
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
            </section>
          </>
        )}
      </div>



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

      {showMessageModal && messageTarget && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2300 }}
          onClick={() => setShowMessageModal(false)}
        >
          <div
            className="bg-white rounded-3 shadow p-3"
            style={{ width: 'min(560px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h6 className="mb-0 fw-bold">Message {messageTarget?.name || 'Connection'}</h6>
              <button className="btn btn-sm btn-light border" type="button" onClick={() => setShowMessageModal(false)}>Close</button>
            </div>

            <div className="border rounded-3 p-2 mb-2" style={{ minHeight: '180px', maxHeight: '280px', overflowY: 'auto', background: '#fafafa' }}>
              {messagesLoading ? (
                <div className="text-secondary small">Loading old messages...</div>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div key={msg.id} className="mb-2 pb-2 border-bottom">
                    <div className="small text-dark">{msg.text}</div>
                    <div className="small text-secondary" style={{ fontSize: '0.72rem' }}>{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}</div>
                  </div>
                ))
              ) : (
                <div className="text-secondary small">No previous messages from you to this user.</div>
              )}
            </div>

            {messagesError && (
              <div className="text-danger mb-2" style={{ fontSize: '12px' }}>{messagesError}</div>
            )}

            <div className="mb-2">
              <textarea
                className="form-control"
                rows={4}
                placeholder="Write your message..."
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
              />
            </div>
            <div className="d-flex justify-content-end">
              <button
                className="btn btn-primary"
                type="button"
                disabled={sendingMessage}
                onClick={handleSendMessage}
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoveConfirmModal && connectionToRemove && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2350 }}
          onClick={() => {
            if (removingConnection) return;
            setShowRemoveConfirmModal(false);
            setConnectionToRemove(null);
          }}
        >
          <div
            className="bg-white rounded-3 shadow p-3"
            style={{ width: 'min(420px, 92vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h6 className="mb-2 fw-bold">Confirm Remove</h6>
            <p className="mb-3 text-secondary" style={{ fontSize: '0.9rem' }}>
              Remove connection with {connectionToRemove?.name || 'this user'}?
            </p>
            <div className="d-flex justify-content-end gap-2">
              <button
                className="btn btn-sm btn-light border"
                type="button"
                disabled={removingConnection}
                onClick={() => {
                  setShowRemoveConfirmModal(false);
                  setConnectionToRemove(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-danger"
                type="button"
                disabled={removingConnection}
                onClick={confirmRemoveSelectedConnection}
              >
                {removingConnection ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .rightbar-group-row:hover,
        .rightbar-group-row:focus-visible {
          background: #f4f7ff;
        }
      `}</style>
    </aside>
  );
}

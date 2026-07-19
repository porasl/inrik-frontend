import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { API_BASE, PUBLIC_BASE } from '../../app.config.js';
import { getUserProfileCached } from '../services/userProfileService';

function escapeGraphQLString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function toPublicUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = String(value).replaceAll('\\', '/');
  const relative = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${PUBLIC_BASE}${relative}`;
}

function initialsFromEmail(email) {
  const local = String(email || 'User').split('@')[0] || 'User';
  return local
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

function CommentAvatar({ email }) {
  const [avatar, setAvatar] = useState('');
  const [hasError, setHasError] = useState(false);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setAvatar('');
    setHasError(false);

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return () => {
        cancelled = true;
      };
    }

    getUserProfileCached(normalizedEmail)
      .then((profile) => {
        if (cancelled) return;
        const profileAvatar = toPublicUrl(profile?.profileImageUrl || '');
        if (profileAvatar) setAvatar(profileAvatar);
      })
      .catch(() => {
        // Initials fallback stays visible.
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedEmail]);

  return (
    <div
      className="rounded-circle overflow-hidden flex-shrink-0 d-flex align-items-center justify-content-center border bg-secondary"
      style={{ width: 28, height: 28 }}
      title={email || 'User'}
    >
      {avatar && !hasError ? (
        <img
          src={avatar}
          alt={email || 'User'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="text-white fw-bold" style={{ fontSize: 11 }}>{initialsFromEmail(email)}</span>
      )}
    </div>
  );
}

function ReplyEditor({ onSubmit, onCancel, autoFocus = false }) {
  const [value, setValue] = useState('');

  return (
    <div className="mt-2 d-grid gap-2">
      <input
        className="form-control form-control-sm"
        placeholder="Write a reply..."
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      />
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={async () => {
            const trimmed = String(value || '').trim();
            if (!trimmed) return;
            const ok = await onSubmit(trimmed);
            if (ok) setValue('');
          }}
        >
          Reply
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CommentBlock({
  comment,
  depth,
  currentUser,
  canModerate = false,
  replyingToId,
  setReplyingToId,
  editingCommentId,
  setEditingCommentId,
  setEditingText,
  deleteComment,
  updateComment,
  replyToComment,
  tree,
}) {
  const isOwner = String(comment.userEmail || '').trim().toLowerCase() === currentUser;
  const canDelete = isOwner || canModerate;
  const replies = tree[comment.id] || [];

  return (
    <div className={`small bg-light border rounded-3 p-2 ${depth ? 'ms-4' : ''}`}>
      <div className="d-flex align-items-start gap-2">
        <CommentAvatar email={comment.userEmail} />
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <div className="text-muted text-truncate">{comment.userEmail || 'User'}</div>
            <div className="d-flex gap-2 flex-wrap justify-content-end">
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none"
                onClick={() => {
                  setReplyingToId(comment.id);
                }}
              >
                Reply
              </button>
              {isOwner && (
                <>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setEditingText(comment.text || '');
                    }}
                  >
                    Edit
                  </button>
                </>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none text-danger"
                  onClick={() => deleteComment(comment.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          {editingCommentId === comment.id ? (
            <div className="mt-2 d-grid gap-2">
              <input
                className="form-control form-control-sm"
                value={editingText}
                onChange={(event) => setEditingText(event.target.value)}
              />
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => updateComment(comment.id)}>
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    setEditingCommentId('');
                    setEditingText('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1">{comment.text}</div>
          )}

          {replyingToId === comment.id && (
            <ReplyEditor
              autoFocus
              onSubmit={async (value) => {
                const ok = await replyToComment(comment.id, value);
                if (ok) setReplyingToId('');
                return ok;
              }}
              onCancel={() => setReplyingToId('')}
            >
            </ReplyEditor>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <div className="d-grid gap-2 mt-2">
          {replies.map((reply) => (
          <CommentBlock
            key={reply.id}
            comment={reply}
            depth={depth + 1}
            currentUser={currentUser}
            canModerate={canModerate}
            replyingToId={replyingToId}
            setReplyingToId={setReplyingToId}
            editingCommentId={editingCommentId}
            setEditingCommentId={setEditingCommentId}
            setEditingText={setEditingText}
              deleteComment={deleteComment}
              updateComment={updateComment}
              replyToComment={replyToComment}
              tree={tree}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostComments({ postId, className = '', compact = false, autoLoad = true, canModerate = false }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [replyingToId, setReplyingToId] = useState('');
  const currentUser = String(localStorage.getItem('email') || localStorage.getItem('author') || localStorage.getItem('userId') || '').trim().toLowerCase();

  const loadComments = useCallback(async ({ force = false } = {}) => {
    if (!postId) return;
    if (loaded && !force) return;

    setLoading(true);
    setError('');
    try {
      const tokenValue = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (tokenValue) headers.Authorization = `Bearer ${tokenValue}`;
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `query { getComments(postId: "${postId}") { id postId text userEmail createdAt parentCommentId } }`,
        }),
      });
      const json = await response.json();
      setComments(Array.isArray(json?.data?.getComments) ? json.data.getComments : []);
      setLoaded(true);
    } catch (err) {
      setComments([]);
      setError(err?.message || 'Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [loaded, postId]);

  useEffect(() => {
    if (autoLoad) loadComments({ force: true });
  }, [autoLoad, loadComments]);

  const tree = comments.reduce((acc, comment) => {
    const key = comment.parentCommentId || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(comment);
    return acc;
  }, {});

  const rootComments = tree[''] || [];

  const addComment = async (event) => {
    event.preventDefault();
    const tokenValue = localStorage.getItem('token');
    if (!tokenValue) {
      setError('Please log in to comment.');
      return;
    }

    const trimmed = String(text || '').trim();
    if (!trimmed) return;

    setError('');
    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          query: `mutation { addComment(postId: "${postId}", text: "${escapeGraphQLString(trimmed)}") { id postId text userEmail createdAt parentCommentId } }`,
        }),
      });
      const json = await response.json();
      const newComment = json?.data?.addComment;
      if (newComment) {
        setText('');
        await loadComments({ force: true });
      } else {
        await loadComments({ force: true });
      }
    } catch (err) {
      setError(err?.message || 'Could not add comment.');
    }
  };

  const updateComment = async (commentId) => {
    const tokenValue = localStorage.getItem('token');
    if (!tokenValue) {
      setError('Please log in to edit comments.');
      return;
    }

    const trimmed = String(editingText || '').trim();
    if (!trimmed) return;

    setError('');
    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          query: `mutation { updateComment(commentId: "${commentId}", text: "${escapeGraphQLString(trimmed)}") { id postId text userEmail createdAt parentCommentId } }`,
        }),
      });
      const json = await response.json();
      const updated = json?.data?.updateComment;
      if (updated) {
        setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)));
        setEditingCommentId('');
        setEditingText('');
      } else {
        await loadComments({ force: true });
        setEditingCommentId('');
        setEditingText('');
      }
    } catch (err) {
      setError(err?.message || 'Could not update comment.');
    }
  };

  const deleteComment = async (commentId) => {
    const tokenValue = localStorage.getItem('token');
    if (!tokenValue) return;
    if (!window.confirm('Delete this comment?')) return;

    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          query: `mutation { deleteComment(commentId: "${commentId}") }`,
        }),
      });
      const json = await response.json();
      if (json?.data?.deleteComment) {
        await loadComments({ force: true });
      } else {
        setError(json?.errors?.[0]?.message || 'Could not delete comment.');
      }
    } catch (err) {
      setError(err?.message || 'Could not delete comment.');
    }
  };

  const replyToComment = async (commentId, textValue) => {
    const tokenValue = localStorage.getItem('token');
    if (!tokenValue) {
      setError('Please log in to reply.');
      return false;
    }
    const trimmed = String(textValue || '').trim();
    if (!trimmed) return false;

    try {
      const response = await fetch(`${API_BASE}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          query: `mutation { replyToComment(postId: "${postId}", parentCommentId: "${commentId}", text: "${escapeGraphQLString(trimmed)}") { id postId text userEmail createdAt parentCommentId } }`,
        }),
      });
      const json = await response.json();
      if (json?.data?.replyToComment) {
        await loadComments({ force: true });
        return true;
      } else {
        setError(json?.errors?.[0]?.message || 'Could not reply.');
      }
    } catch (err) {
      setError(err?.message || 'Could not reply.');
    }
    return false;
  };

  return (
    <div className={className}>
      <form className={`d-flex gap-2 ${compact ? 'mb-2' : 'mb-3'}`} onSubmit={addComment}>
        <input
          className="form-control form-control-sm"
          placeholder="Write a comment..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary">Comment</button>
      </form>
      {error && <div className="small text-danger mb-2">{error}</div>}
      {loading && <div className="small text-secondary">Loading comments...</div>}
      {!loading && comments.length === 0 && <div className="small text-secondary">No comments yet.</div>}
      <div className="d-grid gap-2">
        {rootComments.map((comment) => (
          <CommentBlock
            key={comment.id}
            comment={comment}
            depth={0}
            currentUser={currentUser}
            canModerate={canModerate}
            replyingToId={replyingToId}
            setReplyingToId={setReplyingToId}
            editingCommentId={editingCommentId}
            setEditingCommentId={setEditingCommentId}
            setEditingText={setEditingText}
            deleteComment={deleteComment}
            updateComment={updateComment}
            replyToComment={replyToComment}
            tree={tree}
          />
        ))}
      </div>
    </div>
  );
}

PostComments.propTypes = {
  postId: PropTypes.string.isRequired,
  className: PropTypes.string,
  compact: PropTypes.bool,
  autoLoad: PropTypes.bool,
  canModerate: PropTypes.bool,
};

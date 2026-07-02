import React, { useEffect, useMemo, useState } from 'react';

function loadNotes() {
  try {
    const raw = localStorage.getItem('inrik.notes');
    const notes = raw ? JSON.parse(raw) : [];
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

export default function NoteView() {
  const [notes, setNotes] = useState(() => loadNotes());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    localStorage.setItem('inrik.notes', JSON.stringify(notes));
  }, [notes]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)),
    [notes],
  );

  const handleAddNote = (event) => {
    event.preventDefault();
    const next = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim() || 'Untitled note',
      body: body.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes((current) => [next, ...current]);
    setTitle('');
    setBody('');
  };

  const handleDelete = (id) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  };

  return (
    <div className="border rounded-3 bg-white shadow-sm p-3 p-md-4">
      <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
        <div>
          <h3 className="mb-1">Notes</h3>
          <p className="text-muted mb-0">Quick notes stored in your browser for now.</p>
        </div>
      </div>

      <form className="border rounded-3 p-3 mb-4 bg-light" onSubmit={handleAddNote}>
        <div className="row g-3">
          <div className="col-md-4">
            <input
              type="text"
              className="form-control"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <input
              type="text"
              className="form-control"
              placeholder="Write a short note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="col-md-2 d-grid">
            <button className="btn btn-primary" type="submit">Add note</button>
          </div>
        </div>
      </form>

      <div className="row g-3">
        {sortedNotes.length > 0 ? sortedNotes.map((note) => (
          <div key={note.id} className="col-md-6 col-xl-4">
            <article className="border rounded-3 bg-white p-3 h-100 shadow-sm">
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                <h5 className="mb-0 text-break">{note.title}</h5>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(note.id)}>
                  Delete
                </button>
              </div>
              <p className="mb-0 text-muted text-break" style={{ whiteSpace: 'pre-wrap' }}>{note.body}</p>
            </article>
          </div>
        )) : (
          <div className="col-12">
            <div className="border rounded-3 bg-light p-4 text-center text-muted">
              No notes yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';

const UploadModal = ({ onClose, onUploaded, apiBase = "" }) => {
  const [uploadItems, setUploadItems] = useState([]); // List of {id, name, format, kind, progress, status, previewUrl}
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isMemory, setIsMemory] = useState(false);
  const [isEvent, setIsEvent] = useState(false);
  const [isSlice, setIsSlice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const removedIdsRef = useRef(new Set());

  const decodeJwtPayload = (token) => {
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1] || ''));
    } catch {
      return null;
    }
  };

  const resolveAuthorIdentity = () => {
    const token = localStorage.getItem("token");
    const payload = decodeJwtPayload(token);
    const email = (localStorage.getItem("email") || '').trim();
    const author = (localStorage.getItem("author") || '').trim();
    const userId = (localStorage.getItem("userId") || '').trim();
    const tokenEmail = String(
      payload?.email || payload?.preferred_username || payload?.upn || ''
    ).trim();

    const authorEmail = email || (author.includes('@') ? author : '') || tokenEmail;
    return {
      userId,
      author: authorEmail,
      email: authorEmail,
    };
  };

  const buildEffectiveDescription = (fileName = '') => {
    const text = String(description || '').trim();
    if (text) return text;

    const base = String(fileName || '').replace(/\.[^.]+$/, '').trim();
    return base || 'Uploaded Video';
  };

  useEffect(() => {
    return () => {
      uploadItems.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [uploadItems]);

  const getFileKind = (file) => {
    const mime = (file?.type || '').toLowerCase();
    const ext = (file?.name?.split('.').pop() || '').toLowerCase();

    if (mime.startsWith('video/')) return 'Video';
    if (mime.startsWith('audio/')) return 'Audio';
    if (mime.startsWith('image/')) return 'Image';

    if (['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac'].includes(ext)) return 'Audio';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'Video';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'Image';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Excel';
    if (['doc', 'docx', 'txt', 'rtf', 'pdf'].includes(ext)) return 'Document';
    if (['php'].includes(ext)) return 'Code';

    return 'File';
  };

  const getKindIcon = (kind) => {
    if (kind === 'Video') return 'bi-film';
    if (kind === 'Audio') return 'bi-music-note-beamed';
    if (kind === 'Image') return 'bi-image';
    if (kind === 'Excel') return 'bi-file-earmark-spreadsheet';
    if (kind === 'Document') return 'bi-file-earmark-text';
    if (kind === 'Code') return 'bi-file-earmark-code';
    return 'bi-file-earmark';
  };

  const hasPreview = (kind) => kind === 'Image' || kind === 'Video' || kind === 'Audio';

  const updateItem = (id, patch) => {
    setUploadItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadSingleFile = (selectedFile, onProgress) => {
    if (!selectedFile) return Promise.resolve({ ok: false, error: 'No file selected' });

    const token = localStorage.getItem("token");
    const { userId, author, email } = resolveAuthorIdentity();
    const effectiveDescription = buildEffectiveDescription(selectedFile.name);

    if (!author) {
      return Promise.resolve({ ok: false, error: 'Missing author email. Please logout and login again.' });
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    const savedPostId = localStorage.getItem("postId");
    formData.append("postId", savedPostId && savedPostId !== "undefined" ? savedPostId : "");

    formData.append("userId", userId || "");
    formData.append("author", author);
    formData.append("email", email || author);
    formData.append("description", effectiveDescription);

    formData.append("ispublic", String(isPublic));
    formData.append("ismemory", String(isMemory));
    formData.append("isevent", String(isEvent));
    formData.append("isslice", String(isSlice));

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${apiBase}/api/upload`, true);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let data = {};
          try {
            data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch (parseError) {
            resolve({ ok: false, error: `Invalid server response: ${parseError.message}` });
            return;
          }

          if (data.id) {
            localStorage.setItem("postId", data.id);
          }
          resolve({ ok: true, data });
          return;
        }

        resolve({ ok: false, error: `Server returned ${xhr.status}: ${xhr.responseText || 'Upload failed'}` });
      };

      xhr.onerror = () => {
        resolve({ ok: false, error: 'Network error during upload' });
      };

      xhr.send(formData);
    });
  };

  // 1. Initial/Subsequent Upload (supports multiple files)
  const handleFileChange = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (!files.length) return;

    const newItems = files.map((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const kind = getFileKind(file);
      const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();
      const previewUrl = hasPreview(kind) ? URL.createObjectURL(file) : '';
      return {
        id,
        file,
        name: file.name,
        format: ext,
        kind,
        progress: 0,
        status: 'queued',
        error: '' ,
        previewUrl
      };
    });

    setUploadItems((prev) => [...prev, ...newItems]);

    setUploading(true);

    try {
      for (let i = 0; i < newItems.length; i += 1) {
        const current = newItems[i];
        if (removedIdsRef.current.has(current.id)) continue;

        setUploadStatus(`Uploading ${i + 1} of ${newItems.length}: ${current.name}`);
        updateItem(current.id, { status: 'uploading', progress: 0, error: '' });

        const result = await uploadSingleFile(current.file, (percent) => {
          if (!removedIdsRef.current.has(current.id)) {
            updateItem(current.id, { progress: percent });
          }
        });

        if (removedIdsRef.current.has(current.id)) continue;

        if (result.ok) {
          updateItem(current.id, { status: 'uploaded', progress: 100 });
        } else {
          updateItem(current.id, { status: 'failed', error: result.error || 'Upload failed' });
        }
      }
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  // 2. Final Submit (Update the post metadata)
  const handleFinalSubmit = async () => {
    const savedPostId = localStorage.getItem("postId");
    const successfulItems = uploadItems.filter((item) => item.status === 'uploaded');

    if (!savedPostId || successfulItems.length === 0) {
      alert("Please upload at least one file first.");
      return;
    }

    const token = localStorage.getItem("token");
    const { userId, author, email } = resolveAuthorIdentity();
    const effectiveDescription = buildEffectiveDescription(successfulItems[0]?.name || '');

    if (!author) {
      alert('Missing author email. Please logout and login again.');
      return;
    }

    const updatePayload = {
      id: savedPostId,
      description: effectiveDescription,
      ispublic: isPublic,
      ismemory: isMemory,
      isevent: isEvent,
      isslice: isSlice,
      userId: userId || '',
      author
    };

    updatePayload.email = email || author;

    try {
      const res = await fetch(`${apiBase}/api/posts/update`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });

      if (res.ok) {
        alert("Post finalized successfully!");
        localStorage.removeItem("postId");
        if (onUploaded) onUploaded(); else onClose();
      }
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const handleRemoveItem = (itemId) => {
    removedIdsRef.current.add(itemId);

    setUploadItems((prev) => {
      const target = prev.find((item) => item.id === itemId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== itemId);
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFileChange(e.dataTransfer.files);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-custom shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="m-0 fw-bold">Upload Content</h4>
          <button className="btn-close" onClick={onClose}></button>
        </div>

        {/* Drop Zone */}
        <div
          className="drop-zone border rounded-3 p-3 text-center mb-3"
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{ borderStyle: 'dashed', backgroundColor: '#f8f9fa' }}
        >
          {uploading ? (
            <div className="py-2">
              <div className="spinner-border spinner-border-sm text-primary me-2"></div>
              <span className="small">{uploadStatus || 'Syncing with server...'}</span>
            </div>
          ) : (
            <>
              <p className="small mb-2 text-muted">Drag & Drop or browse to add multiple files (video, mp3, image, docs, excel, php)</p>
              <input
                type="file"
                className="d-none"
                id="multiInput"
                multiple
                accept="video/*,audio/*,image/*,.mp3,.wav,.aac,.ogg,.m4a,.flac,.mp4,.mov,.avi,.mkv,.webm,.m4v,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.xls,.xlsx,.csv,.doc,.docx,.txt,.rtf,.pdf,.php"
                onChange={e => {
                  handleFileChange(e.target.files);
                  e.target.value = '';
                }}
              />
              <label htmlFor="multiInput" className="btn btn-sm btn-outline-primary">Add File</label>
            </>
          )}
        </div>

        {/* Uploaded Files List */}
        {uploadItems.length > 0 && (
          <div className="uploaded-list mb-3 border rounded p-2" style={{ maxHeight: '220px', overflowY: 'auto', backgroundColor: '#fff' }}>
            <label className="x-small fw-bold text-uppercase text-secondary mb-1 d-block" style={{ fontSize: '10px' }}>Attached to Post:</label>
            {uploadItems.map((f) => (
              <div key={f.id} className="d-flex justify-content-between align-items-start border-bottom py-2 gap-2">
                <div className="d-flex align-items-start gap-2 flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="border rounded d-flex align-items-center justify-content-center bg-light" style={{ width: '42px', height: '42px', flexShrink: 0 }}>
                    {f.kind === 'Image' && f.previewUrl ? (
                      <img src={f.previewUrl} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                    ) : (
                      <i className={`bi ${getKindIcon(f.kind)} text-secondary`} style={{ fontSize: '18px' }}></i>
                    )}
                  </div>

                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="small text-truncate me-2" title={f.name}>{f.name}</div>
                    <div className="d-flex align-items-center gap-1 flex-wrap mt-1">
                      <span className="badge bg-secondary" style={{ fontSize: '10px' }}>{f.kind}</span>
                      <span className="badge bg-dark" style={{ fontSize: '10px' }}>{f.format}</span>
                      {f.status === 'uploading' && <span className="badge bg-info text-dark" style={{ fontSize: '10px' }}>{f.progress}%</span>}
                      {f.status === 'uploaded' && <span className="badge bg-success" style={{ fontSize: '10px' }}>Uploaded</span>}
                      {f.status === 'failed' && <span className="badge bg-danger" style={{ fontSize: '10px' }}>Failed</span>}
                    </div>

                    {(f.status === 'uploading' || f.status === 'queued') && (
                      <div className="progress mt-1" style={{ height: '4px' }}>
                        <div className="progress-bar" role="progressbar" style={{ width: `${Math.max(2, f.progress)}%` }} aria-valuenow={f.progress} aria-valuemin="0" aria-valuemax="100" />
                      </div>
                    )}

                    {f.error && (
                      <div className="text-danger" style={{ fontSize: '11px' }}>{f.error}</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => handleRemoveItem(f.id)}
                  title="Remove"
                  disabled={f.status === 'uploading'}
                >
                  <i className="bi bi-x"></i>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3">
          <label className="small fw-bold text-secondary">Post Description</label>
          <textarea
            className="form-control"
            rows="2"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe this upload..."
          />
        </div>

        {/* Switches */}
        <div className="privacy-options d-flex flex-wrap gap-2 mb-3">
          {/* Switches remain as per your logic */}
          <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /><label className="form-check-label small">Public</label></div>
          <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={isMemory} onChange={e => setIsMemory(e.target.checked)} /><label className="form-check-label small">Memory</label></div>
          <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={isEvent} onChange={e => setIsEvent(e.target.checked)} /><label className="form-check-label small">Event</label></div>
          <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={isSlice} onChange={e => setIsSlice(e.target.checked)} /><label className="form-check-label small">Reel</label></div>
        </div>

        <div className="d-flex justify-content-end gap-2 pt-2 border-top">
          <button className="btn btn-light btn-sm border" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm px-4 fw-bold" onClick={handleFinalSubmit}>
            {uploadItems.filter((item) => item.status === 'uploaded').length > 1
              ? `Submit ${uploadItems.filter((item) => item.status === 'uploaded').length} Items`
              : "Submit Post"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
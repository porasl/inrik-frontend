import React, { useState } from 'react';

const UploadModal = ({ onClose, onUploaded, apiBase = "" }) => {
  const [uploadedFiles, setUploadedFiles] = useState([]); // List of {name, format}
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isMemory, setIsMemory] = useState(false);
  const [isEvent, setIsEvent] = useState(false);
  const [isSlice, setIsSlice] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 1. Initial/Subsequent Upload
  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setUploading(true);

    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    const formData = new FormData();
    formData.append("file", selectedFile);

    // Ensure we send "0" or valid ID, never null/undefined strings
    const savedPostId = localStorage.getItem("postId");
    formData.append("postId", savedPostId && savedPostId !== "undefined" ? savedPostId : "");

    formData.append("userId", userId || "");
    formData.append("author", userId || "");
    formData.append("description", description || "");

    // Backend often expects "true"/"false" as strings or 1/0 for multipart
    formData.append("ispublic", String(isPublic));
    formData.append("ismemory", String(isMemory));
    formData.append("isevent", String(isEvent));
    formData.append("isslice", String(isSlice));

    try {
      const response = await fetch(`${apiBase}/api/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
          // Note: Do NOT set 'Content-Type' header here, 
          // the browser must set it automatically for FormData
        },
        body: formData
      });

      // Handle non-JSON errors (like the 500 error you saw)
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server Error Text:", errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.id) {
        localStorage.setItem("postId", data.id);
        const fileExt = selectedFile.name.split('.').pop().toUpperCase();
        setUploadedFiles(prev => [...prev, { name: selectedFile.name, format: fileExt }]);
      }
    } catch (err) {
      console.error("Upload error details:", err);
      alert("Upload failed. Check console for server error message.");
    } finally {
      setUploading(false);
    }
  };

  // 2. Final Submit (Update the post metadata)
  const handleFinalSubmit = async () => {
    const savedPostId = localStorage.getItem("postId");
    if (!savedPostId || uploadedFiles.length === 0) {
      alert("Please upload at least one file first.");
      return;
    }

    const token = localStorage.getItem("token");
    const updatePayload = {
      id: savedPostId,
      description: description,
      ispublic: isPublic,
      ismemory: isMemory,
      isevent: isEvent,
      isslice: isSlice,
      author: localStorage.getItem("userId") || ""
    };

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

  const onDrop = (e) => {
    e.preventDefault();
    handleFileChange(e.dataTransfer.files[0]);
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
              <span className="small">Syncing with server...</span>
            </div>
          ) : (
            <>
              <p className="small mb-2 text-muted">Drag & Drop or browse to add more files</p>
              <input type="file" className="d-none" id="multiInput" onChange={e => handleFileChange(e.target.files[0])} />
              <label htmlFor="multiInput" className="btn btn-sm btn-outline-primary">Add File</label>
            </>
          )}
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="uploaded-list mb-3 border rounded p-2" style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: '#fff' }}>
            <label className="x-small fw-bold text-uppercase text-secondary mb-1 d-block" style={{ fontSize: '10px' }}>Attached to Post:</label>
            {uploadedFiles.map((f, index) => (
              <div key={index} className="d-flex justify-content-between align-items-center border-bottom py-1">
                <span className="small text-truncate me-2" style={{ maxWidth: '200px' }}>{f.name}</span>
                <span className="badge bg-dark" style={{ fontSize: '10px' }}>{f.format}</span>
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
            {uploadedFiles.length > 1 ? `Submit ${uploadedFiles.length} Items` : "Submit Post"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
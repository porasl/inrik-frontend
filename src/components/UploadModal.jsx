import React, { useState, useEffect } from 'react';

const API_BASE = "http://192.168.4.63:8082"; // Matches your app.js

const UploadModal = ({ onClose }) => {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true); // Default to Public as requested
  const [isMemory, setIsMemory] = useState(false);
  const [isEvent, setIsEvent] = useState(false);
  const [isSlice, setIsSlice] = useState(false); // "Reel" option
  const [uploading, setUploading] = useState(false);

  // 1. Initial Upload (Triggered when file is selected/dropped)
  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setUploading(true);

    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("userId", localStorage.getItem("userId") || "");
    
    // Initial status based on current state
    formData.append("ispublic", isPublic);
    formData.append("ismemory", isMemory);
    formData.append("isevent", isEvent);
    formData.append("isslice", isSlice);
    formData.append("author", localStorage.getItem("userId") || "");
    formData.append("description", description);
    
    // Check for existing postId if continuing an upload
    const savedPostId = localStorage.getItem("postId") || "";
    formData.append("postId", savedPostId);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      
      // Store postId in localStorage as app.js does
      if (data.id) {
        localStorage.setItem("postId", data.id);
        console.log("Post created/file uploaded. ID:", data.id);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Initial upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // 2. Final Submit (Update the created post)
  const handleFinalSubmit = async () => {
    const savedPostId = localStorage.getItem("postId");
    if (!savedPostId) {
      alert("Please upload a file first.");
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
      const res = await fetch(`${API_BASE}/api/posts/update`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });

      if (res.ok) {
        alert("Post updated successfully!");
        localStorage.removeItem("postId"); // Cleanup
        onClose();
        window.location.reload(); // Refresh feed
      }
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    handleFileChange(droppedFile);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-custom shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="m-0 fw-bold">Upload Content</h4>
          <button className="btn-close" onClick={onClose}></button>
        </div>

        <div 
          className="drop-zone border rounded-3 p-4 text-center mb-3"
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          style={{ borderStyle: 'dashed !important', backgroundColor: '#f8f9fa' }}
        >
          {uploading ? (
            <div className="spinner-border text-primary" role="status"></div>
          ) : (
            <>
              <p className="mb-1">{file ? file.name : "Drag & Drop video here"}</p>
              <input 
                type="file" 
                className="d-none" 
                id="fileInput" 
                onChange={e => handleFileChange(e.target.files[0])} 
              />
              <label htmlFor="fileInput" className="btn btn-sm btn-outline-primary cursor-pointer">
                Or Browse Files
              </label>
            </>
          )}
        </div>

        <div className="mb-3">
          <label className="small fw-bold text-secondary">Description</label>
          <textarea 
            className="form-control" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="What's on your mind?"
          />
        </div>

        {/* PRIVACY SWITCHES - MATCHING APP.JS */}
        <div className="privacy-options d-flex flex-wrap gap-3 mb-3">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="pubSw" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <label className="form-check-label small" htmlFor="pubSw">Public</label>
          </div>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="memSw" checked={isMemory} onChange={e => setIsMemory(e.target.checked)} />
            <label className="form-check-label small" htmlFor="memSw">Memory</label>
          </div>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="evtSw" checked={isEvent} onChange={e => setIsEvent(e.target.checked)} />
            <label className="form-check-label small" htmlFor="evtSw">Event</label>
          </div>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="slcSw" checked={isSlice} onChange={e => setIsSlice(e.target.checked)} />
            <label className="form-check-label small" htmlFor="slcSw">Reel (Slice)</label>
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2 pt-2">
          <button className="btn btn-light border" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary px-4 fw-bold" onClick={handleFinalSubmit}>Post</button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
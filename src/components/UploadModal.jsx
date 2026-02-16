import React from 'react';

const UploadModal = ({ onClose }) => {
  // Prevent clicks inside the modal from closing it (stops propagation to overlay)
  const handleContentClick = (e) => e.stopPropagation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-custom shadow-lg" onClick={handleContentClick}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="m-0 fw-bold text-dark">Upload Video</h4>
          <button 
            className="btn-close" 
            onClick={onClose} 
            aria-label="Close"
          ></button>
        </div>
        
        <hr className="text-muted" />

        <div className="modal-body py-3">
          <div className="mb-4">
            <label className="form-label small fw-bold text-secondary">Select File</label>
            <input type="file" className="form-control" accept="video/*" />
          </div>
          
          <div className="mb-3">
            <label className="form-label small fw-bold text-secondary">Title</label>
            <input type="text" className="form-control" placeholder="Give your video a name..." />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold text-secondary">Description</label>
            <textarea className="form-control" rows="3" placeholder="Tell viewers about your video..."></textarea>
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2 pt-3">
          <button className="btn btn-light border px-4" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary px-4 fw-bold">Post Video</button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
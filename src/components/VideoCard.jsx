import React from 'react';

export default function VideoCard({ post, onDelete }) {
  return (
    <div className="card shadow-sm border-0" style={{ width: '320px', borderRadius: '12px' }}>
      <div className="position-relative">
        <img 
          src={post.thumbnailUrl} 
          className="card-img-top" 
          alt={post.title} 
          style={{ height: '180px', objectFit: 'cover', borderRadius: '12px 12px 0 0' }} 
        />
        <span className="position-absolute bottom-0 right-0 bg-dark text-white px-2 m-2 small rounded">
          {post.viewCount} views
        </span>
      </div>
      
      <div className="card-body p-3">
        <h6 className="card-title text-truncate">{post.title}</h6>
        
        <div className="d-flex justify-content-between align-items-center mt-3">
          <div className="d-flex gap-3">
            <button className="btn btn-sm btn-outline-secondary border-0 p-0">
              <i className="bi bi-heart text-danger"></i> {post.likeCount}
            </button>
            <button className="btn btn-sm btn-outline-secondary border-0 p-0">
              <i className="bi bi-chat"></i>
            </button>
          </div>
          
          <button onClick={onDelete} className="btn btn-sm text-secondary p-0">
            <i className="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
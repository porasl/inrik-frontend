import React from 'react';

export default function VideoCard({ post, onDelete }) {
  return (
    <div className="card-clean h-100 overflow-hidden" style={{ width: '320px' }}>
      <div className="position-relative bg-light">
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            className="w-100 object-fit-cover"
            alt={post.title || "Video thumbnail"}
            style={{ height: '180px' }}
          />
        ) : (
          <div className="d-flex align-items-center justify-content-center text-secondary-subtle" style={{ height: '180px' }}>
            <i className="bi bi-play-circle fs-1"></i>
          </div>
        )}

        <span className="position-absolute bottom-0 end-0 bg-black bg-opacity-75 text-white px-2 py-1 m-2 rounded small" style={{ fontSize: '0.75rem' }}>
          {post.viewCount || 0} views
        </span>
      </div>

      <div className="p-3">
        <h6 className="card-title text-truncate fw-bold mb-3">{post.title || "Untitled Video"}</h6>

        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-light rounded-pill d-flex align-items-center gap-1 px-3">
              <i className="bi bi-heart text-danger"></i>
              <span className="small fw-medium">{post.likeCount || 0}</span>
            </button>
            <button className="btn btn-sm btn-light rounded-circle" style={{ width: '32px', height: '32px' }}>
              <i className="bi bi-chat text-secondary"></i>
            </button>
          </div>

          <button onClick={onDelete} className="btn btn-sm btn-light text-danger rounded-circle" style={{ width: '32px', height: '32px' }} title="Delete">
            <i className="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
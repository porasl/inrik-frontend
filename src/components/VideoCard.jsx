export default function VideoCard({ video }) {
    return (
      <div className="col-md-4">
        <div className="card bg-dark text-white">
          <video src={video.url} controls width="100%" />
          <div className="card-body">
            <p>{video.description}</p>
            <button onClick={() => handleAction('delete', video.id)}>Delete</button>
          </div>
        </div>
      </div>
    );
  }
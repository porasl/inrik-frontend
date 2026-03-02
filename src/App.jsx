import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Rightbar from './components/Rightbar';
import VideoCard from './components/VideoCard';
import UploadModal from './components/UploadModal';
import VideoWatchPage from './components/VideoWatchPage';
import SliceCarousel from './components/SliceCarousel';

/* ─── Server config ─── */
const Application_IP = "192.168.4.76";
const API_BASE = ""; // Empty string routes API calls to Vite proxy instead of causing CORS 403 on backend
const NOTIFY_URL = `http://${Application_IP}:8084`;
const PUBLIC_BASE = `http://${Application_IP}:3000`; // static file server (no proxy needed)

/* ─── GraphQL query (mirrors app.js fetchAllSlicePosts / setupGraphQLInfiniteScroll) ─── */
const GET_POSTS_QUERY = `
  query($page: Int!, $size: Int!) {
    getAllPostsPaged(page: $page, size: $size) {
      items {
        id
        title: description
        imageUrls
        videoImagePath
        hlsVideoUrls
        slice
        views
        likes
        isLikedByCurrentUser
        userProfileImageUrl
        userFirstName
        userLastName
        email
        author
      }
      pageInfo { page size hasNext }
    }
  }
`;

const GET_DATA_QUERY = `
  query GetInitialData {
    allPosts {
      id
      title
      videoUrl
      thumbnailUrl
      likeCount
      viewCount
      # We need to fetch the nested user data for the avatar
      user {
        avatar
        name
      }
    }
    userConnections {
      id
      name
      avatar
    }
  }
`;
/* ─── Helper: convert FS path → public URL (mirrors app.js toPublicUrl) ─── */
function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  const idx = norm.indexOf("/videos/");
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

function App() {
  /* ─── Auth state ─── */
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    // Restore from the same keys app.js writes on login
    const email = localStorage.getItem("email");
    const firstName = localStorage.getItem("userFirstName");
    const lastName = localStorage.getItem("userLastName");
    const avatar = localStorage.getItem("userProfileImageUrl");
    if (!email) return null;
    return { email, name: [firstName, lastName].filter(Boolean).join(" ") || email, avatar };
  });

  /* ─── Feed state ─── */
  const [posts, setPosts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  /* ─── Watch page state ─── */
  const [watchingPost, setWatchingPost] = useState(null);

  /* ─── Upload modal ─── */
  const [showUpload, setShowUpload] = useState(false);

  /* ────────────────────────────────────────────
     LOGIN  (mirrors app.js loginForm submit)
  ──────────────────────────────────────────── */
  const handleLogin = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error("Invalid login credentials");

      const data = await response.json();

      // app.js stores access_token as "token"
      const token = data.access_token;
      localStorage.setItem("token", token);
      localStorage.setItem("refresh_token", data.refresh_token || "");
      localStorage.setItem("email", email);
      localStorage.setItem("userName", email);
      localStorage.setItem("userId", email);
      localStorage.setItem("author", email);

      const firstName = data.firstname || data.first_name || "";
      const lastName = data.lastname || data.last_name || "";
      const profileUrl = data.profileImageUrl || data.profile_image_url || "";

      if (firstName) localStorage.setItem("userFirstName", firstName);
      else localStorage.removeItem("userFirstName");
      if (lastName) localStorage.setItem("userLastName", lastName);
      else localStorage.removeItem("userLastName");
      if (profileUrl) {
        localStorage.setItem("userProfileImageUrl", profileUrl);
        localStorage.setItem("userProfileImageOwner", email);
      } else {
        localStorage.removeItem("userProfileImageUrl");
        localStorage.removeItem("userProfileImageOwner");
      }

      // Reset upload-related localStorage (mirrors app.js)
      ["postId", "audioUrls", "imageUrls", "videoUrls", "documents", "description",
        "isevent", "ismemory", "ispublic"].forEach(k => localStorage.setItem(k, ""));

      const userData = {
        email,
        name: [firstName, lastName].filter(Boolean).join(" ") || email,
        avatar: profileUrl || null,
      };
      setUser(userData);
      setIsLoggedIn(true);
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed. Please check your credentials.");
    }
  };

  /* ────────────────────────────────────────────
     LOGOUT  (mirrors app.js cleanSession)
  ──────────────────────────────────────────── */
  const handleLogout = () => {
    [
      "token", "refresh_token", "userName", "postId", "audioUrls", "documentUrls", "imageUrls",
      "videoUrls", "author", "description", "documents", "email", "isevent", "ismemory",
      "ispublic", "userId", "userFirstName", "userLastName", "userProfileImageUrl", "userProfileImageOwner"
    ].forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    setUser(null);
    setPosts([]);
    setConnections([]);
    setPage(0);
    setHasNext(true);
  };

  /* ────────────────────────────────────────────
     FETCH POSTS  (mirrors app.js fetchAllSlicePosts / GraphQL pagination)
  ──────────────────────────────────────────── */
  const fetchPosts = async (pageNum = 0, append = false) => {
    const token = localStorage.getItem("token");
    if (!token || isLoading || !hasNext) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ query: GET_POSTS_QUERY, variables: { page: pageNum, size: 15 } }),
      });

      const json = await res.json();
      const data = json?.data?.getAllPostsPaged;
      if (!data) return;

      const items = (data.items || []).map(p => ({
        ...p,
        // Normalise media URLs the same way app.js does
        thumbnailUrl: toPublicUrl(p.videoImagePath || (p.imageUrls?.[0] ?? "")),
        hlsUrl: p.hlsVideoUrls?.[0]
          ? `${PUBLIC_BASE}/` + p.hlsVideoUrls[0].split("webdata/")[1]
          : "",
      }));

      setPosts(prev => append ? [...prev, ...items] : items);
      setHasNext(data.pageInfo?.hasNext ?? false);
      setPage(pageNum);
    } catch (err) {
      console.error("GraphQL fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  /* ────────────────────────────────────────────
     FETCH CONNECTIONS
  ──────────────────────────────────────────── */
  const fetchConnections = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me/connections`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to load connections");
      const data = await res.json();
      const mappedConnections = data.map(conn => ({
        id: conn.id || conn.email || Math.random(),
        name: [conn.firstname, conn.lastname].filter(Boolean).join(" ") || conn.email,
        avatar: conn.profileImageUrl ? toPublicUrl(conn.profileImageUrl) : null,
        status: 'offline' // Adjust as needed based on backend
      }));
      setConnections(mappedConnections);
    } catch (err) {
      console.error(err);
    }
  };

  /* ─── Initial load ─── */
  useEffect(() => {
    if (isLoggedIn) {
      fetchPosts(0, false);
      fetchConnections();
    }
  }, [isLoggedIn]);

  /* ────────────────────────────────────────────
     DELETE POST  (mirrors app.js handleAction 'delete')
  ──────────────────────────────────────────── */
  const handleDeletePost = async (postId) => {
    if (!window.confirm("Are you sure you want to delete this video? This cannot be undone.")) return;
    const token = localStorage.getItem("token");
    try {
      const response = await fetch(`${API_BASE}/api/posts/delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete video: " + err.message);
    }
  };

  /* ────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────── */
  return (
    <div className="app-container">
      <Navbar
        isLoggedIn={isLoggedIn}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onUploadClick={() => setShowUpload(true)}
      />

      <div className="app-body-wrapper">
        <Sidebar onHome={() => setWatchingPost(null)} />

        <main className="main-content">
          {watchingPost ? (
            /* ── WATCH PAGE ── */
            <VideoWatchPage
              post={watchingPost}
              allPosts={posts}
              onWatch={(p) => setWatchingPost(p)}
              onHome={() => setWatchingPost(null)}
            />
          ) : (
            /* ── VIDEO GRID ── */
            <>
              <SliceCarousel onWatch={(p) => setWatchingPost(p)} />
              <div className="video-grid d-flex flex-wrap gap-3">
                {posts.map(post => (
                  <VideoCard
                    key={post.id}
                    post={post}
                    publicBase={PUBLIC_BASE}
                    onDelete={() => handleDeletePost(post.id)}
                    onWatch={(p) => setWatchingPost(p)}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasNext && !isLoading && (
                <div className="text-center my-4">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => fetchPosts(page + 1, true)}
                  >
                    Load more
                  </button>
                </div>
              )}
              {isLoading && (
                <div className="text-center my-4">
                  <div className="spinner-border text-secondary" role="status">
                    <span className="visually-hidden">Loading…</span>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Only show connections rightbar on feed view */}
        {!watchingPost && <Rightbar connections={connections} />}
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-nav d-md-none fixed-bottom bg-white border-top d-flex justify-content-around py-2 shadow-lg" style={{ zIndex: 1030 }}>
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none">
          <i className="bi bi-house-door fs-4"></i>
          <span style={{ fontSize: '10px' }}>Home</span>
        </button>
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none">
          <i className="bi bi-images fs-4"></i>
          <span style={{ fontSize: '10px' }}>Photos</span>
        </button>
        <button
          className="btn btn-link text-primary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none"
          onClick={() => setShowUpload(true)}
        >
          <i className="bi bi-plus-circle-fill" style={{ fontSize: '2rem', marginTop: '-12px' }}></i>
        </button>
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none">
          <i className="bi bi-play-btn fs-4"></i>
          <span style={{ fontSize: '10px' }}>Videos</span>
        </button>
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none">
          <i className="bi bi-music-note-beamed fs-4"></i>
          <span style={{ fontSize: '10px' }}>Audio</span>
        </button>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          apiBase={API_BASE}
          publicBase={PUBLIC_BASE}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); fetchPosts(0, false); }}
        />
      )}
    </div>
  );
}

export default App;
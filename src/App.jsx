import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Rightbar from './components/Rightbar';
import VideoCard from './components/VideoCard';
import UploadModal from './components/UploadModal';
import VideoWatchPage from './components/VideoWatchPage';
import SliceCarousel from './components/SliceCarousel';
import SlicePage from './components/SlicePage';
import { API_BASE, NOTIFY_URL, PUBLIC_BASE } from '../app.config.js';

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

  /* ─── Slice page state ─── */
  const [showSlicePage, setShowSlicePage] = useState(false);
  const [sliceStartId, setSliceStartId] = useState(null);

  /* ─── Upload modal ─── */
  const [showUpload, setShowUpload] = useState(false);

  /* ─── Active sidebar section ─── */
  const [activeSection, setActiveSection] = useState('home'); // 'home' | 'videos' | 'slice'

  /* Helper: reset to home feed */
  const goHome = () => { setWatchingPost(null); setShowSlicePage(false); setSliceStartId(null); setActiveSection('home'); };

  /* Helper: go to Videos — open watch page on the first available post */
  const goVideos = () => { setShowSlicePage(false); setSliceStartId(null); setActiveSection('videos'); setWatchingPost(posts[0] ?? null); };

  /* Helper: open slice page at a specific post */
  const openSlicePage = (postId = null) => {
    setSliceStartId(postId);
    setShowSlicePage(true);
    setWatchingPost(null);
    setActiveSection('slice');
  };

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
      setWatchingPost(null);
      setShowSlicePage(false);
      setSliceStartId(null);
      setActiveSection('home');
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
    setWatchingPost(null);
    setShowSlicePage(false);
    setSliceStartId(null);
    setActiveSection('home');
  };

  /* ────────────────────────────────────────────
     REFRESH ACCESS TOKEN
     Calls /api/auth/refresh-token with the stored
     refresh token. Returns the new access token, or
     null if refresh fails (triggers logout).
  ──────────────────────────────────────────── */
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      handleLogout();
      return null;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${refreshToken}` },
      });
      if (!res.ok) {
        handleLogout();
        return null;
      }
      const data = await res.json();
      const newToken = data.access_token;
      if (!newToken) { handleLogout(); return null; }
      localStorage.setItem("token", newToken);
      if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      return newToken;
    } catch {
      handleLogout();
      return null;
    }
  };

  /* ────────────────────────────────────────────
     AUTH FETCH
     Drop-in replacement for fetch() that:
       1. Attaches the Bearer token automatically.
       2. On 401, tries to refresh the token once.
       3. Retries the original request with the new token.
       4. If refresh also fails, logs the user out.
  ──────────────────────────────────────────── */
  const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
      ...(options.headers || {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    };

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Token expired — try to refresh
      const newToken = await refreshAccessToken();
      if (!newToken) return res; // logout already triggered

      // Retry with the fresh token
      const retryHeaders = { ...headers, "Authorization": `Bearer ${newToken}` };
      res = await fetch(url, { ...options, headers: retryHeaders });

      // If still 401 after refresh, force logout
      if (res.status === 401) handleLogout();
    }

    return res;
  };

  /* ────────────────────────────────────────────
     STARTUP TOKEN CHECK
     On mount, if a token exists but looks expired
     (or on any 401 at startup), silently refresh it
     so connections and feed load correctly.
  ──────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !isLoggedIn) return;

    // Decode JWT payload (no library needed — just base64)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expiresAt = payload.exp * 1000; // convert to ms
      const nowMs = Date.now();
      const fiveMinMs = 5 * 60 * 1000;

      if (expiresAt - nowMs < fiveMinMs) {
        // Token is expired or expires within 5 minutes — refresh now
        refreshAccessToken();
      }
    } catch {
      // Malformed token — try to refresh or logout
      refreshAccessToken();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ────────────────────────────────────────────
     FETCH POSTS  (mirrors app.js fetchAllSlicePosts / GraphQL pagination)
  ──────────────────────────────────────────── */
  const fetchPosts = async (pageNum = 0, append = false) => {
    if (isLoading || !hasNext) return;

    setIsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: GET_POSTS_QUERY, variables: { page: pageNum, size: 15 } }),
      });

      if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);

      const json = await res.json();
      const data = json?.data?.getAllPostsPaged;
      if (!data) return;

      const items = (data.items || []).map(p => ({
        ...p,
        thumbnailUrl: toPublicUrl(p.videoImagePath || (p.imageUrls?.[0] ?? "")),
        hlsUrl: p.hlsVideoUrls?.[0]
          ? `${PUBLIC_BASE}/` + p.hlsVideoUrls[0].split("webdata/")[1]
          : "",
        // Map flat user fields into nested user object that VideoCard/VideoWatchPage expect
        user: {
          name: [p.userFirstName, p.userLastName].filter(Boolean).join(" ") || p.author || p.email || "User",
          avatar: p.userProfileImageUrl || null,
        },
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
    if (!localStorage.getItem("token")) return;
    try {
      const res = await authFetch(`${API_BASE}/api/auth/me/connections`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load connections");
      const data = await res.json();
      const mappedConnections = data.map(conn => ({
        id: conn.id || conn.email || Math.random(),
        name: [conn.firstname, conn.lastname].filter(Boolean).join(" ") || conn.email,
        avatar: conn.profileImageUrl ? toPublicUrl(conn.profileImageUrl) : null,
        status: 'offline'
      }));
      setConnections(mappedConnections);
    } catch (err) {
      console.error(err);
    }
  };

  /* ─── Initial load — always fetch posts (public visible without login) ─── */
  useEffect(() => {
    fetchPosts(0, false);
    if (isLoggedIn) fetchConnections();
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
    <div className={`app-container ${isLoggedIn ? 'is-logged-in' : 'is-logged-out'}`}>
      <Navbar
        isLoggedIn={isLoggedIn}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onUploadClick={() => setShowUpload(true)}
         onHome={goHome}
      />

      <div className="app-body-wrapper">
        <Sidebar
          onHome={goHome}
          onVideos={goVideos}
          onSlice={() => { setShowSlicePage(true); setWatchingPost(null); setActiveSection('slice'); }}
        />

        <main className="main-content">
          {showSlicePage ? (
            /* ── SLICE PAGE ── */
            <SlicePage startPostId={sliceStartId} onClose={goHome} />
          ) : watchingPost ? (
            /* ── WATCH PAGE ── */
            <VideoWatchPage
              post={watchingPost}
              allPosts={posts}
              onWatch={(p) => setWatchingPost(p)}
              onHome={goHome}
            />
          ) : (
            /* ── HOME FEED ── */
            <>
              <SliceCarousel onWatch={(p) => openSlicePage(p.id)} />
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

        {/* Only show connections rightbar on feed/videos view */}
        {!watchingPost && !showSlicePage && <Rightbar connections={connections} />}
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-nav d-lg-none fixed-bottom bg-white border-top d-flex justify-content-around py-2 shadow-lg" style={{ zIndex: 1030 }}>
        <button
          className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none"
          onClick={goHome}
        >
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
        <button
          className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none"
          onClick={goVideos}
        >
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
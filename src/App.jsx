import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Rightbar from './components/Rightbar';
import VideoCard from './components/VideoCard';
import UploadModal from './components/UploadModal';
import VideoWatchPage from './components/VideoWatchPage';
import SliceCarousel from './components/SliceCarousel';
import SlicePage from './components/SlicePage';
import AudioPage from './components/AudioPage';
import PhotoPage from './components/PhotoPage';
import { API_BASE, PUBLIC_BASE } from '../app.config.js';
import { getPagedPosts, invalidatePostsCache, subscribePostsCacheUpdates, subscribePostsRefreshStatus } from './services/postsService';
import { invalidatePhotoCache } from './services/photoService';
import useDelayedVisibility from './hooks/useDelayedVisibility';

function toPublicUrl(fsPath) {
  if (!fsPath) return "";
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, "/");
  const idx = norm.indexOf("/videos/");
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith("/") ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function extractUserId({ token, responseData, fallbackEmail }) {
  const payload = decodeJwtPayload(token);
  const candidates = [
    responseData?.userId,
    responseData?.userid,
    responseData?.id,
    responseData?.sub,
    payload?.userId,
    payload?.userid,
    payload?.id,
    payload?.uid,
    payload?.sub,
    fallbackEmail,
  ];

  const resolved = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return resolved ? String(resolved) : "";
}

function syncStoredUserId(token, responseData, fallbackEmail) {
  const resolvedUserId = extractUserId({ token, responseData, fallbackEmail });
  if (resolvedUserId) {
    localStorage.setItem("userId", resolvedUserId);
  }
  return resolvedUserId;
}

function isHiddenVideoTitle(title) {
  const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized === 'untitled video' || normalized === 'untilted video';
}

function collectConnectionStatusMarkers(value, depth = 0, markers = []) {
  if (depth > 3 || value == null) return markers;

  if (Array.isArray(value)) {
    value.forEach((item) => collectConnectionStatusMarkers(item, depth + 1, markers));
    return markers;
  }

  if (typeof value !== 'object') return markers;

  Object.entries(value).forEach(([key, entry]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const isStatusLikeKey = /(status|state|pending|request|invite|friend)/i.test(normalizedKey);

    if (typeof entry === 'string' && isStatusLikeKey) {
      markers.push(entry);
    } else if (typeof entry === 'boolean' && isStatusLikeKey && entry) {
      markers.push(normalizedKey);
    } else if (entry && typeof entry === 'object') {
      collectConnectionStatusMarkers(entry, depth + 1, markers);
    }
  });

  return markers;
}

function normalizeConnectionStatusMarkers(connection) {
  return collectConnectionStatusMarkers(connection)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function isPendingConnection(connection) {
  const booleanFlags = [
    connection?.pending,
    connection?.isPending,
    connection?.requestPending,
    connection?.hasPendingRequest,
    connection?.pendingRequest,
  ];

  if (booleanFlags.some((flag) => flag === true)) {
    return true;
  }

  const statusValues = [
    connection?.status,
    connection?.connectionStatus,
    connection?.requestStatus,
    connection?.inviteStatus,
    connection?.state,
    connection?.connectionState,
    connection?.friendStatus,
    connection?.friendshipStatus,
    connection?.approvalStatus,
    connection?.request?.status,
    connection?.invite?.status,
    connection?.connection?.status,
    ...normalizeConnectionStatusMarkers(connection),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return statusValues.some((value) => (
    value === 'pending'
    || value === 'pending_connection'
    || value === 'pending-connection'
    || value === 'requested'
    || value === 'request_sent'
    || value === 'request-sent'
    || value === 'sent'
    || value === 'awaiting_acceptance'
    || value === 'awaiting-acceptance'
    || value === 'waiting'
  ));
}

function getConnectionPresenceStatus(connection) {
  const statusValues = [
    connection?.presenceStatus,
    connection?.onlineStatus,
    connection?.status,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return statusValues.includes('online') ? 'online' : 'offline';
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
  const [activeSection, setActiveSection] = useState('home'); // 'home' | 'videos' | 'slice' | 'audio'
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const showFeedRefreshing = useDelayedVisibility(isFeedRefreshing, {
    showDelayMs: 240,
    minVisibleMs: 700,
  });
  const didRunInitialFetch = useRef(false);
  const pageRef = useRef(0);
  const loadMoreSentinelRef = useRef(null);
  const autoLoadLockRef = useRef(false);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const visibleVideoPosts = posts.filter((post) => !isHiddenVideoTitle(post?.title));
  const mainFeedPosts = visibleVideoPosts.filter((post) => post?.slice !== true);

  useEffect(() => {
    const shouldAutoLoad = activeSection !== 'audio' && activeSection !== 'photos' && !showSlicePage && !watchingPost;
    if (!shouldAutoLoad) return;

    const target = loadMoreSentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasNext || isLoading || autoLoadLockRef.current) return;

        autoLoadLockRef.current = true;
        fetchPosts(pageRef.current + 1, true)
          .finally(() => {
            autoLoadLockRef.current = false;
          });
      },
      { root: null, rootMargin: '220px 0px', threshold: 0.01 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeSection, showSlicePage, watchingPost, hasNext, isLoading]);

  /* Helper: reset to home feed */
  const goHome = () => { setWatchingPost(null); setShowSlicePage(false); setSliceStartId(null); setActiveSection('home'); };

  /* Helper: go to Videos — open watch page on the first available post */
  const goVideos = () => { setShowSlicePage(false); setSliceStartId(null); setActiveSection('videos'); setWatchingPost(visibleVideoPosts[0] ?? null); };

  /* Helper: show audio page */
  const goAudio = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('audio'); };

  /* Helper: show photos page */
  const goPhotos = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('photos'); };

  /* Helper: open slice page at a specific post */
  const openSlicePage = (postId = null) => {
    setSliceStartId(postId);
    setShowSlicePage(true);
    setWatchingPost(null);
    setActiveSection('slice');
  };

  /* ────────────────────────────────────────────
     LOGIN 
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
      syncStoredUserId(token, data, email);
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
     LOGOUT  
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
      syncStoredUserId(newToken, data, localStorage.getItem("email") || "");
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

    syncStoredUserId(token, null, localStorage.getItem("email") || "");

    // Decode JWT payload (no library needed — just base64)
    try {
      const payload = decodeJwtPayload(token);
      if (!payload) {
        refreshAccessToken();
        return;
      }
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
  const fetchPosts = async (pageNum = 0, append = false, forceRefresh = false) => {
    if (isLoading) return;
    if (pageNum > 0 && !hasNext) return;

    setIsLoading(true);
    try {
      const data = await getPagedPosts({ page: pageNum, size: 15, forceRefresh });
      if (!data) return;

      const items = data.items || [];

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
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.connections)
          ? data.connections
          : Array.isArray(data?.items)
            ? data.items
            : [];
      const mappedConnections = list.map(conn => ({
        id: conn.id || conn.userId || conn.email || Math.random(),
        name: [conn.firstname || conn.firstName, conn.lastname || conn.lastName].filter(Boolean).join(" ") || conn.name || conn.email,
        email: conn.email || conn.userEmail || '',
        avatar: (conn.profileImageUrl || conn.profile_image_url || conn.avatar || conn.avatarUrl)
          ? toPublicUrl(conn.profileImageUrl || conn.profile_image_url || conn.avatar || conn.avatarUrl)
          : null,
        status: getConnectionPresenceStatus(conn),
        pending: isPendingConnection(conn),
        requestStatus: conn.requestStatus || conn.request?.status || conn.status || conn.connectionStatus || conn.connectionState || conn.state || '',
        rawConnection: conn,
      }));
      setConnections((prev) => {
        const pendingById = new Map(prev.filter((c) => c.pending).map((c) => [String(c.id), c]));
        return mappedConnections.map((conn) => {
          const pendingConn = pendingById.get(String(conn.id));
          return pendingConn ? { ...conn, pending: true } : conn;
        });
      });
      return mappedConnections;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const searchUserById = async (targetUserId) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error('Please log in first.');
    const userId = String(targetUserId || '').trim();
    if (!userId) throw new Error('Missing userId.');

    const maybeInt = Number.parseInt(userId, 10);
    const hasInt = Number.isFinite(maybeInt);

    const graphqlCandidates = [
      {
        query: `query($id: ID!) { getUserById(id: $id) { id userId firstname lastname email profileImageUrl } }`,
        variables: { id: userId },
        pick: (data) => data?.getUserById,
      },
      {
        query: `query($id: Int!) { getUserById(id: $id) { id userId firstname lastname email profileImageUrl } }`,
        variables: hasInt ? { id: maybeInt } : null,
        pick: (data) => data?.getUserById,
      },
      {
        query: `query($userId: ID!) { userById(userId: $userId) { id userId firstname lastname email profileImageUrl } }`,
        variables: { userId },
        pick: (data) => data?.userById,
      },
      {
        query: `query($userId: Int!) { userById(userId: $userId) { id userId firstname lastname email profileImageUrl } }`,
        variables: hasInt ? { userId: maybeInt } : null,
        pick: (data) => data?.userById,
      },
      {
        query: `query($userId: String!) { searchUserById(userId: $userId) { id userId firstname lastname email profileImageUrl } }`,
        variables: { userId },
        pick: (data) => data?.searchUserById,
      },
    ];

    for (const candidate of graphqlCandidates) {
      if (!candidate.variables) continue;
      try {
        const res = await authFetch(`${API_BASE}/graphql`, {
          method: 'POST',
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: candidate.query, variables: candidate.variables }),
        });
        if (!res.ok) continue;

        const json = await res.json();
        if (json?.errors?.length) continue;

        const payload = candidate.pick(json?.data || {});
        if (!payload) continue;

        return {
          id: payload?.id || payload?.userId || userId,
          name: [payload?.firstname, payload?.lastname]
            .filter(Boolean)
            .join(' ') || payload?.email || `User ${userId}`,
          email: payload?.email || '',
          profileImageUrl: payload?.profileImageUrl || '',
          avatar: payload?.profileImageUrl ? toPublicUrl(payload.profileImageUrl) : null,
        };
      } catch {
        // Try next GraphQL shape.
      }
    }

    // Keep popup flow working even when backend query names differ.
    return { id: userId, name: `User ${userId}`, email: '', profileImageUrl: '', avatar: null };
  };

  const addConnectionByUserId = async (targetUser) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error('Please log in first.');
    const userId = String(targetUser?.id || targetUser || '').trim();
    const targetEmail = String(targetUser?.email || '').trim();
    if (!userId) throw new Error('Missing userId.');
    if (!targetEmail) throw new Error('Target user email is required. Search must return a valid email.');

    const tryEndpoints = [
      { url: `${API_BASE}/api/auth/me/connections`, body: { targetEmail } },
      { url: `${API_BASE}/api/auth/connections/add`, body: { targetEmail } },
      { url: `${API_BASE}/api/auth/connections/request`, body: { targetEmail, autoAccept: true } },
    ];

    let accepted = false;
    for (const endpoint of tryEndpoints) {
      try {
        const res = await authFetch(endpoint.url, {
          method: 'POST',
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(endpoint.body),
        });
        if (!res.ok) continue;

        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }

        const explicitFailure = body && (
          body.success === false
          || body.ok === false
          || (typeof body.status === 'string' && body.status.toLowerCase() === 'failed')
        );

        if (explicitFailure) continue;
        accepted = true;
        break;
      } catch {
        // Try next endpoint.
      }
    }

    if (!accepted) {
      throw new Error('No available connection API endpoint responded successfully.');
    }

    const refreshed = await fetchConnections();
    const persisted = refreshed.some((conn) => {
      const connId = String(conn.id || '').trim();
      const connEmail = String(conn.email || '').trim().toLowerCase();
      return connId === userId || (targetEmail && connEmail === targetEmail.toLowerCase());
    });

    if (!persisted) {
      throw new Error('Backend did not persist the connection request yet.');
    }

    setConnections((prev) => prev.map((c) => {
      const connId = String(c.id || '').trim();
      const connEmail = String(c.email || '').trim().toLowerCase();
      const isTarget = connId === userId || (targetEmail && connEmail === targetEmail.toLowerCase());
      return isTarget ? { ...c, pending: true } : c;
    }));
  };

  /* ─── Initial load — always fetch posts (public visible without login) ─── */
  useEffect(() => {
    if (!didRunInitialFetch.current) {
      didRunInitialFetch.current = true;
      fetchPosts(0, false);
    }
    if (isLoggedIn) fetchConnections();
    if (!isLoggedIn) {
      invalidatePostsCache();
      invalidatePhotoCache();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const unsubscribe = subscribePostsCacheUpdates(({ key, items }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (key !== tokenKey) return;

      const loadedPages = pageRef.current + 1;
      const end = loadedPages * 15;
      const nextItems = items.slice(0, end);
      setPosts(nextItems);
      setHasNext(end < items.length);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePostsRefreshStatus(({ key, refreshing }) => {
      const tokenKey = localStorage.getItem('token') || 'anonymous';
      if (key !== tokenKey) return;
      setIsFeedRefreshing(refreshing);
    });

    return unsubscribe;
  }, []);

  /* ────────────────────────────────────────────
     DELETE POST  
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
      invalidatePostsCache();
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete video: " + err.message);
    }
  };

  /* ─────────
     RENDER
  ───────────── */
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
          onAudio={goAudio}
          onPhotos={goPhotos}
          onSlice={() => { setShowSlicePage(true); setWatchingPost(null); setActiveSection('slice'); }}
        />

        <main className="main-content">
          {showFeedRefreshing && activeSection !== 'audio' && activeSection !== 'photos' && !showSlicePage && (
            <div className="mb-2">
              <span className="badge rounded-pill text-bg-light border text-secondary d-inline-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                Refreshing feed...
              </span>
            </div>
          )}

          {showSlicePage ? (
            /* ── SLICE PAGE ── */
            <SlicePage startPostId={sliceStartId} onClose={goHome} />
          ) : activeSection === 'photos' ? (
            /* ── PHOTOS PAGE ── */
            <PhotoPage
              posts={posts}
              isLoggedIn={isLoggedIn}
              onUpload={() => setShowUpload(true)}
            />
          ) : activeSection === 'audio' ? (
            /* ── AUDIO PAGE ── */
            <AudioPage
              posts={posts}
              isLoggedIn={isLoggedIn}
              onUploadAudio={() => setShowUpload(true)}
              hasNext={hasNext}
              isLoading={isLoading}
              onLoadMore={() => fetchPosts(page + 1, true)}
            />
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
                {mainFeedPosts.map(post => (
                  <VideoCard
                    key={post.id}
                    post={post}
                    publicBase={PUBLIC_BASE}
                    onDelete={() => handleDeletePost(post.id)}
                    onWatch={(p) => setWatchingPost(p)}
                  />
                ))}
              </div>

              {/* Infinite-scroll sentinel */}
              {hasNext && <div ref={loadMoreSentinelRef} style={{ height: 1 }} aria-hidden="true" />}
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
        {!watchingPost && !showSlicePage && (
          <Rightbar
            connections={connections}
            isLoggedIn={isLoggedIn}
            onSearchUserById={searchUserById}
            onAddConnection={addConnectionByUserId}
          />
        )}
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
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none" onClick={goPhotos}>
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
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none" onClick={goAudio}>
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
          onUploaded={() => {
            setShowUpload(false);
            invalidatePostsCache();
            invalidatePhotoCache();
            fetchPosts(0, false, true);
          }}
        />
      )}
    </div>
  );
}

export default App;
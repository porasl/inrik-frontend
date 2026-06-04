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
import BoxView from './components/BoxView';
import PostView from './components/PostView';
import GroupView from './components/GroupView';
import { API_BASE, PUBLIC_BASE } from '../app.config.js';
import { getPagedPosts, invalidatePostsCache, subscribePostsCacheUpdates, subscribePostsRefreshStatus } from './services/postsService';
import { invalidatePhotoCache } from './services/photoService';
import useDelayedVisibility from './hooks/useDelayedVisibility';
import ConnectionRequestsModal from './components/ConnectionRequestsModal';

console.log('📦 All app imports loaded, including BoxView');

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

function resolveAccessToken(responseData) {
  const candidates = [
    responseData?.access_token,
    responseData?.accessToken,
    responseData?.token,
    responseData?.jwt,
    responseData?.id_token,
  ];

  const token = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  return token ? token.trim() : '';
}

function resolveRefreshToken(responseData) {
  const candidates = [
    responseData?.refresh_token,
    responseData?.refreshToken,
  ];

  const token = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  return token ? token.trim() : '';
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    
    const expiresAtMs = payload.exp * 1000; // convert to ms
    const nowMs = Date.now();
    const fiveMinMs = 5 * 60 * 1000;
    
    // Token is expired or expires within 5 minutes
    return expiresAtMs - nowMs < fiveMinMs;
  } catch {
    return true; // Malformed token is treated as expired
  }
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

function matchesCurrentUser(value, currentUserId, currentUserEmail) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return normalized === String(currentUserId || '').trim().toLowerCase()
    || normalized === String(currentUserEmail || '').trim().toLowerCase();
}

function isIncomingConnectionRequest(connection, currentUserId, currentUserEmail) {
  if (!isPendingConnection(connection)) return false;

  const incomingFlags = [
    connection?.incoming,
    connection?.isIncoming,
    connection?.requestReceived,
    connection?.receivedRequest,
    connection?.pendingIncoming,
    connection?.rawConnection?.incoming,
    connection?.rawConnection?.isIncoming,
    connection?.rawConnection?.requestReceived,
    connection?.rawConnection?.receivedRequest,
    connection?.rawConnection?.pendingIncoming,
  ];

  if (incomingFlags.includes(true)) return true;

  const directionValues = [
    connection?.direction,
    connection?.requestDirection,
    connection?.requestType,
    connection?.rawConnection?.direction,
    connection?.rawConnection?.requestDirection,
    connection?.rawConnection?.requestType,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (directionValues.some((value) => value === 'incoming' || value === 'received' || value === 'inbound')) {
    return true;
  }

  const receiverCandidates = [
    connection?.receiverId,
    connection?.recipientId,
    connection?.targetUserId,
    connection?.targetEmail,
    connection?.receiverEmail,
    connection?.recipientEmail,
    connection?.rawConnection?.receiverId,
    connection?.rawConnection?.recipientId,
    connection?.rawConnection?.targetUserId,
    connection?.rawConnection?.targetEmail,
    connection?.rawConnection?.receiverEmail,
    connection?.rawConnection?.recipientEmail,
  ];

  const senderCandidates = [
    connection?.senderId,
    connection?.requesterId,
    connection?.requestFrom,
    connection?.requestedBy,
    connection?.senderEmail,
    connection?.requesterEmail,
    connection?.rawConnection?.senderId,
    connection?.rawConnection?.requesterId,
    connection?.rawConnection?.requestFrom,
    connection?.rawConnection?.requestedBy,
    connection?.rawConnection?.senderEmail,
    connection?.rawConnection?.requesterEmail,
  ];

  const receiverMatchesCurrentUser = receiverCandidates.some((value) => matchesCurrentUser(value, currentUserId, currentUserEmail));
  const senderMatchesCurrentUser = senderCandidates.some((value) => matchesCurrentUser(value, currentUserId, currentUserEmail));

  if (receiverMatchesCurrentUser && !senderMatchesCurrentUser) return true;

  return !senderMatchesCurrentUser;
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
  console.log('🚀 App component rendering');
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

  /* ─── Incoming connection requests popup ─── */
  const [incomingRequests, setIncomingRequests] = useState([]);

  /* ─── Active sidebar section ─── */
  const [activeSection, setActiveSection] = useState('home'); // 'home' | 'videos' | 'slice' | 'audio' | 'box' | 'posts' | 'groups' | 'news' | 'sport' | 'art' | 'ai' | 'market'
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const showFeedRefreshing = useDelayedVisibility(isFeedRefreshing, {
    showDelayMs: 240,
    minVisibleMs: 700,
  });
  const didRunInitialFetch = useRef(false);
  const didMobileScrollNudge = useRef(false);
  const pageRef = useRef(0);
  const loadMoreSentinelRef = useRef(null);
  const autoLoadLockRef = useRef(false);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    if (didMobileScrollNudge.current) return;
    didMobileScrollNudge.current = true;

    const w = globalThis;
    const isCoarsePointer = !!w.matchMedia?.('(pointer: coarse)').matches;
    const isStandalone = !!(
      w.matchMedia?.('(display-mode: standalone)').matches
      || w.navigator?.standalone === true
    );

    if (!isCoarsePointer || isStandalone) return;

    const nudgeScroll = () => {
      w.scrollTo(0, 2);
      w.setTimeout(() => w.scrollTo(0, 3), 120);
    };

    if (document.readyState === 'complete') {
      w.requestAnimationFrame(() => {
        w.setTimeout(nudgeScroll, 120);
      });
      return;
    }

    w.addEventListener('load', nudgeScroll, { once: true });
    return () => w.removeEventListener('load', nudgeScroll);
  }, []);

  const visibleVideoPosts = posts.filter((post) => !isHiddenVideoTitle(post?.title));
  const nonSliceVideoPosts = visibleVideoPosts.filter((post) => post?.slice !== true);
  const mainFeedPosts = nonSliceVideoPosts.length > 0 ? nonSliceVideoPosts : visibleVideoPosts;

  useEffect(() => {
    const shouldAutoLoad = activeSection !== 'audio'
      && activeSection !== 'photos'
      && activeSection !== 'box'
      && activeSection !== 'posts'
      && activeSection !== 'groups'
      && activeSection !== 'news'
      && activeSection !== 'sport'
      && activeSection !== 'art'
      && activeSection !== 'ai'
      && activeSection !== 'market'
      && !showSlicePage
      && !watchingPost;
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

  /* Helper: show workstation box view */
  const goBox = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('box'); };

  /* Helper: show post view */
  const goPosts = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('posts'); };

  const goGroups = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('groups'); };

  const goNews = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('news'); };

  const goSport = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('sport'); };

  const goArt = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('art'); };

  const goAi = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('ai'); };

  const goMarket = () => { setShowSlicePage(false); setSliceStartId(null); setWatchingPost(null); setActiveSection('market'); };

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
    [
      'token',
      'refresh_token',
      'access_token',
      'id_token',
      'jwt',
      'userId',
      'email',
      'userName',
      'author',
    ].forEach((key) => localStorage.removeItem(key));
    setIsLoggedIn(false);
    setUser(null);
    setIncomingRequests([]);
    try {
      const response = await fetch(`${API_BASE}/api/auth/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let details = '';
        try {
          details = await response.text();
        } catch {
          details = '';
        }

        const compactDetails = String(details || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid login credentials');
        }

        const message = compactDetails
          ? `Login request failed: ${response.status} ${response.statusText} - ${compactDetails}`
          : `Login request failed: ${response.status} ${response.statusText}`;
        throw new Error(message);
      }

      const data = await response.json();

      const token = resolveAccessToken(data);
      if (!token) throw new Error('No access token returned from authenticate response');
      localStorage.setItem("token", token);
      localStorage.setItem("refresh_token", resolveRefreshToken(data));
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
      alert(err?.message || "Login failed. Please try again.");
    }
  };

  /* ────────────────────────────────────────────
     LOGOUT  
  ──────────────────────────────────────────── */
  const handleLogout = () => {
    [
      "token", "refresh_token", "access_token", "id_token", "jwt", "userName", "postId", "audioUrls", "documentUrls", "imageUrls",
      "videoUrls", "author", "description", "documents", "email", "isevent", "ismemory",
      "ispublic", "userId", "userFirstName", "userLastName", "userProfileImageUrl", "userProfileImageOwner",
      "tokenIssuedAt", "refreshTokenIssuedAt"
    ].forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    setUser(null);
    setPosts([]);
    setConnections([]);
    setIncomingRequests([]);
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
  const refreshAccessToken = async (suppressLogout = false) => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      if (!suppressLogout) handleLogout();
      return null;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${refreshToken}` },
      });
      if (!res.ok) {
        if (!suppressLogout) handleLogout();
        return null;
      }
      const data = await res.json();
      const newToken = resolveAccessToken(data);
      if (!newToken) {
        if (!suppressLogout) handleLogout();
        return null;
      }
      localStorage.setItem("token", newToken);
      syncStoredUserId(newToken, data, localStorage.getItem("email") || "");
      const newRefreshToken = resolveRefreshToken(data);
      if (newRefreshToken) localStorage.setItem("refresh_token", newRefreshToken);
      return newToken;
    } catch {
      if (!suppressLogout) handleLogout();
      return null;
    }
  };

  /* ────────────────────────────────────────────
     AUTH FETCH
     Drop-in replacement for fetch() that:
       1. Checks if token is expired; refreshes if needed.
       2. Attaches the Bearer token automatically.
       3. On 401, tries to refresh the token once.
       4. Retries the original request with the new token.
       5. If refresh also fails, logs the user out.
  ──────────────────────────────────────────── */
  const authFetch = async (url, options = {}) => {
    const { noAutoLogout, skipRefreshOn401, ...fetchOptions } = options;
    let token = localStorage.getItem("token");
    
    // Pre-check: if token is expired/expiring, refresh it now
    if (token && isTokenExpired(token)) {
      const payload = decodeJwtPayload(token);
      if (payload?.iat) {
        const issuedAtMs = payload.iat * 1000;
        const ageMs = Date.now() - issuedAtMs;
        const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));
        console.warn(`Detected expired token - age: ${ageDays} days, iat: ${new Date(issuedAtMs).toISOString()}, exp: ${new Date((payload.exp || 0) * 1000).toISOString()}`);
      }
      
      const newToken = await refreshAccessToken(!!noAutoLogout);
      if (newToken) {
        token = newToken;
      } else if (!noAutoLogout) {
        // Refresh failed and no explicit opt-out — let caller handle 401
        return new Response(JSON.stringify({ error: 'Token expired and refresh failed' }), { status: 401 });
      }
    }
    
    const headers = {
      ...(fetchOptions.headers || {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    };

    let res = await fetch(url, { ...fetchOptions, headers });

    if (res.status === 401) {
      if (skipRefreshOn401) return res;

      // Token expired — try to refresh
      const newToken = await refreshAccessToken(!!noAutoLogout);
      if (!newToken) return res;

      // Retry with the fresh token
      const retryHeaders = { ...headers, "Authorization": `Bearer ${newToken}` };
      res = await fetch(url, { ...fetchOptions, headers: retryHeaders });

      // If still 401 after refresh, force logout
      if (res.status === 401 && !noAutoLogout) handleLogout();
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
      // Stop auto-load retry loops after a backend failure until next manual refresh/login.
      setHasNext(false);
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
      const currentUserId = localStorage.getItem('userId') || user?.email || '';
      const currentUserEmail = localStorage.getItem('email') || user?.email || '';
      const mappedConnections = list.map(conn => {
        const connectionId = conn.connectionId || conn.requestId || conn.connectionRequestId || conn.friendRequestId || '';
        const resolvedEmail = conn.email
          || conn.userEmail
          || conn.senderEmail
          || conn.requesterEmail
          || conn.receiverEmail
          || conn.recipientEmail
          || conn.targetEmail
          || '';
        const resolvedName = [conn.firstname || conn.firstName, conn.lastname || conn.lastName]
          .filter(Boolean)
          .join(" ") || conn.name || resolvedEmail;
        return {
          id: connectionId,
          connectionId,
          requestKey: connectionId || conn.senderId || conn.requesterId || conn.userId || conn.email || Math.random(),
          name: resolvedName,
          email: resolvedEmail,
          avatar: (conn.profileImageUrl || conn.profile_image_url || conn.avatar || conn.avatarUrl)
            ? toPublicUrl(conn.profileImageUrl || conn.profile_image_url || conn.avatar || conn.avatarUrl)
            : null,
          status: getConnectionPresenceStatus(conn),
          pending: isPendingConnection(conn),
          requestStatus: conn.requestStatus || conn.request?.status || conn.status || conn.connectionStatus || conn.connectionState || conn.state || '',
          rawConnection: conn,
        };
      });
      const resolvedConnections = mappedConnections;
      setConnections(resolvedConnections);
      setIncomingRequests(
        resolvedConnections.filter((conn) => isIncomingConnectionRequest(conn.rawConnection || conn, currentUserId, currentUserEmail))
      );
      return resolvedConnections;
    } catch (err) {
      console.error(err);
      setIncomingRequests([]);
      return [];
    }
  };

  const searchUserById = async (targetUserId) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error('Please log in first.');
    const userId = String(targetUserId || '').trim();
    if (!userId) throw new Error('Missing userId.');
    const normalizedSearch = userId.toLowerCase();

    const maybeInt = Number.parseInt(userId, 10);
    const hasInt = Number.isFinite(maybeInt);

    const pickBestUser = (value) => {
      if (!value) return null;
      if (!Array.isArray(value)) return value;

      const startsWithMatch = value.find((item) => {
        const email = String(item?.email || '').trim().toLowerCase();
        const id = String(item?.id || item?.userId || '').trim().toLowerCase();
        const name = [item?.firstname, item?.firstName, item?.lastname, item?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim()
          .toLowerCase();

        return email.startsWith(normalizedSearch)
          || id.startsWith(normalizedSearch)
          || name.startsWith(normalizedSearch);
      });

      if (startsWithMatch) return startsWithMatch;
      return value[0] || null;
    };

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
      {
        query: `query($query: String!) { searchUsers(query: $query) { id userId firstname lastname email profileImageUrl } }`,
        variables: { query: userId },
        pick: (data) => data?.searchUsers,
      },
      {
        query: `query($term: String!) { searchUsers(term: $term) { id userId firstname lastname email profileImageUrl } }`,
        variables: { term: userId },
        pick: (data) => data?.searchUsers,
      },
      {
        query: `query($keyword: String!) { findUsersByKeyword(keyword: $keyword) { id userId firstname lastname email profileImageUrl } }`,
        variables: { keyword: userId },
        pick: (data) => data?.findUsersByKeyword,
      },
      {
        query: `query($email: String!) { getUserByEmail(email: $email) { id userId firstname lastname email profileImageUrl } }`,
        variables: { email: userId },
        pick: (data) => data?.getUserByEmail,
      },
      {
        query: `query($email: String!) { userByEmail(email: $email) { id userId firstname lastname email profileImageUrl } }`,
        variables: { email: userId },
        pick: (data) => data?.userByEmail,
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

        const payload = pickBestUser(candidate.pick(json?.data || {}));
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

    throw new Error('No user found for this userId.');
  };

  /* ────────────────────────────────────────────
     INCOMING CONNECTION REQUESTS
  ──────────────────────────────────────────── */
  const fetchIncomingRequests = async () => {
    return fetchConnections();
  };

  const getConnectionIdentifierCandidates = (req) => {
    const raw = req.rawConnection || {};
    const candidates = [
      raw.connectionId,
      raw.requestId,
      raw.connectionRequestId,
      raw.friendRequestId,
      req.connectionId,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);

    const unique = [...new Set(candidates)];
    // Endpoint expects connection/request Long ID path variable.
    return unique.filter((value) => /^\d+$/.test(value));
  };

  const tryConnectionAction = async (req, action) => {
    const identifiers = getConnectionIdentifierCandidates(req);
    if (!identifiers.length) return { ok: false, status: 0, identifiers };

    const normalizedAction = String(action || '').trim() || 'delete';

    let accessToken = localStorage.getItem('token');
    if (!accessToken) {
      accessToken = await refreshAccessToken(true);
    }
    if (!accessToken) {
      return { ok: false, status: 401, identifiers };
    }

    let lastStatus = 0;
    for (const identifier of identifiers) {
      const res = await authFetch(`${API_BASE}/api/auth/me/connections/${encodeURIComponent(identifier)}/${normalizedAction}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
        noAutoLogout: true,
        skipRefreshOn401: true,
      });

      if (res.ok) return { ok: true, status: res.status, identifiers };
      lastStatus = res.status;

      // Keep local token in sync in case authFetch refreshed it.
      accessToken = localStorage.getItem('token') || accessToken;

      // Stop early for non-auth failures.
      if (res.status !== 401 && res.status !== 404) {
        return { ok: false, status: res.status, identifiers };
      }
    }

    return { ok: false, status: lastStatus, identifiers };
  };

  const acceptConnectionRequest = async (req) => {
    const result = await tryConnectionAction(req, 'accept');
    if (!result.ok) {
      console.error(`Accept connection failed: ${result.status}. Tried: ${result.identifiers.join(', ')}`);
      return;
    }
    setIncomingRequests((prev) => prev.filter((r) => String(r.requestKey || r.id) !== String(req.requestKey || req.id)));
    await fetchConnections();
  };

  const rejectConnectionRequest = async (req) => {
    const result = await tryConnectionAction(req, 'delete');
    if (!result.ok) {
      console.error(`Delete connection failed: ${result.status}. Tried: ${result.identifiers.join(', ')}`);
      return;
    }
    setIncomingRequests((prev) => prev.filter((r) => String(r.requestKey || r.id) !== String(req.requestKey || req.id)));
    await fetchConnections();
  };

  const removeConnection = async (conn) => {
    const result = await tryConnectionAction(conn, 'delete');
    if (!result.ok) {
      throw new Error(`Delete connection failed (${result.status || 'unknown'}).`);
    }
    setIncomingRequests((prev) => prev.filter((r) => String(r.requestKey || r.id) !== String(conn.requestKey || conn.id)));
    await fetchConnections();
  };

  const getConnectionMessagePayload = async (res) => {
    let json = null;
    try {
      json = await res.json();
    } catch {
      return [];
    }

    const list = Array.isArray(json)
      ? json
      : Array.isArray(json?.messages)
        ? json.messages
        : Array.isArray(json?.items)
          ? json.items
          : Array.isArray(json?.data)
            ? json.data
            : [];

    const meEmail = String(localStorage.getItem('email') || '').trim().toLowerCase();
    const meUserId = String(localStorage.getItem('userId') || '').trim().toLowerCase();

    return list
      .map((item, index) => ({
        id: item?.id || item?.messageId || `${index}-${item?.createdAt || ''}`,
        text: item?.text || item?.message || item?.content || '',
        createdAt: item?.createdAt || item?.created_at || item?.sentAt || item?.timestamp || '',
        senderEmail: item?.senderEmail || item?.fromEmail || item?.sender?.email || '',
        senderId: item?.senderId || item?.fromUserId || item?.sender?.id || item?.sender?.userId || '',
      }))
      .filter((item) => {
        const senderEmail = String(item.senderEmail || '').trim().toLowerCase();
        const senderId = String(item.senderId || '').trim().toLowerCase();
        return (meEmail && senderEmail === meEmail) || (meUserId && senderId === meUserId);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return aTime - bTime;
      });
  };

  const getConnectionRecipientCandidates = (conn) => {
    const raw = conn?.rawConnection || {};
    return [
      conn?.email,
      raw?.email,
      raw?.userEmail,
      raw?.senderEmail,
      raw?.requesterEmail,
      raw?.receiverEmail,
      raw?.recipientEmail,
      raw?.targetEmail,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  };

  const fetchSentMessagesForConnection = async (conn) => {
    const identifiers = getConnectionIdentifierCandidates(conn);
    const recipients = getConnectionRecipientCandidates(conn);

    const endpoints = [];
    identifiers.forEach((id) => {
      endpoints.push(`${API_BASE}/api/auth/me/connections/${encodeURIComponent(id)}/messages`);
      endpoints.push(`${API_BASE}/api/auth/me/messages?connectionId=${encodeURIComponent(id)}`);
    });
    recipients.forEach((email) => {
      endpoints.push(`${API_BASE}/api/auth/me/messages?recipientEmail=${encodeURIComponent(email)}`);
    });

    for (const url of endpoints) {
      try {
        const res = await authFetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        return await getConnectionMessagePayload(res);
      } catch {
        // Try next endpoint shape.
      }
    }

    return [];
  };

  const sendMessageToConnection = async (conn, text) => {
    const message = String(text || '').trim();
    if (!message) throw new Error('Message cannot be empty.');

    const identifiers = getConnectionIdentifierCandidates(conn);
    const recipients = getConnectionRecipientCandidates(conn);

    const candidates = [];
    identifiers.forEach((id) => {
      candidates.push({
        url: `${API_BASE}/api/auth/me/connections/${encodeURIComponent(id)}/messages`,
        body: { message },
      });
      candidates.push({
        url: `${API_BASE}/api/auth/me/messages`,
        body: { connectionId: id, message },
      });
    });
    recipients.forEach((email) => {
      candidates.push({
        url: `${API_BASE}/api/auth/me/messages`,
        body: { recipientEmail: email, message },
      });
    });

    for (const candidate of candidates) {
      try {
        const res = await authFetch(candidate.url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(candidate.body),
        });
        if (res.ok) return;
      } catch {
        // Try next candidate.
      }
    }

    throw new Error('Could not send message. Backend message endpoint is not available yet.');
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
    if (isLoggedIn) { fetchConnections(); fetchIncomingRequests(); }
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
  console.log('🎨 Rendering App with logged in:', isLoggedIn, 'section:', activeSection);
  return (
    <div className={`app-container ${isLoggedIn ? 'is-logged-in' : 'is-logged-out'} ${showSlicePage ? 'is-slice-page-open' : ''}`}>
      <Navbar
        isLoggedIn={isLoggedIn}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onUploadClick={() => setShowUpload(true)}
        onHome={goHome}
        onNotes={goHome}
        onVideos={goVideos}
        onPosts={goPosts}
        onSlice={() => { setShowSlicePage(true); setWatchingPost(null); setActiveSection('slice'); }}
        onBox={goBox}
        onAudio={goAudio}
        onPhotos={goPhotos}
        onNews={goNews}
        onSport={goSport}
        onArt={goArt}
        onAi={goAi}
        onMarket={goMarket}
      />

      <div className="app-body-wrapper">
        <Sidebar
          onHome={goHome}
          onVideos={goVideos}
          onPosts={goPosts}
          onAudio={goAudio}
          onGroups={goGroups}
          onPhotos={goPhotos}
          onBox={goBox}
          onSlice={() => { setShowSlicePage(true); setWatchingPost(null); setActiveSection('slice'); }}
          onNotes={goHome}
        />

        <main className="main-content">
          {showFeedRefreshing
            && activeSection !== 'audio'
            && activeSection !== 'photos'
            && activeSection !== 'box'
            && activeSection !== 'posts'
            && activeSection !== 'groups'
            && activeSection !== 'news'
            && activeSection !== 'sport'
            && activeSection !== 'art'
            && activeSection !== 'ai'
            && activeSection !== 'market'
            && !showSlicePage && (
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
          ) : activeSection === 'box' ? (
            /* ── BOX VIEW ── */
            <BoxView posts={posts} user={user} isLoggedIn={isLoggedIn} onHome={goHome} onDelete={handleDeletePost} />
          ) : activeSection === 'posts' ? (
            /* ── POST VIEW ── */
            <PostView
              posts={posts}
              isLoggedIn={isLoggedIn}
              onUpload={() => setShowUpload(true)}
              onDelete={handleDeletePost}
            />
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
          ) : activeSection === 'groups' ? (
            /* ── GROUPS PAGE ── */
            <GroupView token={xAuthToken} userId={userId} />
          ) : activeSection === 'news' ? (
            <div className="p-3 p-md-4 border rounded-3 bg-white shadow-sm">
              <h3 className="mb-2">News View</h3>
              <p className="mb-0 text-muted">Welcome to the News view page.</p>
            </div>
          ) : activeSection === 'sport' ? (
            <div className="p-3 p-md-4 border rounded-3 bg-white shadow-sm">
              <h3 className="mb-2">Sport View</h3>
              <p className="mb-0 text-muted">Welcome to the Sport view page.</p>
            </div>
          ) : activeSection === 'art' ? (
            <div className="p-3 p-md-4 border rounded-3 bg-white shadow-sm">
              <h3 className="mb-2">Art View</h3>
              <p className="mb-0 text-muted">Welcome to the Art view page.</p>
            </div>
          ) : activeSection === 'ai' ? (
            <div className="p-3 p-md-4 border rounded-3 bg-white shadow-sm">
              <h3 className="mb-2">AI View</h3>
              <p className="mb-0 text-muted">Welcome to the AI view page.</p>
            </div>
          ) : activeSection === 'market' ? (
            <div className="p-3 p-md-4 border rounded-3 bg-white shadow-sm">
              <h3 className="mb-2">Market View</h3>
              <p className="mb-0 text-muted">Welcome to the Market view page.</p>
            </div>
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
              <SliceCarousel onWatch={(p) => openSlicePage(p.id)} onDelete={handleDeletePost} />
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

        {/* Keep rightbar mounted on mobile so header menu "Connections" can toggle it */}
        {((!watchingPost && activeSection !== 'box') || globalThis.matchMedia?.('(max-width: 992px)').matches) && (
          <Rightbar
            connections={connections}
            isLoggedIn={isLoggedIn}
            onSearchUserById={searchUserById}
            onAddConnection={addConnectionByUserId}
            onRemoveConnection={removeConnection}
            onFetchSentMessages={fetchSentMessagesForConnection}
            onSendMessage={sendMessageToConnection}
          />
        )}
      </div>

      {/* Incoming connection requests popup */}
      {isLoggedIn && incomingRequests.length > 0 && (
        <ConnectionRequestsModal
          requests={incomingRequests}
          onAccept={acceptConnectionRequest}
          onReject={rejectConnectionRequest}
          onClose={() => setIncomingRequests([])}
        />
      )}

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
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none" onClick={goPosts}>
          <i className="bi bi-card-text fs-4"></i>
          <span style={{ fontSize: '10px' }}>Posts</span>
        </button>
        <button className="btn btn-link text-secondary p-2 d-flex flex-column align-items-center gap-1 text-decoration-none" onClick={goBox}>
          <i className="bi bi-window-stack fs-4"></i>
          <span style={{ fontSize: '10px' }}>Box</span>
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
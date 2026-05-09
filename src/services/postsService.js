import { API_BASE, PUBLIC_BASE } from '../../app.config.js';

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

const cacheByToken = new Map();
const inflightByToken = new Map();
const POSTS_CACHE_TTL_MS = 60 * 1000;
const postsCacheListeners = new Set();
const postsStatusListeners = new Set();

function emitPostsCacheUpdate(payload) {
  postsCacheListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors to keep cache updates resilient.
    }
  });
}

function emitPostsRefreshStatus(payload) {
  postsStatusListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors to keep cache status updates resilient.
    }
  });
}

function toPublicUrl(fsPath) {
  if (!fsPath) return '';
  if (/^https?:\/\//i.test(fsPath)) return fsPath;
  const norm = String(fsPath).replace(/\\/g, '/');
  const idx = norm.indexOf('/videos/');
  const rel = idx >= 0 ? norm.slice(idx) : (norm.startsWith('/') ? norm : `/${norm}`);
  return `${PUBLIC_BASE}${rel}`;
}

function isNumericLike(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function resolveHlsUrl(post) {
  const raw = String(post?.hlsVideoUrls?.[0] || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const norm = raw.replace(/\\/g, '/');
  const webdataIdx = norm.indexOf('webdata/');
  if (webdataIdx >= 0) {
    return `${PUBLIC_BASE}/${norm.slice(webdataIdx + 'webdata/'.length)}`;
  }

  const videosIdx = norm.indexOf('/videos/');
  if (videosIdx >= 0) {
    return `${PUBLIC_BASE}${norm.slice(videosIdx)}`;
  }

  if (norm.startsWith('videos/')) {
    return `${PUBLIC_BASE}/${norm}`;
  }

  return '';
}

function resolveThumbnailUrl(post) {
  const candidates = [post?.videoImagePath, post?.imageUrls?.[0]].filter(Boolean);
  for (const value of candidates) {
    const raw = String(value).trim();
    if (!raw || isNumericLike(raw) || raw.includes('@')) continue;
    const resolved = toPublicUrl(raw);
    if (resolved) return resolved;
  }
  return '';
}

function mapPost(post) {
  const authorValue = String(post.author || '').trim();
  const displayName = [post.userFirstName, post.userLastName].filter(Boolean).join(' ')
    || (!isNumericLike(authorValue) ? authorValue : '')
    || post.email
    || 'User';

  return {
    ...post,
    thumbnailUrl: resolveThumbnailUrl(post),
    hlsUrl: resolveHlsUrl(post),
    user: {
      name: displayName,
      avatar: post.userProfileImageUrl || null,
    },
  };
}

function getTokenKey() {
  return localStorage.getItem('token') || 'anonymous';
}

async function fetchAllPostsFromGraphql(pageSize = 30) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let page = 0;
  let all = [];

  while (true) {
    const res = await fetch(`${API_BASE}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: GET_POSTS_QUERY, variables: { page, size: pageSize } }),
    });

    if (!res.ok) {
      let details = '';
      try {
        details = await res.text();
      } catch {
        details = '';
      }
      const compactDetails = String(details || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const message = compactDetails
        ? `GraphQL request failed: ${res.status} ${res.statusText} - ${compactDetails}`
        : `GraphQL request failed: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }

    const json = await res.json();
    const data = json?.data?.getAllPostsPaged;
    if (!data) break;

    all = all.concat((data.items || []).map(mapPost));

    if (!data.pageInfo?.hasNext) break;
    page += 1;
  }

  return all;
}

export async function getAllPostsCached({ forceRefresh = false, pageSize = 30 } = {}) {
  const key = getTokenKey();
  const now = Date.now();
  const cached = cacheByToken.get(key);

  const startRefresh = () => {
    if (inflightByToken.has(key)) return inflightByToken.get(key);

    emitPostsRefreshStatus({ key, refreshing: true });

    const promise = fetchAllPostsFromGraphql(pageSize)
      .then((items) => {
        cacheByToken.set(key, { items, fetchedAt: Date.now() });
        emitPostsCacheUpdate({ key, items });
        emitPostsRefreshStatus({ key, refreshing: false });
        inflightByToken.delete(key);
        return items;
      })
      .catch((err) => {
        emitPostsRefreshStatus({ key, refreshing: false });
        inflightByToken.delete(key);
        throw err;
      });

    inflightByToken.set(key, promise);
    return promise;
  };

  if (!forceRefresh && cached) {
    const age = now - cached.fetchedAt;
    if (age <= POSTS_CACHE_TTL_MS) {
      return cached.items;
    }

    // Return stale data immediately and refresh in the background.
    startRefresh();
    return cached.items;
  }

  if (inflightByToken.has(key)) {
    return inflightByToken.get(key);
  }

  return startRefresh();
}

export async function getPagedPosts({ page = 0, size = 15, forceRefresh = false } = {}) {
  const all = await getAllPostsCached({ forceRefresh });
  const start = page * size;
  const end = start + size;
  const items = all.slice(start, end);

  return {
    items,
    pageInfo: {
      page,
      size,
      hasNext: end < all.length,
    },
  };
}

export async function getSlicePostsCached({ forceRefresh = false } = {}) {
  const all = await getAllPostsCached({ forceRefresh });
  return all.filter((p) => p.slice === true);
}

export function invalidatePostsCache() {
  cacheByToken.clear();
  inflightByToken.clear();
}

export function subscribePostsCacheUpdates(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  postsCacheListeners.add(listener);
  return () => {
    postsCacheListeners.delete(listener);
  };
}

export function subscribePostsRefreshStatus(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  postsStatusListeners.add(listener);
  return () => {
    postsStatusListeners.delete(listener);
  };
}

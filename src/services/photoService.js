import { API_BASE } from '../../app.config.js';

const GET_MY_PHOTOS_QUERY = `
  query GetMyPhotos($page: Int!, $size: Int!) {
    getMyPhotos(page: $page, size: $size) {
      items {
        id
        description
        imageUrls
        userFirstName
        userLastName
        email
        userProfileImageUrl
        createdAt
        isPublic
      }
      pageInfo { page size hasNext }
    }
  }
`;

const GET_PUBLIC_PHOTOS_QUERY = `
  query GetPublicPhotos($page: Int!, $size: Int!) {
    getPublicPhotos(page: $page, size: $size) {
      items {
        id
        description
        imageUrls
        userFirstName
        userLastName
        email
        userProfileImageUrl
        createdAt
        isPublic
      }
      pageInfo { page size hasNext }
    }
  }
`;

const pageCache = new Map();
const inflight = new Map();
const PHOTO_CACHE_TTL_MS = 45 * 1000;
const photoCacheListeners = new Set();
const photoStatusListeners = new Set();

function emitPhotoCacheUpdate(payload) {
  photoCacheListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors to keep cache updates resilient.
    }
  });
}

function emitPhotoRefreshStatus(payload) {
  photoStatusListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors to keep cache status updates resilient.
    }
  });
}

function tokenPart() {
  return localStorage.getItem('token') || 'anonymous';
}

function cacheKey(type, page, size) {
  return `${tokenPart()}::${type}::${page}::${size}`;
}

async function gql(query, variables) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL error: ${res.status}`);
  }

  return res.json();
}

async function getPage(type, page, size, forceRefresh = false) {
  const key = cacheKey(type, page, size);
  const now = Date.now();
  const cached = pageCache.get(key);

  const query = type === 'mine' ? GET_MY_PHOTOS_QUERY : GET_PUBLIC_PHOTOS_QUERY;
  const field = type === 'mine' ? 'getMyPhotos' : 'getPublicPhotos';

  const startRefresh = () => {
    if (inflight.has(key)) return inflight.get(key);

    emitPhotoRefreshStatus({ key, type, page, size, refreshing: true });

    const promise = gql(query, { page, size })
      .then((json) => {
        const payload = json?.data?.[field] || { items: [], pageInfo: { page, size, hasNext: false } };
        pageCache.set(key, { payload, fetchedAt: Date.now() });
        emitPhotoCacheUpdate({ key, type, page, size, payload });
        emitPhotoRefreshStatus({ key, type, page, size, refreshing: false });
        inflight.delete(key);
        return payload;
      })
      .catch((err) => {
        emitPhotoRefreshStatus({ key, type, page, size, refreshing: false });
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    return promise;
  };

  if (!forceRefresh && cached) {
    const age = now - cached.fetchedAt;
    if (age <= PHOTO_CACHE_TTL_MS) {
      return cached.payload;
    }

    // Return stale data immediately and revalidate in the background.
    startRefresh();
    return cached.payload;
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  return startRefresh();
}

export function getMyPhotosPage(page = 0, size = 24, forceRefresh = false) {
  return getPage('mine', page, size, forceRefresh);
}

export function getPublicPhotosPage(page = 0, size = 24, forceRefresh = false) {
  return getPage('public', page, size, forceRefresh);
}

export function invalidatePhotoCache() {
  pageCache.clear();
  inflight.clear();
}

export function subscribePhotoCacheUpdates(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  photoCacheListeners.add(listener);
  return () => {
    photoCacheListeners.delete(listener);
  };
}

export function subscribePhotoRefreshStatus(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  photoStatusListeners.add(listener);
  return () => {
    photoStatusListeners.delete(listener);
  };
}

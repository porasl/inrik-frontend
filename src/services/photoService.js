import { API_BASE } from '../../app.config.js';

const GET_MY_PHOTOS_QUERY = `
  query GetMyPhotos($userId: ID!) {
    getMyPhotos(userId: $userId) {
      id
      description
      imageUrls
      userFirstName
      userLastName
      email
      userProfileImageUrl
      createdAt
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
      }
      pageInfo { page size hasNext }
    }
  }
`;

const pageCache = new Map();
const inflight = new Map();
const collectionCache = new Map();
const collectionInflight = new Map();
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

function currentUserId() {
  return localStorage.getItem('userId') || localStorage.getItem('email') || '';
}

function cacheKey(type, page, size) {
  const userPart = type === 'mine' ? currentUserId() : 'public';
  return `${tokenPart()}::${userPart}::${type}::${page}::${size}`;
}

function collectionKey(type) {
  const userPart = type === 'mine' ? currentUserId() : 'public';
  return `${tokenPart()}::${userPart}::${type}`;
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
  const dataKey = collectionKey(type);
  const now = Date.now();
  const cached = pageCache.get(key);

  const query = type === 'mine' ? GET_MY_PHOTOS_QUERY : GET_PUBLIC_PHOTOS_QUERY;
  const field = type === 'mine' ? 'getMyPhotos' : 'getPublicPhotos';
  const variables = type === 'mine'
    ? { userId: currentUserId() }
    : { page, size };

  const toPagedPayload = (raw) => {
    if (type === 'public' && raw?.items && raw?.pageInfo) {
      return raw;
    }

    const allItems = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

    const start = page * size;
    const end = start + size;

    return {
      items: allItems.slice(start, end),
      pageInfo: {
        page,
        size,
        hasNext: end < allItems.length,
      },
    };
  };

  const startRefresh = () => {
    if (type === 'mine' && collectionInflight.has(dataKey)) {
      return collectionInflight.get(dataKey);
    }
    if (type !== 'mine' && inflight.has(key)) return inflight.get(key);

    emitPhotoRefreshStatus({ key, type, page, size, refreshing: true });

    const promise = gql(query, variables)
      .then((json) => {
        const raw = json?.data?.[field];
        const payload = toPagedPayload(raw);

        if (type === 'mine') {
          collectionCache.set(dataKey, { raw, fetchedAt: Date.now() });
        }
        pageCache.set(key, { payload, fetchedAt: Date.now() });
        emitPhotoCacheUpdate({ key, type, page, size, payload });
        emitPhotoRefreshStatus({ key, type, page, size, refreshing: false });
        if (type === 'mine') {
          collectionInflight.delete(dataKey);
        } else {
          inflight.delete(key);
        }
        return payload;
      })
      .catch((err) => {
        emitPhotoRefreshStatus({ key, type, page, size, refreshing: false });
        if (type === 'mine') {
          collectionInflight.delete(dataKey);
        } else {
          inflight.delete(key);
        }
        throw err;
      });

    if (type === 'mine') {
      collectionInflight.set(dataKey, promise);
    } else {
      inflight.set(key, promise);
    }
    return promise;
  };

  if (type === 'mine') {
    const collection = collectionCache.get(dataKey);
    if (!forceRefresh && collection) {
      const age = now - collection.fetchedAt;
      const payload = toPagedPayload(collection.raw);
      pageCache.set(key, { payload, fetchedAt: collection.fetchedAt });

      if (age <= PHOTO_CACHE_TTL_MS) {
        return payload;
      }

      startRefresh();
      return payload;
    }
  }

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
  collectionCache.clear();
  collectionInflight.clear();
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
